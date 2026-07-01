CREATE TABLE IF NOT EXISTS InventoryLocation (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  locationType VARCHAR(32) DEFAULT 'WAREHOUSE',
  assignedToId VARCHAR(191),
  address TEXT,
  isActive TINYINT(1) DEFAULT 1,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId, locationType),
  INDEX(assignedToId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS InventoryPart (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  sku VARCHAR(128),
  name VARCHAR(191) NOT NULL,
  description TEXT,
  category VARCHAR(128),
  vendor VARCHAR(191),
  manufacturer VARCHAR(191),
  model VARCHAR(191),
  locationId VARCHAR(191),
  unitCost DECIMAL(12,2) DEFAULT 0,
  unitPrice DECIMAL(12,2) DEFAULT 0,
  quantityOnHand DECIMAL(12,2) DEFAULT 0,
  quantityReserved DECIMAL(12,2) DEFAULT 0,
  reorderPoint DECIMAL(12,2) DEFAULT 0,
  reorderQuantity DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(32) DEFAULT 'ACTIVE',
  createdById VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(companyId, sku),
  INDEX(companyId, name),
  INDEX(companyId, category),
  INDEX(companyId, locationId),
  INDEX(companyId, status)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS InventoryTransaction (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  partId VARCHAR(191) NOT NULL,
  locationId VARCHAR(191),
  movementType VARCHAR(32) NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  notes TEXT,
  ticketId VARCHAR(191),
  actorId VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId, createdAt),
  INDEX(partId),
  INDEX(ticketId),
  INDEX(locationId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'View inventory and parts', 'inventory.view', 'Assets', 'View parts inventory, stock levels, locations, and transactions', NOW(3)),
  (UUID(), 'Manage inventory and parts', 'inventory.manage', 'Assets', 'Create parts, adjust stock, reserve parts, and record consumed materials', NOW(3));
