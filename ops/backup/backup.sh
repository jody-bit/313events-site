#!/usr/bin/env bash
# Independent, encrypted, off-site backup of the 313.events production Supabase project.
# Runs read-only against the database and Storage. Nothing here writes to Supabase.
#
# Required environment (supply as CI secrets or from a local secrets manager; never commit):
#   SUPABASE_DB_URL        Session-pooler connection string for a read-only backup role (IPv4 compatible)
#   SUPABASE_URL           https://<ref>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY  used only to list and download Storage objects (GET only)
#   AGE_RECIPIENT          age public key(s) the archive is encrypted to (public; the private key is never on CI)
#   RCLONE_REMOTE          rclone remote path for the off-site bucket, e.g. offsite:313-events-backups
# Optional:
#   BACKUP_DIR             working directory (default: mktemp)
#   BACKUP_DRY_RUN=1       build and encrypt locally, skip upload
#   ALERT_WEBHOOK_URL      HTTP endpoint that receives a short failure message (no secrets in the message)
set -Eeuo pipefail

: "${AGE_RECIPIENT:?}" "${SUPABASE_DB_URL:?}" "${SUPABASE_URL:?}" "${SUPABASE_SERVICE_ROLE_KEY:?}"
[ "${BACKUP_DRY_RUN:-0}" = 1 ] || : "${RCLONE_REMOTE:?}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="${BACKUP_DIR:-$(mktemp -d)}/313events-$STAMP"
mkdir -p "$WORK/storage"
cd "$WORK"

alert() {
  [ -n "${ALERT_WEBHOOK_URL:-}" ] && curl -fsS -m 10 -X POST -d "313.events backup FAILED at step: $1 ($STAMP)" "$ALERT_WEBHOOK_URL" >/dev/null || true
}
trap 'alert "${STEP:-unknown}"' ERR

STEP=dump_custom
# Full logical dump of application schema and data including grants, policies and RLS flags.
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --schema=public --schema=supabase_migrations --file=db.dump
STEP=dump_schema_sql
pg_dump "$SUPABASE_DB_URL" --format=plain --schema-only --no-owner --schema=public --file=schema.sql
STEP=dump_storage_meta
# Storage bucket definitions and object metadata (the files themselves are copied below).
pg_dump "$SUPABASE_DB_URL" --format=plain --data-only --no-owner --table=storage.buckets --table=storage.objects --file=storage_meta.sql

STEP=row_counts
# Live row counts recorded in the manifest so a restore can be compared against the source.
psql "$SUPABASE_DB_URL" -At -F $'\t' -c "
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
  select 'storage_objects', count(*) from storage.objects" > row_counts.tsv

STEP=storage_copy
# List then download every object in every bucket (GET only). Paginated to 1000 per page.
API="$SUPABASE_URL/storage/v1"
AUTH=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
buckets="$(curl -fsS "${AUTH[@]}" "$API/bucket" | jq -r '.[].id')"
for b in $buckets; do
  offset=0
  while :; do
    page="$(curl -fsS "${AUTH[@]}" -H 'content-type: application/json' \
      -d "{\"prefix\":\"\",\"limit\":1000,\"offset\":$offset}" "$API/object/list/$b")"
    n="$(jq length <<<"$page")"
    [ "$n" -gt 0 ] || break
    while IFS= read -r name; do
      mkdir -p "storage/$b/$(dirname "$name")"
      curl -fsS "${AUTH[@]}" -o "storage/$b/$name" "$API/object/$b/$(jq -rn --arg n "$name" '$n|@uri')"
    done < <(jq -r '.[] | select(.id != null) | .name' <<<"$page")
    offset=$((offset + n))
  done
done
find storage -type f | wc -l > storage_file_count.txt

STEP=pre_verify
pg_restore --list db.dump >/dev/null            # archive is readable and complete
test -s schema.sql && test -s storage_meta.sql

STEP=manifest
{
  echo "created_utc=$STAMP"
  echo "source_project=${SUPABASE_URL#https://}"
  echo "pg_dump_version=$(pg_dump --version)"
  echo "storage_files=$(cat storage_file_count.txt)"
  echo "--- row_counts"; cat row_counts.tsv
  echo "--- sha256"; sha256sum db.dump schema.sql storage_meta.sql row_counts.tsv
  (find storage -type f -print0 | sort -z | xargs -0 -r sha256sum)
} > MANIFEST.txt

STEP=encrypt
cd ..
tar -cf - "313events-$STAMP" | age -r "$AGE_RECIPIENT" -o "313events-$STAMP.tar.age"
sha256sum "313events-$STAMP.tar.age" > "313events-$STAMP.tar.age.sha256"
cp "313events-$STAMP/MANIFEST.txt" "313events-$STAMP.manifest.txt"   # manifest has counts and hashes only, no row data

if [ "${BACKUP_DRY_RUN:-0}" = 1 ]; then
  echo "dry run complete: $(pwd)/313events-$STAMP.tar.age"; exit 0
fi

STEP=upload
rclone copyto "313events-$STAMP.tar.age" "$RCLONE_REMOTE/daily/313events-$STAMP.tar.age"
rclone copyto "313events-$STAMP.tar.age.sha256" "$RCLONE_REMOTE/daily/313events-$STAMP.tar.age.sha256"
rclone copyto "313events-$STAMP.manifest.txt" "$RCLONE_REMOTE/daily/313events-$STAMP.manifest.txt"

STEP=post_upload_verify
# Read back from the bucket and compare the ciphertext hash with the local one.
remote_sha="$(rclone cat "$RCLONE_REMOTE/daily/313events-$STAMP.tar.age" | sha256sum | cut -d' ' -f1)"
test "$remote_sha" = "$(cut -d' ' -f1 "313events-$STAMP.tar.age.sha256")"

echo "backup ok: 313events-$STAMP.tar.age"
rm -rf "313events-$STAMP"   # plaintext removed; only the encrypted archive and manifest remain
