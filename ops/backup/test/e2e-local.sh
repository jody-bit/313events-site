#!/usr/bin/env bash
# End-to-end test against a REAL local PostgreSQL server and a mock Storage API: backup (incl. nested objects), encrypt,
# decrypt, restore into a second empty database, default-privilege trap, fingerprint gate, Storage round trip.
# Skipped when no PostgreSQL server binaries or the postgres OS user are available. Never touches Supabase.
set -Eeuo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)"
if [ -z "$PGBIN" ] || ! id postgres >/dev/null 2>&1 || [ "$(id -u)" != 0 ]; then echo "SKIP: e2e-local (needs root + local postgres server)"; exit 0; fi
major="$("$PGBIN/postgres" --version | sed 's/[^0-9]*\([0-9]*\).*/\1/')"
tmp="$(mktemp -d)"; chmod 777 "$tmp"; data="$tmp/pg"; port=54329; KEY=KEY_for_tests_123
cleanup() { runuser -u postgres -- "$PGBIN/pg_ctl" -D "$data" -m immediate stop >/dev/null 2>&1 || true; kill $(jobs -p) 2>/dev/null || true; rm -rf "$tmp"; }
trap cleanup EXIT
runuser -u postgres -- "$PGBIN/initdb" -D "$data" -A trust >/dev/null
runuser -u postgres -- "$PGBIN/pg_ctl" -D "$data" -o "-p $port -k $tmp" -l "$tmp/pg.log" -w start >/dev/null
export PGHOST=127.0.0.1 PGPORT=$port PGUSER=postgres PGPASSWORD=dummy PGSSLMODE=disable PGDATABASE=postgres
export PATH="$PGBIN:$PATH" PG_DUMP_MAJOR="$major"
psql -X -q -c "create role anon nologin" -c "create role authenticated nologin" -c "create role service_role nologin bypassrls" -c "create database src" -c "create database dst"
# Source: a miniature of the production shape, including RLS, column grants, a view, and nested Storage names.
m1=$(printf 'PNGDATA1' | md5sum | cut -d' ' -f1); m2=$(printf 'PNGDATA-two' | md5sum | cut -d' ' -f1)
sed -e "s/__M1__/$m1/" -e "s/__M2__/$m2/" <<'SQL' | psql -X -q -d src
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, metadata jsonb, updated_at timestamptz default now());
insert into storage.buckets values ('event-flyers','event-flyers',true,4194304,array['image/png','image/jpeg']);
insert into storage.objects(bucket_id,name,metadata) values
 ('event-flyers','top.png','{"size":8,"eTag":"\"__M1__\""}'),('event-flyers','u/abc123/nested one.png','{"size":11,"eTag":"\"__M2__\""}'),('event-flyers','u/def/deep/x.png','{"size":6}');
create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key); insert into supabase_migrations.schema_migrations values ('1');
create table public.events (id serial primary key, title text not null, status text not null default 'pending', secret text);
create table public.venues (id serial primary key, name text);
create table public.neighborhoods (id serial primary key, name text);
create table public.organizers (id serial primary key, name text);
create table public.categories (id serial primary key, slug text);
create table public.editorial_articles (id serial primary key, title text);
create table public.editorial_article_events (a int, e int);
create table public.feed_sources (id serial primary key, url text);
create table public.source_runs (id serial primary key, slug text);
create table public.schema_migrations (filename text primary key);
insert into public.events(title,status,secret) select 'e'||g, case when g%2=0 then 'approved' else 'pending' end, 'x' from generate_series(1,25) g;
insert into public.venues(name) values ('v1'),('v2'); insert into public.schema_migrations values ('a'),('b'),('c');
create view public.events_public as select id,title from public.events where status='approved';
create function public.f_locked() returns int language sql as 'select 1';
revoke all on function public.f_locked() from public; grant execute on function public.f_locked() to service_role;
create function public.f_open() returns int language sql as 'select 2';
alter table public.events enable row level security;
create policy "public read approved" on public.events for select to public using (status='approved');
revoke all on all tables in schema public from anon, authenticated, service_role;
grant select (id,title,status) on public.events to anon, authenticated;
grant select on public.events_public, public.venues to anon, authenticated;
grant all on all tables in schema public to service_role;
SQL
# Same trap as a new Supabase project: default privileges hand anon/authenticated everything on new public tables.
psql -X -q -d dst -c "alter default privileges in schema public grant all on tables to anon, authenticated; alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;"
mkdir -p "$tmp/srcfiles/event-flyers/u/abc123" "$tmp/srcfiles/event-flyers/u/def/deep" "$tmp/dstfiles"
printf 'PNGDATA1' > "$tmp/srcfiles/event-flyers/top.png"; printf 'PNGDATA-two' > "$tmp/srcfiles/event-flyers/u/abc123/nested one.png"; printf 'PNGD-3' > "$tmp/srcfiles/event-flyers/u/def/deep/x.png"
python3 "$here/test/mock_storage.py" 54330 "$tmp/srcfiles" "$KEY" & SRC1=$!
python3 "$here/test/mock_storage.py" 54331 "$tmp/dstfiles" "$KEY" "" dst & DST1=$!
sleep 1
psql -X -q -d dst -c "create schema storage; create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, metadata jsonb, updated_at timestamptz default now());"
age-keygen -o "$tmp/id" 2>/dev/null; rec="$(age-keygen -y "$tmp/id")"

