UPDATE PlatformSecurityPolicy
SET requireMfaSuperAdmin = 1,
    requireMfaTenantAdmin = 1,
    updatedAt = NOW(3)
WHERE id = 'global-security-policy';

UPDATE DataRetentionPolicy
SET auditLogDays = GREATEST(auditLogDays, 2190),
    updatedAt = NOW(3)
WHERE id = 'global-retention-policy';
