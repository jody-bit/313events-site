#!/usr/bin/env bash
# Restore an encrypted backup into a NEW, EMPTY, ISOLATED Supabase project and prove the result. Never targets production or staging.
# Target connection comes from PG* environment variables (PGHOST, PGPORT, PGUSER, PGPASSWORD): nothing secret in argv.
#   AGE_IDENTITY  path to the age private key file (kept offline; never in CI)
#   ARCHIVE       path to a 313events-*.tar.age
#   RESTORE_SUPABASE_URL, RESTORE_SERVICE_KEY   the rehearsal project's API URL and service-role key (Storage upload and verify)
# Exit codes: 0 all checks passed; 2 refused target; 3 target not empty; 4 access boundary differs (DO NOT EXPOSE);
#             5 counts differ; 6 restore errors; 7 storage verification failed.
# NEVER RUN TWO RESTORES AT ONCE (this script, restore-mac.sh, in two terminals or against two targets): the stale-folder sweep below deletes every
#   313events-restore.* working folder, including the live one of a concurrent run. Wait for one run to finish or be stopped before starting another.
# Prints elapsed seconds per phase so recovery time can be recorded. Recovery point = the archive's created_utc.
set -Eeuo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; . "$here/lib.sh"
: "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}" "${AGE_IDENTITY:?}" "${ARCHIVE:?}" "${RESTORE_SUPABASE_URL:?}" "${RESTORE_SERVICE_KEY:?}"
for ref in afvyfjfqukptnfmgshzn efxjdlogohcggpuftivm; do
  case "$PGHOST $PGUSER $RESTORE_SUPABASE_URL" in *"$ref"*) echo "REFUSED: target is production or staging" >&2; exit 2;; esac
done
# ALLOW-LIST (the deny-list above cannot see a pooler host, which carries no project ref): only the rehearsal project is accepted.
# The only exception is a loopback database with a loopback API URL (the local end-to-end test); the in-database marker below still applies.
REHEARSAL_REF="ysevatiihdticidmnmeh"
b64d() { base64 -d 2>/dev/null || base64 -D 2>/dev/null; }   # GNU/Linux uses -d; the Mac's base64 needs -D on older systems
case "$PGHOST" in
  127.0.0.1|localhost|::1) case "$RESTORE_SUPABASE_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "REFUSED: loopback database with a non-loopback API URL" >&2; exit 2;; esac ;;
  *)
    [ "$PGUSER" = "postgres.$REHEARSAL_REF" ] || { echo "REFUSED: PGUSER is not postgres.$REHEARSAL_REF" >&2; exit 2; }
    [ "$RESTORE_SUPABASE_URL" = "https://$REHEARSAL_REF.supabase.co" ] || { echo "REFUSED: API URL is not the rehearsal project" >&2; exit 2; }
    # The service-role key must be the legacy JWT form (eyJ...); its own ref claim must be the rehearsal project (decoded locally, never printed).
    key_ref="$(printf '%s' "$RESTORE_SERVICE_KEY" | cut -d. -f2 | tr '_-' '/+' | awk '{while(length($0)%4)$0=$0"=";print}' | b64d | jq -r '.ref // empty' 2>/dev/null || true)"
    [ "$key_ref" = "$REHEARSAL_REF" ] || { echo "REFUSED: service-role key is not a legacy JWT key of the rehearsal project (a new-format sb_secret_ key cannot be checked here)" >&2; exit 2; } ;;
esac
# The age identity file must be a private file (mode 600 or 400), supplied by path only.
am="$(stat -c %a "$AGE_IDENTITY" 2>/dev/null || stat -f %Lp "$AGE_IDENTITY" 2>/dev/null || echo ?)"
case "$am" in 600|400) ;; *) echo "REFUSED: age identity file mode is $am (needs 600)" >&2; exit 2;; esac
export PGSSLMODE="${PGSSLMODE:-require}" PGDATABASE="${PGDATABASE:-postgres}"
DB="dbname=$PGDATABASE"
t0=$(date +%s); lap() { echo "[$(( $(date +%s) - t0 ))s] $1"; }
# Stale decrypted folders from an earlier killed run are removed first; the trap also covers abort, interrupt and termination.
for old in "${TMPDIR:-/tmp}"/313events-restore.*; do [ -d "$old" ] && rm -rf "$old"; done 2>/dev/null || true
work="$(mktemp -d "${TMPDIR:-/tmp}/313events-restore.XXXXXX")"; trap 'rm -rf "$work"' EXIT; trap 'exit 130' INT; trap 'exit 143' TERM HUP
age -d -i "$AGE_IDENTITY" "$ARCHIVE" | tar -x -C "$work"; d="$(echo "$work"/313events-*)"; lap "decrypted"
( cd "$d" && awk '/^--- sha256/{go=1; next} go' MANIFEST.txt | sha256_check ) || { echo "MANIFEST HASH MISMATCH: the archive is corrupt or altered; nothing was restored" >&2; exit 6; }
lap "manifest hashes verified"
created="$(awk -F= '$1=="created_utc"{print $2}' "$d/MANIFEST.txt")"