run_backup() { ( PGDATABASE=src BACKUP_DRY_RUN=1 BACKUP_DIR="$tmp/out" AGE_RECIPIENT="$rec" SUPABASE_URL=http://127.0.0.1:54330 SUPABASE_SERVICE_ROLE_KEY="$KEY" "$here/backup.sh" ) ; }
# 1. backup succeeds, includes the nested objects, leaves ciphertext only
run_backup >"$tmp/b.log" 2>&1 || { cat "$tmp/b.log"; echo "FAIL: backup"; exit 1; }
a="$(ls "$tmp"/out/*.tar.age)"
[ "$(ls "$tmp/out" | grep -vc -E '\.tar\.age$|\.sha256$|\.manifest\.txt$')" = 0 ] || { ls "$tmp/out"; echo "FAIL: plaintext left behind"; exit 1; }
grep -q '^storage_files=3$' "$tmp"/out/*.manifest.txt || { cat "$tmp"/out/*.manifest.txt; echo "FAIL: nested objects not all captured"; exit 1; }
grep -q '^storage_bytes=25$' "$tmp"/out/*.manifest.txt || { echo "FAIL: byte total"; exit 1; }
grep -q '^storage_content_hashed=2$' "$tmp"/out/*.manifest.txt || { echo "FAIL: content-hashed count (2 of 3 have a plain MD5 eTag)"; exit 1; }
! grep -aq 'PNGDATA' "$a" || { echo "FAIL: plaintext in archive"; exit 1; }
echo "PASS 1: backup captured 3/3 objects (2 nested), bytes 25, no plaintext left"
# 2. a missing object makes the backup fail closed
rm -rf "$tmp/out"; kill $SRC1 2>/dev/null || true; sleep 0.3
python3 "$here/test/mock_storage.py" 54330 "$tmp/srcfiles" "$KEY" "deep" & SRC2=$!; sleep 1
if run_backup >"$tmp/b2.log" 2>&1; then echo "FAIL: backup succeeded with a missing object"; exit 1; fi
[ -z "$(ls "$tmp/out"/*.tar.age 2>/dev/null)" ] || { echo "FAIL: partial archive kept"; exit 1; }
echo "PASS 2: backup fails closed when an object cannot be downloaded"
# 3. restore into the empty database passes every gate despite the default-privilege trap
kill $SRC2 2>/dev/null || true; sleep 0.3; python3 "$here/test/mock_storage.py" 54330 "$tmp/srcfiles" "$KEY" & SRC3=$!; sleep 1
run_backup >"$tmp/b.log" 2>&1; a="$(ls "$tmp"/out/*.tar.age)"
rst() { ( PGDATABASE=dst AGE_IDENTITY="$tmp/id" ARCHIVE="$a" RESTORE_SUPABASE_URL=http://127.0.0.1:54331 RESTORE_SERVICE_KEY="$KEY" "$here/restore-rehearsal.sh" ); }
rst >"$tmp/r.log" 2>&1 || { cat "$tmp/r.log"; echo "FAIL: restore"; exit 1; }
grep -q 'ALL CHECKS PASSED' "$tmp/r.log" && grep -q 'fingerprint table_grants' "$tmp/r.log" && grep -q '3/3 objects round-trip' "$tmp/r.log" || { cat "$tmp/r.log"; echo "FAIL: restore output"; exit 1; }
n="$(psql -X -At -d dst -c "select count(*) from public.events")"; [ "$n" = 25 ] || { echo "FAIL: events $n"; exit 1; }
# anonymous role sees only approved rows and cannot read the secret column, exactly as at the source
got="$(psql -X -At -d dst -c "set role anon; select count(*) from public.events" 2>&1 | tail -1)"; [ "$got" = 12 ] || { echo "FAIL: anon row visibility: $got"; exit 1; }
if psql -X -q -d dst -c "set role anon; select secret from public.events" >/dev/null 2>&1; then echo "FAIL: anon can read secret column"; exit 1; fi
if psql -X -q -d dst -c "set role anon; select * from public.source_runs" >/dev/null 2>&1; then echo "FAIL: anon can read source_runs"; exit 1; fi
echo "PASS 3: restore passed every gate; trap grants replaced; anon sees 12 approved rows only; secret column and source_runs denied"
# 3b. function privileges restored exactly, despite new-project default EXECUTE grants for anon/authenticated/service_role
fq="select p.proname, has_function_privilege('anon',p.oid,'execute'), has_function_privilege('authenticated',p.oid,'execute'), has_function_privilege('service_role',p.oid,'execute'), coalesce((select bool_or(a.grantee=0) from aclexplode(p.proacl) a where a.privilege_type='EXECUTE'), true) from pg_proc p where p.pronamespace='public'::regnamespace order by 1"
fs="$(psql -X -At -d src -c "$fq")"; fd="$(psql -X -At -d dst -c "$fq")"
[ "$fs" = "$fd" ] || { echo "src: $fs"; echo "dst: $fd"; echo "FAIL: function privileges differ"; exit 1; }
[ "$(psql -X -At -d dst -c "set role anon; select count(*) from (select public.f_locked()) s" 2>&1 | tail -1)" != 1 ] || { echo "FAIL: anon can execute f_locked"; exit 1; }
grep -q 'function privileges after restore' "$tmp/r.log" || { echo "FAIL: restore did not print function privileges"; exit 1; }
echo "PASS 3b: function privileges match the source (f_locked not executable by anon)"
# 3c. a corrupted archive stops the restore before anything is written (hash check is fatal)
psql -X -q -c "create database dst2"
mkdir "$tmp/cx"; age -d -i "$tmp/id" "$a" | tar -x -C "$tmp/cx"; echo corrupt >> "$tmp/cx"/313events-*/db.dump
tar -C "$tmp/cx" -cf - $(ls "$tmp/cx") | age -r "$rec" -o "$tmp/corrupt.tar.age"
if ( PGDATABASE=dst2 AGE_IDENTITY="$tmp/id" ARCHIVE="$tmp/corrupt.tar.age" RESTORE_SUPABASE_URL=http://127.0.0.1:54331 RESTORE_SERVICE_KEY="$KEY" "$here/restore-rehearsal.sh" ) >"$tmp/r3.log" 2>&1; then echo "FAIL: corrupted archive was restored"; exit 1; fi
grep -q 'MANIFEST HASH MISMATCH' "$tmp/r3.log" || { cat "$tmp/r3.log"; echo "FAIL: wrong reason for corrupt archive"; exit 1; }
[ "$(psql -X -At -d dst2 -c "select count(*) from pg_tables where schemaname='public'")" = 0 ] || { echo "FAIL: corrupt archive wrote to target"; exit 1; }
echo "PASS 3c: corrupted archive refused before any write"
# 4. a non-empty target is refused
if rst >"$tmp/r2.log" 2>&1; then echo "FAIL: restored into a non-empty target"; exit 1; fi; grep -q 'not empty' "$tmp/r2.log" || { echo "FAIL: wrong refusal"; exit 1; }
# 5. production and staging targets are refused before anything is read
for ref in afvyfjfqukptnfmgshzn efxjdlogohcggpuftivm; do
  if ( PGHOST="db.$ref.supabase.co" PGDATABASE=dst AGE_IDENTITY="$tmp/id" ARCHIVE="$a" RESTORE_SUPABASE_URL=http://127.0.0.1:54331 RESTORE_SERVICE_KEY="$KEY" "$here/restore-rehearsal.sh" ) >/dev/null 2>&1; then echo "FAIL: accepted $ref"; exit 1; fi
done
echo "PASS 4-5: non-empty target and production/staging targets refused"
# 6. the fingerprint really detects the trap: re-open one table to anon and the grants hash must change
f1="$(psql -X -q -At -F, -d dst -f "$here/fingerprint.sql" | grep '^table_grants')"
psql -X -q -d dst -c "grant select on public.source_runs to anon"
f2="$(psql -X -q -At -F, -d dst -f "$here/fingerprint.sql" | grep '^table_grants')"
[ "$f1" != "$f2" ] || { echo "FAIL: fingerprint did not notice an extra anon grant"; exit 1; }
echo "PASS 6: fingerprint detects an extra anonymous grant"
# 7. Storage changing while the backup runs must fail the backup (new object, replaced object), leaving nothing behind
for change in "insert into storage.objects(bucket_id,name,metadata) values ('event-flyers','late.png','{\"size\":3}')" \
              "delete from storage.objects where name='u/def/deep/x.png'" \
              "update storage.objects set updated_at=now(), metadata=jsonb_set(metadata,'{eTag}','\"abc\"') where name='top.png'"; do
  kill $SRC3 2>/dev/null || true; sleep 0.3; rm -rf "$tmp/out"
  python3 "$here/test/mock_storage.py" 54330 "$tmp/srcfiles" "$KEY" "" "" "$change" & SRC4=$!; sleep 1
  if run_backup >"$tmp/b3.log" 2>&1; then echo "FAIL: backup passed although Storage changed mid-run"; exit 1; fi
  grep -q 'Storage changed while the backup was running' "$tmp/b3.log" || { cat "$tmp/b3.log"; echo "FAIL: wrong failure reason"; exit 1; }
  [ -z "$(ls -A "$tmp/out" 2>/dev/null)" ] || { ls "$tmp/out"; echo "FAIL: leftovers after mid-run change"; exit 1; }
  psql -X -q -d src -c "delete from storage.objects where name='late.png'; insert into storage.objects(bucket_id,name,metadata) select 'event-flyers','u/def/deep/x.png','{\"size\":6}' where not exists (select 1 from storage.objects where name='u/def/deep/x.png'); update storage.objects set updated_at=null, metadata=metadata - 'eTag' where name='top.png'" >/dev/null
  SRC3=$SRC4
done
echo "PASS 7: Storage changes during the backup (added object, replaced object) fail it and leave nothing behind"
# 8. failure paths leave no plaintext and no partial ciphertext: encryption failure, and Ctrl-C mid-download
kill $SRC3 2>/dev/null || true; sleep 0.3
python3 "$here/test/mock_storage.py" 54330 "$tmp/srcfiles" "$KEY" & SRC5=$!; sleep 1
rm -rf "$tmp/out"
if ( PGDATABASE=src BACKUP_DRY_RUN=1 BACKUP_DIR="$tmp/out" AGE_RECIPIENT="not-a-valid-key" SUPABASE_URL=http://127.0.0.1:54330 SUPABASE_SERVICE_ROLE_KEY="$KEY" "$here/backup.sh" ) >"$tmp/b4.log" 2>&1; then echo "FAIL: backup passed with an invalid age recipient"; exit 1; fi
[ -z "$(ls -A "$tmp/out")" ] || { ls "$tmp/out"; echo "FAIL: leftovers after encryption failure"; exit 1; }
kill $SRC5 2>/dev/null || true; sleep 0.3
python3 "$here/test/mock_storage.py" 54330 "$tmp/srcfiles" "$KEY" "" "" "" 2 & SRC6=$!; sleep 1
( PGDATABASE=src BACKUP_DRY_RUN=1 BACKUP_DIR="$tmp/out" AGE_RECIPIENT="$rec" SUPABASE_URL=http://127.0.0.1:54330 SUPABASE_SERVICE_ROLE_KEY="$KEY" "$here/backup.sh" ) >"$tmp/b5.log" 2>&1 & BP=$!
sleep 2; [ -z "$(ls -A "$tmp/out" 2>/dev/null)" ] || { ls "$tmp/out"; echo "FAIL: something exists under the output folder DURING the run"; exit 1; }
pkill -INT -P $BP 2>/dev/null || true; kill -INT $BP 2>/dev/null || true; wait $BP 2>/dev/null || true; sleep 1
[ -z "$(ls -A "$tmp/out" 2>/dev/null)" ] || { ls "$tmp/out"; echo "FAIL: leftovers after interrupt"; exit 1; }
kill $SRC6 2>/dev/null || true
echo "PASS 8: encryption failure and interrupt leave no plaintext and no partial archive"
# 9. a SIGKILL-style leftover from an earlier run is swept at the next start, and plaintext never lands in the output folder
kill $SRC3 2>/dev/null || true; sleep 0.3
python3 "$here/test/mock_storage.py" 54330 "$tmp/srcfiles" "$KEY" & SRC7=$!; sleep 1
mkdir -p "$tmp/t/313events-work.stale/storage" "$tmp/out9/313events-20200101T000000Z"; echo leftover > "$tmp/t/313events-work.stale/storage/x"
( TMPDIR="$tmp/t" PGDATABASE=src BACKUP_DRY_RUN=1 BACKUP_DIR="$tmp/out9" AGE_RECIPIENT="$rec" SUPABASE_URL=http://127.0.0.1:54330 SUPABASE_SERVICE_ROLE_KEY="$KEY" "$here/backup.sh" ) >"$tmp/b9.log" 2>&1 || { cat "$tmp/b9.log"; echo "FAIL: backup 9"; exit 1; }
grep -q "swept stale plaintext" "$tmp/b9.log" || { echo "FAIL: sweep did not report what it removed"; exit 1; }
[ ! -e "$tmp/t/313events-work.stale" ] && [ ! -e "$tmp/out9/313events-20200101T000000Z" ] || { echo "FAIL: stale plaintext not swept"; exit 1; }
[ -z "$(ls "$tmp/t")" ] && [ -z "$(ls "$tmp/out9" | grep -v -E '\.tar\.age$|\.sha256$|\.manifest\.txt$')" ] || { echo "FAIL: leftovers after run 9"; exit 1; }
kill $SRC7 2>/dev/null || true
echo "PASS 9: stale plaintext from a killed run is swept; working files live in the temp dir, output folder holds ciphertext only"
# 10. the dedicated read-only role (no superuser, no pg_read_all_data) is sufficient for a complete backup and cannot write
psql -X -q -d src <<'SQL'
create role backup_reader login bypassrls connection limit 2;
alter role backup_reader set default_transaction_read_only = on;
grant usage on schema public, supabase_migrations, storage to backup_reader;
grant select on all tables in schema public to backup_reader;
grant select on all sequences in schema public to backup_reader;
grant select on all tables in schema supabase_migrations to backup_reader;
grant select on storage.buckets, storage.objects to backup_reader;
SQL
kill $SRC3 2>/dev/null || true; sleep 0.3; rm -rf "$tmp/out"
python3 "$here/test/mock_storage.py" 54330 "$tmp/srcfiles" "$KEY" & SRC10=$!; sleep 1
( PGUSER=backup_reader PGDATABASE=src BACKUP_DRY_RUN=1 BACKUP_DIR="$tmp/out" AGE_RECIPIENT="$rec" SUPABASE_URL=http://127.0.0.1:54330 SUPABASE_SERVICE_ROLE_KEY="$KEY" "$here/backup.sh" ) >"$tmp/b10.log" 2>&1 || { cat "$tmp/b10.log"; echo "FAIL: backup as backup_reader"; exit 1; }
grep -q '^storage_files=3$' "$tmp"/out/*.manifest.txt && grep -q '^events	25$' "$tmp"/out/*.manifest.txt || { echo "FAIL: backup_reader archive incomplete"; exit 1; }
if PGUSER=backup_reader psql -X -q -d src -c "insert into public.venues(name) values ('x')" >/dev/null 2>&1; then echo "FAIL: backup_reader can write"; exit 1; fi
if PGUSER=backup_reader psql -X -q -d src -c "select * from pg_authid" >/dev/null 2>&1; then echo "FAIL: backup_reader can read pg_authid"; exit 1; fi
kill $SRC10 2>/dev/null || true
echo "PASS 10: dedicated read-only role makes a complete backup (incl. RLS tables) and cannot write"
echo "PASS: e2e-local"
