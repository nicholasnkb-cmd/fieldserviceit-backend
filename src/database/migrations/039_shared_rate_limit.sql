CREATE TABLE IF NOT EXISTS RateLimitState (
  keyHash CHAR(64) PRIMARY KEY,
  totalHits INT NOT NULL DEFAULT 0,
  expiresAt DATETIME(3) NOT NULL,
  blockedUntil DATETIME(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX RateLimitState_expiry_idx (expiresAt, blockedUntil)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
