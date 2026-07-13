UPDATE PlatformSecurityPolicy
SET requireMfaSuperAdmin = 1,
    requireMfaTenantAdmin = 1,
    requireMfaTechnicians = 1,
    updatedAt = NOW(3)
WHERE id = 'global-security-policy';
