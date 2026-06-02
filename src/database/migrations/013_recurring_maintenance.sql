CREATE TABLE IF NOT EXISTS MaintenancePlan (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  assetId VARCHAR(191),
  location VARCHAR(191),
  frequency VARCHAR(32) DEFAULT 'MONTHLY',
  intervalDays INT DEFAULT 0,
  nextDueAt DATETIME(3) NOT NULL,
  lastCompletedAt DATETIME(3),
  checklist TEXT,
  ticketTemplateTitle VARCHAR(191),
  ticketTemplateDescription TEXT,
  assignedToId VARCHAR(191),
  status VARCHAR(32) DEFAULT 'ACTIVE',
  createdById VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId, status, nextDueAt),
  INDEX(assetId),
  INDEX(assignedToId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS MaintenanceRun (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  planId VARCHAR(191) NOT NULL,
  ticketId VARCHAR(191),
  status VARCHAR(32) DEFAULT 'DUE',
  dueAt DATETIME(3) NOT NULL,
  completedAt DATETIME(3),
  completedById VARCHAR(191),
  notes TEXT,
  createdById VARCHAR(191),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId, status, dueAt),
  INDEX(planId, dueAt),
  INDEX(ticketId),
  INDEX(completedById)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'View recurring maintenance', 'maintenance.view', 'Dispatch', 'View recurring maintenance plans, schedules, and completions', NOW(3)),
  (UUID(), 'Manage recurring maintenance', 'maintenance.manage', 'Dispatch', 'Create plans, generate maintenance tickets, and mark maintenance complete', NOW(3));
