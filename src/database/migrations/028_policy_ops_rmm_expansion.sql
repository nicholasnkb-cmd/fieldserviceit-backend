CREATE TABLE IF NOT EXISTS ContextualAccessPolicy (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  name VARCHAR(191) NOT NULL,
  targetType VARCHAR(32) NOT NULL DEFAULT 'PERMISSION',
  targetValue VARCHAR(191) NOT NULL,
  conditions LONGTEXT NOT NULL,
  effect VARCHAR(32) NOT NULL DEFAULT 'DENY',
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdById VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX ContextualAccessPolicy_company_idx (companyId, isActive),
  INDEX ContextualAccessPolicy_target_idx (targetType, targetValue)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ScimGroupRoleMapping (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  externalGroupId VARCHAR(191) NOT NULL,
  externalGroupName VARCHAR(191),
  roleId VARCHAR(191),
  presetKey VARCHAR(64),
  priority INT NOT NULL DEFAULT 100,
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdById VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ScimGroupRoleMapping_company_group_key (companyId, externalGroupId),
  INDEX ScimGroupRoleMapping_company_idx (companyId, isActive)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ScimGroup (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  externalId VARCHAR(191),
  displayName VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY ScimGroup_company_external_key (companyId, externalId),
  INDEX ScimGroup_company_idx (companyId, displayName)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ScimGroupMember (
  groupId VARCHAR(191) NOT NULL,
  userId VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (groupId, userId),
  INDEX ScimGroupMember_user_idx (userId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AccessRequest (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  requesterId VARCHAR(191) NOT NULL,
  requestType VARCHAR(32) NOT NULL,
  targetId VARCHAR(191),
  permissionSlug VARCHAR(191),
  roleId VARCHAR(191),
  relationshipResourceType VARCHAR(64),
  relationshipResourceId VARCHAR(191),
  relationshipName VARCHAR(64),
  requestedMinutes INT,
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  reviewedById VARCHAR(191),
  reviewedAt DATETIME(3),
  resultRefId VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX AccessRequest_company_status_idx (companyId, status, createdAt),
  INDEX AccessRequest_requester_idx (requesterId, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AuthorizationTestCase (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  name VARCHAR(191) NOT NULL,
  principalType VARCHAR(32) NOT NULL DEFAULT 'ROLE',
  principalId VARCHAR(191) NOT NULL,
  permissionSlug VARCHAR(191) NOT NULL,
  resourceType VARCHAR(64),
  resourceId VARCHAR(191),
  expectedDecision VARCHAR(16) NOT NULL DEFAULT 'DENY',
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdById VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX AuthorizationTestCase_company_idx (companyId, isActive)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PolicyBundleSnapshot (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  bundle LONGTEXT NOT NULL,
  importedById VARCHAR(191),
  exportedById VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX PolicyBundleSnapshot_company_idx (companyId, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS UserCompanyAssignmentHistory (
  id VARCHAR(191) PRIMARY KEY,
  userId VARCHAR(191) NOT NULL,
  previousCompanyId VARCHAR(191),
  nextCompanyId VARCHAR(191),
  actorId VARCHAR(191) NOT NULL,
  reason TEXT,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX UserCompanyAssignmentHistory_user_idx (userId, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'View sensitive ticket data', 'tickets.sensitive.view', 'Tickets', 'View unmasked requester contact fields and internal ticket details.', NOW(3)),
  (UUID(), 'View sensitive billing data', 'billing.sensitive.view', 'Billing', 'View unmasked billing totals, customer billing details, and payment metadata.', NOW(3)),
  (UUID(), 'Manage contextual access policies', 'contextual-access.manage', 'Security', 'Manage device, network, location, time, and assurance-level authorization conditions.', NOW(3)),
  (UUID(), 'Manage policy-as-code bundles', 'policy-bundles.manage', 'Security', 'Export and import roles, scopes, relationships, tests, and contextual policies.', NOW(3)),
  (UUID(), 'Manage access requests', 'access-requests.manage', 'Administration', 'Approve or reject user access requests.', NOW(3)),
  (UUID(), 'Request access', 'access-requests.create', 'Administration', 'Request roles, permissions, relationships, and temporary elevation.', NOW(3)),
  (UUID(), 'Manage authorization tests', 'authorization-tests.manage', 'Security', 'Create and run authorization test cases.', NOW(3));

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p WHERE r.slug = 'super-admin';

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p
WHERE r.slug IN ('tenant-admin') AND p.slug IN (
  'tickets.sensitive.view', 'billing.sensitive.view',
  'contextual-access.manage', 'policy-bundles.manage',
  'access-requests.manage', 'authorization-tests.manage'
);

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p
WHERE p.slug = 'access-requests.create';
