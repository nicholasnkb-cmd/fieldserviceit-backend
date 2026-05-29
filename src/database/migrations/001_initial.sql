-- 001_initial: Core tables
-- Applied automatically by MigrationsService on startup.

CREATE TABLE IF NOT EXISTS `_migrations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL UNIQUE,
  `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- The remaining tables are created by DatabaseService.ensureTables().
-- This migration tracks that the schema has been initialized.
INSERT IGNORE INTO `_migrations` (`name`) VALUES ('001_initial');
