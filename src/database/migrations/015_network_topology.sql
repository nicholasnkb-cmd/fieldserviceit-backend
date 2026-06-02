CREATE TABLE IF NOT EXISTS NetworkTopologyLink (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  sourceAssetId VARCHAR(191) NOT NULL,
  targetAssetId VARCHAR(191) NOT NULL,
  sourceInterface VARCHAR(191),
  targetInterface VARCHAR(191),
  linkType VARCHAR(32) DEFAULT 'UPLINK',
  status VARCHAR(32) DEFAULT 'ACTIVE',
  bandwidthMbps BIGINT,
  discoveredBy VARCHAR(64) DEFAULT 'manual',
  notes TEXT,
  createdById VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId, status),
  INDEX(sourceAssetId),
  INDEX(targetAssetId),
  INDEX(linkType)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'View network topology', 'topology.view', 'Network', 'View topology maps, device relationships, sites, links, and impact paths', NOW(3)),
  (UUID(), 'Manage network topology', 'topology.manage', 'Network', 'Create sites and maintain manual topology links', NOW(3));
