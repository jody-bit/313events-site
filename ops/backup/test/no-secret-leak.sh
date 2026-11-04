#!/usr/bin/env bash
# Runs backup.sh with sentinel secrets and fails if a sentinel appears in stdout/stderr, the manifest, the output folder, or ANY
# process argument (stubs log their argv), or if a script uses `set -x`. Also proves Storage files are fetched anonymously: no Storage key is read, no credential header or -K config reaches curl.
set -Eeuo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
if grep -nE '^\s*set -[a-z]*x|bash -x' "$here"/*.sh; then echo "FAIL: xtrace in a script"; exit 1; fi
tmp="$(mktemp -d)"; mkdir "$tmp/bin"; : > "$tmp/argv.log"; : > "$tmp/curlcfg.log"
for c in pg_restore pg_dump psql; do cat > "$tmp/bin/$c" <<S
#!/usr/bin/env bash
echo "$c \$*" >> "$tmp/argv.log"
[ "$c" = pg_dump ] && { [ "\$1" = "--version" ] && { echo "pg_dump (stub) 17.0"; exit 0; }; for a in "\$@"; do case \$a in --file=*) f="\${a#--file=}"; echo stub > "\$f"; case "\$f" in storage_meta.sql) printf 'COPY storage.objects (a) FROM stdin;\\nrow1\\n\\\\.\\n' >> "\$f";; esac;; esac; done; }
if [ "$c" = psql ]; then sql="\$(cat)"; case "\$sql" in *"from storage.objects order by"*) printf 'b\tk.jpg\t3\t-\t-\n';; *json_agg*) echo '[{"id":"b","name":"b","public":true}]';; *"select 'events'"*) printf 'events\t1\nstorage_objects\t1\n';; *) printf 'x\ty\t1\n';; esac; fi
exit 0
S
done
cat > "$tmp/bin/curl" <<S
#!/usr/bin/env bash
echo "curl \$*" >> "$tmp/argv.log"
prev=""; out=""; for a in "\$@"; do [ "\$prev" = "-K" ] && cat "\$a" >> "$tmp/curlcfg.log"; [ "\$prev" = "-o" ] && out="\$a"; prev="\$a"; done
[ -n "\$out" ] && printf 'abc' > "\$out"; exit 0
S
chmod +x "$tmp/bin/"*
age-keygen -o "$tmp/id" 2>/dev/null; key="$(age-keygen -y "$tmp/id")"
export PATH="$tmp/bin:$PATH"
out="$(PGHOST=h PGUSER=u PGPASSWORD="SENTINEL_DB_PASSWORD_9f3" BACKUP_DRY_RUN=1 BACKUP_DIR="$tmp/o" AGE_RECIPIENT="$key" SUPABASE_URL=https://x.supabase.co SUPABASE_SERVICE_ROLE_KEY="SENTINEL_SERVICE_KEY_7c1" "$here/backup.sh" 2>&1)"
if grep -rq 'SENTINEL_' <<<"$out" "$tmp/o" "$tmp/argv.log"; then echo "FAIL: secret leaked (output, files, or argv)"; exit 1; fi
[ ! -s "$tmp/curlcfg.log" ] && ! grep -qiE 'apikey|authorization|bearer| -K ' "$tmp/argv.log" || { echo "FAIL: a credential or -K config reached curl on the public Storage path"; exit 1; }
grep -q '/storage/v1/object/public/b/k.jpg' "$tmp/argv.log" || { echo "FAIL: public object URL was not used"; exit 1; }
echo "PASS: no secret in output, files or process arguments; Storage fetched from public URLs with no credential; no xtrace"
rm -rf "$tmp"
