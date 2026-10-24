#!/usr/bin/env bash
# Runs backup.sh with sentinel secret values and fails if any sentinel appears in stdout/stderr, the manifest, or any script uses `set -x`.
set -Eeuo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
if grep -nE '^\s*set -[a-z]*x|bash -x' "$here"/*.sh; then echo "FAIL: xtrace in a script"; exit 1; fi
tmp="$(mktemp -d)"; mkdir "$tmp/bin"
for c in pg_restore; do printf '#!/usr/bin/env bash\nexit 0\n' > "$tmp/bin/$c"; done
printf '#!/usr/bin/env bash\n[ "$1" = "--version" ] && { echo "pg_dump (stub) 17.0"; exit 0; }\nfor a in "$@"; do case $a in --file=*) echo stub > "${a#--file=}"; esac; done\n' > "$tmp/bin/pg_dump"
printf '#!/usr/bin/env bash\nprintf "events\\t1\\n"\n' > "$tmp/bin/psql"
printf '#!/usr/bin/env bash\ncase "$*" in *"/bucket"*) echo "[]";; esac\n' > "$tmp/bin/curl"
chmod +x "$tmp/bin/"*
id="$tmp/id"; age-keygen -o "$id" 2>/dev/null; key="$(age-keygen -y "$id")"
export PATH="$tmp/bin:$PATH"
DBS="postgres://u:SENTINEL_DB_PASSWORD_9f3@h/db" SVC="SENTINEL_SERVICE_KEY_7c1"
out="$(BACKUP_DRY_RUN=1 BACKUP_DIR="$tmp/o" AGE_RECIPIENT="$key" SUPABASE_DB_URL="$DBS" SUPABASE_URL=https://x.supabase.co SUPABASE_SERVICE_ROLE_KEY="$SVC" "$here/backup.sh" 2>&1)"
if grep -rq 'SENTINEL_' <<<"$out" "$tmp/o"/*/MANIFEST.txt "$tmp/o"/*.manifest.txt; then echo "FAIL: secret leaked"; exit 1; fi
echo "PASS: no secret in output or manifest, no xtrace"
rm -rf "$tmp"
