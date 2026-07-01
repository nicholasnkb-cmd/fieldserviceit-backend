UPDATE BackupPolicy
SET retentionCount = 30, destination = 'OFFSITE_ENCRYPTED', updatedAt = NOW(3)
WHERE id = 'global-backup-policy' AND retentionCount < 30;
