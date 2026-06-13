import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database.service';

interface Migration {
  name: string;
  sql: string;
}

@Injectable()
export class MigrationsService {
  private readonly logger = new Logger('MigrationsService');
  private runningPromise: Promise<void> | null = null;

  constructor(
    @Inject(forwardRef(() => DatabaseService))
    private readonly db: DatabaseService,
  ) {}

  async run(): Promise<void> {
    if (this.runningPromise) return this.runningPromise;
    this.runningPromise = this.runMigrations();
    try {
      await this.runningPromise;
    } finally {
      this.runningPromise = null;
    }
  }

  private async runMigrations(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    const migrations = this.loadMigrations();

    for (const migration of migrations) {
      const result = await this.db.query<any[]>(
        'SELECT id FROM _migrations WHERE name = ?',
        [migration.name],
      );
      if (result.length > 0) {
        this.logger.log(`Migration ${migration.name} already applied, skipping`);
        continue;
      }

      const statements = migration.sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        await this.executeStatement(stmt);
      }

      await this.db.query(
        'INSERT IGNORE INTO _migrations (name) VALUES (?)',
        [migration.name],
      );

      this.logger.log(`Migration ${migration.name} applied successfully`);
    }
  }

  private async executeStatement(statement: string) {
    const compatibleStatement = statement
      .replace(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, 'ADD COLUMN')
      .replace(/\bADD\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b/gi, (_match, unique) => `ADD ${unique || ''}INDEX`);
    try {
      await this.db.query(compatibleStatement);
    } catch (error: any) {
      // MySQL reports these when an idempotent ALTER has already been applied.
      if ([1060, 1061].includes(Number(error?.errno))) return;
      throw error;
    }
  }

  private loadMigrations(): Migration[] {
    // Try to load from .sql files in the migrations directory
    // Falls back to inline embedded migrations if files not found (e.g. in production builds)
    const dir = this.resolveMigrationsDir();
    if (dir && fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.sql'))
        .sort();
      if (files.length > 0) {
        return files.map(file => ({
          name: path.basename(file, '.sql'),
          sql: stripComments(fs.readFileSync(path.join(dir, file), 'utf8')),
        }));
      }
    }

    this.logger.warn('No migration SQL files found on disk, using embedded defaults');
    return this.embeddedMigrations();
  }

  private resolveMigrationsDir(): string | null {
    // ts-node (dev): __dirname = src/database/migrations
    // compiled (prod): __dirname = dist/database/migrations (no .sql files)
    if (fs.existsSync(__dirname)) return __dirname;
    const fallback = path.join(process.cwd(), 'src', 'database', 'migrations');
    if (fs.existsSync(fallback)) return fallback;
    return null;
  }

  private embeddedMigrations(): Migration[] {
    return [
      {
        name: '001_initial',
        sql: stripComments(`
          CREATE TABLE IF NOT EXISTS _migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB;
          INSERT IGNORE INTO _migrations (name) VALUES ('001_initial');
        `),
      },
      {
        name: '002_seed_reference',
        sql: "INSERT IGNORE INTO _migrations (name) VALUES ('002_seed_reference');",
      },
      {
        name: '003_network_monitoring',
        sql: stripComments(`
          CREATE TABLE IF NOT EXISTS NetworkMonitoringConfig (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191) NOT NULL,
            pingEnabled TINYINT(1) DEFAULT 1,
            pingIntervalSec INT DEFAULT 60,
            snmpEnabled TINYINT(1) DEFAULT 0,
            snmpVersion VARCHAR(32),
            snmpCommunity VARCHAR(191),
            snmpUsername VARCHAR(191),
            snmpAuthProtocol VARCHAR(64),
            snmpPrivacyProtocol VARCHAR(64),
            syslogEnabled TINYINT(1) DEFAULT 0,
            syslogPort INT DEFAULT 514,
            vendor VARCHAR(64),
            vendorControllerUrl VARCHAR(255),
            vendorSiteId VARCHAR(191),
            vendorApiKey TEXT,
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            UNIQUE KEY NetworkMonitoringConfig_assetId_key (assetId),
            INDEX(companyId),
            INDEX(assetId),
            INDEX(vendor)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkHealthSnapshot (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191) NOT NULL,
            status VARCHAR(32) DEFAULT 'UNKNOWN',
            latencyMs INT,
            packetLossPct FLOAT,
            uptimeSec BIGINT,
            cpuPct FLOAT,
            memoryPct FLOAT,
            interfaceStatus TEXT,
            bandwidth TEXT,
            errors TEXT,
            source VARCHAR(32) DEFAULT 'PING',
            message TEXT,
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId),
            INDEX(assetId, createdAt),
            INDEX(status)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkSyslogEvent (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191),
            host VARCHAR(191),
            facility VARCHAR(64),
            severity VARCHAR(64),
            message TEXT NOT NULL,
            receivedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId, receivedAt),
            INDEX(assetId, receivedAt),
            INDEX(severity)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkAlertRule (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191),
            name VARCHAR(191) NOT NULL,
            metric VARCHAR(64) NOT NULL,
            operator VARCHAR(16) DEFAULT 'GT',
            threshold VARCHAR(191),
            durationSec INT DEFAULT 300,
            severity VARCHAR(32) DEFAULT 'WARNING',
            enabled TINYINT(1) DEFAULT 1,
            notifyEmail VARCHAR(191),
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId),
            INDEX(assetId),
            INDEX(metric),
            INDEX(enabled)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkAlertEvent (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191) NOT NULL,
            ruleId VARCHAR(191) NOT NULL,
            snapshotId VARCHAR(191),
            ticketId VARCHAR(191),
            status VARCHAR(32) DEFAULT 'ACTIVE',
            title VARCHAR(191) NOT NULL,
            details TEXT,
            triggeredAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            resolvedAt DATETIME(3),
            INDEX(companyId, status),
            INDEX(assetId, status),
            INDEX(ruleId, status),
            INDEX(ticketId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkMaintenanceWindow (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191),
            name VARCHAR(191) NOT NULL,
            startsAt DATETIME(3) NOT NULL,
            endsAt DATETIME(3) NOT NULL,
            suppressAlerts TINYINT(1) DEFAULT 1,
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId, startsAt, endsAt),
            INDEX(assetId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkConfigBackup (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191) NOT NULL,
            source VARCHAR(64) DEFAULT 'manual',
            configText MEDIUMTEXT NOT NULL,
            checksum VARCHAR(191),
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId, createdAt),
            INDEX(assetId, createdAt),
            INDEX(checksum)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkIpReservation (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191),
            subnet VARCHAR(64) NOT NULL,
            ipAddress VARCHAR(64) NOT NULL,
            hostname VARCHAR(191),
            macAddress VARCHAR(191),
            status VARCHAR(32) DEFAULT 'RESERVED',
            notes TEXT,
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            UNIQUE KEY NetworkIpReservation_company_ip_key (companyId, ipAddress),
            INDEX(companyId, subnet),
            INDEX(assetId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `),
      },
      {
        name: '004_network_operations',
        sql: stripComments(`
          CREATE TABLE IF NOT EXISTS NetworkInterfaceMetric (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191) NOT NULL,
            ifIndex INT NOT NULL,
            name VARCHAR(191),
            status VARCHAR(32),
            speedMbps BIGINT,
            inOctets BIGINT,
            outOctets BIGINT,
            inErrors BIGINT,
            outErrors BIGINT,
            poeWatts FLOAT,
            vlan VARCHAR(64),
            connectedMac VARCHAR(191),
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId),
            INDEX(assetId, createdAt),
            INDEX(ifIndex)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkFirmwareInventory (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191) NOT NULL,
            vendor VARCHAR(64),
            model VARCHAR(191),
            firmwareVersion VARCHAR(191),
            latestVersion VARCHAR(191),
            eolStatus VARCHAR(64),
            cveSummary TEXT,
            checkedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId),
            INDEX(assetId, checkedAt),
            INDEX(vendor)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkDiscoveryResult (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            subnet VARCHAR(64) NOT NULL,
            ipAddress VARCHAR(64) NOT NULL,
            hostname VARCHAR(191),
            macAddress VARCHAR(191),
            vendor VARCHAR(191),
            status VARCHAR(32) DEFAULT 'FOUND',
            assetId VARCHAR(191),
            discoveredAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId, subnet),
            INDEX(ipAddress),
            INDEX(assetId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkSite (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            name VARCHAR(191) NOT NULL,
            parentId VARCHAR(191),
            type VARCHAR(64) DEFAULT 'SITE',
            address VARCHAR(255),
            notes TEXT,
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId),
            INDEX(parentId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkDeviceAction (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191) NOT NULL,
            action VARCHAR(64) NOT NULL,
            payload TEXT,
            status VARCHAR(32) DEFAULT 'QUEUED',
            result TEXT,
            requestedById VARCHAR(191),
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            completedAt DATETIME(3),
            INDEX(companyId),
            INDEX(assetId, createdAt),
            INDEX(status)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `),
      },
      {
        name: '005_network_production_ops',
        sql: stripComments(`
          CREATE TABLE IF NOT EXISTS NetworkCredential (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191),
            name VARCHAR(191) NOT NULL,
            vendor VARCHAR(64),
            authMode VARCHAR(64) DEFAULT 'API_KEY',
            username VARCHAR(191),
            secret TEXT,
            metadata TEXT,
            lastTestStatus VARCHAR(32),
            lastTestAt DATETIME(3),
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId),
            INDEX(assetId),
            INDEX(vendor)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkEscalationPolicy (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            name VARCHAR(191) NOT NULL,
            severity VARCHAR(32) DEFAULT 'WARNING',
            firstDelayMin INT DEFAULT 0,
            secondDelayMin INT DEFAULT 15,
            managerDelayMin INT DEFAULT 30,
            enabled TINYINT(1) DEFAULT 1,
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId),
            INDEX(severity),
            INDEX(enabled)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkSyslogSavedSearch (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            name VARCHAR(191) NOT NULL,
            query VARCHAR(255),
            severity VARCHAR(64),
            facility VARCHAR(64),
            assetId VARCHAR(191),
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId),
            INDEX(assetId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkRetentionPolicy (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL UNIQUE,
            snapshotDays INT DEFAULT 30,
            syslogDays INT DEFAULT 30,
            maxConcurrentPolls INT DEFAULT 10,
            vendorBackoffSec INT DEFAULT 300,
            createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
            (UUID(), 'View network monitoring', 'network.monitoring.view', 'Network', 'View network health, syslog, and topology', NOW(3)),
            (UUID(), 'Manage network configuration', 'network.config.manage', 'Network', 'Edit network device settings and monitoring configuration', NOW(3)),
            (UUID(), 'Run network actions', 'network.actions.run', 'Network', 'Run network device actions', NOW(3)),
            (UUID(), 'View network credentials', 'network.credentials.view', 'Network', 'View network credential metadata', NOW(3)),
            (UUID(), 'Manage network credentials', 'network.credentials.manage', 'Network', 'Create, rotate, and test network credentials', NOW(3));
        `),
      },
      {
        name: '009_operations_workspaces',
        sql: stripComments(`
          CREATE TABLE IF NOT EXISTS OperationalWorkspaceItem (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            moduleKey VARCHAR(64) NOT NULL,
            title VARCHAR(191) NOT NULL,
            description TEXT,
            status VARCHAR(64) DEFAULT 'ACTIVE',
            priority VARCHAR(64) DEFAULT 'MEDIUM',
            ownerId VARCHAR(191),
            ticketId VARCHAR(191),
            assetId VARCHAR(191),
            dueAt DATETIME(3),
            metadata JSON,
            createdById VARCHAR(191),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId, moduleKey, status),
            INDEX(ticketId),
            INDEX(assetId),
            INDEX(ownerId),
            INDEX(dueAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
            (UUID(), 'View operational workspaces', 'operations.view', 'Operations', 'View customer portal, mobile, inventory, quotes, SLA, maintenance, knowledge, alerting, topology, and security workspaces', NOW(3)),
            (UUID(), 'Manage operational workspaces', 'operations.manage', 'Operations', 'Create and update operational workspace records', NOW(3));
        `),
      },
      {
        name: '010_quotes_invoices',
        sql: stripComments(`
          CREATE TABLE IF NOT EXISTS ServiceQuote (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            quoteNumber VARCHAR(64) NOT NULL,
            title VARCHAR(191) NOT NULL,
            customerName VARCHAR(191),
            customerEmail VARCHAR(191),
            customerPhone VARCHAR(64),
            ticketId VARCHAR(191),
            status VARCHAR(32) DEFAULT 'DRAFT',
            currency VARCHAR(8) DEFAULT 'USD',
            subtotal DECIMAL(12,2) DEFAULT 0,
            taxRate DECIMAL(8,4) DEFAULT 0,
            taxTotal DECIMAL(12,2) DEFAULT 0,
            discountTotal DECIMAL(12,2) DEFAULT 0,
            total DECIMAL(12,2) DEFAULT 0,
            notes TEXT,
            terms TEXT,
            validUntil DATETIME(3),
            approvedAt DATETIME(3),
            convertedInvoiceId VARCHAR(191),
            createdById VARCHAR(191),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            UNIQUE(companyId, quoteNumber),
            INDEX(companyId, status, updatedAt),
            INDEX(ticketId),
            INDEX(customerEmail)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS ServiceQuoteLine (
            id VARCHAR(191) PRIMARY KEY,
            quoteId VARCHAR(191) NOT NULL,
            position INT DEFAULT 1,
            description TEXT NOT NULL,
            quantity DECIMAL(12,2) DEFAULT 1,
            unitPrice DECIMAL(12,2) DEFAULT 0,
            taxable TINYINT(1) DEFAULT 1,
            total DECIMAL(12,2) DEFAULT 0,
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(quoteId),
            INDEX(position)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS ServiceInvoice (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            invoiceNumber VARCHAR(64) NOT NULL,
            quoteId VARCHAR(191),
            ticketId VARCHAR(191),
            title VARCHAR(191) NOT NULL,
            customerName VARCHAR(191),
            customerEmail VARCHAR(191),
            customerPhone VARCHAR(64),
            status VARCHAR(32) DEFAULT 'DRAFT',
            currency VARCHAR(8) DEFAULT 'USD',
            subtotal DECIMAL(12,2) DEFAULT 0,
            taxRate DECIMAL(8,4) DEFAULT 0,
            taxTotal DECIMAL(12,2) DEFAULT 0,
            discountTotal DECIMAL(12,2) DEFAULT 0,
            total DECIMAL(12,2) DEFAULT 0,
            amountPaid DECIMAL(12,2) DEFAULT 0,
            balanceDue DECIMAL(12,2) DEFAULT 0,
            notes TEXT,
            terms TEXT,
            dueAt DATETIME(3),
            sentAt DATETIME(3),
            paidAt DATETIME(3),
            createdById VARCHAR(191),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            UNIQUE(companyId, invoiceNumber),
            INDEX(companyId, status, updatedAt),
            INDEX(quoteId),
            INDEX(ticketId),
            INDEX(customerEmail),
            INDEX(dueAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS ServiceInvoiceLine (
            id VARCHAR(191) PRIMARY KEY,
            invoiceId VARCHAR(191) NOT NULL,
            position INT DEFAULT 1,
            description TEXT NOT NULL,
            quantity DECIMAL(12,2) DEFAULT 1,
            unitPrice DECIMAL(12,2) DEFAULT 0,
            taxable TINYINT(1) DEFAULT 1,
            total DECIMAL(12,2) DEFAULT 0,
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(invoiceId),
            INDEX(position)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
            (UUID(), 'View quotes and invoices', 'quotes-invoices.view', 'Billing', 'View service quotes, estimates, and invoices', NOW(3)),
            (UUID(), 'Manage quotes and invoices', 'quotes-invoices.manage', 'Billing', 'Create, update, approve, convert, and close service quote and invoice records', NOW(3));
        `),
      },
      {
        name: '011_inventory_parts',
        sql: stripComments(`
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
        `),
      },
      {
        name: '012_customer_portal',
        sql: stripComments(`
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
        `),
      },
      {
        name: '013_recurring_maintenance',
        sql: stripComments(`
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
        `),
      },
      {
        name: '014_security_center',
        sql: stripComments(`
          CREATE TABLE IF NOT EXISTS SecurityFinding (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            title VARCHAR(191) NOT NULL,
            description TEXT,
            severity VARCHAR(32) DEFAULT 'MEDIUM',
            category VARCHAR(32) DEFAULT 'POLICY',
            status VARCHAR(32) DEFAULT 'OPEN',
            assetId VARCHAR(191),
            userId VARCHAR(191),
            assignedToId VARCHAR(191),
            remediation TEXT,
            dueAt DATETIME(3),
            resolvedAt DATETIME(3),
            createdById VARCHAR(191),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId, status, severity),
            INDEX(companyId, category),
            INDEX(assetId),
            INDEX(userId),
            INDEX(assignedToId),
            INDEX(dueAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
            (UUID(), 'View security center', 'security-center.view', 'Security', 'View security posture, audit events, access reviews, and compliance findings', NOW(3)),
            (UUID(), 'Manage security findings', 'security-center.manage', 'Security', 'Create, assign, update, and resolve security findings', NOW(3));
        `),
      },
      {
        name: '015_network_topology',
        sql: stripComments(`
          CREATE TABLE IF NOT EXISTS NetworkTopologyLink (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            sourceAssetId VARCHAR(191) NOT NULL,
            targetAssetId VARCHAR(191) NOT NULL,
            sourceInterface VARCHAR(191),
            targetInterface VARCHAR(191),
            linkType VARCHAR(32) DEFAULT 'UPLINK',
            status VARCHAR(32) DEFAULT 'ACTIVE',
            bandwidthMbps BIGINT,
            discoveredBy VARCHAR(64) DEFAULT 'manual',
            notes TEXT,
            createdById VARCHAR(191),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId, status),
            INDEX(sourceAssetId),
            INDEX(targetAssetId),
            INDEX(linkType)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
            (UUID(), 'View network topology', 'topology.view', 'Network', 'View topology maps, device relationships, sites, links, and impact paths', NOW(3)),
            (UUID(), 'Manage network topology', 'topology.manage', 'Network', 'Create sites and maintain manual topology links', NOW(3));
        `),
      },
      {
        name: '016_topology_enhancements',
        sql: stripComments(`
          CREATE TABLE IF NOT EXISTS NetworkTopologyLayout (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            assetId VARCHAR(191) NOT NULL,
            x INT NOT NULL DEFAULT 0,
            y INT NOT NULL DEFAULT 0,
            locked TINYINT(1) DEFAULT 1,
            updatedById VARCHAR(191),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            UNIQUE KEY NetworkTopologyLayout_company_asset_key (companyId, assetId),
            INDEX(companyId),
            INDEX(assetId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkTopologySetting (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL UNIQUE,
            customerVisible TINYINT(1) DEFAULT 0,
            shareEnabled TINYINT(1) DEFAULT 1,
            defaultOverlay VARCHAR(32) DEFAULT 'health',
            updatedById VARCHAR(191),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkTopologyShare (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            token VARCHAR(128) NOT NULL UNIQUE,
            name VARCHAR(191) NOT NULL,
            siteId VARCHAR(191),
            expiresAt DATETIME(3),
            active TINYINT(1) DEFAULT 1,
            createdById VARCHAR(191),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId, active),
            INDEX(siteId),
            INDEX(expiresAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS NetworkTopologyChange (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191) NOT NULL,
            changeType VARCHAR(64) NOT NULL,
            sourceType VARCHAR(64),
            sourceId VARCHAR(191),
            title VARCHAR(191) NOT NULL,
            details TEXT,
            status VARCHAR(32) DEFAULT 'OPEN',
            detectedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            resolvedAt DATETIME(3),
            INDEX(companyId, status),
            INDEX(changeType),
            INDEX(sourceId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
            (UUID(), 'Share network topology', 'topology.share', 'Network', 'Create customer-visible topology share links and portal topology views', NOW(3)),
            (UUID(), 'Run topology actions', 'topology.actions.run', 'Network', 'Queue topology-driven device actions such as restart, port disable, and PoE bounce', NOW(3));
        `),
      },
      {
        name: '017_catalog_requests',
        sql: stripComments(`
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
        `),
      },
      {
        name: '018_service_catalog_items',
        sql: stripComments(`
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
        `),
      },
      {
        name: '019_email_notification_center',
        sql: stripComments(`
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
        `),
      },
      {
        name: '020_email_provider_config',
        sql: stripComments(`
          CREATE TABLE IF NOT EXISTS EmailProviderConfig (
            id VARCHAR(191) PRIMARY KEY,
            provider VARCHAR(64) NOT NULL DEFAULT 'SMTP',
            host VARCHAR(255) NOT NULL,
            port INT NOT NULL,
            secure TINYINT(1) NOT NULL DEFAULT 1,
            username VARCHAR(320) NOT NULL,
            encryptedPassword TEXT NOT NULL,
            fromAddress VARCHAR(320) NOT NULL,
            replyTo VARCHAR(320),
            isActive TINYINT(1) NOT NULL DEFAULT 1,
            lastTestStatus VARCHAR(32),
            lastTestAt DATETIME(3),
            lastTestError TEXT,
            updatedById VARCHAR(191),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(provider),
            INDEX(isActive)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `),
      },
      {
        name: '021_email_operations_hardening',
        sql: stripComments(`
          ALTER TABLE EmailDelivery ADD COLUMN IF NOT EXISTS deliveredAt DATETIME(3);
          ALTER TABLE EmailDelivery ADD COLUMN IF NOT EXISTS openedAt DATETIME(3);
          ALTER TABLE EmailDelivery ADD COLUMN IF NOT EXISTS firstClickedAt DATETIME(3);
          ALTER TABLE EmailDelivery ADD COLUMN IF NOT EXISTS complainedAt DATETIME(3);
          ALTER TABLE EmailDelivery ADD COLUMN IF NOT EXISTS cancelledAt DATETIME(3);
          ALTER TABLE EmailDelivery ADD COLUMN IF NOT EXISTS cancelledById VARCHAR(191);
          ALTER TABLE EmailDelivery ADD COLUMN IF NOT EXISTS resentFromId VARCHAR(191);
          ALTER TABLE EmailDelivery ADD COLUMN IF NOT EXISTS openCount INT NOT NULL DEFAULT 0;
          ALTER TABLE EmailDelivery ADD COLUMN IF NOT EXISTS clickCount INT NOT NULL DEFAULT 0;
          ALTER TABLE EmailDelivery ADD COLUMN IF NOT EXISTS failureNotifiedAt DATETIME(3);
          ALTER TABLE EmailDelivery ADD INDEX IF NOT EXISTS EmailDelivery_resentFromId_idx (resentFromId);

          CREATE TABLE IF NOT EXISTS EmailTrackingEvent (
            id VARCHAR(191) PRIMARY KEY,
            deliveryId VARCHAR(191) NOT NULL,
            eventType VARCHAR(32) NOT NULL,
            targetUrl TEXT,
            ipHash VARCHAR(64),
            userAgent VARCHAR(500),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(deliveryId, createdAt),
            INDEX(eventType, createdAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS EmailQueueControl (
            id VARCHAR(191) PRIMARY KEY,
            paused TINYINT(1) NOT NULL DEFAULT 0,
            reason VARCHAR(500),
            pausedAt DATETIME(3),
            pausedById VARCHAR(191),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          INSERT IGNORE INTO EmailQueueControl (id, paused, updatedAt)
          VALUES ('global-email-queue', 0, NOW(3));

          ALTER TABLE EmailProviderConfig ADD COLUMN IF NOT EXISTS encryptedWebhookSecret TEXT;
          ALTER TABLE EmailProviderConfig ADD COLUMN IF NOT EXISTS webhookSecretUpdatedAt DATETIME(3);
          ALTER TABLE Notification MODIFY companyId VARCHAR(191) NULL;
        `),
      },
      {
        name: '022_platform_security_operations',
        sql: stripComments(`
          ALTER TABLE User ADD COLUMN IF NOT EXISTS mfaEnabled TINYINT(1) NOT NULL DEFAULT 0;
          ALTER TABLE User ADD COLUMN IF NOT EXISTS mfaSecretEncrypted TEXT;
          ALTER TABLE User ADD COLUMN IF NOT EXISTS mfaPendingSecretEncrypted TEXT;
          ALTER TABLE User ADD COLUMN IF NOT EXISTS mfaRecoveryCodes TEXT;
          ALTER TABLE User ADD COLUMN IF NOT EXISTS mfaEnabledAt DATETIME(3);

          ALTER TABLE Session ADD COLUMN IF NOT EXISTS userAgent VARCHAR(500);
          ALTER TABLE Session ADD COLUMN IF NOT EXISTS lastSeenAt DATETIME(3);
          ALTER TABLE Session ADD COLUMN IF NOT EXISTS revokedAt DATETIME(3);
          ALTER TABLE Session ADD COLUMN IF NOT EXISTS revokedById VARCHAR(191);
          ALTER TABLE Session ADD COLUMN IF NOT EXISTS revokeReason VARCHAR(255);
          ALTER TABLE Session ADD INDEX IF NOT EXISTS Session_user_status_idx (userId, revokedAt, expiresAt);

          ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS approvalStatus VARCHAR(32) NOT NULL DEFAULT 'NOT_REQUIRED';
          ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS approvedById VARCHAR(191);
          ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS approvedAt DATETIME(3);
          ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS rejectedById VARCHAR(191);
          ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS rejectedAt DATETIME(3);
          ALTER TABLE NetworkDeviceAction ADD COLUMN IF NOT EXISTS approvalNote VARCHAR(500);
          ALTER TABLE NetworkDeviceAction ADD INDEX IF NOT EXISTS NetworkDeviceAction_approval_idx (companyId, approvalStatus, createdAt);

          CREATE TABLE IF NOT EXISTS PlatformSecurityPolicy (
            id VARCHAR(191) PRIMARY KEY,
            requireMfaSuperAdmin TINYINT(1) NOT NULL DEFAULT 0,
            requireMfaTenantAdmin TINYINT(1) NOT NULL DEFAULT 0,
            requireMfaTechnicians TINYINT(1) NOT NULL DEFAULT 0,
            sessionLifetimeDays INT NOT NULL DEFAULT 7,
            maxActiveSessions INT NOT NULL DEFAULT 10,
            requireNetworkApproval TINYINT(1) NOT NULL DEFAULT 1,
            updatedById VARCHAR(191),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          INSERT IGNORE INTO PlatformSecurityPolicy
            (id, requireMfaSuperAdmin, requireMfaTenantAdmin, requireMfaTechnicians, sessionLifetimeDays, maxActiveSessions, requireNetworkApproval, updatedAt)
          VALUES
            ('global-security-policy', 0, 0, 0, 7, 10, 1, NOW(3));

          CREATE TABLE IF NOT EXISTS OidcProviderConfig (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191),
            name VARCHAR(191) NOT NULL,
            issuer VARCHAR(500) NOT NULL,
            clientId VARCHAR(500) NOT NULL,
            encryptedClientSecret TEXT,
            allowedDomains TEXT,
            autoProvision TINYINT(1) NOT NULL DEFAULT 0,
            defaultRole VARCHAR(64) NOT NULL DEFAULT 'CLIENT',
            enabled TINYINT(1) NOT NULL DEFAULT 0,
            lastTestStatus VARCHAR(32),
            lastTestAt DATETIME(3),
            lastTestError TEXT,
            createdById VARCHAR(191),
            updatedById VARCHAR(191),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(companyId, enabled),
            INDEX(issuer)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS OidcAuthState (
            id VARCHAR(191) PRIMARY KEY,
            providerId VARCHAR(191) NOT NULL,
            stateHash VARCHAR(64) NOT NULL UNIQUE,
            nonce VARCHAR(191) NOT NULL,
            encryptedCodeVerifier TEXT NOT NULL,
            redirectPath VARCHAR(500),
            expiresAt DATETIME(3) NOT NULL,
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(providerId, expiresAt),
            INDEX(expiresAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS OidcLoginCode (
            id VARCHAR(191) PRIMARY KEY,
            codeHash VARCHAR(64) NOT NULL UNIQUE,
            userId VARCHAR(191) NOT NULL,
            expiresAt DATETIME(3) NOT NULL,
            usedAt DATETIME(3),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(userId, expiresAt),
            INDEX(expiresAt, usedAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS BackupPolicy (
            id VARCHAR(191) PRIMARY KEY,
            enabled TINYINT(1) NOT NULL DEFAULT 0,
            scheduleDay INT NOT NULL DEFAULT 0,
            scheduleHour INT NOT NULL DEFAULT 3,
            retentionCount INT NOT NULL DEFAULT 4,
            destination VARCHAR(32) NOT NULL DEFAULT 'LOCAL_ENCRYPTED',
            lastRunAt DATETIME(3),
            updatedById VARCHAR(191),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          INSERT IGNORE INTO BackupPolicy
            (id, enabled, scheduleDay, scheduleHour, retentionCount, destination, updatedAt)
          VALUES
            ('global-backup-policy', 0, 0, 3, 4, 'LOCAL_ENCRYPTED', NOW(3));

          CREATE TABLE IF NOT EXISTS BackupRun (
            id VARCHAR(191) PRIMARY KEY,
            status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
            destination VARCHAR(32) NOT NULL,
            artifactPath VARCHAR(1000),
            bytes BIGINT,
            checksum VARCHAR(64),
            tableCount INT,
            rowCount BIGINT,
            encryption VARCHAR(64),
            restoreTestStatus VARCHAR(32),
            restoreTestedAt DATETIME(3),
            errorMessage TEXT,
            requestedById VARCHAR(191),
            startedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            completedAt DATETIME(3),
            INDEX(status, startedAt),
            INDEX(restoreTestStatus, startedAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS DataRetentionPolicy (
            id VARCHAR(191) PRIMARY KEY,
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            sessionDays INT NOT NULL DEFAULT 30,
            auditLogDays INT NOT NULL DEFAULT 365,
            errorReportDays INT NOT NULL DEFAULT 90,
            emailEventDays INT NOT NULL DEFAULT 180,
            networkSnapshotDays INT NOT NULL DEFAULT 90,
            syslogDays INT NOT NULL DEFAULT 30,
            updatedById VARCHAR(191),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          INSERT IGNORE INTO DataRetentionPolicy
            (id, enabled, sessionDays, auditLogDays, errorReportDays, emailEventDays, networkSnapshotDays, syslogDays, updatedAt)
          VALUES
            ('global-retention-policy', 1, 30, 365, 90, 180, 90, 30, NOW(3));

          CREATE TABLE IF NOT EXISTS OperationalJobRun (
            id VARCHAR(191) PRIMARY KEY,
            jobName VARCHAR(191) NOT NULL,
            status VARCHAR(32) NOT NULL,
            detail TEXT,
            durationMs INT,
            startedAt DATETIME(3) NOT NULL,
            completedAt DATETIME(3),
            INDEX(jobName, startedAt),
            INDEX(status, startedAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          CREATE TABLE IF NOT EXISTS FileScanEvent (
            id VARCHAR(191) PRIMARY KEY,
            fileName VARCHAR(255) NOT NULL,
            fileSize BIGINT NOT NULL,
            mimeType VARCHAR(191),
            scanner VARCHAR(64) NOT NULL,
            status VARCHAR(32) NOT NULL,
            signatureName VARCHAR(255),
            errorMessage TEXT,
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX(status, createdAt),
            INDEX(scanner, createdAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

          INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
            (UUID(), 'View platform security operations', 'platform-security.view', 'Security', 'View MFA, sessions, SSO, backups, retention, observability, scanning, and action approvals', NOW(3)),
            (UUID(), 'Manage platform security operations', 'platform-security.manage', 'Security', 'Manage platform security policy, SSO, backups, retention, scanning, and action approvals', NOW(3)),
            (UUID(), 'Approve disruptive network actions', 'network.actions.approve', 'Network', 'Approve or reject disruptive network actions before execution', NOW(3));
        `),
      },
      {
        name: '023_billing_provider_abstraction',
        sql: stripComments(`
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
          UPDATE Plan SET annualPrice = ROUND(monthlyPrice * 10, 2) WHERE annualPrice = 0 AND monthlyPrice > 0;
          UPDATE Plan SET trialDays = 14 WHERE LOWER(name) = 'business' AND trialDays = 0;
          INSERT IGNORE INTO BillingPrice
            (id, planId, provider, billingInterval, component, externalPriceId, isActive, createdAt, updatedAt)
          SELECT UUID(), id, 'STRIPE', 'MONTH', 'BASE', stripePriceId, 1, NOW(3), NOW(3)
          FROM Plan WHERE stripePriceId IS NOT NULL AND stripePriceId <> '';
        `),
      },
      {
        name: '024_permission_action_catalog',
        sql: stripComments(`
          INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
            (UUID(), 'View tickets', 'tickets.view', 'Tickets', 'View ticket records and activity.', NOW(3)),
            (UUID(), 'Create tickets', 'tickets.create', 'Tickets', 'Create new ticket records.', NOW(3)),
            (UUID(), 'Edit tickets', 'tickets.edit', 'Tickets', 'Update, assign, and resolve tickets.', NOW(3)),
            (UUID(), 'Delete tickets', 'tickets.delete', 'Tickets', 'Delete ticket records.', NOW(3)),
            (UUID(), 'Approve tickets', 'tickets.approve', 'Tickets', 'Approve ticket changes and service requests.', NOW(3)),
            (UUID(), 'Export tickets', 'tickets.export', 'Tickets', 'Export ticket data.', NOW(3)),
            (UUID(), 'View assets', 'assets.view', 'Assets', 'View asset and device inventory.', NOW(3)),
            (UUID(), 'Create assets', 'assets.create', 'Assets', 'Create asset records.', NOW(3)),
            (UUID(), 'Edit assets', 'assets.edit', 'Assets', 'Update asset records.', NOW(3)),
            (UUID(), 'Delete assets', 'assets.delete', 'Assets', 'Delete or retire asset records.', NOW(3)),
            (UUID(), 'Export assets', 'assets.export', 'Assets', 'Export asset inventory.', NOW(3)),
            (UUID(), 'View users', 'users.view', 'Administration', 'View users and role assignments.', NOW(3)),
            (UUID(), 'Create users', 'users.create', 'Administration', 'Invite and create users.', NOW(3)),
            (UUID(), 'Manage users', 'users.manage', 'Administration', 'Edit, suspend, and assign users.', NOW(3)),
            (UUID(), 'Delete users', 'users.delete', 'Administration', 'Remove users.', NOW(3)),
            (UUID(), 'View roles', 'roles.view', 'Administration', 'View roles and permission assignments.', NOW(3)),
            (UUID(), 'Manage roles', 'roles.manage', 'Administration', 'Create, clone, and edit roles.', NOW(3)),
            (UUID(), 'View billing', 'billing.view', 'Billing', 'View subscription and billing status.', NOW(3)),
            (UUID(), 'Create billing records', 'billing.create', 'Billing', 'Create billing and subscription records.', NOW(3)),
            (UUID(), 'Edit billing', 'billing.edit', 'Billing', 'Change subscriptions and billing settings.', NOW(3)),
            (UUID(), 'Manage billing', 'billing.manage', 'Billing', 'Administer payment providers and billing operations.', NOW(3)),
            (UUID(), 'Approve billing', 'billing.approve', 'Billing', 'Approve billing adjustments and credits.', NOW(3)),
            (UUID(), 'Export billing', 'billing.export', 'Billing', 'Export billing records.', NOW(3)),
            (UUID(), 'View invoices', 'invoices.view', 'Billing', 'View invoices and payment status.', NOW(3)),
            (UUID(), 'Create invoices', 'invoices.create', 'Billing', 'Create invoices.', NOW(3)),
            (UUID(), 'Edit invoices', 'invoices.edit', 'Billing', 'Edit draft invoices.', NOW(3)),
            (UUID(), 'Approve invoices', 'invoices.approve', 'Billing', 'Approve and issue invoices.', NOW(3)),
            (UUID(), 'Export invoices', 'invoices.export', 'Billing', 'Export invoice data.', NOW(3)),
            (UUID(), 'View quotes', 'quotes.view', 'Billing', 'View quotes.', NOW(3)),
            (UUID(), 'Create quotes', 'quotes.create', 'Billing', 'Create quotes.', NOW(3)),
            (UUID(), 'Edit quotes', 'quotes.edit', 'Billing', 'Edit quotes.', NOW(3)),
            (UUID(), 'Approve quotes', 'quotes.approve', 'Billing', 'Approve quotes.', NOW(3)),
            (UUID(), 'Export quotes', 'quotes.export', 'Billing', 'Export quote data.', NOW(3)),
            (UUID(), 'View dispatch', 'dispatch.view', 'Field Service', 'View dispatches and schedules.', NOW(3)),
            (UUID(), 'Create dispatch', 'dispatch.create', 'Field Service', 'Schedule and dispatch technicians.', NOW(3)),
            (UUID(), 'Edit dispatch', 'dispatch.edit', 'Field Service', 'Update field-service assignments.', NOW(3)),
            (UUID(), 'View reports', 'reports.view', 'Reporting', 'View operational reports.', NOW(3)),
            (UUID(), 'Export reports', 'reports.export', 'Reporting', 'Export report data.', NOW(3)),
            (UUID(), 'View inventory', 'inventory.view', 'Inventory', 'View parts and stock.', NOW(3)),
            (UUID(), 'View knowledge base', 'knowledge-base.view', 'Knowledge', 'View internal knowledge articles.', NOW(3)),
            (UUID(), 'View audit logs', 'audit-logs.view', 'Security', 'View audit and permission-change history.', NOW(3));
        `),
      },
      {
        name: '025_permission_governance',
        sql: stripComments(`
          INSERT IGNORE INTO Permission (id, name, slug, grp, description, createdAt) VALUES
            (UUID(), 'Manage platform security', 'platform-security.manage', 'Security', 'Change platform security settings, policies, and recovery controls.', NOW(3)),
            (UUID(), 'View platform security', 'platform-security.view', 'Security', 'View platform security status and controls.', NOW(3)),
            (UUID(), 'Manage backups', 'backups.manage', 'Security', 'Manage backup, restore, and retention settings.', NOW(3)),
            (UUID(), 'View permission governance', 'permissions.governance.view', 'Administration', 'View permission approvals, scopes, temporary grants, alerts, and reviews.', NOW(3)),
            (UUID(), 'Manage permission governance', 'permissions.governance.manage', 'Administration', 'Approve access changes, grant temporary access, manage scopes, and run reviews.', NOW(3));
          CREATE TABLE IF NOT EXISTS PermissionApproval (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191),
            roleId VARCHAR(191) NOT NULL,
            requestedById VARCHAR(191) NOT NULL,
            approvedById VARCHAR(191),
            status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
            requestedPermissions LONGTEXT NOT NULL,
            reason TEXT,
            reviewedAt DATETIME(3),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX PermissionApproval_company_status_idx (companyId, status, createdAt),
            INDEX PermissionApproval_role_idx (roleId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
          CREATE TABLE IF NOT EXISTS TemporaryPermissionGrant (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191),
            userId VARCHAR(191) NOT NULL,
            permissionId VARCHAR(191) NOT NULL,
            grantedById VARCHAR(191) NOT NULL,
            scopeType VARCHAR(32) NOT NULL DEFAULT 'ALL',
            scopeValue LONGTEXT,
            reason TEXT,
            startsAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            expiresAt DATETIME(3) NOT NULL,
            revokedAt DATETIME(3),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX TemporaryPermissionGrant_user_active_idx (userId, startsAt, expiresAt, revokedAt),
            INDEX TemporaryPermissionGrant_company_idx (companyId, expiresAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
          CREATE TABLE IF NOT EXISTS PermissionScope (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191),
            roleId VARCHAR(191),
            userId VARCHAR(191),
            permissionSlug VARCHAR(191) NOT NULL,
            scopeType VARCHAR(32) NOT NULL DEFAULT 'ALL',
            scopeValues LONGTEXT,
            createdById VARCHAR(191) NOT NULL,
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX PermissionScope_company_idx (companyId),
            INDEX PermissionScope_role_idx (roleId),
            INDEX PermissionScope_user_idx (userId)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
          CREATE TABLE IF NOT EXISTS AccessReviewCampaign (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191),
            name VARCHAR(191) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
            dueAt DATETIME(3),
            createdById VARCHAR(191) NOT NULL,
            completedAt DATETIME(3),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX AccessReviewCampaign_company_status_idx (companyId, status, dueAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
          CREATE TABLE IF NOT EXISTS AccessReviewItem (
            id VARCHAR(191) PRIMARY KEY,
            campaignId VARCHAR(191) NOT NULL,
            userId VARCHAR(191) NOT NULL,
            reviewerId VARCHAR(191),
            decision VARCHAR(32) NOT NULL DEFAULT 'PENDING',
            notes TEXT,
            reviewedAt DATETIME(3),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            UNIQUE KEY AccessReviewItem_campaign_user_key (campaignId, userId),
            INDEX AccessReviewItem_campaign_decision_idx (campaignId, decision)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
          INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
          SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p WHERE r.slug = 'super-admin';
          INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
          SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p
          WHERE r.slug = 'global-tech'
            AND p.slug IN ('tickets.view', 'tickets.create', 'tickets.edit', 'assets.view', 'assets.edit', 'dispatch.view', 'dispatch.edit', 'inventory.view', 'knowledge-base.view');
          INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
          SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p
          WHERE r.slug = 'tenant-admin'
            AND p.slug IN (
              'tickets.view', 'tickets.create', 'tickets.edit', 'tickets.approve', 'tickets.export',
              'assets.view', 'assets.create', 'assets.edit', 'assets.export',
              'users.view', 'users.create', 'users.manage', 'roles.view', 'roles.manage',
              'billing.view', 'billing.create', 'billing.edit', 'billing.approve', 'billing.export',
              'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.approve', 'invoices.export',
              'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.approve', 'quotes.export',
              'dispatch.view', 'dispatch.create', 'dispatch.edit', 'reports.view', 'reports.export',
              'inventory.view', 'knowledge-base.view', 'audit-logs.view',
              'permissions.governance.view', 'permissions.governance.manage'
            );
          INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
          SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p
          WHERE r.slug = 'technician'
            AND p.slug IN ('tickets.view', 'tickets.create', 'tickets.edit', 'assets.view', 'dispatch.view', 'dispatch.edit', 'inventory.view', 'knowledge-base.view');
          INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
          SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p
          WHERE r.slug = 'read-only' AND p.slug IN ('tickets.view', 'assets.view', 'reports.view', 'audit-logs.view');
          INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
          SELECT r.id, p.id, NOW(3) FROM Role r JOIN Permission p
          WHERE r.slug = 'client' AND p.slug IN ('tickets.view', 'tickets.create');
        `),
      },
      {
        name: '026_identity_access_hardening',
        sql: stripComments(`
          ALTER TABLE Session ADD COLUMN IF NOT EXISTS mfaVerifiedAt DATETIME(3);
          ALTER TABLE User ADD COLUMN IF NOT EXISTS authVersion INT NOT NULL DEFAULT 0;
          ALTER TABLE User ADD COLUMN IF NOT EXISTS isBreakGlass TINYINT(1) NOT NULL DEFAULT 0;
          ALTER TABLE User ADD COLUMN IF NOT EXISTS breakGlassReason TEXT;
          ALTER TABLE User ADD INDEX IF NOT EXISTS User_break_glass_idx (isBreakGlass, role, isActive);
          ALTER TABLE PlatformSecurityPolicy ADD COLUMN IF NOT EXISTS requirePhishingResistantSuperAdmin TINYINT(1) NOT NULL DEFAULT 0;
          CREATE TABLE IF NOT EXISTS SecurityPolicySnapshot (
            id VARCHAR(191) PRIMARY KEY,
            policyType VARCHAR(64) NOT NULL,
            policyId VARCHAR(191) NOT NULL,
            snapshot LONGTEXT NOT NULL,
            createdById VARCHAR(191) NOT NULL,
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX SecurityPolicySnapshot_policy_idx (policyType, policyId, createdAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
          CREATE TABLE IF NOT EXISTS ServiceAccount (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191),
            name VARCHAR(191) NOT NULL,
            tokenHash VARCHAR(191) NOT NULL UNIQUE,
            permissionSlugs LONGTEXT NOT NULL,
            scopeType VARCHAR(32) NOT NULL DEFAULT 'ALL',
            scopeValues LONGTEXT,
            expiresAt DATETIME(3),
            lastUsedAt DATETIME(3),
            lastUsedIp VARCHAR(191),
            isActive TINYINT(1) NOT NULL DEFAULT 1,
            createdById VARCHAR(191) NOT NULL,
            revokedById VARCHAR(191),
            revokedAt DATETIME(3),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX ServiceAccount_company_idx (companyId, isActive),
            INDEX ServiceAccount_expiry_idx (expiresAt, isActive)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
          CREATE TABLE IF NOT EXISTS SecurityAlert (
            id VARCHAR(191) PRIMARY KEY,
            companyId VARCHAR(191),
            alertType VARCHAR(64) NOT NULL,
            severity VARCHAR(32) NOT NULL DEFAULT 'warning',
            subjectId VARCHAR(191),
            summary VARCHAR(255) NOT NULL,
            detail LONGTEXT,
            acknowledgedAt DATETIME(3),
            acknowledgedById VARCHAR(191),
            createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX SecurityAlert_company_type_idx (companyId, alertType, createdAt),
            INDEX SecurityAlert_ack_idx (acknowledgedAt)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `),
      },
    ];
  }
}

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}
