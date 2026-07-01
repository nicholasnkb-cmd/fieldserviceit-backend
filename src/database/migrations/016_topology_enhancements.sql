CREATE TABLE IF NOT EXISTS NetworkTopologyLayout (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  assetId VARCHAR(191) NOT NULL,
  x INT NOT NULL DEFAULT 0,
  y INT NOT NULL DEFAULT 0,
  locked TINYINT(1) DEFAULT 1,
  updatedById VARCHAR(191),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY NetworkTopologyLayout_company_asset_key (companyId, assetId),
  INDEX(companyId),
  INDEX(assetId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS NetworkTopologySetting (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL UNIQUE,
  customerVisible TINYINT(1) DEFAULT 0,
  shareEnabled TINYINT(1) DEFAULT 1,
  defaultOverlay VARCHAR(32) DEFAULT 'health',
  updatedById VARCHAR(191),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS NetworkTopologyShare (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  siteId VARCHAR(191),
  expiresAt DATETIME(3),
  active TINYINT(1) DEFAULT 1,
  createdById VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId, active),
  INDEX(siteId),
  INDEX(expiresAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS NetworkTopologyChange (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  changeType VARCHAR(64) NOT NULL,
  sourceType VARCHAR(64),
  sourceId VARCHAR(191),
  title VARCHAR(191) NOT NULL,
  details TEXT,
  status VARCHAR(32) DEFAULT 'OPEN',
  detectedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolvedAt DATETIME(3),
  INDEX(companyId, status),
  INDEX(changeType),
  INDEX(sourceId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'Share network topology', 'topology.share', 'Network', 'Create customer-visible topology share links and portal topology views', NOW(3)),
  (UUID(), 'Run topology actions', 'topology.actions.run', 'Network', 'Queue topology-driven device actions such as restart, port disable, and PoE bounce', NOW(3));
