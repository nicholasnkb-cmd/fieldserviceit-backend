CREATE TABLE IF NOT EXISTS CatalogRequest (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  createdById VARCHAR(191),
  requestType VARCHAR(50) NOT NULL DEFAULT 'OTHER',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  priority VARCHAR(50) NOT NULL DEFAULT 'MEDIUM',
  itemName VARCHAR(255),
  quantity INT,
  justification TEXT,
  notes TEXT,
  approvedById VARCHAR(191),
  approvedAt DATETIME(3),
  rejectionReason TEXT,
  fulfilledAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId),
  INDEX(createdById),
  INDEX(status),
  INDEX(requestType)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'View catalog requests', 'catalog-requests.view', 'Catalog', 'View catalog requests', NOW(3)),
  (UUID(), 'Create catalog requests', 'catalog-requests.create', 'Catalog', 'Create catalog requests', NOW(3)),
  (UUID(), 'Approve catalog requests', 'catalog-requests.approve', 'Catalog', 'Approve or reject catalog requests', NOW(3)),
  (UUID(), 'Manage catalog requests', 'catalog-requests.manage', 'Catalog', 'Manage all catalog requests', NOW(3));
