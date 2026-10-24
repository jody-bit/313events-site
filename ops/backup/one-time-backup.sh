#!/usr/bin/env bash
# One-time local backup for the owner's Mac. Credentials are never typed into chat, passed as arguments, echoed, or written to disk.
# Each secret is read from, in order: an existing environment variable, the macOS Keychain, or a hidden prompt (read -s).
#
# One-time Keychain setup (optional; each command prompts for the value, nothing is echoed):
#   security add-generic-password -a "$USER" -s 313events-backup-db-url -w
#   security add-generic-password -a "$USER" -s 313events-backup-storage-key -w
# The age key pair is generated on first run at ~/.313events-backup/age.key (mode 600, outside the repo and CI).
# Keep a second copy of that file in the password manager; losing it makes every archive unreadable.
set -Eeuo pipefail
set +x
umask 077

SUPABASE_URL="${SUPABASE_URL:-https://afvyfjfqukptnfmgshzn.supabase.co}"
OUT="${BACKUP_OUT:-$HOME/Documents/313.events/backups}"
KEYDIR="$HOME/.313events-backup"

secret() {  # name, keychain service, prompt text
  local val="${!1:-}"
  if [ -z "$val" ] && command -v security >/dev/null 2>&1; then
    val="$(security find-generic-password -a "$USER" -s "$2" -w 2>/dev/null || true)"
  fi
  if [ -z "$val" ]; then
    read -r -s -p "$3: " val </dev/tty; echo >&2
  fi
  [ -n "$val" ] || { echo "missing $1" >&2; exit 1; }
  printf -v "$1" '%s' "$val"
}

for t in pg_dump pg_restore psql age age-keygen jq curl; do command -v "$t" >/dev/null || { echo "missing tool: $t (macOS: brew install postgresql@17 age jq)" >&2; exit 1; }; done
case "$(pg_dump --version)" in *" 17."*) ;; *) echo "pg_dump 17 required (found: $(pg_dump --version))" >&2; exit 1;; esac

mkdir -p "$KEYDIR" "$OUT"; chmod 700 "$KEYDIR"
if [ ! -f "$KEYDIR/age.key" ]; then
  age-keygen -o "$KEYDIR/age.key" 2>/dev/null; chmod 600 "$KEYDIR/age.key"
  echo "Created age key at $KEYDIR/age.key. Copy it to your password manager NOW; it is not recoverable." >&2
fi
AGE_RECIPIENT="$(age-keygen -y "$KEYDIR/age.key")"

secret SUPABASE_DB_URL 313events-backup-db-url "Session-pooler database URL (hidden)"
secret SUPABASE_SERVICE_ROLE_KEY 313events-backup-storage-key "Storage service key (hidden)"
export SUPABASE_URL AGE_RECIPIENT SUPABASE_DB_URL SUPABASE_SERVICE_ROLE_KEY
export BACKUP_DRY_RUN=1 BACKUP_DIR="$OUT"     # local only: nothing is uploaded

"$(dirname "$0")/backup.sh"
f="$(ls -t "$OUT"/*.tar.age | head -1)"
echo
echo "Archive: $f"; ls -l "$f" | awk '{print "Size bytes:", $5}'
echo "Manifest row counts:"; sed -n '/^--- row_counts/,/^--- sha256/p' "$OUT"/313events-*/MANIFEST.txt 2>/dev/null | tail -n +2 | head -n -1 | tail -20
echo "Next: run restore-rehearsal.sh against the temporary project, using AGE_IDENTITY=$KEYDIR/age.key"
