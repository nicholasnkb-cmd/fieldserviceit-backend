CREATE TABLE IF NOT EXISTS EmailDelivery (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  ticketId VARCHAR(191),
  userId VARCHAR(191),
  recipientEmail VARCHAR(320) NOT NULL,
  recipientName VARCHAR(191),
  eventType VARCHAR(64) NOT NULL,
  eventCategory VARCHAR(64) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  htmlBody MEDIUMTEXT NOT NULL,
  textBody MEDIUMTEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
  priority INT NOT NULL DEFAULT 50,
  attempts INT NOT NULL DEFAULT 0,
  maxAttempts INT NOT NULL DEFAULT 5,
  nextAttemptAt DATETIME(3),
  providerMessageId VARCHAR(255),
  errorMessage TEXT,
  metadata TEXT,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sentAt DATETIME(3),
  bouncedAt DATETIME(3),
  INDEX(status, nextAttemptAt, priority),
  INDEX(companyId, createdAt),
  INDEX(ticketId, createdAt),
  INDEX(userId, createdAt),
  INDEX(recipientEmail, createdAt),
  INDEX(providerMessageId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS EmailSuppression (
  id VARCHAR(191) PRIMARY KEY,
  recipientEmail VARCHAR(320) NOT NULL UNIQUE,
  reason VARCHAR(64) NOT NULL,
  source VARCHAR(64),
  details TEXT,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(reason),
  INDEX(updatedAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS EmailTemplate (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191) NOT NULL,
  eventType VARCHAR(64) NOT NULL DEFAULT 'TICKET_PARTICIPANT',
  subjectTemplate VARCHAR(255),
  htmlTemplate MEDIUMTEXT,
  senderName VARCHAR(191),
  replyTo VARCHAR(320),
  accentColor VARCHAR(32),
  headerText VARCHAR(255),
  footerText VARCHAR(500),
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(companyId, eventType),
  INDEX(companyId),
  INDEX(eventType)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS EmailInboundMessage (
  id VARCHAR(191) PRIMARY KEY,
  providerMessageId VARCHAR(255) NOT NULL UNIQUE,
  senderEmail VARCHAR(320) NOT NULL,
  ticketId VARCHAR(191),
  subject VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'PROCESSED',
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(ticketId),
  INDEX(senderEmail, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS TicketEmailEscalation (
  id VARCHAR(191) PRIMARY KEY,
  ticketId VARCHAR(191) NOT NULL,
  escalationLevel VARCHAR(64) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(ticketId, escalationLevel),
  INDEX(createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE NotificationPreference ADD COLUMN IF NOT EXISTS settings TEXT;
ALTER TABLE NotificationPreference ADD COLUMN IF NOT EXISTS unsubscribeToken VARCHAR(191);
ALTER TABLE NotificationPreference ADD COLUMN IF NOT EXISTS digestHour INT NOT NULL DEFAULT 8;
ALTER TABLE NotificationPreference ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT 'UTC';

INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
  (UUID(), 'View email operations', 'email-operations.view', 'Notifications', 'View email queue, delivery history, failures, bounces, and SMTP health', NOW(3)),
  (UUID(), 'Manage email operations', 'email-operations.manage', 'Notifications', 'Retry email deliveries and manage notification templates', NOW(3));
