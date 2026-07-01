CREATE TABLE IF NOT EXISTS RemoteAccessEndpoint (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  assetId VARCHAR(191) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  externalDeviceId VARCHAR(255) NOT NULL,
  launchUrl TEXT NOT NULL,
  enabled TINYINT(1) DEFAULT 1,
  createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY remote_endpoint_unique (companyId, assetId, provider),
  INDEX(companyId),
  INDEX(assetId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS RemoteAccessSession (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  endpointId VARCHAR(191) NOT NULL,
  assetId VARCHAR(191) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  requestedById VARCHAR(191),
  status VARCHAR(32) DEFAULT 'LAUNCHED',
  launchUrl TEXT NOT NULL,
  requestedAt DATETIME(3) NOT NULL,
  endedAt DATETIME(3),
  INDEX(companyId, requestedAt),
  INDEX(assetId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PatchPolicy (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  osFamily VARCHAR(32) DEFAULT 'ALL',
  severities TEXT,
  delayDays INT DEFAULT 0,
  maintenanceWindow VARCHAR(191),
  autoApprove TINYINT(1) DEFAULT 1,
  rebootAllowed TINYINT(1) DEFAULT 0,
  enabled TINYINT(1) DEFAULT 1,
  createdById VARCHAR(191),
  createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PatchInventory (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  assetId VARCHAR(191) NOT NULL,
  patchKey VARCHAR(191) NOT NULL,
  title VARCHAR(500) NOT NULL,
  severity VARCHAR(32) DEFAULT 'UNKNOWN',
  status VARCHAR(32) DEFAULT 'MISSING',
  releaseDate DATETIME(3),
  requiresReboot TINYINT(1) DEFAULT 0,
  detectedAt DATETIME(3) NOT NULL,
  installedAt DATETIME(3),
  metadata TEXT,
  UNIQUE KEY patch_inventory_unique (companyId, assetId, patchKey),
  INDEX(companyId, status),
  INDEX(assetId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PatchJob (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  assetId VARCHAR(191) NOT NULL,
  policyId VARCHAR(191),
  commandId VARCHAR(191),
  patchKeys TEXT NOT NULL,
  status VARCHAR(32) DEFAULT 'PENDING',
  requestedById VARCHAR(191),
  scheduledAt DATETIME(3),
  startedAt DATETIME(3),
  completedAt DATETIME(3),
  result TEXT,
  createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId, status),
  INDEX(assetId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'View remote access', 'remote-access.view', 'Endpoint Operations', 'View configured remote-access endpoints and session history.', NOW(3)),
  (UUID(), 'Manage remote access', 'remote-access.manage', 'Endpoint Operations', 'Configure remote-access provider endpoints.', NOW(3)),
  (UUID(), 'Launch remote sessions', 'remote-access.launch', 'Endpoint Operations', 'Launch remote-access sessions for managed assets.', NOW(3)),
  (UUID(), 'View patch management', 'patches.view', 'Endpoint Operations', 'View patch inventory, policies, and deployment jobs.', NOW(3)),
  (UUID(), 'Manage patch policies', 'patches.manage', 'Endpoint Operations', 'Manage patch inventory and patch policies.', NOW(3)),
  (UUID(), 'Deploy patches', 'patches.deploy', 'Endpoint Operations', 'Queue patch installation commands for enrolled assets.', NOW(3));

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p
WHERE r.slug IN ('super-admin', 'tenant-admin');

INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p
WHERE r.slug = 'technician'
  AND p.slug IN ('remote-access.view', 'remote-access.launch', 'patches.view', 'patches.deploy');
