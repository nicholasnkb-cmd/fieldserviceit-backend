CREATE TABLE IF NOT EXISTS LoginAbuseState (
  emailHash CHAR(64) PRIMARY KEY,
  failureCount INT NOT NULL DEFAULT 0,
  lockedUntil DATETIME(3),
  lastFailureAt DATETIME(3) NOT NULL,
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX LoginAbuseState_expiry_idx (lockedUntil, lastFailureAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS RateLimitState (
  keyHash CHAR(64) PRIMARY KEY,
  totalHits INT NOT NULL DEFAULT 0,
  expiresAt DATETIME(3) NOT NULL,
  blockedUntil DATETIME(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX RateLimitState_expiry_idx (expiresAt, blockedUntil)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS NetworkDiscoverySchedule (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL UNIQUE,
  subnet VARCHAR(64) NOT NULL,
  intervalMinutes INT NOT NULL DEFAULT 1440,
  hostLimit INT NOT NULL DEFAULT 64,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  lastRunAt DATETIME(3),
  nextRunAt DATETIME(3),
  lastResultCount INT,
  lastError VARCHAR(500),
  createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX NetworkDiscoverySchedule_enabled_nextRunAt_idx (enabled, nextRunAt),
  INDEX NetworkDiscoverySchedule_companyId_idx (companyId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
