#!/usr/bin/env bash
# Offline test of backup.sh using stub pg_dump/pg_restore/psql/curl. Proves flow, manifest and encryption; does not touch any database.
set -Eeuo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; mkdir "$tmp/bin"
cat >"$tmp/bin/pg_dump" <<'S'
#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "pg_dump (stub) 17.0"; exit 0; fi
for a in "$@"; do case $a in --file=*) echo "-- stub $a" > "${a#--file=}"; esac; done
S
cat >"$tmp/bin/pg_restore" <<'S'
#!/usr/bin/env bash
exit 0
S
cat >"$tmp/bin/psql" <<'S'
#!/usr/bin/env bash
printf 'events\t10\nvenues\t2\n'
S
cat >"$tmp/bin/curl" <<'S'
#!/usr/bin/env bash
args="$*"
case "$args" in
  *"/storage/v1/bucket"*) echo '[{"id":"event-flyers"}]' ;;
  *"object/list/event-flyers"*) if [ -f "$STUB_LISTED" ]; then echo '[]'; else touch "$STUB_LISTED"; echo '[{"id":"x","name":"a b.jpg"}]'; fi ;;
  *"object/event-flyers/"*) out=""; prev=""; for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done; echo jpegdata > "$out" ;;
esac
S
chmod +x "$tmp/bin/"*
key="$(age-keygen 2>"$tmp/pub" | grep -v '^#' > "$tmp/id"; sed -n 's/.*Public key: //p' "$tmp/pub")"
[ -n "$key" ] || key="$(age-keygen -y "$tmp/id")"
export PATH="$tmp/bin:$PATH" STUB_LISTED="$tmp/listed"
BACKUP_DRY_RUN=1 BACKUP_DIR="$tmp/out" AGE_RECIPIENT="$key" SUPABASE_DB_URL=postgres://stub SUPABASE_URL=https://stub.supabase.co SUPABASE_SERVICE_ROLE_KEY=stub "$here/backup.sh"
f="$(ls "$tmp"/out/*.tar.age)"
age -d -i "$tmp/id" "$f" | tar -xO --wildcards '*/MANIFEST.txt' | grep -q 'storage_files=1'
! grep -aq 'jpegdata' "$f"        # ciphertext only
echo "PASS: backup flow, manifest and encryption"
rm -rf "$tmp"
