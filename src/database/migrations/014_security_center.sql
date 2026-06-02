CREATE TABLE IF NOT EXISTS SecurityFinding (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  title VARCHAR(191) NOT NULL,
  description TEXT,
  severity VARCHAR(32) DEFAULT 'MEDIUM',
  category VARCHAR(32) DEFAULT 'POLICY',
  status VARCHAR(32) DEFAULT 'OPEN',
  assetId VARCHAR(191),
  userId VARCHAR(191),
  assignedToId VARCHAR(191),
  remediation TEXT,
  dueAt DATETIME(3),
  resolvedAt DATETIME(3),
  createdById VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId, status, severity),
  INDEX(companyId, category),
  INDEX(assetId),
  INDEX(userId),
  INDEX(assignedToId),
  INDEX(dueAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'View security center', 'security-center.view', 'Security', 'View security posture, audit events, access reviews, and compliance findings', NOW(3)),
  (UUID(), 'Manage security findings', 'security-center.manage', 'Security', 'Create, assign, update, and resolve security findings', NOW(3));
