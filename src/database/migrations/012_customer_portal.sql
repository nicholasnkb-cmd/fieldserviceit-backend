CREATE TABLE IF NOT EXISTS TicketCustomerFeedback (
  id VARCHAR(191) PRIMARY KEY,
  ticketId VARCHAR(191) NOT NULL,
  companyId VARCHAR(191),
  userId VARCHAR(191) NOT NULL,
  rating INT DEFAULT 5,
  signOffName VARCHAR(191),
  comment TEXT,
  approved TINYINT(1) DEFAULT 1,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(ticketId, userId),
  INDEX(companyId, updatedAt),
  INDEX(ticketId),
  INDEX(userId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'Use customer portal', 'customer-portal.use', 'Tickets', 'View customer ticket activity, submit messages, and provide ticket feedback', NOW(3));
