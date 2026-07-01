CREATE TABLE IF NOT EXISTS UserLegalConsent (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  userId VARCHAR(191) NOT NULL,
  termsVersion VARCHAR(32) NOT NULL,
  privacyVersion VARCHAR(32) NOT NULL,
  ipAddress VARCHAR(64),
  userAgent VARCHAR(500),
  acceptedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX UserLegalConsent_user_accepted_idx (userId, acceptedAt),
  CONSTRAINT UserLegalConsent_user_fk FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
