#!/bin/bash

# Automated backup script with S3 upload
set -e

# Configuration
BACKUP_DIR="/app/backups"
DATA_DIR="/app/data"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}

echo "[$(date)] Starting backup..."

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# 1. Backup SQLite database
if [ -f "$DATA_DIR/database.sqlite" ]; then
    echo "[$(date)] Backing up database..."
    sqlite3 "$DATA_DIR/database.sqlite" ".backup $BACKUP_DIR/db_backup_$TIMESTAMP.sqlite"
    gzip "$BACKUP_DIR/db_backup_$TIMESTAMP.sqlite"
fi

# 2. Backup logs
if [ -d "/app/logs" ]; then
    echo "[$(date)] Backing up logs..."
    tar -czf "$BACKUP_DIR/logs_backup_$TIMESTAMP.tar.gz" -C /app logs/
fi

# 3. Backup documents
if [ -d "/app/documents" ]; then
    echo "[$(date)] Backing up documents..."
    tar -czf "$BACKUP_DIR/documents_backup_$TIMESTAMP.tar.gz" -C /app documents/
fi

# 4. Upload to S3 if configured
if [ ! -z "$S3_BUCKET" ]; then
    echo "[$(date)] Uploading to S3..."
    aws s3 cp "$BACKUP_DIR/db_backup_$TIMESTAMP.sqlite.gz" "s3://$S3_BUCKET/backups/database/" || true
    aws s3 cp "$BACKUP_DIR/logs_backup_$TIMESTAMP.tar.gz" "s3://$S3_BUCKET/backups/logs/" || true
    aws s3 cp "$BACKUP_DIR/documents_backup_$TIMESTAMP.tar.gz" "s3://$S3_BUCKET/backups/documents/" || true
fi

# 5. Clean up old local backups
echo "[$(date)] Cleaning up old backups..."
find $BACKUP_DIR -name "*.gz" -mtime +$RETENTION_DAYS -delete

# 6. Clean up old S3 backups if configured
if [ ! -z "$S3_BUCKET" ]; then
    echo "[$(date)] Cleaning up old S3 backups..."
    aws s3 ls "s3://$S3_BUCKET/backups/database/" | while read -r line; do
        createDate=$(echo $line | awk '{print $1" "$2}')
        createDate=$(date -d "$createDate" +%s)
        olderThan=$(date -d "$RETENTION_DAYS days ago" +%s)
        if [[ $createDate -lt $olderThan ]]; then
            fileName=$(echo $line | awk '{print $4}')
            aws s3 rm "s3://$S3_BUCKET/backups/database/$fileName"
        fi
    done
fi

echo "[$(date)] Backup completed successfully!"

# Report backup size
BACKUP_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
echo "[$(date)] Total backup size: $BACKUP_SIZE"