#!/usr/bin/env bash
# Mac wrapper for restore-rehearsal.sh. Restores the newest local archive into the TEMPORARY rehearsal project only.
# Secrets are prompted hidden (or read from env/Keychain) and never echoed, written to disk, or put in argv.
set -Eeuo pipefail
set +x
umask 077
here="$(cd "$(dirname "$0")" && pwd)"; . "$here/lib.sh"
REHEARSAL_REF="ysevatiihdticidmnmeh"
OUT="${BACKUP_OUT:-$HOME/Documents/313.events/backups}"
if command -v brew >/dev/null 2>&1; then pgbin="$(brew --prefix postgresql@17 2>/dev/null || true)/bin"; [ -d "$pgbin" ] && export PATH="$pgbin:$PATH"; fi
for t in pg_restore psql age jq curl tar awk file; do command -v "$t" >/dev/null || { echo "missing tool: $t" >&2; exit 1; }; done
ARCHIVE="${ARCHIVE:-$(ls -t "$OUT"/*.tar.age 2>/dev/null | head -1)}"
[ -f "$ARCHIVE" ] || { echo "no archive found in $OUT" >&2; exit 1; }
read -r -p "Rehearsal project pooler host (dashboard > Connect, project $REHEARSAL_REF): " PGHOST </dev/tty
read -r -s -p "Rehearsal database password (hidden): " PGPASSWORD </dev/tty; echo >&2
read -r -s -p "Rehearsal service-role key (hidden): " RESTORE_SERVICE_KEY </dev/tty; echo >&2
export PGHOST PGPASSWORD RESTORE_SERVICE_KEY ARCHIVE PGPORT=5432 PGUSER="postgres.$REHEARSAL_REF" PGDATABASE=postgres
export RESTORE_SUPABASE_URL="https://$REHEARSAL_REF.supabase.co" AGE_IDENTITY="$HOME/.313events-backup/age.key"
echo "Restoring $(basename "$ARCHIVE") into project $REHEARSAL_REF (not production, not staging)"
"$here/restore-rehearsal.sh"