tq() { psql "$DB" -X -q -At -F $'\t' -v ON_ERROR_STOP=1 "$@"; }     # target session (this script writes only to the rehearsal project)
[ "$(tq -c "select count(*) from pg_tables where schemaname='public'")" = 0 ] \
  || { echo "REFUSED: target project is not empty" >&2; exit 3; }

# In-database guards. (1) Never the production cluster: the identifier must be a non-empty number that differs from production's (an empty or failed read refuses).
PROD_SYSID=7666007964130682852
sysid="$(tq -c "select system_identifier from pg_control_system()" || true)"
case "$sysid" in ''|*[!0-9]*) echo "REFUSED: could not read a numeric cluster identifier" >&2; exit 2;; esac
[ "$sysid" != "$PROD_SYSID" ] || { echo "REFUSED: target database is the production cluster" >&2; exit 2; }
# (2) Positive identification: the rehearsal project carries a marker table that production and staging do not (it lives outside public, so the empty-public check still holds).
[ "$(tq -c "select count(*) from rehearsal_marker.identity where ref='$REHEARSAL_REF'" 2>/dev/null || echo 0)" = 1 ] \
  || { echo "REFUSED: rehearsal marker (rehearsal_marker.identity = $REHEARSAL_REF) not found in the target database" >&2; exit 2; }
# No anonymous-readable window while the data loads: new objects must not default-grant the API roles (tables, sequences), nor PUBLIC/API roles (functions).
tq -c "alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated; alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated; alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated; alter default privileges for role postgres revoke execute on functions from public;"
# pg_restore errors can quote data, so only counts and the first error messages (no "Command was" lines) are shown.
pg_restore --no-owner --dbname="$DB" "$d/db.dump" 2>"$work/restore.err" || true
# A dump made while the dedicated backup account existed carries GRANTs to it; that account is not part of the restored project.
bad="$(grep -E '^pg_restore: error:' "$work/restore.err" | grep -v 'schema "public" already exists' | grep -v 'role "backup_reader" does not exist' | grep -vi 'command was' || true)"
if [ -n "$bad" ]; then echo "restore errors: $(echo "$bad" | wc -l | tr -d ' ')"; echo "$bad" | head -3 | cut -c1-140; exit 6; fi
lap "database restored"

# Access boundary. New Supabase projects default-grant anon/authenticated on new tables, and a dump cannot undo that.
# Revoke everything for the three API roles, replay the source's exact grants, then require a matching fingerprint.
tq -c "do \$\$ declare r record; begin for r in select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','v','m') loop execute format('revoke all on public.%I from anon, authenticated, service_role', r.relname); end loop; end \$\$;"
psql "$DB" -X -q -v ON_ERROR_STOP=1 -f "$d/acl_replay.sql" >/dev/null
# Function privileges: new projects default-grant EXECUTE on public functions to anon/authenticated/service_role, and the
# fingerprint hashes function definitions, not their ACLs. Reset every public function to the plain default (PUBLIC execute
# only), then apply the GRANT/REVOKE lines the dump holds for functions, and print the result for comparison with the source.
tq -c "do \$\$ declare r record; begin for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace='public'::regnamespace loop execute format('revoke all on function %s from public, anon, authenticated, service_role', r.sig); execute format('grant execute on function %s to public', r.sig); end loop; end \$\$;"
pg_restore --schema=public -f - "$d/db.dump" 2>/dev/null | grep -E '^(GRANT|REVOKE) .* ON FUNCTION ' > "$work/function_acl.sql" || true
if [ -s "$work/function_acl.sql" ]; then psql "$DB" -X -q -v ON_ERROR_STOP=1 -f "$work/function_acl.sql" >/dev/null; fi
echo "function privileges after restore (execute: public/anon/authenticated/service_role):"
tq -c "select p.proname, coalesce((select bool_or(a.grantee=0) from aclexplode(p.proacl) a where a.privilege_type='EXECUTE'), true), has_function_privilege('anon',p.oid,'execute'), has_function_privilege('authenticated',p.oid,'execute'), has_function_privilege('service_role',p.oid,'execute') from pg_proc p where p.pronamespace='public'::regnamespace order by 1" | sed 's/^/  /'
tq -f "$here/fingerprint.sql" > "$work/fingerprint.target.tsv"
boundary=0
while IFS=$'\t' read -r k h n; do
  tgt="$(awk -F'\t' -v k="$k" '$1==k{print $2" "$3}' "$work/fingerprint.target.tsv")"
  if [ "$tgt" = "$h $n" ]; then echo "ok   fingerprint $k ($n lines)"; else echo "DIFF fingerprint $k source=$h/$n restored=$tgt"; boundary=1; fi
