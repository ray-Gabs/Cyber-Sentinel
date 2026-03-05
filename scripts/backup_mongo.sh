#!/usr/bin/env bash
# Daily MongoDB backup — run via cron on the VM host.
# Retention: 7 days. Requires MONGO_USERNAME and MONGO_PASSWORD in environment.
#
# Crontab entry (crontab -e):
#   0 2 * * * MONGO_USERNAME=cyber_sentinel MONGO_PASSWORD=<pass> /opt/cyber-sentinel/scripts/backup_mongo.sh >> /var/log/mongo_backup.log 2>&1
#
# Restore:
#   docker cp <backup_dir> cyber-sentinel-mongo:/tmp/restore
#   docker exec cyber-sentinel-mongo mongorestore \
#     --username "$MONGO_USERNAME" --password "$MONGO_PASSWORD" --drop /tmp/restore

set -euo pipefail

BACKUP_DIR="/opt/cyber-sentinel/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEST="${BACKUP_DIR}/mongo_${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting backup → ${DEST}"

docker exec cyber-sentinel-mongo mongodump \
  --username "${MONGO_USERNAME}" \
  --password "${MONGO_PASSWORD}" \
  --authenticationDatabase admin \
  --out "/tmp/mongodump_${TIMESTAMP}"

docker cp "cyber-sentinel-mongo:/tmp/mongodump_${TIMESTAMP}" "${DEST}"
docker exec cyber-sentinel-mongo rm -rf "/tmp/mongodump_${TIMESTAMP}"

# Prune backups older than 7 days
find "${BACKUP_DIR}" -maxdepth 1 -name "mongo_*" -mtime +7 -exec rm -rf {} +

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup complete: ${DEST}"
