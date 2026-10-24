# Shared helpers, sourced by the backup and restore scripts. Portable to stock macOS (bash 3.2, BSD tools) and Linux.
# No secret is ever placed on a command line: database credentials travel in PG* environment variables, the Storage
# key in a curl config read from a pipe (printf is a shell builtin, so it never appears in a process listing).

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
sha256_check() { if command -v sha256sum >/dev/null 2>&1; then sha256sum -c --quiet; else shasum -a 256 -c --quiet; fi; }  # reads "hash  path" lines on stdin
fsize() { wc -c < "$1" | tr -d ' '; }
md5_of() { if command -v md5sum >/dev/null 2>&1; then md5sum "$1" | cut -d" " -f1; else md5 -q "$1"; fi; }
uri_path() { jq -rn --arg n "$1" '$n|split("/")|map(@uri)|join("/")'; }

# sb_curl <curl args...>   needs SB_KEY
sb_curl() { curl -fsS -K <(printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' "$SB_KEY" "$SB_KEY") "$@"; }

# q reads SQL on stdin and runs it in a session forced to read-only. -q keeps command tags out of the output.
q() { { echo "set default_transaction_read_only = on;"; cat; } | psql "${DB:-dbname=postgres}" -X -q -At -F $'\t' -v ON_ERROR_STOP=1; }

# sweep_stale <output dir>: remove plaintext left by an earlier run that was killed (SIGKILL, crash, power loss).
sweep_stale() {
  local d
  for d in "${TMPDIR:-/tmp}"/313events-work.* "${TMPDIR:-/tmp}"/313events-verify.* "$1"/313events-[0-9]*T[0-9]*Z; do
    [ -d "$d" ] && rm -rf "$d"
  done
  return 0
}
