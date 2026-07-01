INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt)
VALUES (UUID(), 'Use AI agent', 'ai-agent.use', 'Automation', 'Use AI-assisted service operations tools.', NOW(3));

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3)
FROM Role r
JOIN Permission p ON p.slug = 'ai-agent.use'
WHERE r.slug IN ('super-admin', 'tenant-admin', 'technician', 'dispatcher');
