#!/usr/bin/env bash
# Restore an encrypted backup into a NEW, EMPTY, ISOLATED Supabase project and verify it. Never targets production or staging.
#   RESTORE_DB_URL  connection string of the rehearsal project (session pooler)
#   AGE_IDENTITY    path to the age private key file (kept offline; never in CI)
#   ARCHIVE         path to a 313events-*.tar.age downloaded from the off-site bucket
# Prints elapsed seconds per phase so recovery time can be recorded in the runbook table.
set -Eeuo pipefail
: "${RESTORE_DB_URL:?}" "${AGE_IDENTITY:?}" "${ARCHIVE:?}"
case "$RESTORE_DB_URL" in
  *afvyfjfqukptnfmgshzn*|*efxjdlogohcggpuftivm*) echo "REFUSED: target is production or staging" >&2; exit 2;; esac
t0=$(date +%s); lap() { echo "[$(( $(date +%s) - t0 ))s] $1"; }
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
age -d -i "$AGE_IDENTITY" "$ARCHIVE" | tar -x -C "$work"; d="$(echo "$work"/313events-*)"; lap "decrypted"
( cd "$d" && grep -A99999 '^--- sha256' MANIFEST.txt | tail -n +2 | sha256sum -c --quiet ) && lap "manifest hashes verified"
test "$(psql "$RESTORE_DB_URL" -At -c "select count(*) from pg_tables where schemaname='public'")" = 0 \
  || { echo "REFUSED: target project is not empty" >&2; exit 3; }
pg_restore --no-owner --exit-on-error --dbname="$RESTORE_DB_URL" "$d/db.dump"; lap "database restored"
psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$d/storage_meta.sql" >/dev/null 2>&1 || echo "note: storage metadata load skipped (re-upload objects instead)"
fail=0
while IFS=$'\t' read -r t n; do
  case "$t" in storage_objects) q="select count(*) from storage.objects";; *) q="select count(*) from public.$t";; esac
  got="$(psql "$RESTORE_DB_URL" -At -c "$q" 2>/dev/null || echo ERR)"
  [ "$got" = "$n" ] && echo "ok   $t $got" || { echo "DIFF $t source=$n restored=$got"; fail=1; }
done < "$d/row_counts.tsv"
lap "row counts compared"
echo "storage files in archive: $(cat "$d/storage_file_count.txt") (re-upload to the rehearsal project's event-flyers bucket and request a few public URLs)"
psql "$RESTORE_DB_URL" -At -c "select 'events_public rows', count(*) from public.events_public" || fail=1
psql "$RESTORE_DB_URL" -At -c "select 'rls_enabled_tables', count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity"
lap "done (record this total as measured recovery time; recovery point = archive created_utc)"
exit $fail