done < "$d/fingerprint.tsv"
lap "schema and access boundary compared"
if [ "$boundary" != 0 ]; then
  # Containment (rehearsal project only, already verified as the target above): cut the API roles off from the restored data now.
  tq -c "revoke usage on schema public from anon, authenticated; revoke all on all tables in schema public from anon, authenticated; revoke all on all sequences in schema public from anon, authenticated; revoke all on all functions in schema public from public, anon, authenticated;" >/dev/null 2>&1 \
    && echo "CONTAINED: anon/authenticated access to schema public was revoked on the rehearsal project." >&2 \
    || echo "CONTAINMENT FAILED: turn off the Data API for the rehearsal project in its dashboard now." >&2
  echo "ACCESS BOUNDARY DIFFERS: DO NOT EXPOSE THIS DATABASE TO TRAFFIC (also turn off the Data API for the rehearsal project in its dashboard until investigated)" >&2; exit 4
fi

fail=0
while IFS=$'\t' read -r t n; do
  [ "$t" = storage_objects ] && continue
  got="$(tq -c "select count(*) from public.$t" 2>/dev/null || echo ERR)"
  [ "$got" = "$n" ] && echo "ok   rows $t $got" || { echo "DIFF rows $t source=$n restored=$got"; fail=5; }
done < "$d/row_counts.tsv"
lap "row counts compared"
[ "$fail" = 0 ] || exit "$fail"

# Storage objects: create buckets, upload every file, download again and compare hashes to the manifest.
SB_KEY="$RESTORE_SERVICE_KEY"; API="$RESTORE_SUPABASE_URL/storage/v1"
jq -c '.[]' "$d/buckets.json" | while IFS= read -r b; do
  sb_curl -o /dev/null -X POST -H 'content-type: application/json' -d "$b" "$API/bucket" || echo "note: bucket create returned an error (may already exist)"
done
up=0
while IFS=$'\t' read -r b name size; do
  mime="$(file --mime-type -b "$d/storage/$b/$name")"
  sb_curl -o /dev/null -X POST -H "content-type: $mime" -H 'x-upsert: true' --data-binary "@$d/storage/$b/$name" "$API/object/$b/$(uri_path "$name")" \
    || { echo "upload failed for object #$((up + 1))"; exit 7; }
  up=$((up + 1))
done < "$d/storage_objects.tsv"
lap "uploaded $up storage objects"
ok=0
mkdir -p "$work/verify"
while IFS=$'\t' read -r b name size; do
  sb_curl -o "$work/verify/obj" "$API/object/$b/$(uri_path "$name")" || { echo "download failed for an object"; exit 7; }
  want="$(awk -v p="storage/$b/$name" '/^--- sha256/{go=1; next} go && substr($0, 67)==p {print substr($0,1,64)}' "$d/MANIFEST.txt")"
  have="$(sha256 "$work/verify/obj" | cut -d' ' -f1)"
  [ -n "$want" ] && [ "$want" = "$have" ] && ok=$((ok + 1)) || { echo "HASH MISMATCH on object #$((ok + 1))"; exit 7; }
done < "$d/storage_objects.tsv"
rows="$(tq -c "select count(*), coalesce(sum((metadata->>'size')::bigint),0) from storage.objects")"
[ "$rows" = "$(printf '%s\t%s' "$(awk -F= '$1=="storage_files"{print $2}' "$d/MANIFEST.txt")" "$(awk -F= '$1=="storage_bytes"{print $2}' "$d/MANIFEST.txt")")" ] \
  || { echo "STORAGE COUNT/BYTES DIFFER from the archive (restored rows,bytes = $rows)"; exit 7; }
echo "storage: $ok/$up objects round-trip hash-verified; storage.objects (rows, bytes) = $rows; archive says $(awk -F= '$1=="storage_files"{print $2}' "$d/MANIFEST.txt") files, $(awk -F= '$1=="storage_bytes"{print $2}' "$d/MANIFEST.txt") bytes"
lap "storage verified"
echo "events_public rows: $(tq -c 'select count(*) from public.events_public')"
echo "RECOVERY POINT (archive created_utc): $created"
lap "ALL CHECKS PASSED (record this total as measured recovery time)"
