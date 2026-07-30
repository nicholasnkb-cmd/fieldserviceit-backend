CREATE TABLE IF NOT EXISTS TenantUserInvitation (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  email VARCHAR(191) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'CLIENT',
  tokenHash VARCHAR(191) NOT NULL,
  invitedById VARCHAR(191) NOT NULL,
  expiresAt DATETIME(3) NOT NULL,
  acceptedAt DATETIME(3),
  revokedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX TenantUserInvitation_token_unique (tokenHash),
  INDEX TenantUserInvitation_company_status_idx (companyId, acceptedAt, revokedAt, expiresAt),
  INDEX TenantUserInvitation_email_idx (email, companyId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
