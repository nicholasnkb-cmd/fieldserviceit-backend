CREATE TABLE IF NOT EXISTS `ErrorReport` (
  `id` VARCHAR(191) PRIMARY KEY,
  `source` VARCHAR(120) NOT NULL,
  `message` TEXT NOT NULL,
  `stack` TEXT,
  `path` VARCHAR(500),
  `userAgent` VARCHAR(500),
  `userId` VARCHAR(191),
  `companyId` VARCHAR(191),
  `metadata` JSON,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(`source`),
  INDEX(`userId`),
  INDEX(`companyId`),
  INDEX(`createdAt`)
);
