#!/usr/bin/env bash
# Independent, encrypted, off-site backup of the 313.events production Supabase project.
# Read-only against the database (every session is forced to default_transaction_read_only) and against Storage (GET only).
#
# Database credentials: either SUPABASE_DB_URL (CI) or PGHOST/PGPORT/PGUSER/PGPASSWORD (local; keeps the password out of argv).
# Required environment (supply as CI secrets or from a local secrets manager; never commit):
#   SUPABASE_URL               https://<ref>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY  used only to download Storage objects (GET only)
#   AGE_RECIPIENT              age public key the archive is encrypted to (public; the private key is never on CI)
#   RCLONE_REMOTE              rclone remote path for the off-site bucket, e.g. offsite:313-events-backups
# Optional:
#   BACKUP_DIR           output directory (default: mktemp)
#   BACKUP_DRY_RUN=1     build and encrypt locally, skip upload
#   PG_DUMP_MAJOR        required pg_dump major version (default 17, matching production)
#   ALERT_WEBHOOK_URL    HTTP endpoint that receives a short failure message (no secrets in the message)
# The plaintext working directory is always deleted on exit; only the encrypted archive, its hash and the manifest remain.
set -Eeuo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; . "$here/lib.sh"

: "${AGE_RECIPIENT:?}" "${SUPABASE_URL:?}" "${SUPABASE_SERVICE_ROLE_KEY:?}"
if [ -z "${SUPABASE_DB_URL:-}" ]; then : "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}"; fi
[ "${BACKUP_DRY_RUN:-0}" = 1 ] || : "${RCLONE_REMOTE:?}"
DB="${SUPABASE_DB_URL:-dbname=${PGDATABASE:-postgres}}"; export PGSSLMODE="${PGSSLMODE:-require}"
SB_KEY="$SUPABASE_SERVICE_ROLE_KEY"
case "$(pg_dump --version)" in *" ${PG_DUMP_MAJOR:-17}."*) ;; *) echo "pg_dump major ${PG_DUMP_MAJOR:-17} required (found: $(pg_dump --version))" >&2; exit 1;; esac

umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTDIR="${BACKUP_DIR:-$(mktemp -d)}"; mkdir -p "$OUTDIR"; OUTDIR="$(cd "$OUTDIR" && pwd)"
# Plaintext lives only in a private temp directory outside the output folder (which may be synced, e.g. iCloud); the output
# folder receives ciphertext, its hash and the manifest only. Leftovers from a killed or crashed earlier run are swept first.
sweep_stale "$OUTDIR"
WORKROOT="$(mktemp -d "${TMPDIR:-/tmp}/313events-work.XXXXXX")"
WORK="$WORKROOT/313events-$STAMP"
mkdir -p "$WORK/storage"
cd "$WORK"

alert() {
  [ -n "${ALERT_WEBHOOK_URL:-}" ] && curl -fsS -m 10 -X POST -d "313.events backup FAILED at step: $1 ($STAMP)" "$ALERT_WEBHOOK_URL" >/dev/null || true
}
trap 'alert "${STEP:-unknown}"' ERR
DONE=0
cleanup() {  # always remove the plaintext working directory; remove partial ciphertext artifacts if the run did not finish
  cd /; rm -rf "$WORKROOT"
  [ "$DONE" = 1 ] || rm -f "$OUTDIR/313events-$STAMP.tar.age" "$OUTDIR/313events-$STAMP.tar.age.sha256" "$OUTDIR/313events-$STAMP.manifest.txt"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

# pg_dump itself runs inside a READ ONLY, REPEATABLE READ transaction.
STEP=dump_custom
DUMP_STARTED="$(date -u +%Y%m%dT%H%M%SZ)"
pg_dump "$DB" --format=custom --no-owner --schema=public --schema=supabase_migrations --file=db.dump
STEP=dump_schema_sql
pg_dump "$DB" --format=plain --schema-only --no-owner --schema=public --file=schema.sql
STEP=dump_storage_meta
# Bucket definitions and object metadata only; the files themselves are copied below.
pg_dump "$DB" --format=plain --data-only --no-owner --table=storage.buckets --table=storage.objects --file=storage_meta.sql

STEP=row_counts
q > row_counts.tsv <<'SQL'
select 'events', count(*) from public.events union all
select 'venues', count(*) from public.venues union all
select 'neighborhoods', count(*) from public.neighborhoods union all
select 'organizers', count(*) from public.organizers union all
select 'categories', count(*) from public.categories union all
select 'editorial_articles', count(*) from public.editorial_articles union all
select 'editorial_article_events', count(*) from public.editorial_article_events union all
select 'feed_sources', count(*) from public.feed_sources union all
select 'source_runs', count(*) from public.source_runs union all
select 'schema_migrations', count(*) from public.schema_migrations union all
select 'storage_objects', count(*) from storage.objects;
SQL

STEP=storage_copy
# SQL-driven: the object list comes from storage.objects, so sub-folders cannot be skipped. The list (name, size, eTag,
# updated_at) is snapshotted before the downloads and again after; any difference means Storage changed while the backup ran,
# and the backup fails rather than produce an archive that matches neither moment. Each file must also match its size and,
# where the eTag is a plain MD5, its content hash.
snap() { q <<'SQL'
select bucket_id, name, coalesce((metadata->>'size')::bigint, -1), coalesce(nullif(metadata->>'eTag', ''), '-'), coalesce(updated_at::text, '-')
from storage.objects order by 1, 2;
SQL
}
snap > storage_objects.tsv
LIST_AT="$(date -u +%Y%m%dT%H%M%SZ)"
q > buckets.json <<'SQL'
select coalesce(json_agg(b), '[]'::json) from (select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id) b;
SQL
if awk -F'\t' 'NF != 5 {bad=1} END {exit !bad}' storage_objects.tsv; then echo "unexpected object name or metadata (tab/newline)" >&2; false; fi
exp_n="$(wc -l < storage_objects.tsv | tr -d ' ')"
# The object list must agree with the row count taken earlier and with the object rows in the metadata dump.
rc_n="$(awk -F'\t' '$1=="storage_objects"{print $2}' row_counts.tsv)"
meta_n="$(awk '/^COPY storage.objects /{f=1; next} /^\\\.$/{f=0} f' storage_meta.sql | wc -l | tr -d ' ')"
[ "$exp_n" = "$rc_n" ] && [ "$exp_n" = "$meta_n" ] || { echo "storage object count disagrees: list $exp_n, row_counts $rc_n, metadata dump $meta_n (Storage changed during the run; rerun)" >&2; false; }
exp_bytes="$(awk -F'\t' '{s+=$3} END{print s+0}' storage_objects.tsv)"
i=0; hashed=0
while IFS=$'\t' read -r b name size etag upd; do
  i=$((i + 1))
  mkdir -p "storage/$b/$(dirname "$name")"
  sb_curl -o "storage/$b/$name" "$SUPABASE_URL/storage/v1/object/$b/$(uri_path "$name")"
  [ "$(fsize "storage/$b/$name")" = "$size" ] || { echo "size mismatch on object #$i" >&2; false; }
  e="$(printf '%s' "$etag" | tr -d '"')"
  case "$e" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f])
      [ "$(md5_of "storage/$b/$name")" = "$e" ] || { echo "content hash mismatch on object #$i" >&2; false; }
      hashed=$((hashed + 1)) ;;
  esac
