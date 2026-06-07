ALTER TABLE User ADD COLUMN IF NOT EXISTS mfaEnabled TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE User ADD COLUMN IF NOT EXISTS mfaSecretEncrypted TEXT;
ALTER TABLE User ADD COLUMN IF NOT EXISTS mfaPendingSecretEncrypted TEXT;
ALTER TABLE User ADD COLUMN IF NOT EXISTS mfaRecoveryCodes TEXT;
ALTER TABLE User ADD COLUMN IF NOT EXISTS mfaEnabledAt DATETIME(3);

ALTER TABLE Session ADD COLUMN IF NOT EXISTS userAgent VARCHAR(500);
ALTER TABLE Session ADD COLUMN IF NOT EXISTS lastSeenAt DATETIME(3);
ALTER TABLE Session ADD COLUMN IF NOT EXISTS revokedAt DATETIME(3);
ALTER TABLE Session ADD COLUMN IF NOT EXISTS revokedById VARCHAR(191);
ALTER TABLE Session ADD COLUMN IF NOT EXISTS revokeReason VARCHAR(255);
ALTER TABLE Session ADD INDEX IF NOT EXISTS Session_user_status_idx (userId, revokedAt, expiresAt);

ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS approvalStatus VARCHAR(32) NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS approvedById VARCHAR(191);
ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS approvedAt DATETIME(3);
ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS rejectedById VARCHAR(191);
ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS rejectedAt DATETIME(3);
ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS approvalNote VARCHAR(500);
ALTER TABLE NetworkDeviceAction ADD INDEX IF NOT EXISTS NetworkDeviceAction_approval_idx (companyId, approvalStatus, createdAt);

CREATE TABLE IF NOT EXISTS PlatformSecurityPolicy (
  id VARCHAR(191) PRIMARY KEY,
  requireMfaSuperAdmin TINYINT(1) NOT NULL DEFAULT 0,
  requireMfaTenantAdmin TINYINT(1) NOT NULL DEFAULT 0,
  requireMfaTechnicians TINYINT(1) NOT NULL DEFAULT 0,
  sessionLifetimeDays INT NOT NULL DEFAULT 7,
  maxActiveSessions INT NOT NULL DEFAULT 10,
  requireNetworkApproval TINYINT(1) NOT NULL DEFAULT 1,
  updatedById VARCHAR(191),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO PlatformSecurityPolicy
  (id, requireMfaSuperAdmin, requireMfaTenantAdmin, requireMfaTechnicians, sessionLifetimeDays, maxActiveSessions, requireNetworkApproval, updatedAt)
VALUES
  ('global-security-policy', 0, 0, 0, 7, 10, 1, NOW(3));

CREATE TABLE IF NOT EXISTS OidcProviderConfig (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  name VARCHAR(191) NOT NULL,
  issuer VARCHAR(500) NOT NULL,
  clientId VARCHAR(500) NOT NULL,
  encryptedClientSecret TEXT,
  allowedDomains TEXT,
  autoProvision TINYINT(1) NOT NULL DEFAULT 0,
  defaultRole VARCHAR(64) NOT NULL DEFAULT 'CLIENT',
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  lastTestStatus VARCHAR(32),
  lastTestAt DATETIME(3),
  lastTestError TEXT,
  createdById VARCHAR(191),
  updatedById VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId, enabled),
  INDEX(issuer)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS OidcAuthState (
  id VARCHAR(191) PRIMARY KEY,
  providerId VARCHAR(191) NOT NULL,
  stateHash VARCHAR(64) NOT NULL UNIQUE,
  nonce VARCHAR(191) NOT NULL,
  encryptedCodeVerifier TEXT NOT NULL,
  redirectPath VARCHAR(500),
  expiresAt DATETIME(3) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(providerId, expiresAt),
  INDEX(expiresAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS OidcLoginCode (
  id VARCHAR(191) PRIMARY KEY,
  codeHash VARCHAR(64) NOT NULL UNIQUE,
  userId VARCHAR(191) NOT NULL,
  expiresAt DATETIME(3) NOT NULL,
  usedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(userId, expiresAt),
  INDEX(expiresAt, usedAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BackupPolicy (
  id VARCHAR(191) PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  scheduleDay INT NOT NULL DEFAULT 0,
  scheduleHour INT NOT NULL DEFAULT 3,
  retentionCount INT NOT NULL DEFAULT 4,
  destination VARCHAR(32) NOT NULL DEFAULT 'LOCAL_ENCRYPTED',
  lastRunAt DATETIME(3),
  updatedById VARCHAR(191),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO BackupPolicy
  (id, enabled, scheduleDay, scheduleHour, retentionCount, destination, updatedAt)
VALUES
  ('global-backup-policy', 0, 0, 3, 4, 'LOCAL_ENCRYPTED', NOW(3));

CREATE TABLE IF NOT EXISTS BackupRun (
  id VARCHAR(191) PRIMARY KEY,
  status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
  destination VARCHAR(32) NOT NULL,
  artifactPath VARCHAR(1000),
  bytes BIGINT,
  checksum VARCHAR(64),
  tableCount INT,
  rowCount BIGINT,
  encryption VARCHAR(64),
  restoreTestStatus VARCHAR(32),
  restoreTestedAt DATETIME(3),
  errorMessage TEXT,
  requestedById VARCHAR(191),
  startedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completedAt DATETIME(3),
  INDEX(status, startedAt),
  INDEX(restoreTestStatus, startedAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS DataRetentionPolicy (
  id VARCHAR(191) PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sessionDays INT NOT NULL DEFAULT 30,
  auditLogDays INT NOT NULL DEFAULT 365,
  errorReportDays INT NOT NULL DEFAULT 90,
  emailEventDays INT NOT NULL DEFAULT 180,
  networkSnapshotDays INT NOT NULL DEFAULT 90,
  syslogDays INT NOT NULL DEFAULT 30,
  updatedById VARCHAR(191),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO DataRetentionPolicy
  (id, enabled, sessionDays, auditLogDays, errorReportDays, emailEventDays, networkSnapshotDays, syslogDays, updatedAt)
VALUES
  ('global-retention-policy', 1, 30, 365, 90, 180, 90, 30, NOW(3));

CREATE TABLE IF NOT EXISTS OperationalJobRun (
  id VARCHAR(191) PRIMARY KEY,
  jobName VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL,
  detail TEXT,
  durationMs INT,
  startedAt DATETIME(3) NOT NULL,
  completedAt DATETIME(3),
  INDEX(jobName, startedAt),
  INDEX(status, startedAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS FileScanEvent (
  id VARCHAR(191) PRIMARY KEY,
  fileName VARCHAR(255) NOT NULL,
  fileSize BIGINT NOT NULL,
  mimeType VARCHAR(191),
  scanner VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  signatureName VARCHAR(255),
  errorMessage TEXT,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(status, createdAt),
  INDEX(scanner, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'View platform security operations', 'platform-security.view', 'Security', 'View MFA, sessions, SSO, backups, retention, observability, scanning, and action approvals', NOW(3)),
  (UUID(), 'Manage platform security operations', 'platform-security.manage', 'Security', 'Manage platform security policy, SSO, backups, retention, scanning, and action approvals', NOW(3)),
  (UUID(), 'Approve disruptive network actions', 'network.actions.approve', 'Network', 'Approve or reject disruptive network actions before execution', NOW(3));
