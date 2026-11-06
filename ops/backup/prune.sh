#!/usr/bin/env bash
# Retention: keep 14 daily, 8 weekly (Sunday), 12 monthly (first of month). Deletes only inside RCLONE_REMOTE/daily.
# Default is a dry run; set PRUNE_APPLY=1 to delete. Requires an owner-approved retention policy in RUNBOOK.md.
set -Eeuo pipefail
: "${RCLONE_REMOTE:?}"
mapfile -t all < <(rclone lsf "$RCLONE_REMOTE/daily" --include '*.tar.age' | sort -r)
keep=(); d=0; w=0; m=0; declare -A seenw seenm
for f in "${all[@]}"; do
  s="${f#313events-}"; day="${s:0:8}"
  dow="$(date -u -d "${day}" +%u)"; wk="$(date -u -d "$day" +%G%V)"; mo="${day:0:6}"
  k=0
  if [ $d -lt 14 ]; then d=$((d+1)); k=1; fi
  if [ "$dow" = 7 ] && [ -z "${seenw[$wk]:-}" ] && [ $w -lt 8 ]; then seenw[$wk]=1; w=$((w+1)); k=1; fi
  if [ -z "${seenm[$mo]:-}" ] && [ $m -lt 12 ]; then seenm[$mo]=1; m=$((m+1)); k=1; fi
  if [ $k = 1 ]; then keep+=("$f"); else
    echo "prune: $f"
    if [ "${PRUNE_APPLY:-0}" = 1 ]; then
      base="${f%.tar.age}"
      for obj in "$base.tar.age" "$base.tar.age.sha256" "$base.manifest.txt"; do rclone deletefile "$RCLONE_REMOTE/daily/$obj" || true; done
    fi
  fi
done
echo "kept ${#keep[@]} of ${#all[@]}"
