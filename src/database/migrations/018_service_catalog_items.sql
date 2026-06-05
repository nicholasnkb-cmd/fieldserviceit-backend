CREATE TABLE IF NOT EXISTS CatalogItem (
  id VARCHAR(191) PRIMARY KEY,
  companyId VARCHAR(191),
  requestType VARCHAR(50) NOT NULL DEFAULT 'OTHER',
  name VARCHAR(255) NOT NULL,
  shortDescription VARCHAR(500),
  description TEXT,
  category VARCHAR(120) NOT NULL DEFAULT 'General',
  icon VARCHAR(80),
  defaultPriority VARCHAR(50) NOT NULL DEFAULT 'MEDIUM',
  estimatedFulfillment VARCHAR(120),
  requiresApproval TINYINT(1) NOT NULL DEFAULT 1,
  formSchema TEXT,
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  sortOrder INT NOT NULL DEFAULT 0,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX(companyId),
  INDEX(requestType),
  INDEX(category),
  INDEX(isActive),
  INDEX(sortOrder)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE CatalogRequest ADD COLUMN IF NOT EXISTS catalogItemId VARCHAR(191);
ALTER TABLE CatalogRequest ADD INDEX IF NOT EXISTS CatalogRequest_catalogItemId_idx (catalogItemId);

INSERT IGNORE INTO CatalogItem (
  id, companyId, requestType, name, shortDescription, description, category, icon,
  defaultPriority, estimatedFulfillment, requiresApproval, sortOrder, createdAt, updatedAt
) VALUES
  ('global-service-new-employee-setup', NULL, 'SERVICE', 'New Employee Setup', 'Prepare accounts, devices, and access for a new hire.', 'Request a complete onboarding setup including device assignment, email, identity access, collaboration tools, and required business applications.', 'Employee Services', 'user-plus', 'HIGH', '1-2 business days', 1, 10, NOW(3), NOW(3)),
  ('global-service-workstation-troubleshooting', NULL, 'SERVICE', 'Workstation Troubleshooting', 'Get help with a workstation, printer, phone, or productivity issue.', 'Submit a support request for an end-user device, application, printer, desk phone, or productivity problem.', 'Support Services', 'wrench', 'MEDIUM', 'Same business day', 0, 20, NOW(3), NOW(3)),
  ('global-service-network-change-request', NULL, 'SERVICE', 'Network Change Request', 'Request VLAN, firewall, port, VPN, or WAN changes.', 'Ask the network team to review and perform a controlled network change with approval and audit tracking.', 'Network Services', 'network', 'HIGH', '2-5 business days', 1, 30, NOW(3), NOW(3)),
  ('global-software-license-request', NULL, 'SOFTWARE', 'Software License Request', 'Request a new software license or SaaS seat.', 'Request approval and provisioning for licensed software, SaaS access, or a subscription used by your role or department.', 'Software', 'badge-check', 'MEDIUM', '1-3 business days', 1, 40, NOW(3), NOW(3)),
  ('global-software-application-installation', NULL, 'SOFTWARE', 'Application Installation', 'Install approved software on a company device.', 'Request installation or update of approved software on a managed workstation, laptop, or server.', 'Software', 'download', 'MEDIUM', 'Same business day', 0, 50, NOW(3), NOW(3)),
  ('global-hardware-laptop-desktop-request', NULL, 'HARDWARE', 'Laptop or Desktop Request', 'Request a laptop, desktop, or replacement workstation.', 'Request a new or replacement workstation with business justification, preferred model, and required accessories.', 'Hardware', 'monitor', 'HIGH', '3-7 business days', 1, 60, NOW(3), NOW(3)),
  ('global-hardware-accessory-request', NULL, 'HARDWARE', 'Accessory Request', 'Request monitors, docks, keyboards, headsets, or cables.', 'Request common accessories needed for a workstation or remote office setup.', 'Hardware', 'package', 'LOW', '1-3 business days', 1, 70, NOW(3), NOW(3)),
  ('global-access-system-access-request', NULL, 'ACCESS', 'System Access Request', 'Request access to an application, shared mailbox, VPN, or group.', 'Request new or changed access with manager approval, business reason, and required system details.', 'Access', 'key-round', 'HIGH', '1-2 business days', 1, 80, NOW(3), NOW(3)),
  ('global-access-password-mfa-help', NULL, 'ACCESS', 'Password or MFA Help', 'Get help with password reset, MFA, or account lockout.', 'Request urgent assistance for sign-in, MFA registration, lockout, or password reset problems.', 'Access', 'shield-check', 'HIGH', 'Same business day', 0, 90, NOW(3), NOW(3)),
  ('global-other-general-it-request', NULL, 'OTHER', 'General IT Request', 'Ask for something that does not fit the other categories.', 'Submit a general request and the team will route it to the right workflow.', 'General', 'clipboard-list', 'MEDIUM', '1-3 business days', 0, 100, NOW(3), NOW(3));
