INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'Manage platform security', 'platform-security.manage', 'Security', 'Change platform security settings, policies, and recovery controls.', NOW(3)),
  (UUID(), 'View platform security', 'platform-security.view', 'Security', 'View platform security status and controls.', NOW(3)),
  (UUID(), 'Manage backups', 'backups.manage', 'Security', 'Manage backup, restore, and retention settings.', NOW(3)),
  (UUID(), 'View permission governance', 'permissions.governance.view', 'Administration', 'View permission approvals, scopes, temporary grants, alerts, and reviews.', NOW(3)),
  (UUID(), 'Manage permission governance', 'permissions.governance.manage', 'Administration', 'Approve access changes, grant temporary access, manage scopes, and run reviews.', NOW(3));

CREATE TABLE IF NOT EXISTS PermissionApproval (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  roleId VARCHAR(191) NOT NULL,
  requestedById VARCHAR(191) NOT NULL,
  approvedById VARCHAR(191),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  requestedPermissions LONGTEXT NOT NULL,
  reason TEXT,
  reviewedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX PermissionApproval_company_status_idx (companyId, status, createdAt),
  INDEX PermissionApproval_role_idx (roleId),
  INDEX PermissionApproval_requested_by_idx (requestedById),
  INDEX PermissionApproval_approved_by_idx (approvedById)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS TemporaryPermissionGrant (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  userId VARCHAR(191) NOT NULL,
  permissionId VARCHAR(191) NOT NULL,
  grantedById VARCHAR(191) NOT NULL,
  scopeType VARCHAR(32) NOT NULL DEFAULT 'ALL',
  scopeValue LONGTEXT,
  reason TEXT,
  startsAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expiresAt DATETIME(3) NOT NULL,
  revokedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX TemporaryPermissionGrant_user_active_idx (userId, startsAt, expiresAt, revokedAt),
  INDEX TemporaryPermissionGrant_company_idx (companyId, expiresAt),
  INDEX TemporaryPermissionGrant_permission_idx (permissionId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PermissionScope (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  roleId VARCHAR(191),
  userId VARCHAR(191),
  permissionSlug VARCHAR(191) NOT NULL,
  scopeType VARCHAR(32) NOT NULL DEFAULT 'ALL',
  scopeValues LONGTEXT,
  createdById VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX PermissionScope_company_idx (companyId),
  INDEX PermissionScope_role_idx (roleId),
  INDEX PermissionScope_user_idx (userId),
  INDEX PermissionScope_permission_idx (permissionSlug)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AccessReviewCampaign (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  name VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  dueAt DATETIME(3),
  createdById VARCHAR(191) NOT NULL,
  completedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX AccessReviewCampaign_company_status_idx (companyId, status, dueAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AccessReviewItem (
  id VARCHAR(191) PRIMARY KEY,
  campaignId VARCHAR(191) NOT NULL,
  userId VARCHAR(191) NOT NULL,
  reviewerId VARCHAR(191),
  decision VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  reviewedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY AccessReviewItem_campaign_user_key (campaignId, userId),
  INDEX AccessReviewItem_campaign_decision_idx (campaignId, decision),
  INDEX AccessReviewItem_user_idx (userId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3)
FROM Role r JOIN Permission p
WHERE r.slug = 'super-admin';

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3)
FROM Role r JOIN Permission p
WHERE r.slug = 'tenant-admin'
  AND p.slug IN (
    'tickets.view', 'tickets.create', 'tickets.edit', 'tickets.approve', 'tickets.export',
    'assets.view', 'assets.create', 'assets.edit', 'assets.export',
    'users.view', 'users.create', 'users.manage',
    'roles.view', 'roles.manage',
    'billing.view', 'billing.create', 'billing.edit', 'billing.approve', 'billing.export',
    'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.approve', 'invoices.export',
    'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.approve', 'quotes.export',
    'dispatch.view', 'dispatch.create', 'dispatch.edit',
    'reports.view', 'reports.export',
    'inventory.view', 'knowledge-base.view', 'audit-logs.view',
    'permissions.governance.view', 'permissions.governance.manage'
  );

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3)
FROM Role r JOIN Permission p
WHERE r.slug = 'technician'
  AND p.slug IN ('tickets.view', 'tickets.create', 'tickets.edit', 'assets.view', 'dispatch.view', 'dispatch.edit', 'inventory.view', 'knowledge-base.view');

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3)
FROM Role r JOIN Permission p
WHERE r.slug = 'global-tech'
  AND p.slug IN ('tickets.view', 'tickets.create', 'tickets.edit', 'assets.view', 'assets.edit', 'dispatch.view', 'dispatch.edit', 'inventory.view', 'knowledge-base.view');

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3)
FROM Role r JOIN Permission p
WHERE r.slug = 'read-only'
  AND p.slug IN ('tickets.view', 'assets.view', 'reports.view', 'audit-logs.view');

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3)
FROM Role r JOIN Permission p
WHERE r.slug = 'client'
  AND p.slug IN ('tickets.view', 'tickets.create');
