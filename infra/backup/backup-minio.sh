#!/bin/sh
set -eu

mkdir -p /backups/minio
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="/backups/minio/creative_files_${timestamp}.tar.gz"

tar -czf "$archive" -C /data .
find /backups/minio -type f -mtime +"${BACKUP_RETENTION_DAYS:-30}" -delete
echo "MinIO backup written to $archive"
