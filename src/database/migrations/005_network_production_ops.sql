-- 005_network_production_ops: Credential vault, escalation policies, saved syslog searches, retention controls.

CREATE TABLE IF NOT EXISTS `NetworkCredential` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191),
  `name` VARCHAR(191) NOT NULL,
  `vendor` VARCHAR(64),
  `authMode` VARCHAR(64) DEFAULT 'API_KEY',
  `username` VARCHAR(191),
  `secret` TEXT,
  `metadata` TEXT,
  `lastTestStatus` VARCHAR(32),
  `lastTestAt` DATETIME(3),
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`),
  INDEX(`assetId`),
  INDEX(`vendor`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkEscalationPolicy` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `severity` VARCHAR(32) DEFAULT 'WARNING',
  `firstDelayMin` INT DEFAULT 0,
  `secondDelayMin` INT DEFAULT 15,
  `managerDelayMin` INT DEFAULT 30,
  `enabled` TINYINT(1) DEFAULT 1,
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`),
  INDEX(`severity`),
  INDEX(`enabled`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkSyslogSavedSearch` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `query` VARCHAR(255),
  `severity` VARCHAR(64),
  `facility` VARCHAR(64),
  `assetId` VARCHAR(191),
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`),
  INDEX(`assetId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NetworkRetentionPolicy` (
  `id` VARCHAR(191) PRIMARY KEY,
  `companyId` VARCHAR(191) NOT NULL UNIQUE,
  `snapshotDays` INT DEFAULT 30,
  `syslogDays` INT DEFAULT 30,
  `maxConcurrentPolls` INT DEFAULT 10,
  `vendorBackoffSec` INT DEFAULT 300,
  `createdAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `Permission` (`id`, `name`, `slug`, `grp`, `description`, `createdAt`) VALUES
  (UUID(), 'View network monitoring', 'network.monitoring.view', 'Network', 'View network health, syslog, and topology', NOW(3)),
  (UUID(), 'Manage network configuration', 'network.config.manage', 'Network', 'Edit network device settings and monitoring configuration', NOW(3)),
  (UUID(), 'Run network actions', 'network.actions.run', 'Network', 'Run network device actions', NOW(3)),
  (UUID(), 'View network credentials', 'network.credentials.view', 'Network', 'View network credential metadata', NOW(3)),
  (UUID(), 'Manage network credentials', 'network.credentials.manage', 'Network', 'Create, rotate, and test network credentials', NOW(3));
