ALTER TABLE `RmmProviderConfig` ADD COLUMN IF NOT EXISTS `lastSyncStatus` VARCHAR(32);
ALTER TABLE `RmmProviderConfig` ADD COLUMN IF NOT EXISTS `lastSyncMessage` TEXT;
ALTER TABLE `RmmProviderConfig` ADD COLUMN IF NOT EXISTS `lastTestStatus` VARCHAR(32);
ALTER TABLE `RmmProviderConfig` ADD COLUMN IF NOT EXISTS `lastTestAt` DATETIME(3);

CREATE TABLE IF NOT EXISTS `RmmSyncRun` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `startedAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3),
  `assetsCreated` INT DEFAULT 0,
  `assetsUpdated` INT DEFAULT 0,
  `assetsSkipped` INT DEFAULT 0,
  `errorMessage` TEXT,
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`, `provider`, `startedAt`),
  INDEX(`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
