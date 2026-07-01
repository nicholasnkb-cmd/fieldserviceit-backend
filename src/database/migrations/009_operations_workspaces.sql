CREATE TABLE IF NOT EXISTS `OperationalWorkspaceItem` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `moduleKey` VARCHAR(64) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT,
  `status` VARCHAR(64) DEFAULT 'ACTIVE',
  `priority` VARCHAR(64) DEFAULT 'MEDIUM',
  `ownerId` VARCHAR(191),
  `ticketId` VARCHAR(191),
  `assetId` VARCHAR(191),
  `dueAt` DATETIME(3),
  `metadata` JSON,
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`, `moduleKey`, `status`),
  INDEX(`ticketId`),
  INDEX(`assetId`),
  INDEX(`ownerId`),
  INDEX(`dueAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'View operational workspaces', 'operations.view', 'Operations', 'View customer portal, mobile, inventory, quotes, SLA, maintenance, knowledge, alerting, topology, and security workspaces', NOW(3)),
  (UUID(), 'Manage operational workspaces', 'operations.manage', 'Operations', 'Create and update operational workspace records', NOW(3));
