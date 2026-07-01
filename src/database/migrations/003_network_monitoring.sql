-- 003_network_monitoring: Network monitoring settings, health snapshots, syslog, and alert rules.

CREATE TABLE IF NOT EXISTS `NetworkMonitoringConfig` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `pingEnabled` TINYINT(1) DEFAULT 1,
  `pingIntervalSec` INT DEFAULT 60,
  `snmpEnabled` TINYINT(1) DEFAULT 0,
  `snmpVersion` VARCHAR(32),
  `snmpCommunity` VARCHAR(191),
  `snmpUsername` VARCHAR(191),
  `snmpAuthProtocol` VARCHAR(64),
  `snmpPrivacyProtocol` VARCHAR(64),
  `syslogEnabled` TINYINT(1) DEFAULT 0,
  `syslogPort` INT DEFAULT 514,
  `vendor` VARCHAR(64),
  `vendorControllerUrl` VARCHAR(255),
  `vendorSiteId` VARCHAR(191),
  `vendorApiKey` TEXT,
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `NetworkMonitoringConfig_assetId_key` (`assetId`),
  INDEX(`companyId`),
  INDEX(`assetId`),
  INDEX(`vendor`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkHealthSnapshot` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) DEFAULT 'UNKNOWN',
  `latencyMs` INT,
  `packetLossPct` FLOAT,
  `uptimeSec` BIGINT,
  `cpuPct` FLOAT,
  `memoryPct` FLOAT,
  `interfaceStatus` TEXT,
  `bandwidth` TEXT,
  `errors` TEXT,
  `source` VARCHAR(32) DEFAULT 'PING',
  `message` TEXT,
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`),
  INDEX(`assetId`, `createdAt`),
  INDEX(`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkSyslogEvent` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191),
  `host` VARCHAR(191),
  `facility` VARCHAR(64),
  `severity` VARCHAR(64),
  `message` TEXT NOT NULL,
  `receivedAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`, `receivedAt`),
  INDEX(`assetId`, `receivedAt`),
  INDEX(`severity`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkAlertRule` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191),
  `name` VARCHAR(191) NOT NULL,
  `metric` VARCHAR(64) NOT NULL,
  `operator` VARCHAR(16) DEFAULT 'GT',
  `threshold` VARCHAR(191),
  `durationSec` INT DEFAULT 300,
  `severity` VARCHAR(32) DEFAULT 'WARNING',
  `enabled` TINYINT(1) DEFAULT 1,
  `notifyEmail` VARCHAR(191),
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`),
  INDEX(`assetId`),
  INDEX(`metric`),
  INDEX(`enabled`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkAlertEvent` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `ruleId` VARCHAR(191) NOT NULL,
  `snapshotId` VARCHAR(191),
  `ticketId` VARCHAR(191),
  `status` VARCHAR(32) DEFAULT 'ACTIVE',
  `title` VARCHAR(191) NOT NULL,
  `details` TEXT,
  `triggeredAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3),
  INDEX(`companyId`, `status`),
  INDEX(`assetId`, `status`),
  INDEX(`ruleId`, `status`),
  INDEX(`ticketId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkMaintenanceWindow` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191),
  `name` VARCHAR(191) NOT NULL,
  `startsAt` DATETIME(3) NOT NULL,
  `endsAt` DATETIME(3) NOT NULL,
  `suppressAlerts` TINYINT(1) DEFAULT 1,
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`, `startsAt`, `endsAt`),
  INDEX(`assetId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkConfigBackup` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `source` VARCHAR(64) DEFAULT 'manual',
  `configText` MEDIUMTEXT NOT NULL,
  `checksum` VARCHAR(191),
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`, `createdAt`),
  INDEX(`assetId`, `createdAt`),
  INDEX(`checksum`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkIpReservation` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191),
  `subnet` VARCHAR(64) NOT NULL,
  `ipAddress` VARCHAR(64) NOT NULL,
  `hostname` VARCHAR(191),
  `macAddress` VARCHAR(191),
  `status` VARCHAR(32) DEFAULT 'RESERVED',
  `notes` TEXT,
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `NetworkIpReservation_company_ip_key` (`companyId`, `ipAddress`),
  INDEX(`companyId`, `subnet`),
  INDEX(`assetId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
