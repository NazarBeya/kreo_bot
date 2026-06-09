#!/bin/sh
set -eu

marker="$1/.last_success"
max_age_seconds="${BACKUP_MAX_AGE_SECONDS:-93600}"

if [ ! -f "$marker" ]; then
  exit 1
fi

now="$(date +%s)"
updated="$(stat -c %Y "$marker" 2>/dev/null || stat -f %m "$marker")"
age="$((now - updated))"

[ "$age" -le "$max_age_seconds" ]
