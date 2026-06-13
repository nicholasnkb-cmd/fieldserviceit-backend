CREATE TABLE IF NOT EXISTS SessionRefreshHistory (
  id VARCHAR(191) PRIMARY KEY,
  sessionId VARCHAR(191) NOT NULL,
  userId VARCHAR(191) NOT NULL,
  tokenHash VARCHAR(191) NOT NULL UNIQUE,
  expiresAt DATETIME(3) NOT NULL,
  rotatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(userId, expiresAt),
  INDEX(sessionId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE Asset ADD COLUMN IF NOT EXISTS mdmDeviceTokenHash VARCHAR(191);
CREATE INDEX Asset_mdmDeviceTokenHash_idx ON Asset (mdmDeviceTokenHash);
