#!/bin/sh
set -eu

mkdir -p /backups/postgres
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="/backups/postgres/creative_bot_${timestamp}.dump"

pg_dump "$DATABASE_URL" --format=custom --file="$file"
find /backups/postgres -type f -mtime +"${BACKUP_RETENTION_DAYS:-30}" -delete
echo "Postgres backup written to $file"
