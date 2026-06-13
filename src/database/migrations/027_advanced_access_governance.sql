ALTER TABLE User ADD COLUMN IF NOT EXISTS scimExternalId VARCHAR(191);
ALTER TABLE User ADD COLUMN IF NOT EXISTS scimManaged TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE User ADD UNIQUE INDEX IF NOT EXISTS User_scim_external_key (companyId, scimExternalId);
ALTER TABLE AccessReviewCampaign ADD COLUMN IF NOT EXISTS cadence VARCHAR(32);
ALTER TABLE AccessReviewCampaign ADD COLUMN IF NOT EXISTS reminderDays INT NOT NULL DEFAULT 7;
ALTER TABLE AccessReviewCampaign ADD COLUMN IF NOT EXISTS nextRunAt DATETIME(3);

CREATE TABLE IF NOT EXISTS AccessElevationRequest (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  userId VARCHAR(191) NOT NULL,
  permissionSlug VARCHAR(191) NOT NULL,
  scopeType VARCHAR(32) NOT NULL DEFAULT 'ALL',
  scopeValue LONGTEXT,
  reason TEXT NOT NULL,
  requestedMinutes INT NOT NULL DEFAULT 60,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  requestedById VARCHAR(191) NOT NULL,
  reviewedById VARCHAR(191),
  reviewedAt DATETIME(3),
  grantId VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX AccessElevationRequest_company_status_idx (companyId, status, createdAt),
  INDEX AccessElevationRequest_user_idx (userId, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS DualApprovalRequest (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  actionType VARCHAR(64) NOT NULL,
  resourceType VARCHAR(64) NOT NULL,
  resourceId VARCHAR(191),
  payload LONGTEXT,
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  requestedById VARCHAR(191) NOT NULL,
  firstApprovedById VARCHAR(191),
  firstApprovedAt DATETIME(3),
  secondApprovedById VARCHAR(191),
  secondApprovedAt DATETIME(3),
  rejectedById VARCHAR(191),
  rejectedAt DATETIME(3),
  executedAt DATETIME(3),
  expiresAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX DualApprovalRequest_company_status_idx (companyId, status, createdAt),
  INDEX DualApprovalRequest_action_idx (actionType, resourceType, resourceId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AuthorizationRelationship (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  subjectType VARCHAR(32) NOT NULL DEFAULT 'USER',
  subjectId VARCHAR(191) NOT NULL,
  relationName VARCHAR(64) NOT NULL,
  resourceType VARCHAR(64) NOT NULL,
  resourceId VARCHAR(191) NOT NULL,
  createdById VARCHAR(191) NOT NULL,
  expiresAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY AuthorizationRelationship_tuple_key (subjectType, subjectId, relationName, resourceType, resourceId),
  INDEX AuthorizationRelationship_resource_idx (resourceType, resourceId, relationName),
  INDEX AuthorizationRelationship_subject_idx (subjectType, subjectId, relationName)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ImpersonationSession (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  actorId VARCHAR(191) NOT NULL,
  targetUserId VARCHAR(191) NOT NULL,
  reason TEXT NOT NULL,
  approvedRequestId VARCHAR(191),
  startedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expiresAt DATETIME(3) NOT NULL,
  endedAt DATETIME(3),
  INDEX ImpersonationSession_actor_idx (actorId, startedAt),
  INDEX ImpersonationSession_target_idx (targetUserId, startedAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ScimProvisioningToken (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  tokenHash VARCHAR(191) NOT NULL UNIQUE,
  expiresAt DATETIME(3),
  lastUsedAt DATETIME(3),
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdById VARCHAR(191) NOT NULL,
  revokedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX ScimProvisioningToken_company_idx (companyId, isActive)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS SecurityEventDestination (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  name VARCHAR(191) NOT NULL,
  destinationType VARCHAR(32) NOT NULL DEFAULT 'WEBHOOK',
  endpointUrl TEXT NOT NULL,
  secretEncrypted TEXT,
  minimumSeverity VARCHAR(32) NOT NULL DEFAULT 'info',
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdById VARCHAR(191) NOT NULL,
  lastDeliveryAt DATETIME(3),
  lastDeliveryStatus VARCHAR(32),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX SecurityEventDestination_company_idx (companyId, isActive)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS SecurityEventDelivery (
  id VARCHAR(191) PRIMARY KEY,
  destinationId VARCHAR(191) NOT NULL,
  alertId VARCHAR(191),
  status VARCHAR(32) NOT NULL,
  statusCode INT,
  errorMessage TEXT,
  attemptedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX SecurityEventDelivery_destination_idx (destinationId, attemptedAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PermissionUsage (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  principalType VARCHAR(32) NOT NULL DEFAULT 'USER',
  principalId VARCHAR(191) NOT NULL,
  permissionSlug VARCHAR(191) NOT NULL,
  resourceType VARCHAR(64),
  resourceId VARCHAR(191),
  usedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX PermissionUsage_principal_idx (principalType, principalId, usedAt),
  INDEX PermissionUsage_permission_idx (permissionSlug, usedAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'Use support impersonation', 'impersonation.use', 'Administration', 'Start controlled, visible, time-limited support impersonation sessions.', NOW(3)),
  (UUID(), 'Manage SCIM provisioning', 'scim.manage', 'Administration', 'Configure SCIM tokens and identity provisioning.', NOW(3)),
  (UUID(), 'Manage security event streaming', 'security-events.manage', 'Security', 'Configure and test external security event destinations.', NOW(3)),
  (UUID(), 'Manage authorization relationships', 'relationships.manage', 'Administration', 'Grant and revoke resource-level authorization relationships.', NOW(3));

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p
WHERE r.slug = 'super-admin';
