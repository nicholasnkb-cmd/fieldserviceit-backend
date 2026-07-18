CREATE TABLE IF NOT EXISTS SavedView (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  userId VARCHAR(191) NOT NULL,
  resourceKey VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  filters LONGTEXT NOT NULL,
  isDefault TINYINT(1) NOT NULL DEFAULT 0,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY SavedView_user_resource_name_key (userId, resourceKey, name),
  INDEX SavedView_company_resource_idx (companyId, resourceKey),
  INDEX SavedView_user_resource_idx (userId, resourceKey)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS StatusNotice (
  id VARCHAR(191) PRIMARY KEY,
  title VARCHAR(191) NOT NULL,
  message TEXT NOT NULL,
  noticeType VARCHAR(32) NOT NULL DEFAULT 'MAINTENANCE',
  status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
  startsAt DATETIME(3),
  endsAt DATETIME(3),
  publishedAt DATETIME(3),
  resolvedAt DATETIME(3),
  createdById VARCHAR(191) NOT NULL,
  updatedById VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX StatusNotice_public_idx (publishedAt, status, startsAt),
  INDEX StatusNotice_updated_idx (updatedAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE Asset ADD INDEX IF NOT EXISTS Asset_recycle_bin_idx (companyId, deletedAt);

UPDATE User
SET isActive = 0, deletedAt = COALESCE(deletedAt, NOW(3)), authVersion = authVersion + 1, updatedAt = NOW(3)
WHERE email = 'production-verifier-20260717@fieldserviceit.com'
  AND deletedAt IS NULL;

UPDATE Company c
JOIN User u ON u.companyId = c.id AND u.email = 'production-verifier-20260717@fieldserviceit.com'
SET c.isActive = 0, c.deletedAt = COALESCE(c.deletedAt, NOW(3)), c.updatedAt = NOW(3)
WHERE c.deletedAt IS NULL
  AND NOT EXISTS (SELECT 1 FROM User activeUser WHERE activeUser.companyId = c.id AND activeUser.deletedAt IS NULL)
  AND NOT EXISTS (SELECT 1 FROM Ticket activeTicket WHERE activeTicket.companyId = c.id AND activeTicket.deletedAt IS NULL)
  AND NOT EXISTS (SELECT 1 FROM Asset activeAsset WHERE activeAsset.companyId = c.id AND activeAsset.deletedAt IS NULL);