done < storage_objects.tsv
snap > storage_objects.after.tsv
cmp -s storage_objects.tsv storage_objects.after.tsv || { echo "Storage changed while the backup was running; rerun" >&2; false; }
rm -f storage_objects.after.tsv
VERIFIED_AT="$(date -u +%Y%m%dT%H%M%SZ)"
got_n="$(find storage -type f | wc -l | tr -d ' ')"
got_bytes="$(find storage -type f | while IFS= read -r f; do fsize "$f"; done | awk '{s+=$1} END{print s+0}')"
[ "$got_n" = "$exp_n" ] && [ "$got_bytes" = "$exp_bytes" ] || { echo "storage incomplete: files $got_n/$exp_n bytes $got_bytes/$exp_bytes" >&2; false; }
echo "$got_n" > storage_file_count.txt; echo "$got_bytes" > storage_bytes.txt

STEP=fingerprint_and_acl
# Source catalog fingerprint and exact role grants, so a restore can re-apply them and prove the access boundary.
q < "$here/fingerprint.sql" > fingerprint.tsv
q < "$here/acl_replay.sql" > acl_replay.sql

STEP=pre_verify
pg_restore --list db.dump >/dev/null            # archive is readable and complete
test -s schema.sql && test -s storage_meta.sql && test -s fingerprint.tsv && test -s acl_replay.sql && test -s buckets.json

STEP=manifest
{
  echo "created_utc=$STAMP"
  echo "db_dump_started_utc=$DUMP_STARTED"
  echo "storage_listed_utc=$LIST_AT"
  echo "storage_verified_utc=$VERIFIED_AT"
  echo "source_project=${SUPABASE_URL#https://}"
  echo "pg_dump_version=$(pg_dump --version)"
  echo "storage_files=$got_n"
  echo "storage_bytes=$got_bytes"
  echo "storage_content_hashed=$hashed"   # files whose eTag is a plain MD5 and matched; the rest are checked by size and the before/after snapshot
  echo "--- row_counts"; cat row_counts.tsv
  echo "--- sha256"
  sha256 db.dump schema.sql storage_meta.sql row_counts.tsv fingerprint.tsv acl_replay.sql buckets.json storage_objects.tsv
  find storage -type f | LC_ALL=C sort | while IFS= read -r f; do sha256 "$f"; done
} > MANIFEST.txt

STEP=encrypt
cd "$OUTDIR"
tar -C "$WORKROOT" -cf - "313events-$STAMP" | age -r "$AGE_RECIPIENT" -o "313events-$STAMP.tar.age"
sha256 "313events-$STAMP.tar.age" > "313events-$STAMP.tar.age.sha256"
cp "$WORK/MANIFEST.txt" "313events-$STAMP.manifest.txt"   # manifest has counts and hashes only, no row data

if [ "${BACKUP_DRY_RUN:-0}" = 1 ]; then
  DONE=1; echo "dry run complete: $OUTDIR/313events-$STAMP.tar.age"; exit 0
fi

STEP=upload
rclone copyto "313events-$STAMP.tar.age" "$RCLONE_REMOTE/daily/313events-$STAMP.tar.age"
rclone copyto "313events-$STAMP.tar.age.sha256" "$RCLONE_REMOTE/daily/313events-$STAMP.tar.age.sha256"
rclone copyto "313events-$STAMP.manifest.txt" "$RCLONE_REMOTE/daily/313events-$STAMP.manifest.txt"

STEP=post_upload_verify
# Read back from the bucket and compare the ciphertext hash with the local one.
remote_sha="$(rclone cat "$RCLONE_REMOTE/daily/313events-$STAMP.tar.age" | sha256 | cut -d' ' -f1)"
test "$remote_sha" = "$(cut -d' ' -f1 "313events-$STAMP.tar.age.sha256")"

DONE=1; echo "backup ok: 313events-$STAMP.tar.age"
