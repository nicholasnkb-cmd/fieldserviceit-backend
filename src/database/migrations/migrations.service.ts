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

  constructor(
    @Inject(forwardRef(() => DatabaseService))
    private readonly db: DatabaseService,
  ) {}

  async run(): Promise<void> {
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
        await this.db.query(stmt);
      }

      this.logger.log(`Migration ${migration.name} applied successfully`);
    }
  }

  private loadMigrations(): Migration[] {
    // Try to load from .sql files in the migrations directory
    // Falls back to inline embedded migrations if files not found (e.g. in production builds)
    const dir = this.resolveMigrationsDir();
    if (dir && fs.existsSync(dir)) {
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.sql'))
        .sort()
        .map(file => ({
          name: path.basename(file, '.sql'),
          sql: stripComments(fs.readFileSync(path.join(dir, file), 'utf8')),
        }));
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
    ];
  }
}

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}
