-- 004_network_operations: SNMP interface metrics, discovery, firmware, sites, and action queue.

CREATE TABLE IF NOT EXISTS `NetworkInterfaceMetric` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `ifIndex` INT NOT NULL,
  `name` VARCHAR(191),
  `status` VARCHAR(32),
  `speedMbps` BIGINT,
  `inOctets` BIGINT,
  `outOctets` BIGINT,
  `inErrors` BIGINT,
  `outErrors` BIGINT,
  `poeWatts` FLOAT,
  `vlan` VARCHAR(64),
  `connectedMac` VARCHAR(191),
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`),
  INDEX(`assetId`, `createdAt`),
  INDEX(`ifIndex`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkFirmwareInventory` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `vendor` VARCHAR(64),
  `model` VARCHAR(191),
  `firmwareVersion` VARCHAR(191),
  `latestVersion` VARCHAR(191),
  `eolStatus` VARCHAR(64),
  `cveSummary` TEXT,
  `checkedAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`),
  INDEX(`assetId`, `checkedAt`),
  INDEX(`vendor`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkDiscoveryResult` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `subnet` VARCHAR(64) NOT NULL,
  `ipAddress` VARCHAR(64) NOT NULL,
  `hostname` VARCHAR(191),
  `macAddress` VARCHAR(191),
  `vendor` VARCHAR(191),
  `status` VARCHAR(32) DEFAULT 'FOUND',
  `assetId` VARCHAR(191),
  `discoveredAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`, `subnet`),
  INDEX(`ipAddress`),
  INDEX(`assetId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkSite` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `parentId` VARCHAR(191),
  `type` VARCHAR(64) DEFAULT 'SITE',
  `address` VARCHAR(255),
  `notes` TEXT,
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`),
  INDEX(`parentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkDeviceAction` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `payload` TEXT,
  `status` VARCHAR(32) DEFAULT 'QUEUED',
  `result` TEXT,
  `requestedById` VARCHAR(191),
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3),
  INDEX(`companyId`),
  INDEX(`assetId`, `createdAt`),
  INDEX(`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
