#!/usr/bin/env bash
# Offline test of backup.sh with stub pg_dump/pg_restore/psql/curl. Proves flow, manifest, encryption and the Storage gates
# (nested object included, count and byte totals enforced); does not touch any database. See e2e-local.sh for the real-Postgres test.
set -Eeuo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; mkdir "$tmp/bin"
cat >"$tmp/bin/pg_dump" <<'S'
#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "pg_dump (stub) 17.0"; exit 0; fi
for a in "$@"; do case $a in --file=*) f="${a#--file=}"; echo "-- stub $a" > "$f"; case "$f" in storage_meta.sql) printf 'COPY storage.objects (a) FROM stdin;\nrow1\nrow2\n\\.\n' >> "$f";; esac;; esac; done
S
printf '#!/usr/bin/env bash\nexit 0\n' >"$tmp/bin/pg_restore"
cat >"$tmp/bin/psql" <<'S'
#!/usr/bin/env bash
sql="$(cat)"
case "$sql" in
  *"from storage.objects order by"*) printf 'event-flyers\ttop.jpg\t8\t-\t-\nevent-flyers\tu/nested dir/a b.jpg\t8\t-\t-\n' ;;
  *json_agg*) echo '[{"id":"event-flyers","name":"event-flyers","public":true}]' ;;
  *"select 'events'"*) printf 'events\t10\nvenues\t2\nstorage_objects\t%s\n' "${STUB_OBJECTS:-2}" ;;
  *aclexplode*) echo 'grant select on public.venues to anon;' ;;
  *) printf 'columns\tabc\t3\n' ;;
esac
S
cat >"$tmp/bin/curl" <<'S'
#!/usr/bin/env bash
out=""; prev=""; for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
[ -n "$out" ] && printf 'jpegdat9' > "$out"
S
chmod +x "$tmp/bin/"*
age-keygen -o "$tmp/id" 2>/dev/null; key="$(age-keygen -y "$tmp/id")"
export PATH="$tmp/bin:$PATH"
run() { PGHOST=h PGUSER=u PGPASSWORD=p BACKUP_DRY_RUN=1 BACKUP_DIR="$tmp/out" AGE_RECIPIENT="$key" SUPABASE_URL=https://stub.supabase.co SUPABASE_SERVICE_ROLE_KEY=stub "$here/backup.sh"; }
run
f="$(ls "$tmp"/out/*.tar.age)"
mkdir "$tmp/x"; age -d -i "$tmp/id" "$f" | tar -x -C "$tmp/x"; m="$(echo "$tmp"/x/313events-*/MANIFEST.txt)"
grep -q '^storage_files=2$' "$m" && grep -q '^storage_bytes=16$' "$m"      # nested object included, 2 x 8 bytes
! grep -aq 'jpegdat9' "$f"        # ciphertext only
[ -z "$(ls "$tmp/out" | grep -v -E '\.tar\.age$|\.sha256$|\.manifest\.txt$')" ]   # no plaintext directory left behind
echo "PASS: backup flow, nested Storage object, manifest, encryption, no plaintext left"
rm -rf "$tmp"
