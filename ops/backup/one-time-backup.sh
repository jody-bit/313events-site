#!/usr/bin/env bash
# One-time local backup for the owner's Mac. Nothing secret is typed into chat, passed as an argument, echoed, or written to disk.
# Each secret is read from, in order: an existing environment variable, the macOS Keychain, or a hidden prompt (read -s).
#
# Optional one-time Keychain setup (each command prompts for the value; nothing is echoed):
#   security add-generic-password -a "$USER" -s 313events-backup-db-password -w
#   security add-generic-password -a "$USER" -s 313events-backup-storage-key -w
# The age key pair is generated on first run at ~/.313events-backup/age.key (mode 600, outside the repo and CI).
# Keep a second copy of that file in the password manager; losing it makes every archive unreadable.
#
# Read-only guarantee: every database session sets default_transaction_read_only, pg_dump uses a READ ONLY transaction,
# and Storage is accessed with GET only. No SQL in this directory writes. The output folder receives ciphertext only.
set -Eeuo pipefail
set +x
umask 077
here="$(cd "$(dirname "$0")" && pwd)"; . "$here/lib.sh"

PROD_REF="afvyfjfqukptnfmgshzn"
SUPABASE_URL="https://$PROD_REF.supabase.co"
OUT="${BACKUP_OUT:-$HOME/Documents/313.events/backups}"
KEYDIR="$HOME/.313events-backup"

# Homebrew's postgresql@17 is keg-only; put it on PATH if present.
if command -v brew >/dev/null 2>&1; then
  pgbin="$(brew --prefix postgresql@17 2>/dev/null || true)/bin"
  [ -d "$pgbin" ] && export PATH="$pgbin:$PATH"
fi

secret() {  # variable name, keychain service, prompt text
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

for t in pg_dump pg_restore psql age age-keygen jq curl tar awk; do
  command -v "$t" >/dev/null || { echo "missing tool: $t   (macOS: brew install postgresql@17 age jq)" >&2; exit 1; }
done
command -v sha256sum >/dev/null || command -v shasum >/dev/null || { echo "missing tool: shasum" >&2; exit 1; }
case "$(pg_dump --version)" in *" 17."*) ;; *) echo "pg_dump 17 required (found: $(pg_dump --version)). Run: brew install postgresql@17" >&2; exit 1;; esac

mkdir -p "$KEYDIR" "$OUT"; chmod 700 "$KEYDIR"
if [ ! -f "$KEYDIR/age.key" ]; then
  age-keygen -o "$KEYDIR/age.key" 2>/dev/null; chmod 600 "$KEYDIR/age.key"
  echo "Created age key at $KEYDIR/age.key. Copy it to your password manager NOW; it is not recoverable." >&2
fi
AGE_RECIPIENT="$(age-keygen -y "$KEYDIR/age.key")"

# Non-secret connection details (Supabase dashboard > Connect > Session pooler). The password is prompted hidden.
PGHOST="${PGHOST:-}"
if [ -z "$PGHOST" ]; then
  read -r -p "Session pooler host (dashboard > Connect), e.g. aws-0-us-west-2.pooler.supabase.com: " PGHOST </dev/tty
fi
export PGHOST PGPORT=5432 PGUSER="postgres.$PROD_REF" PGDATABASE=postgres PGSSLMODE=require
secret PGPASSWORD 313events-backup-db-password "Production database password (hidden)"
secret SUPABASE_SERVICE_ROLE_KEY 313events-backup-storage-key "Production service-role key, used only for Storage GET (hidden)"
export PGPASSWORD SUPABASE_URL AGE_RECIPIENT SUPABASE_SERVICE_ROLE_KEY
export BACKUP_DRY_RUN=1 BACKUP_DIR="$OUT"     # local only: nothing is uploaded

# Preflight: prove the connection works and the session is read-only, before any dump starts.
DB="dbname=postgres"
pre="$(echo "show transaction_read_only; select current_setting('server_version'), (select count(*) from storage.objects), (select coalesce(sum((metadata->>'size')::bigint),0) from storage.objects);" | q)" \
  || { echo "Cannot connect with those details. Check the host and password (not stored anywhere)." >&2; exit 1; }
echo "Preflight (read-only session): $(echo "$pre" | tr '\n\t' ' ')   [read-only flag, server version, storage objects, storage bytes]"

"$here/backup.sh"
f="$(ls -t "$OUT"/*.tar.age | head -1)"
base="${f%.tar.age}"

# Test decrypt with the private key, verify every hash inside, then delete the plaintext again.
tmpd="$(mktemp -d)"; trap 'rm -rf "$tmpd"' EXIT
age -d -i "$KEYDIR/age.key" "$f" | tar -x -C "$tmpd"
d="$(echo "$tmpd"/313events-*)"
( cd "$d" && awk '/^--- sha256/{go=1; next} go' MANIFEST.txt | sha256_check )
files_in="$(find "$d/storage" -type f | wc -l | tr -d ' ')"
sf="$(awk -F= '$1=="storage_files"{print $2}' "$d/MANIFEST.txt")"
[ "$files_in" = "$sf" ] || { echo "decrypted archive has $files_in storage files, manifest says $sf" >&2; exit 1; }

echo
echo "BACKUP OK (decrypt and every hash verified; plaintext removed)"
echo "Archive:  $f"
echo "Size:     $(fsize "$f") bytes"
echo "SHA-256:  $(cut -d' ' -f1 "$base.tar.age.sha256")"
echo "Created:  $(awk -F= '$1=="created_utc"{print $2}' "$base.manifest.txt")"
echo "Storage:  $(awk -F= '$1=="storage_files"{print $2}' "$base.manifest.txt") files, $(awk -F= '$1=="storage_bytes"{print $2}' "$base.manifest.txt") bytes"
echo "Row counts:"
awk '/^--- row_counts/{go=1; next} /^--- sha256/{go=0} go' "$base.manifest.txt" | sed 's/^/  /'
echo "Next: restore into the temporary project with ops/backup/restore-mac.sh (age key: $KEYDIR/age.key)"
