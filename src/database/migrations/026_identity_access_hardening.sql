ALTER TABLE Session ADD COLUMN IF NOT EXISTS mfaVerifiedAt DATETIME(3);
ALTER TABLE User ADD COLUMN IF NOT EXISTS authVersion INT NOT NULL DEFAULT 0;
ALTER TABLE User ADD COLUMN IF NOT EXISTS isBreakGlass TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE User ADD COLUMN IF NOT EXISTS breakGlassReason TEXT;
ALTER TABLE User ADD INDEX IF NOT EXISTS User_break_glass_idx (isBreakGlass, role, isActive);
ALTER TABLE PlatformSecurityPolicy ADD COLUMN IF NOT EXISTS requirePhishingResistantSuperAdmin TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS SecurityPolicySnapshot (
  id VARCHAR(191) PRIMARY KEY,
  policyType VARCHAR(64) NOT NULL,
  policyId VARCHAR(191) NOT NULL,
  snapshot LONGTEXT NOT NULL,
  createdById VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX SecurityPolicySnapshot_policy_idx (policyType, policyId, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ServiceAccount (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  name VARCHAR(191) NOT NULL,
  tokenHash VARCHAR(191) NOT NULL UNIQUE,
  permissionSlugs LONGTEXT NOT NULL,
  scopeType VARCHAR(32) NOT NULL DEFAULT 'ALL',
  scopeValues LONGTEXT,
  expiresAt DATETIME(3),
  lastUsedAt DATETIME(3),
  lastUsedIp VARCHAR(191),
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdById VARCHAR(191) NOT NULL,
  revokedById VARCHAR(191),
  revokedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX ServiceAccount_company_idx (companyId, isActive),
  INDEX ServiceAccount_expiry_idx (expiresAt, isActive)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS SecurityAlert (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  alertType VARCHAR(64) NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'warning',
  subjectId VARCHAR(191),
  summary VARCHAR(255) NOT NULL,
  detail LONGTEXT,
  acknowledgedAt DATETIME(3),
  acknowledgedById VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX SecurityAlert_company_type_idx (companyId, alertType, createdAt),
  INDEX SecurityAlert_ack_idx (acknowledgedAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
