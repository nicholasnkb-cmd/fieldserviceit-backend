CREATE TABLE IF NOT EXISTS WebAuthnCredential (
  id VARCHAR(191) PRIMARY KEY,
  userId VARCHAR(191) NOT NULL,
  credentialId VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  publicKey MEDIUMBLOB NOT NULL,
  counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports JSON,
  deviceType VARCHAR(32),
  backedUp TINYINT(1) NOT NULL DEFAULT 0,
  name VARCHAR(100) NOT NULL DEFAULT 'Passkey',
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  lastUsedAt DATETIME(3),
  UNIQUE INDEX WebAuthnCredential_credential_unique (credentialId),
  INDEX WebAuthnCredential_user_idx (userId, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS WebAuthnChallenge (
  id VARCHAR(191) PRIMARY KEY,
  userId VARCHAR(191),
  purpose VARCHAR(32) NOT NULL,
  challenge VARCHAR(512) NOT NULL,
  expiresAt DATETIME(3) NOT NULL,
  usedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX WebAuthnChallenge_lookup_idx (id, purpose, expiresAt, usedAt),
  INDEX WebAuthnChallenge_user_idx (userId, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS MfaResetRequest (
  id VARCHAR(191) PRIMARY KEY,
  userId VARCHAR(191),
  email VARCHAR(191) NOT NULL,
  reason VARCHAR(1000),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  reviewedById VARCHAR(191),
  reviewNotes VARCHAR(2000),
  reviewedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX MfaResetRequest_status_idx (status, createdAt),
  INDEX MfaResetRequest_user_idx (userId, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
