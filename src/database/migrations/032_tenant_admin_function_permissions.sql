INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'View email operations', 'email-operations.view', 'Notifications', 'View tenant email delivery status, history, queues, and templates.', NOW(3)),
  (UUID(), 'View platform security', 'platform-security.view', 'Security', 'View tenant-scoped identity providers and action approvals.', NOW(3)),
  (UUID(), 'Manage platform security', 'platform-security.manage', 'Security', 'Manage tenant-scoped identity providers and action approvals.', NOW(3));

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3)
FROM Role r
JOIN Permission p
WHERE r.slug = 'tenant-admin'
  AND p.slug IN (
    'users.view',
    'users.create',
    'users.manage',
    'users.delete',
    'settings.view',
    'settings.manage',
    'email-operations.view',
    'email-operations.manage',
    'platform-security.view',
    'platform-security.manage'
  );
