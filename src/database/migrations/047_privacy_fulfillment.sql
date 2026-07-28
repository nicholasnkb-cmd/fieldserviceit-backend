ALTER TABLE PrivacyRequest ADD COLUMN IF NOT EXISTS verificationTokenHash VARCHAR(191);
ALTER TABLE PrivacyRequest ADD COLUMN IF NOT EXISTS verificationExpiresAt DATETIME(3);
ALTER TABLE PrivacyRequest ADD COLUMN IF NOT EXISTS verifiedAt DATETIME(3);
ALTER TABLE PrivacyRequest ADD COLUMN IF NOT EXISTS legalHoldAt DATETIME(3);
ALTER TABLE PrivacyRequest ADD COLUMN IF NOT EXISTS legalHoldReason VARCHAR(1000);
ALTER TABLE PrivacyRequest ADD COLUMN IF NOT EXISTS deletionApprovedAt DATETIME(3);
ALTER TABLE PrivacyRequest ADD COLUMN IF NOT EXISTS deletionApprovedById VARCHAR(191);
ALTER TABLE PrivacyRequest ADD COLUMN IF NOT EXISTS escalationNotifiedAt DATETIME(3);

CREATE TABLE IF NOT EXISTS PrivacyRequestEvent (
  id VARCHAR(191) PRIMARY KEY,
  requestId VARCHAR(191) NOT NULL,
  actorId VARCHAR(191),
  eventType VARCHAR(64) NOT NULL,
  detail JSON,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX PrivacyRequestEvent_request_idx (requestId, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PrivacyExportArtifact (
  id VARCHAR(191) PRIMARY KEY,
  requestId VARCHAR(191) NOT NULL,
  tokenHash VARCHAR(191) NOT NULL,
  content LONGTEXT NOT NULL,
  expiresAt DATETIME(3) NOT NULL,
  downloadedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX PrivacyExportArtifact_token_unique (tokenHash),
  INDEX PrivacyExportArtifact_request_idx (requestId, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PrivacyActionJob (
  id VARCHAR(191) PRIMARY KEY,
  requestId VARCHAR(191) NOT NULL,
  actionType VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
  approvedById VARCHAR(191) NOT NULL,
  approvedAt DATETIME(3) NOT NULL,
  executedAt DATETIME(3),
  resultDetail JSON,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX PrivacyActionJob_status_idx (status, createdAt),
  INDEX PrivacyActionJob_request_idx (requestId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
