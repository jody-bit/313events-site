#!/usr/bin/env bash
# Dead-man's switch: fails (and alerts) when the newest off-site backup is missing, too old, or its hash does not match.
# Needs only RCLONE_REMOTE (read access to the bucket). Never needs the age private key.
#   MAX_AGE_HOURS (default 30)   ALERT_WEBHOOK_URL (optional)
set -Eeuo pipefail
: "${RCLONE_REMOTE:?}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-30}"
fail() { echo "BACKUP CHECK FAILED: $1" >&2
  [ -n "${ALERT_WEBHOOK_URL:-}" ] && curl -fsS -m 10 -X POST -d "313.events backup check FAILED: $1" "$ALERT_WEBHOOK_URL" >/dev/null || true
  exit 1; }

latest="$(rclone lsf "$RCLONE_REMOTE/daily" --include '*.tar.age' | sort | tail -1)"
[ -n "$latest" ] || fail "no backups found"
stamp="${latest#313events-}"; stamp="${stamp%.tar.age}"
created="$(date -u -d "${stamp:0:4}-${stamp:4:2}-${stamp:6:2}T${stamp:9:2}:${stamp:11:2}:${stamp:13:2}Z" +%s)"
age_h=$(( ( $(date -u +%s) - created ) / 3600 ))
[ "$age_h" -le "$MAX_AGE_HOURS" ] || fail "newest backup is ${age_h}h old (limit ${MAX_AGE_HOURS}h)"
want="$(rclone cat "$RCLONE_REMOTE/daily/$latest.sha256" | cut -d' ' -f1)"
got="$(rclone cat "$RCLONE_REMOTE/daily/$latest" | sha256sum | cut -d' ' -f1)"
[ "$want" = "$got" ] || fail "hash mismatch for $latest"
size="$(rclone size --json "$RCLONE_REMOTE/daily/$latest" | jq .bytes)"
[ "$size" -gt 1000000 ] || fail "$latest is suspiciously small (${size} bytes)"
echo "ok: $latest age=${age_h}h size=${size}"
