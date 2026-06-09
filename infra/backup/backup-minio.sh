#!/bin/sh
set -eu

mkdir -p /backups/minio
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="/backups/minio/creative_files_${timestamp}.tar.gz"

tar -czf "$archive" -C /data .
sha256sum "$archive" > "$archive.sha256"
printf '%s\n' "$archive" > /backups/minio/.last_success

if [ -n "${BACKUP_OFFSITE_DIR:-}" ] && [ -d "$BACKUP_OFFSITE_DIR" ]; then
  mkdir -p "$BACKUP_OFFSITE_DIR/minio"
  cp "$archive" "$archive.sha256" "$BACKUP_OFFSITE_DIR/minio/"
fi

find /backups/minio -type f -mtime +"${BACKUP_RETENTION_DAYS:-30}" -delete
echo "MinIO backup written to $archive"
