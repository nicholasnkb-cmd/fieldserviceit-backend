CREATE TABLE IF NOT EXISTS LoginAbuseState (
  emailHash CHAR(64) PRIMARY KEY,
  failureCount INT NOT NULL DEFAULT 0,
  lockedUntil DATETIME(3),
  lastFailureAt DATETIME(3) NOT NULL,
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX LoginAbuseState_expiry_idx (lockedUntil, lastFailureAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
