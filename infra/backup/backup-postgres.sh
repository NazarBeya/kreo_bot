#!/bin/sh
set -eu

mkdir -p /backups/postgres
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="/backups/postgres/creative_bot_${timestamp}.dump"

pg_dump "$DATABASE_URL" --format=custom --file="$file"
sha256sum "$file" > "$file.sha256"
printf '%s\n' "$file" > /backups/postgres/.last_success

if [ -n "${BACKUP_OFFSITE_DIR:-}" ] && [ -d "$BACKUP_OFFSITE_DIR" ]; then
  mkdir -p "$BACKUP_OFFSITE_DIR/postgres"
  cp "$file" "$file.sha256" "$BACKUP_OFFSITE_DIR/postgres/"
fi

find /backups/postgres -type f -mtime +"${BACKUP_RETENTION_DAYS:-30}" -delete
echo "Postgres backup written to $file"
