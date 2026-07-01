ALTER TABLE Plan ADD COLUMN IF NOT EXISTS annualPrice DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE Plan ADD COLUMN IF NOT EXISTS seatMonthlyPrice DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE Plan ADD COLUMN IF NOT EXISTS seatAnnualPrice DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE Plan ADD COLUMN IF NOT EXISTS trialDays INT NOT NULL DEFAULT 0;

ALTER TABLE CompanyPlan ADD COLUMN IF NOT EXISTS billingProvider VARCHAR(32) NOT NULL DEFAULT 'STRIPE';
ALTER TABLE CompanyPlan ADD COLUMN IF NOT EXISTS providerCustomerId VARCHAR(191);
ALTER TABLE CompanyPlan ADD COLUMN IF NOT EXISTS providerSubscriptionId VARCHAR(191);
ALTER TABLE CompanyPlan ADD COLUMN IF NOT EXISTS billingInterval VARCHAR(16) NOT NULL DEFAULT 'MONTH';
ALTER TABLE CompanyPlan ADD COLUMN IF NOT EXISTS seatQuantity INT NOT NULL DEFAULT 1;
ALTER TABLE CompanyPlan ADD COLUMN IF NOT EXISTS cancelAtPeriodEnd TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE CompanyPlan ADD COLUMN IF NOT EXISTS gracePeriodEndsAt DATETIME(3);
ALTER TABLE CompanyPlan ADD INDEX IF NOT EXISTS CompanyPlan_provider_subscription_idx (billingProvider, providerSubscriptionId);

CREATE TABLE IF NOT EXISTS BillingPrice (
  id VARCHAR(191) PRIMARY KEY,
  planId VARCHAR(191) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  billingInterval VARCHAR(16) NOT NULL,
  component VARCHAR(16) NOT NULL DEFAULT 'BASE',
  externalPriceId VARCHAR(255) NOT NULL,
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY BillingPrice_catalog_key (planId, provider, billingInterval, component),
  INDEX BillingPrice_provider_idx (provider, isActive)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BillingEvent (
  id VARCHAR(191) PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  providerEventId VARCHAR(255) NOT NULL,
  eventType VARCHAR(191) NOT NULL,
  companyId VARCHAR(191),
  status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
  payload LONGTEXT,
  errorMessage TEXT,
  processedAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY BillingEvent_provider_event_key (provider, providerEventId),
  INDEX BillingEvent_company_idx (companyId, createdAt),
  INDEX BillingEvent_status_idx (status, createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

UPDATE Plan
SET annualPrice = ROUND(monthlyPrice * 10, 2)
WHERE annualPrice = 0 AND monthlyPrice > 0;

UPDATE Plan
SET trialDays = 14
WHERE LOWER(name) = 'business' AND trialDays = 0;

INSERT IGNORE INTO BillingPrice
  (id, planId, provider, billingInterval, component, externalPriceId, isActive, createdAt, updatedAt)
SELECT UUID(), id, 'STRIPE', 'MONTH', 'BASE', stripePriceId, 1, NOW(3), NOW(3)
FROM Plan
WHERE stripePriceId IS NOT NULL AND stripePriceId <> '';
