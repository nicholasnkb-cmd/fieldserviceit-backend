import { Injectable, OnModuleInit, OnModuleDestroy, OnApplicationShutdown, Logger, Optional, BadRequestException } from '@nestjs/common';
import { createPool, Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { MigrationsService } from './migrations/migrations.service';

interface QueryOptions {
  nestTables?: boolean;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor(
    @Optional() private readonly migrationsService?: MigrationsService,
  ) {
    const databaseUrl = process.env.DATABASE_URL || '';
    const parsed = this.parseDatabaseUrl(databaseUrl);

    this.pool = createPool({
      host: parsed.host,
      port: parsed.port,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  async onModuleInit() {
    try {
      const conn = await this.pool.getConnection();
      conn.release();
      this.logger.log('Database connected');
      await this.ensureTables();
      await this.migrationsService?.run();
    } catch (err) {
      this.logger.warn('Database unavailable: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  private async ensureTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS \`User\` (
        id VARCHAR(191) PRIMARY KEY,
        email VARCHAR(191) NOT NULL UNIQUE,
        passwordHash VARCHAR(191),
        firstName VARCHAR(191) NOT NULL,
        lastName VARCHAR(191) NOT NULL,
        phone VARCHAR(191),
        jobTitle VARCHAR(191),
        department VARCHAR(191),
        location VARCHAR(191),
        preferredContactMethod VARCHAR(191),
        timezone VARCHAR(191),
        avatarUrl VARCHAR(191),
        featureOverrides TEXT,
        role VARCHAR(191) DEFAULT 'CLIENT',
        userType VARCHAR(191) DEFAULT 'BUSINESS',
        companyId VARCHAR(191),
        isActive TINYINT(1) DEFAULT 1,
        emailVerified TINYINT(1) DEFAULT 0,
        lastLoginAt DATETIME(3),
        resetToken VARCHAR(191),
        resetTokenExpiresAt DATETIME(3),
        emailVerificationToken VARCHAR(191),
        emailVerificationExpiresAt DATETIME(3),
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        deletedAt DATETIME(3),
        INDEX(companyId),
        INDEX(email),
        INDEX(userType)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`Session\` (
        id VARCHAR(191) PRIMARY KEY,
        userId VARCHAR(191) NOT NULL,
        refreshToken VARCHAR(191) NOT NULL UNIQUE,
        deviceInfo VARCHAR(191),
        ipAddress VARCHAR(191),
        expiresAt DATETIME(3) NOT NULL,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(userId),
        INDEX(refreshToken)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`Ticket\` (
        id VARCHAR(191) PRIMARY KEY,
        ticketNumber VARCHAR(191) NOT NULL UNIQUE,
        title VARCHAR(191) NOT NULL,
        description TEXT,
        contactName VARCHAR(191),
        contactEmail VARCHAR(191),
        contactPhone VARCHAR(191),
        category VARCHAR(191),
        subcategory VARCHAR(191),
        location VARCHAR(191),
        latitude FLOAT,
        longitude FLOAT,
        status VARCHAR(191) DEFAULT 'OPEN',
        priority VARCHAR(191) DEFAULT 'MEDIUM',
        type VARCHAR(191) DEFAULT 'INCIDENT',
        companyId VARCHAR(191),
        createdById VARCHAR(191) NOT NULL,
        assignedToId VARCHAR(191),
        assetId VARCHAR(191),
        slaId VARCHAR(191),
        contractId VARCHAR(191),
        trackingToken VARCHAR(191),
        onHoldReason TEXT,
        resolution TEXT,
        resolvedAt DATETIME(3),
        resolvedById VARCHAR(191),
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        deletedAt DATETIME(3),
        INDEX(companyId),
        INDEX(status),
        INDEX(assignedToId),
        INDEX(ticketNumber)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`TicketTimeline\` (
        id VARCHAR(191) PRIMARY KEY,
        ticketId VARCHAR(191) NOT NULL,
        action VARCHAR(191) NOT NULL,
        actorId VARCHAR(191) NOT NULL,
        oldValue TEXT,
        newValue TEXT,
        comment TEXT,
        isInternal TINYINT(1) DEFAULT 0,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(ticketId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`TicketAttachment\` (
        id VARCHAR(191) PRIMARY KEY,
        ticketId VARCHAR(191) NOT NULL,
        fileUrl VARCHAR(191) NOT NULL,
        fileName VARCHAR(191) NOT NULL,
        fileSize INT NOT NULL,
        mimeType VARCHAR(191) NOT NULL,
        uploadedById VARCHAR(191) NOT NULL,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(ticketId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`Asset\` (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        assetType VARCHAR(191) NOT NULL,
        serialNumber VARCHAR(191),
        manufacturer VARCHAR(191),
        model VARCHAR(191),
        location VARCHAR(191),
        ipAddress VARCHAR(191),
        macAddress VARCHAR(191),
        os VARCHAR(191),
        osVersion VARCHAR(191),
        cpu VARCHAR(191),
        ram VARCHAR(191),
        storage VARCHAR(191),
        status VARCHAR(191) DEFAULT 'active',
        deviceCategory VARCHAR(191) DEFAULT 'DESKTOP',
        ownership VARCHAR(191) DEFAULT 'COMPANY',
        assignedUser VARCHAR(191),
        enrollmentStatus VARCHAR(191) DEFAULT 'UNMANAGED',
        managementMode VARCHAR(191),
        mdmProvider VARCHAR(191),
        mdmDeviceId VARCHAR(191),
        lastCheckInAt DATETIME(3),
        complianceStatus VARCHAR(191) DEFAULT 'UNKNOWN',
        complianceReasons TEXT,
        encryptionStatus VARCHAR(191) DEFAULT 'UNKNOWN',
        firewallEnabled TINYINT(1),
        antivirusStatus VARCHAR(191),
        passcodeCompliant TINYINT(1),
        jailbreakDetected TINYINT(1) DEFAULT 0,
        lostModeEnabled TINYINT(1) DEFAULT 0,
        batteryLevel INT,
        imei VARCHAR(191),
        meid VARCHAR(191),
        phoneNumber VARCHAR(191),
        carrier VARCHAR(191),
        appInventory TEXT,
        policyProfile VARCHAR(191),
        notes TEXT,
        companyId VARCHAR(191) NOT NULL,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        deletedAt DATETIME(3),
        INDEX(companyId),
        INDEX(assetType),
        INDEX(deviceCategory),
        INDEX(enrollmentStatus),
        INDEX(complianceStatus),
        INDEX(lastCheckInAt)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`MdmEnrollmentToken\` (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        token VARCHAR(191) NOT NULL UNIQUE,
        deviceCategory VARCHAR(191) DEFAULT 'LAPTOP',
        ownership VARCHAR(191) DEFAULT 'COMPANY',
        policyProfile VARCHAR(191),
        expiresAt DATETIME(3) NOT NULL,
        usedAt DATETIME(3),
        assetId VARCHAR(191),
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId),
        INDEX(token),
        INDEX(expiresAt)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`MdmCommand\` (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        assetId VARCHAR(191) NOT NULL,
        action VARCHAR(191) NOT NULL,
        payload TEXT,
        status VARCHAR(191) DEFAULT 'PENDING',
        result TEXT,
        requestedById VARCHAR(191),
        completedAt DATETIME(3),
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId),
        INDEX(assetId),
        INDEX(status),
        INDEX(createdAt)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`Contract\` (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        description TEXT,
        companyId VARCHAR(191) NOT NULL,
        startDate DATETIME(3) NOT NULL,
        endDate DATETIME(3) NOT NULL,
        value FLOAT,
        status VARCHAR(191) DEFAULT 'active',
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        deletedAt DATETIME(3),
        INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`SLA\` (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        companyId VARCHAR(191) NOT NULL,
        responseTimeMin INT NOT NULL,
        resolutionTimeMin INT NOT NULL,
        priority VARCHAR(191) NOT NULL,
        escalateAfterMin INT,
        escalateToId VARCHAR(191),
        isActive TINYINT(1) DEFAULT 1,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`Dispatch\` (
        id VARCHAR(191) PRIMARY KEY,
        ticketId VARCHAR(191) NOT NULL,
        technicianId VARCHAR(191) NOT NULL,
        companyId VARCHAR(191) NOT NULL,
        status VARCHAR(191) DEFAULT 'PENDING',
        scheduledAt DATETIME(3),
        arrivedAt DATETIME(3),
        completedAt DATETIME(3),
        notes TEXT,
        customerSignature VARCHAR(191),
        photoUrls TEXT DEFAULT '[]',
        latitude FLOAT,
        longitude FLOAT,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(ticketId),
        INDEX(technicianId),
        INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`Plan\` (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        description TEXT,
        stripePriceId VARCHAR(191),
        monthlyPrice DECIMAL(10,2) NOT NULL DEFAULT 0,
        maxUsers INT DEFAULT -1,
        maxTickets INT DEFAULT -1,
        features JSON,
        sortOrder INT DEFAULT 0,
        isActive TINYINT(1) DEFAULT 1,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`CompanyPlan\` (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL UNIQUE,
        planId VARCHAR(191) NOT NULL,
        stripeSubscriptionId VARCHAR(191),
        stripeCustomerId VARCHAR(191),
        status VARCHAR(191) DEFAULT 'ACTIVE',
        trialEndsAt DATETIME(3),
        currentPeriodStart DATETIME(3),
        currentPeriodEnd DATETIME(3),
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId),
        INDEX(planId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`UsageRecord\` (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        metric VARCHAR(191) NOT NULL,
        count INT NOT NULL DEFAULT 0,
        periodStart DATETIME(3) NOT NULL,
        periodEnd DATETIME(3) NOT NULL,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId, metric)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`Company\` (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        slug VARCHAR(191) NOT NULL UNIQUE,
        domain VARCHAR(191),
        logo VARCHAR(191),
        settings TEXT,
        isActive TINYINT(1) DEFAULT 1,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        deletedAt DATETIME(3),
        branding TEXT,
        inviteCode VARCHAR(191) UNIQUE,
        inviteExpiresAt DATETIME(3),
        INDEX(name)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`Role\` (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        slug VARCHAR(191) NOT NULL,
        description VARCHAR(191),
        companyId VARCHAR(191),
        isSystem TINYINT(1) DEFAULT 0,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE(slug, companyId),
        INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`Permission\` (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        slug VARCHAR(191) NOT NULL UNIQUE,
        grp VARCHAR(191),
        description VARCHAR(191),
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(grp)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`RolePermission\` (
        roleId VARCHAR(191) NOT NULL,
        permissionId VARCHAR(191) NOT NULL,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY(roleId, permissionId),
        INDEX(permissionId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`UserRole\` (
        userId VARCHAR(191) NOT NULL,
        roleId VARCHAR(191) NOT NULL,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY(userId, roleId),
        INDEX(roleId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`TicketTemplate\` (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        description VARCHAR(191),
        category VARCHAR(191),
        subcategory VARCHAR(191),
        priority VARCHAR(191),
        title VARCHAR(191),
        body TEXT,
        companyId VARCHAR(191) NOT NULL,
        isActive TINYINT(1) DEFAULT 1,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`Workflow\` (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        description VARCHAR(191),
        triggerOn VARCHAR(191) DEFAULT 'ticket.created',
        companyId VARCHAR(191) NOT NULL,
        isActive TINYINT(1) DEFAULT 1,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        deletedAt DATETIME(3),
        INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`WorkflowStep\` (
        id VARCHAR(191) PRIMARY KEY,
        workflowId VARCHAR(191) NOT NULL,
        stepOrder INT NOT NULL,
        action VARCHAR(191) NOT NULL,
        config TEXT,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(workflowId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`WorkflowRun\` (
        id VARCHAR(191) PRIMARY KEY,
        workflowId VARCHAR(191) NOT NULL,
        ticketId VARCHAR(191) NOT NULL,
        companyId VARCHAR(191) NOT NULL,
        status VARCHAR(191) DEFAULT 'running',
        startedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        completedAt DATETIME(3),
        INDEX(workflowId),
        INDEX(ticketId),
        INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`WorkflowRunStep\` (
        id VARCHAR(191) PRIMARY KEY,
        runId VARCHAR(191) NOT NULL,
        stepId VARCHAR(191) NOT NULL,
        status VARCHAR(191) DEFAULT 'pending',
        executedById VARCHAR(191),
        output TEXT,
        startedAt DATETIME(3),
        completedAt DATETIME(3),
        INDEX(runId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`Notification\` (
        id VARCHAR(191) PRIMARY KEY,
        userId VARCHAR(191) NOT NULL,
        companyId VARCHAR(191) NOT NULL,
        title VARCHAR(191) NOT NULL,
        body TEXT,
        type VARCHAR(191) DEFAULT 'info',
        isRead TINYINT(1) DEFAULT 0,
        link VARCHAR(191),
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(userId, isRead),
        INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`NotificationPreference\` (
        id VARCHAR(191) PRIMARY KEY,
        userId VARCHAR(191) NOT NULL UNIQUE,
        emailEnabled TINYINT(1) DEFAULT 1,
        pushEnabled TINYINT(1) DEFAULT 1,
        smsEnabled TINYINT(1) DEFAULT 0,
        digestDaily TINYINT(1) DEFAULT 0,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`RmmProviderConfig\` (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        provider VARCHAR(191) NOT NULL,
        credentials TEXT NOT NULL,
        isActive TINYINT(1) DEFAULT 1,
        syncIntervalMin INT DEFAULT 60,
        lastSyncAt DATETIME(3),
        lastSyncStatus VARCHAR(32),
        lastSyncMessage TEXT,
        lastTestStatus VARCHAR(32),
        lastTestAt DATETIME(3),
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE(companyId, provider),
        INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`UserPageFavorite\` (
        id VARCHAR(191) PRIMARY KEY,
        userId VARCHAR(191) NOT NULL,
        label VARCHAR(191) NOT NULL,
        path VARCHAR(191) NOT NULL,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE(userId, path),
        INDEX(userId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`RmmSyncRun\` (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        provider VARCHAR(191) NOT NULL,
        status VARCHAR(32) NOT NULL,
        startedAt DATETIME(3) NOT NULL,
        completedAt DATETIME(3),
        assetsCreated INT DEFAULT 0,
        assetsUpdated INT DEFAULT 0,
        assetsSkipped INT DEFAULT 0,
        errorMessage TEXT,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId, provider, startedAt),
        INDEX(status)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`ErrorReport\` (
        id VARCHAR(191) PRIMARY KEY,
        source VARCHAR(120) NOT NULL,
        message TEXT NOT NULL,
        stack TEXT,
        path VARCHAR(500),
        userAgent VARCHAR(500),
        userId VARCHAR(191),
        companyId VARCHAR(191),
        metadata JSON,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(source),
        INDEX(userId),
        INDEX(companyId),
        INDEX(createdAt)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`AuditLog\` (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        actorId VARCHAR(191) NOT NULL,
        action VARCHAR(191) NOT NULL,
        resourceType VARCHAR(191) NOT NULL,
        resourceId VARCHAR(191),
        diff TEXT,
        ip VARCHAR(191),
        userAgent VARCHAR(191),
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId, createdAt),
        INDEX(resourceType, resourceId),
        INDEX(actorId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`TimeEntry\` (
        id VARCHAR(191) PRIMARY KEY,
        ticketId VARCHAR(191) NOT NULL,
        userId VARCHAR(191) NOT NULL,
        startTime DATETIME(3) NOT NULL,
        endTime DATETIME(3),
        duration INT,
        description TEXT,
        billable TINYINT(1) DEFAULT 1,
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(ticketId),
        INDEX(userId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS \`KbArticle\` (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        title VARCHAR(191) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(191),
        tags VARCHAR(191),
        createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    ];
    for (const sql of tables) {
      try {
        await this.execute(sql);
        this.logger.log(`Table ensured: ${sql.split('`')[1] || 'unknown'}`);
      } catch (err: any) {
        this.logger.warn(`Table creation skipped: ${err?.message || err}`);
      }
    }
    await this.ensureCompanyCoreColumns();
    await this.ensureTicketCoreColumns();
    await this.ensureAuditLogCoreColumns();
    await this.ensureUserProfileColumns();
    await this.ensureUserCoreColumns();
    await this.ensureAssetMdmColumns();
    await this.ensureRmmColumns();
  }

  private async ensureCompanyCoreColumns() {
    const columns: Array<{ name: string; definition: string }> = [
      { name: 'domain', definition: 'VARCHAR(191)' },
      { name: 'logo', definition: 'VARCHAR(191)' },
      { name: 'settings', definition: 'TEXT' },
      { name: 'isActive', definition: 'TINYINT(1) DEFAULT 1' },
      { name: 'updatedAt', definition: 'DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)' },
      { name: 'deletedAt', definition: 'DATETIME(3)' },
      { name: 'branding', definition: 'TEXT' },
      { name: 'inviteCode', definition: 'VARCHAR(191)' },
      { name: 'inviteExpiresAt', definition: 'DATETIME(3)' },
    ];
    await this.ensureColumns('Company', columns);
  }

  private async ensureTicketCoreColumns() {
    const columns: Array<{ name: string; definition: string }> = [
      { name: 'contactName', definition: 'VARCHAR(191)' },
      { name: 'contactEmail', definition: 'VARCHAR(191)' },
      { name: 'contactPhone', definition: 'VARCHAR(191)' },
      { name: 'category', definition: 'VARCHAR(191)' },
      { name: 'subcategory', definition: 'VARCHAR(191)' },
      { name: 'location', definition: 'VARCHAR(191)' },
      { name: 'latitude', definition: 'FLOAT' },
      { name: 'longitude', definition: 'FLOAT' },
      { name: 'type', definition: "VARCHAR(191) DEFAULT 'INCIDENT'" },
      { name: 'assignedToId', definition: 'VARCHAR(191)' },
      { name: 'assetId', definition: 'VARCHAR(191)' },
      { name: 'slaId', definition: 'VARCHAR(191)' },
      { name: 'trackingToken', definition: 'VARCHAR(191)' },
      { name: 'onHoldReason', definition: 'TEXT' },
      { name: 'resolution', definition: 'TEXT' },
      { name: 'resolvedAt', definition: 'DATETIME(3)' },
      { name: 'resolvedById', definition: 'VARCHAR(191)' },
      { name: 'updatedAt', definition: 'DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)' },
      { name: 'deletedAt', definition: 'DATETIME(3)' },
    ];
    await this.ensureColumns('Ticket', columns);
  }

  private async ensureAuditLogCoreColumns() {
    const columns: Array<{ name: string; definition: string }> = [
      { name: 'resourceId', definition: 'VARCHAR(191)' },
      { name: 'diff', definition: 'TEXT' },
      { name: 'ip', definition: 'VARCHAR(191)' },
      { name: 'userAgent', definition: 'VARCHAR(191)' },
    ];
    await this.ensureColumns('AuditLog', columns);
  }

  private async ensureRmmColumns() {
    const columns: Array<{ name: string; definition: string }> = [
      { name: 'lastSyncStatus', definition: 'VARCHAR(32)' },
      { name: 'lastSyncMessage', definition: 'TEXT' },
      { name: 'lastTestStatus', definition: 'VARCHAR(32)' },
      { name: 'lastTestAt', definition: 'DATETIME(3)' },
    ];

    for (const column of columns) {
      try {
        await this.execute(`ALTER TABLE RmmProviderConfig ADD COLUMN ${this.escapeColumn(column.name)} ${column.definition}`);
        this.logger.log(`RMM config column ensured: ${column.name}`);
      } catch (err: any) {
        if (!String(err?.message || '').includes('Duplicate column')) {
          this.logger.warn(`RMM config column skipped (${column.name}): ${err?.message || err}`);
        }
      }
    }
  }

  private async ensureUserProfileColumns() {
    const columns: Array<{ name: string; definition: string }> = [
      { name: 'phone', definition: 'VARCHAR(191)' },
      { name: 'jobTitle', definition: 'VARCHAR(191)' },
      { name: 'department', definition: 'VARCHAR(191)' },
      { name: 'location', definition: 'VARCHAR(191)' },
      { name: 'preferredContactMethod', definition: 'VARCHAR(191)' },
      { name: 'timezone', definition: 'VARCHAR(191)' },
      { name: 'featureOverrides', definition: 'TEXT' },
    ];

    for (const column of columns) {
      try {
        await this.execute(`ALTER TABLE User ADD COLUMN ${this.escapeColumn(column.name)} ${column.definition}`);
        this.logger.log(`User column ensured: ${column.name}`);
      } catch (err: any) {
        if (!String(err?.message || '').includes('Duplicate column')) {
          this.logger.warn(`User column skipped (${column.name}): ${err?.message || err}`);
        }
      }
    }
  }

  private async ensureUserCoreColumns() {
    const columns: Array<{ name: string; definition: string }> = [
      { name: 'role', definition: "VARCHAR(191) DEFAULT 'CLIENT'" },
      { name: 'userType', definition: "VARCHAR(191) DEFAULT 'BUSINESS'" },
      { name: 'companyId', definition: 'VARCHAR(191)' },
      { name: 'isActive', definition: 'TINYINT(1) DEFAULT 1' },
      { name: 'emailVerified', definition: 'TINYINT(1) DEFAULT 0' },
      { name: 'lastLoginAt', definition: 'DATETIME(3)' },
      { name: 'resetToken', definition: 'VARCHAR(191)' },
      { name: 'resetTokenExpiresAt', definition: 'DATETIME(3)' },
      { name: 'emailVerificationToken', definition: 'VARCHAR(191)' },
      { name: 'emailVerificationExpiresAt', definition: 'DATETIME(3)' },
      { name: 'updatedAt', definition: 'DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)' },
      { name: 'deletedAt', definition: 'DATETIME(3)' },
    ];
    await this.ensureColumns('User', columns);
  }

  private async ensureColumns(table: string, columns: Array<{ name: string; definition: string }>) {
    for (const column of columns) {
      try {
        await this.execute(`ALTER TABLE ${this.escapeColumn(table)} ADD COLUMN ${this.escapeColumn(column.name)} ${column.definition}`);
        this.logger.log(`${table} column ensured: ${column.name}`);
      } catch (err: any) {
        if (!String(err?.message || '').includes('Duplicate column')) {
          this.logger.warn(`${table} column skipped (${column.name}): ${err?.message || err}`);
        }
      }
    }
  }

  private async ensureAssetMdmColumns() {
    const columns: Array<{ name: string; definition: string; index?: string }> = [
      { name: 'osVersion', definition: 'VARCHAR(191)' },
      { name: 'deviceCategory', definition: "VARCHAR(191) DEFAULT 'DESKTOP'", index: 'INDEX(deviceCategory)' },
      { name: 'ownership', definition: "VARCHAR(191) DEFAULT 'COMPANY'" },
      { name: 'assignedUser', definition: 'VARCHAR(191)' },
      { name: 'enrollmentStatus', definition: "VARCHAR(191) DEFAULT 'UNMANAGED'", index: 'INDEX(enrollmentStatus)' },
      { name: 'managementMode', definition: 'VARCHAR(191)' },
      { name: 'mdmProvider', definition: 'VARCHAR(191)' },
      { name: 'mdmDeviceId', definition: 'VARCHAR(191)' },
      { name: 'lastCheckInAt', definition: 'DATETIME(3)', index: 'INDEX(lastCheckInAt)' },
      { name: 'complianceStatus', definition: "VARCHAR(191) DEFAULT 'UNKNOWN'", index: 'INDEX(complianceStatus)' },
      { name: 'complianceReasons', definition: 'TEXT' },
      { name: 'encryptionStatus', definition: "VARCHAR(191) DEFAULT 'UNKNOWN'" },
      { name: 'firewallEnabled', definition: 'TINYINT(1)' },
      { name: 'antivirusStatus', definition: 'VARCHAR(191)' },
      { name: 'passcodeCompliant', definition: 'TINYINT(1)' },
      { name: 'jailbreakDetected', definition: 'TINYINT(1) DEFAULT 0' },
      { name: 'lostModeEnabled', definition: 'TINYINT(1) DEFAULT 0' },
      { name: 'batteryLevel', definition: 'INT' },
      { name: 'imei', definition: 'VARCHAR(191)' },
      { name: 'meid', definition: 'VARCHAR(191)' },
      { name: 'phoneNumber', definition: 'VARCHAR(191)' },
      { name: 'carrier', definition: 'VARCHAR(191)' },
      { name: 'appInventory', definition: 'TEXT' },
      { name: 'policyProfile', definition: 'VARCHAR(191)' },
    ];

    for (const column of columns) {
      try {
        await this.execute(`ALTER TABLE Asset ADD COLUMN ${this.escapeColumn(column.name)} ${column.definition}`);
        this.logger.log(`Asset column ensured: ${column.name}`);
      } catch (err: any) {
        if (!String(err?.message || '').includes('Duplicate column')) {
          this.logger.warn(`Asset column skipped (${column.name}): ${err?.message || err}`);
        }
      }
      if (column.index) {
        try {
          await this.execute(`ALTER TABLE Asset ADD ${column.index}`);
        } catch (err: any) {
          if (!String(err?.message || '').includes('Duplicate key name')) {
            this.logger.warn(`Asset index skipped (${column.name}): ${err?.message || err}`);
          }
        }
      }
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutting down (signal: ${signal}) — closing database pool...`);
    if (this.pool) {
      await this.pool.end();
      this.logger.log('Database pool closed');
    }
  }

  private parseDatabaseUrl(url: string) {
    try {
      const normalizedUrl = url.trim().replace(/^DATABASE_URL=/, '');
      const parsed = new URL(normalizedUrl);
      if (parsed.protocol !== 'mysql:' || !parsed.username || !parsed.hostname || !parsed.pathname.slice(1)) {
        throw new Error('Missing required MySQL connection parts');
      }

      return {
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        host: parsed.hostname,
        port: parseInt(parsed.port || '3306', 10),
        database: decodeURIComponent(parsed.pathname.slice(1)),
      };
    } catch {
      throw new Error('Invalid DATABASE_URL');
    }
  }

  async query<T = RowDataPacket[]>(sql: string, values?: any[]): Promise<T> {
    const [rows] = await this.pool.execute(sql, values || []);
    return rows as T;
  }

  async execute(sql: string, values?: any[]): Promise<ResultSetHeader> {
    const [result] = await this.pool.execute(sql, values || []);
    return result as ResultSetHeader;
  }

  async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      const tx = new TransactionClient(conn);
      const result = await fn(tx);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  user = {
    findUnique: async ({ where, select }: { where: Record<string, any>; select?: Record<string, any> }) => {
      if (Object.values(where).some(v => v === undefined)) return null;
      const cols = this.resolveSelectCols(select);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM User WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      const user = rows[0] || null;
      if (user && select?.company) {
        user.company = user.companyId
          ? (await this.query<RowDataPacket[]>(`SELECT id, name FROM Company WHERE id = ? LIMIT 1`, [user.companyId]))[0] || null
          : null;
      }
      return user;
    },

    findFirst: async ({ where, select, include, orderBy }: { where: Record<string, any>; select?: Record<string, any>; include?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      }).filter(Boolean);
      const values = Object.values(where).filter(v => v !== null);
      let sql = `SELECT ${cols.join(', ')} FROM User WHERE ${whereClauses.join(' AND ')}`;
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      sql += ` LIMIT 1`;
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return rows[0] || null;
    },

    findMany: async ({ where, select, orderBy, skip, take, include }: { where?: Record<string, any>; select?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number; include?: Record<string, any> }) => {
      const cols = this.resolveSelectCols(select);
      let sql = `SELECT ${cols.join(', ')} FROM User`;
      const values: any[] = [];

      if (where && Object.keys(where).length > 0) {
        const clauses = this.buildWhereClauses('User', where, values);
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }

      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }

      if (take !== undefined) {
        sql += ` LIMIT ?`;
        values.push(take);
      }
      if (skip !== undefined) {
        sql += ` OFFSET ?`;
        values.push(skip);
      }

      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (select?.company || include?.company) {
        for (const row of rows) {
          if (row.companyId) {
            const companyRows = await this.query<RowDataPacket[]>(`SELECT id, name FROM Company WHERE id = ? LIMIT 1`, [row.companyId]);
            row.company = companyRows[0] || null;
          } else {
            row.company = null;
          }
        }
      }
      if (include?.assignedTickets) {
        for (const row of rows) {
          row.assignedTickets = await this.query<RowDataPacket[]>(`SELECT id, createdAt, resolvedAt FROM Ticket WHERE assignedToId = ? AND status = 'RESOLVED' AND deletedAt IS NULL`, [row.id]);
        }
      }
      if (include?.dispatches) {
        for (const row of rows) {
          row.dispatches = await this.query<RowDataPacket[]>(`SELECT * FROM Dispatch WHERE technicianId = ?`, [row.id]);
        }
      }
      return rows;
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT COUNT(*) as count FROM User';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = this.buildWhereClauses('User', where, values);
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Number(rows[0].count);
    },

    create: async ({ data, select }: { data: Record<string, any>; select?: Record<string, any> }) => {
      const now = new Date();
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData).filter(k => insertData[k] !== undefined);
      const values = cols.map(k => insertData[k]);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO User (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const selCols = this.resolveSelectCols(select);
      const rows = await this.query<RowDataPacket[]>(`SELECT ${selCols.join(', ')} FROM User WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data, select }: { where: Record<string, any>; data: Record<string, any>; select?: Record<string, any> }) => {
      const cols = this.resolveSelectCols(select);
      const dataKeys = Object.keys(data).filter(k => data[k] !== undefined);
      const setClauses = dataKeys.map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...dataKeys.map(k => data[k]), ...Object.values(where)];
      const sql = `UPDATE User SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT ${cols.join(', ')} FROM User WHERE ${whereClauses.join(' AND ')} LIMIT 1`, Object.values(where));
      return rows[0];
    },

    updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      });
      const values = [...Object.values(data), ...Object.values(where).filter(v => v !== null)];
      const sql = `UPDATE User SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      const result = await this.execute(sql, values);
      return { count: result.affectedRows };
    },

    deleteMany: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM User WHERE ${whereClauses.join(' AND ')}`;
      const result = await this.execute(sql, values);
      return { count: result.affectedRows };
    },

    groupBy: async (params: { by: string[]; where?: Record<string, any>; _count?: any }) => {
      return this.genericGroupBy('User', params);
    },
  };

  company = {
    findUnique: async ({ where, select }: { where: Record<string, any>; select?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM Company WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    findFirst: async ({ where, select, include }: { where: Record<string, any>; select?: Record<string, any>; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      }).filter(Boolean);
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM Company WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    findMany: async ({ where, select, orderBy, skip, take, include }: { where?: Record<string, any>; select?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      let sql = `SELECT ${cols.join(', ')} FROM Company`;
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = this.buildWhereClauses('Company', where, values);
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return rows;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const now = new Date();
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData).filter(k => insertData[k] !== undefined);
      const values = cols.map(k => insertData[k]);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Company (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Company WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data, select }: { where: Record<string, any>; data: Record<string, any>; select?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE Company SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT ${cols.join(', ')} FROM Company WHERE id = ? LIMIT 1`, [where.id]);
      return rows[0];
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      return this.genericCount('Company', { where });
    },
  };

  ticket = {
    findUnique: async ({ where, select, include }: { where: Record<string, any>; select?: Record<string, any>; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      });
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM Ticket WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return this.enrichTicket(rows[0], include) || null;
    },

    findFirst: async ({ where, select, include }: { where: Record<string, any>; select?: Record<string, any>; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const values: any[] = [];
      const whereClauses = this.buildWhereClauses('Ticket', where, values);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM Ticket WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return this.enrichTicket(rows[0], include) || null;
    },

    findMany: async ({ where, select, orderBy, skip, take, include }: { where?: Record<string, any>; select?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k] && typeof select[k] === 'boolean') : ['*'];
      let sql = `SELECT ${cols.join(', ')} FROM Ticket`;
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = this.buildWhereClauses('Ticket', where, values);
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Promise.all(rows.map(r => this.enrichTicket(r, include)));
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT COUNT(*) as count FROM Ticket';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = this.buildWhereClauses('Ticket', where, values);
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Number(rows[0].count);
    },

    create: async ({ data, select, include }: { data: Record<string, any>; select?: Record<string, any>; include?: Record<string, any> }) => {
      const now = new Date();
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData).filter(k => insertData[k] !== undefined);
      const values = cols.map(k => insertData[k]);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Ticket (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Ticket WHERE id = ? LIMIT 1`, [insertData.id]);
      return this.enrichTicket(rows[0], include);
    },

    update: async ({ where, data, select, include }: { where: Record<string, any>; data: Record<string, any>; select?: Record<string, any>; include?: Record<string, any> }) => {
      const dataKeys = Object.keys(data).filter(k => data[k] !== undefined);
      if (dataKeys.length === 0) {
        const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Ticket WHERE id = ? LIMIT 1`, [where.id]);
        return this.enrichTicket(rows[0], include);
      }
      const setClauses = dataKeys.map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...dataKeys.map(k => data[k]), ...Object.values(where)];
      const sql = `UPDATE Ticket SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Ticket WHERE ${whereClauses.join(' AND ')} LIMIT 1`, Object.values(where));
      return this.enrichTicket(rows[0], include);
    },

    delete: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM Ticket WHERE ${whereClauses.join(' AND ')}`;
      const result = await this.execute(sql, values);
      return { count: result.affectedRows };
    },

    groupBy: async (params: { by: string[]; where?: Record<string, any>; _count?: any }) => {
      return this.genericGroupBy('Ticket', params);
    },
  };

  session = {
    findUnique: async ({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) => {
      if (Object.values(where).some(v => v === undefined)) return null;
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM Session WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      const session = rows[0] || null;
      if (session && include?.user) {
        const userRows = await this.query<RowDataPacket[]>(`SELECT * FROM User WHERE id = ? LIMIT 1`, [session.userId]);
        session.user = userRows[0] || null;
      }
      return session;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: new Date(), ...data };
      const cols = Object.keys(insertData).filter(k => insertData[k] !== undefined);
      const values = cols.map(k => insertData[k]);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Session (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Session WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE Session SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const lookupColumn = where.id ? 'id' : 'refreshToken';
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Session WHERE ${this.escapeColumn(lookupColumn)} = ? LIMIT 1`, [where[lookupColumn]]);
      return rows[0];
    },

    deleteMany: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM Session WHERE ${whereClauses.join(' AND ')}`;
      const result = await this.execute(sql, values);
      return { count: result.affectedRows };
    },
  };

  ticketAttachment = {
    create: async ({ data, include }: { data: Record<string, any>; include?: Record<string, any> }) => {
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: new Date(), ...data };
      const cols = Object.keys(insertData).filter(k => insertData[k] !== undefined);
      const values = cols.map(k => insertData[k]);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO TicketAttachment (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketAttachment WHERE id = ? LIMIT 1`, [insertData.id]);
      const attachment = rows[0];
      if (attachment && include?.uploadedBy) {
        const userRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [attachment.uploadedById]);
        attachment.uploadedBy = userRows[0] || null;
      }
      return attachment;
    },

    delete: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM TicketAttachment WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      return { success: true };
    },
  };

  ticketTemplate = {
    findMany: async ({ where, orderBy }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      let sql = 'SELECT * FROM TicketTemplate';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = this.buildWhereClauses('TicketTimeline', where, values);
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      return this.query<RowDataPacket[]>(sql, values);
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const now = new Date();
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO TicketTemplate (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketTemplate WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE TicketTemplate SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketTemplate WHERE id = ? LIMIT 1`, [where.id]);
      return rows[0];
    },
  };

  timeEntry = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: new Date(), ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO TimeEntry (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TimeEntry WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    findMany: async ({ where, orderBy, include }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; include?: Record<string, any> }) => {
      let sql = 'SELECT * FROM TimeEntry';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.user) {
        for (const row of rows) {
          const userRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [row.userId]);
          row.user = userRows[0] || null;
        }
      }
      return rows;
    },
  };

  dispatch = {
    findMany: async ({ where, select, orderBy, skip, take, include }: { where?: Record<string, any>; select?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      let sql = `SELECT ${cols.join(', ')} FROM Dispatch`;
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.ticket) {
        for (const row of rows) {
          const tRows = await this.query<RowDataPacket[]>(`SELECT * FROM Ticket WHERE id = ? LIMIT 1`, [row.ticketId]);
          row.ticket = tRows[0] || null;
        }
      }
      if (include?.technician) {
        for (const row of rows) {
          const tRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [row.technicianId]);
          row.technician = tRows[0] || null;
        }
      }
      return rows;
    },

    findFirst: async ({ where, select, include }: { where: Record<string, any>; select?: Record<string, any>; include?: Record<string, any> }) => {
      const rows = await this.dispatch.findMany({ where, select, include, take: 1 });
      return rows[0] || null;
    },

    create: async ({ data, include }: { data: Record<string, any>; include?: Record<string, any> }) => {
      const row = await this.genericCreate('Dispatch', { data });
      if (include?.ticket) {
        const tRows = await this.query<RowDataPacket[]>(`SELECT * FROM Ticket WHERE id = ? LIMIT 1`, [row.ticketId]);
        row.ticket = tRows[0] || null;
      }
      if (include?.technician) {
        const tRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [row.technicianId]);
        row.technician = tRows[0] || null;
      }
      return row;
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      return this.genericUpdate('Dispatch', { where, data });
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      return this.genericCount('Dispatch', { where });
    },
  };

  asset = {
    findMany: async ({ where, select, orderBy, skip, take }: { where?: Record<string, any>; select?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      let sql = `SELECT ${cols.join(', ')} FROM Asset`;
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).flatMap(([k, v]) => {
          if (k === 'OR' && Array.isArray(v)) {
            const orClauses = v.flatMap((condition: Record<string, any>) => Object.entries(condition).map(([orKey, orValue]) => {
              if (typeof orValue === 'object' && orValue?.contains !== undefined) {
                values.push(`%${orValue.contains}%`);
                return `${this.escapeColumn(orKey)} LIKE ?`;
              }
              values.push(orValue);
              return `${this.escapeColumn(orKey)} = ?`;
            }));
            return orClauses.length > 0 ? [`(${orClauses.join(' OR ')})`] : [];
          }
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          if (typeof v === 'object' && v?.contains !== undefined) { values.push(`%${v.contains}%`); return `${this.escapeColumn(k)} LIKE ?`; }
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      return this.query<RowDataPacket[]>(sql, values);
    },

    findFirst: async ({ where, select, include }: { where: Record<string, any>; select?: Record<string, any>; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      }).filter(Boolean);
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM Asset WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    findUnique: async ({ where, select, orderBy }: { where: Record<string, any>; select?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      let sql = `SELECT ${cols.join(', ')} FROM Asset WHERE ${whereClauses.join(' AND ')} LIMIT 1`;
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return rows[0] || null;
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT COUNT(*) as count FROM Asset';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).flatMap(([k, v]) => {
          if (k === 'OR' && Array.isArray(v)) {
            const orClauses = v.flatMap((condition: Record<string, any>) => Object.entries(condition).map(([orKey, orValue]) => {
              if (typeof orValue === 'object' && orValue?.contains !== undefined) {
                values.push(`%${orValue.contains}%`);
                return `${this.escapeColumn(orKey)} LIKE ?`;
              }
              values.push(orValue);
              return `${this.escapeColumn(orKey)} = ?`;
            }));
            return orClauses.length > 0 ? [`(${orClauses.join(' OR ')})`] : [];
          }
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          if (typeof v === 'object' && v?.contains !== undefined) { values.push(`%${v.contains}%`); return `${this.escapeColumn(k)} LIKE ?`; }
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Number(rows[0].count);
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const now = new Date();
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData).filter(k => insertData[k] !== undefined);
      const values = cols.map(k => insertData[k]);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Asset (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Asset WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const dataKeys = Object.keys(data).filter(k => data[k] !== undefined);
      const setClauses = dataKeys.map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...dataKeys.map(k => data[k]), ...Object.values(where)];
      const sql = `UPDATE Asset SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Asset WHERE id = ? LIMIT 1`, [where.id]);
      return rows[0];
    },

    groupBy: async (params: { by: string[]; where?: Record<string, any>; _count?: any }) => {
      return this.genericGroupBy('Asset', params);
    },
  };

  sla = {
    findMany: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT * FROM SLA';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      return this.query<RowDataPacket[]>(sql, values);
    },

    findUnique: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM SLA WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      return this.genericCreate('SLA', { data });
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      return this.genericUpdate('SLA', { where, data });
    },

    delete: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM SLA WHERE ${whereClauses.join(' AND ')}`;
      const result = await this.execute(sql, values);
      return { count: result.affectedRows };
    },
  };

  contract = {
    findMany: async ({ where, orderBy, skip, take }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number }) => {
      let sql = 'SELECT * FROM Contract';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      return this.query<RowDataPacket[]>(sql, values);
    },

    findFirst: async ({ where, select }: { where: Record<string, any>; select?: Record<string, any> }) => {
      return this.genericFindFirst('Contract', { where, select });
    },

    findUnique: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM Contract WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      return this.genericCreate('Contract', { data });
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      return this.genericUpdate('Contract', { where, data });
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      return this.genericCount('Contract', { where });
    },
  };

  notification = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: new Date(), ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Notification (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Notification WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    findMany: async ({ where, orderBy, skip, take }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number }) => {
      let sql = 'SELECT * FROM Notification';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      return this.query<RowDataPacket[]>(sql, values);
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT COUNT(*) as count FROM Notification';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Number(rows[0].count);
    },

    updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      });
      const values = [...Object.values(data), ...Object.values(where).filter(v => v !== null)];
      const sql = `UPDATE Notification SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      const result = await this.execute(sql, values);
      return { count: result.affectedRows };
    },
  };

  role = {
    findMany: async ({ where, include, orderBy }: { where?: Record<string, any>; include?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      let sql = 'SELECT * FROM Role';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.permissions) {
        for (const row of rows) {
          const permRows = await this.query<RowDataPacket[]>(
            `SELECT rp.*, p.* FROM RolePermission rp JOIN Permission p ON rp.permissionId = p.id WHERE rp.roleId = ?`,
            [row.id],
          );
          row.permissions = permRows;
        }
      }
      return rows;
    },

    findUnique: async ({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM Role WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      const role = rows[0];
      if (role && include?.permissions) {
        const permRows = await this.query<RowDataPacket[]>(
          `SELECT rp.*, p.* FROM RolePermission rp JOIN Permission p ON rp.permissionId = p.id WHERE rp.roleId = ?`,
          [role.id],
        );
        role.permissions = permRows;
      }
      return role;
    },

    create: async ({ data, include }: { data: Record<string, any>; include?: Record<string, any> }) => {
      const { permissions, ...roleData } = data;
      const now = new Date();
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...roleData };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Role (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      if (permissions?.create) {
        for (const perm of permissions.create) {
          await this.execute(`INSERT INTO RolePermission (roleId, permissionId) VALUES (?, ?)`, [insertData.id, perm.permissionId]);
        }
      }
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Role WHERE id = ? LIMIT 1`, [insertData.id]);
      const role = rows[0];
      if (role && include?.permissions) {
        const permRows = await this.query<RowDataPacket[]>(
          `SELECT rp.*, p.* FROM RolePermission rp JOIN Permission p ON rp.permissionId = p.id WHERE rp.roleId = ?`,
          [role.id],
        );
        role.permissions = permRows;
      }
      return role;
    },

    update: async ({ where, data, include }: { where: Record<string, any>; data: Record<string, any>; include?: Record<string, any> }) => {
      const { permissions, ...updateData } = data;
      const setClauses = Object.keys(updateData).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(updateData), ...Object.values(where)];
      if (setClauses.length > 0) {
        const sql = `UPDATE Role SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
        await this.execute(sql, values);
      }
      if (permissions) {
        const roleId = where.id;
        if (permissions.deleteMany) {
          await this.execute(`DELETE FROM RolePermission WHERE roleId = ?`, [roleId]);
        }
        if (permissions.create) {
          for (const perm of permissions.create) {
            await this.execute(`INSERT INTO RolePermission (roleId, permissionId) VALUES (?, ?)`, [roleId, perm.permissionId]);
          }
        }
      }
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Role WHERE id = ? LIMIT 1`, [where.id]);
      const role = rows[0];
      if (role && include?.permissions) {
        const permRows = await this.query<RowDataPacket[]>(
          `SELECT rp.*, p.* FROM RolePermission rp JOIN Permission p ON rp.permissionId = p.id WHERE rp.roleId = ?`,
          [role.id],
        );
        role.permissions = permRows;
      }
      return role;
    },

    delete: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM Role WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      return { success: true };
    },

    createMany: async ({ data }: { data: Record<string, any>[] }) => {
      return this.genericCreateMany('Role', { data });
    },

    upsert: async ({ where, update, create }: { where: Record<string, any>; update: Record<string, any>; create: Record<string, any> }) => {
      return this.genericUpsert('Role', { where, update, create });
    },
  };

  permission = {
    findMany: async ({ where, orderBy }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[] }) => {
      let sql = 'SELECT *, grp as `group` FROM Permission';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          const column = this.normalizeColumn('Permission', k);
          if (v === null) return `${this.escapeColumn(column)} IS NULL`;
          if (typeof v === 'object' && v?.in !== undefined) { values.push(v.in); return `${this.escapeColumn(column)} IN (?)`; }
          values.push(v);
          return `${this.escapeColumn(column)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        if (Array.isArray(orderBy)) {
          const orderParts = orderBy.map((o: any) => {
            const key = Object.keys(o)[0];
            return `${this.escapeColumn(this.normalizeColumn('Permission', key))} ${o[key].toUpperCase()}`;
          });
          sql += ` ORDER BY ${orderParts.join(', ')}`;
        } else {
          const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(this.normalizeColumn('Permission', k))} ${v.toUpperCase()}`);
          sql += ` ORDER BY ${orderParts.join(', ')}`;
        }
      }
      try {
        return await this.query<RowDataPacket[]>(sql, values);
      } catch (err: any) {
        if (!String(err?.message || '').includes("Unknown column 'grp'")) throw err;
        const fallbackSql = sql.replace('grp as `group`', '`group`').replace(/`grp`/g, '`group`');
        return this.query<RowDataPacket[]>(fallbackSql, values);
      }
    },
  };

  rolePermission = {
    findMany: async ({ where, include }: { where?: Record<string, any>; include?: Record<string, any> }) => {
      let sql = 'SELECT * FROM RolePermission';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      return this.query<RowDataPacket[]>(sql, values);
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const cols = Object.keys(data);
      const values = Object.values(data);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO RolePermission (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM RolePermission WHERE roleId = ? AND permissionId = ? LIMIT 1`, [data.roleId, data.permissionId]);
      return rows[0];
    },

    deleteMany: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM RolePermission WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      return { count: 0 };
    },

    createMany: async ({ data }: { data: Record<string, any>[] }) => {
      for (const item of data) {
        const cols = Object.keys(item);
        const values = Object.values(item);
        const placeholders = cols.map(() => '?').join(', ');
        const sql = `INSERT INTO RolePermission (${cols.map(c => `\`${c.replace(/`/g, '')}\``).join(', ')}) VALUES (${placeholders})`;
        await this.query(sql, values);
      }
      return { count: data.length };
    },
  };

  userRole = {
    findMany: async ({ where, include }: { where?: Record<string, any>; include?: Record<string, any> }) => {
      let sql = 'SELECT * FROM UserRole';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.role) {
        for (const row of rows) {
          const roleRows = await this.query<RowDataPacket[]>(`SELECT * FROM Role WHERE id = ? LIMIT 1`, [row.roleId]);
          row.role = roleRows[0];
          if (include.role.include?.permissions) {
            const permRows = await this.query<RowDataPacket[]>(
              `SELECT rp.*, p.* FROM RolePermission rp JOIN Permission p ON rp.permissionId = p.id WHERE rp.roleId = ?`,
              [row.roleId],
            );
            row.role.permissions = permRows;
          }
        }
      }
      return rows;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const cols = Object.keys(data);
      const values = Object.values(data);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO UserRole (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM UserRole WHERE userId = ? AND roleId = ? LIMIT 1`, [data.userId, data.roleId]);
      return rows[0];
    },

    delete: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM UserRole WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      return { success: true };
    },

    deleteMany: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      });
      const values = Object.values(where).filter(v => v !== null);
      const sql = `DELETE FROM UserRole WHERE ${whereClauses.join(' AND ')}`;
      const result = await this.execute(sql, values);
      return { count: result.affectedRows };
    },

    findUnique: async ({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) => {
      const rows = await this.userRole.findMany({ where, include, take: 1 } as any);
      return rows[0] || null;
    },

    upsert: async ({ where, update, create, include }: { where: Record<string, any>; update: Record<string, any>; create: Record<string, any>; include?: Record<string, any> }) => {
      const rows = await this.userRole.findMany({ where } as any);
      if (rows.length > 0) {
        await this.userRole.delete({ where });
        await this.userRole.create({ data: { ...update } } as any);
        return { ...rows[0], ...update };
      }
      return this.userRole.create({ data: create } as any);
    },
  };

  auditLog = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const cols = Object.keys(data);
      const values = Object.values(data);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO AuditLog (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      return data;
    },

    findMany: async ({ where, orderBy, skip, take, include }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number; include?: Record<string, any> }) => {
      let sql = 'SELECT * FROM AuditLog';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.actor) {
        for (const row of rows) {
          const actorRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [row.actorId]);
          row.actor = actorRows[0] || null;
        }
      }
      if (include?.company) {
        for (const row of rows) {
          const companyRows = await this.query<RowDataPacket[]>(`SELECT id, name FROM Company WHERE id = ? LIMIT 1`, [row.companyId]);
          row.company = companyRows[0] || null;
        }
      }
      return rows;
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT COUNT(*) as count FROM AuditLog';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Number(rows[0].count);
    },
  };

  workflow = {
    findMany: async ({ where, include, orderBy }: { where?: Record<string, any>; include?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      let sql = 'SELECT * FROM Workflow';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.steps) {
        for (const row of rows) {
          const stepOrder = include.steps.orderBy?.stepOrder === 'asc' ? 'ASC' : 'DESC';
          const stepRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowStep WHERE workflowId = ? ORDER BY stepOrder ${stepOrder}`, [row.id]);
          row.steps = stepRows;
        }
      }
      if (include?.runs) {
        for (const row of rows) {
          const limit = include.runs.take || 10;
          const runRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowRun WHERE workflowId = ? ORDER BY startedAt DESC LIMIT ?`, [row.id, limit]);
          row.runs = runRows;
        }
      }
      return rows;
    },

    findFirst: async ({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      }).filter(Boolean);
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM Workflow WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      const workflow = rows[0];
      if (workflow && include) {
        if (include.steps) {
          const stepOrder = include.steps.orderBy?.stepOrder === 'asc' ? 'ASC' : 'DESC';
          const stepRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowStep WHERE workflowId = ? ORDER BY stepOrder ${stepOrder}`, [workflow.id]);
          workflow.steps = stepRows;
        }
        if (include.runs) {
          const limit = include.runs.take || 10;
          const runRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowRun WHERE workflowId = ? ORDER BY startedAt DESC LIMIT ?`, [workflow.id, limit]);
          workflow.runs = runRows;
        }
      }
      return workflow;
    },

    create: async ({ data, include }: { data: Record<string, any>; include?: Record<string, any> }) => {
      const { steps, ...workflowData } = data;
      const workflowId = this.generateUuid();
      const now = new Date();
      const insertData = { id: workflowId, createdAt: now, updatedAt: now, ...workflowData };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Workflow (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);

      if (steps?.create) {
        for (const step of steps.create) {
          await this.execute(
            `INSERT INTO WorkflowStep (workflowId, stepOrder, action, config) VALUES (?, ?, ?, ?)`,
            [workflowId, step.stepOrder, step.action, typeof step.config === 'object' ? JSON.stringify(step.config) : step.config],
          );
        }
      }

      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Workflow WHERE id = ? LIMIT 1`, [workflowId]);
      const workflow = rows[0];
      if (workflow && include?.steps) {
        const stepOrder = include.steps.orderBy?.stepOrder === 'asc' ? 'ASC' : 'DESC';
        const stepRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowStep WHERE workflowId = ? ORDER BY stepOrder ${stepOrder}`, [workflow.id]);
        workflow.steps = stepRows;
      }
      return workflow;
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE Workflow SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Workflow WHERE id = ? LIMIT 1`, [where.id]);
      return rows[0];
    },
  };

  workflowRun = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const { steps, ...runData } = data;
      const runId = this.generateUuid();
      const now = new Date();
      const insertData = { id: runId, startedAt: now, ...runData };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO WorkflowRun (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);

      if (steps?.create) {
        for (const step of steps.create) {
          await this.execute(
            `INSERT INTO WorkflowRunStep (runId, stepId, status) VALUES (?, ?, ?)`,
            [runId, step.stepId, step.status || 'pending'],
          );
        }
      }

      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowRun WHERE id = ? LIMIT 1`, [runId]);
      return rows[0];
    },

    findMany: async ({ where, include, orderBy }: { where?: Record<string, any>; include?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      let sql = 'SELECT * FROM WorkflowRun';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.steps) {
        for (const row of rows) {
          const stepRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowRunStep WHERE runId = ?`, [row.id]);
          row.steps = stepRows;
        }
      }
      if (include?.ticket) {
        for (const row of rows) {
          const ticketCols = include.ticket.select ? Object.keys(include.ticket.select).filter(k => include.ticket.select[k]) : ['*'];
          const ticketRows = await this.query<RowDataPacket[]>(`SELECT ${ticketCols.join(', ')} FROM Ticket WHERE id = ? LIMIT 1`, [row.ticketId]);
          row.ticket = ticketRows[0] || null;
        }
      }
      return rows;
    },
  };

  workflowRunStep = {
    findMany: async ({ where, skip, take }: { where?: Record<string, any>; skip?: number; take?: number }) => {
      let sql = 'SELECT * FROM WorkflowRunStep';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      return this.query<RowDataPacket[]>(sql, values);
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const insertData: Record<string, any> = { id: this.generateUuid(), ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      await this.execute(`INSERT INTO WorkflowRunStep (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowRunStep WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      return this.genericUpdate('WorkflowRunStep', { where, data });
    },
  };

  rmmProviderConfig = {
    findMany: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT * FROM RmmProviderConfig';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      return this.query<RowDataPacket[]>(sql, values);
    },

    findFirst: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      }).filter(Boolean);
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM RmmProviderConfig WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    findUnique: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM RmmProviderConfig WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const now = new Date();
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO RmmProviderConfig (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM RmmProviderConfig WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE RmmProviderConfig SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM RmmProviderConfig WHERE id = ? LIMIT 1`, [where.id]);
      return rows[0];
    },

    upsert: async ({ where, update, create }: { where: Record<string, any>; update: Record<string, any>; create: Record<string, any> }) => {
      return this.genericUpsert('RmmProviderConfig', { where, update, create });
    },
  };

  kbArticle = {
    findMany: async ({ where, orderBy, skip, take }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number }) => {
      let sql = 'SELECT * FROM KbArticle';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      return this.query<RowDataPacket[]>(sql, values);
    },
  };

  ticketTimeline = {
    findMany: async ({ where, orderBy, include, skip, take }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; include?: Record<string, any>; skip?: number; take?: number }) => {
      let sql = 'SELECT * FROM TicketTimeline';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.actor) {
        for (const row of rows) {
          const actorRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [row.actorId]);
          row.actor = actorRows[0] || null;
        }
      }
      if (include?.ticket) {
        for (const row of rows) {
          const ticketRows = await this.query<RowDataPacket[]>(`SELECT id, ticketNumber, title, status FROM Ticket WHERE id = ? LIMIT 1`, [row.ticketId]);
          row.ticket = ticketRows[0] || null;
        }
      }
      return rows;
    },

    create: async ({ data, include }: { data: Record<string, any>; include?: Record<string, any> }) => {
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: new Date(), ...data };
      const cols = Object.keys(insertData).filter(k => insertData[k] !== undefined);
      const values = cols.map(k => insertData[k]);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO TicketTimeline (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketTimeline WHERE id = ? LIMIT 1`, [insertData.id]);
      const entry = rows[0];
      if (entry && include?.actor) {
        const actorRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [entry.actorId]);
        entry.actor = actorRows[0] || null;
      }
      return entry;
    },
  };

  private async enrichTicket(ticket: any, include?: Record<string, any>) {
    if (!ticket) return null;
    if (include) {
      if (include.createdBy) {
        const rows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName, email FROM User WHERE id = ? LIMIT 1`, [ticket.createdById]);
        ticket.createdBy = rows[0] || null;
      }
      if (include.assignedTo) {
        if (ticket.assignedToId) {
          const rows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName, email FROM User WHERE id = ? LIMIT 1`, [ticket.assignedToId]);
          ticket.assignedTo = rows[0] || null;
        } else {
          ticket.assignedTo = null;
        }
      }
      if (include.resolvedBy) {
        if (ticket.resolvedById) {
          const rows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName, email FROM User WHERE id = ? LIMIT 1`, [ticket.resolvedById]);
          ticket.resolvedBy = rows[0] || null;
        } else {
          ticket.resolvedBy = null;
        }
      }
      if (include.asset) {
        if (ticket.assetId) {
          const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Asset WHERE id = ? LIMIT 1`, [ticket.assetId]);
          ticket.asset = rows[0] || null;
        } else {
          ticket.asset = null;
        }
      }
      if (include.sla) {
        if (ticket.slaId) {
          const rows = await this.query<RowDataPacket[]>(`SELECT * FROM SLA WHERE id = ? LIMIT 1`, [ticket.slaId]);
          ticket.sla = rows[0] || null;
        } else {
          ticket.sla = null;
        }
      }
      if (include.timeline) {
        const order = include.timeline.orderBy?.createdAt === 'desc' ? 'DESC' : 'ASC';
        const limit = include.timeline.take || 50;
        const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketTimeline WHERE ticketId = ? ORDER BY createdAt ${order} LIMIT ?`, [ticket.id, limit]);
        if (include.timeline.include?.actor) {
          for (const row of rows) {
            const actorRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [row.actorId]);
            row.actor = actorRows[0] || null;
          }
        }
        ticket.timeline = rows;
      }
      if (include.attachments) {
        const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketAttachment WHERE ticketId = ?`, [ticket.id]);
        if (include.attachments.include?.uploadedBy) {
          for (const row of rows) {
            const userRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [row.uploadedById]);
            row.uploadedBy = userRows[0] || null;
          }
        }
        ticket.attachments = rows;
      }
      if (include.dispatches) {
        const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Dispatch WHERE ticketId = ?`, [ticket.id]);
        ticket.dispatches = rows;
      }
      if (include.contract) {
        if (ticket.contractId) {
          const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Contract WHERE id = ? LIMIT 1`, [ticket.contractId]);
          ticket.contract = rows[0] || null;
        } else {
          ticket.contract = null;
        }
      }
    }
    return ticket;
  }

  private parsePlanRow(row: any) {
    if (!row) return row;
    if (typeof row.features === 'string') {
      try { row.features = JSON.parse(row.features); } catch { /* ignore */ }
    }
    return row;
  }

  plan = {
    findMany: async ({ where, orderBy }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      let sql = 'SELECT * FROM Plan';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return rows.map(r => this.parsePlanRow(r));
    },

    findUnique: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      });
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Plan WHERE ${whereClauses.join(' AND ')} LIMIT 1`, values);
      return this.parsePlanRow(rows[0] || null);
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: new Date(), updatedAt: new Date(), ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      await this.execute(`INSERT INTO Plan (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`, values);
      return this.parsePlanRow(insertData);
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const updateData: Record<string, any> = { ...data, updatedAt: new Date() };
      const dataKeys = Object.keys(updateData).filter(k => updateData[k] !== undefined);
      const setClauses = dataKeys.map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...dataKeys.map(k => updateData[k]), ...Object.values(where)];
      await this.execute(`UPDATE Plan SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`, values);
      return this.plan.findUnique({ where });
    },
  };

  companyPlan = {
    findUnique: async ({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      });
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM CompanyPlan WHERE ${whereClauses.join(' AND ')} LIMIT 1`, values);
      const cp = rows[0] || null;
      if (cp && include?.plan) {
        const planRows = await this.query<RowDataPacket[]>(`SELECT * FROM Plan WHERE id = ? LIMIT 1`, [cp.planId]);
        cp.plan = this.parsePlanRow(planRows[0] || null);
      }
      return cp;
    },

    findFirst: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      });
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM CompanyPlan WHERE ${whereClauses.join(' AND ')} LIMIT 1`, values);
      return rows[0] || null;
    },

    upsert: async ({ where, update, create }: { where: Record<string, any>; update: Record<string, any>; create: Record<string, any> }) => {
      const existing = await this.companyPlan.findUnique({ where });
      if (existing) {
        const setClauses = Object.keys(update).map(k => `${this.escapeColumn(k)} = ?`);
        const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
        const values = [...Object.values(update), ...Object.values(where)];
        await this.execute(`UPDATE CompanyPlan SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`, values);
        return this.companyPlan.findUnique({ where });
      }
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: new Date(), updatedAt: new Date(), ...create };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      await this.execute(`INSERT INTO CompanyPlan (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`, values);
      return this.companyPlan.findUnique({ where });
    },

    updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      });
      const values = [...Object.values(data), ...Object.values(where).filter(v => v !== null)];
      const result = await this.execute(`UPDATE CompanyPlan SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`, values);
      return { count: result.affectedRows };
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      await this.execute(`UPDATE CompanyPlan SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`, values);
      return this.companyPlan.findUnique({ where });
    },
  };

  usageRecord = {
    findFirst: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        if (typeof v === 'object' && v !== null) {
          const op = Object.keys(v)[0];
          if (op === 'gte') return `${this.escapeColumn(k)} >= ?`;
          if (op === 'lte') return `${this.escapeColumn(k)} <= ?`;
          return `${this.escapeColumn(k)} = ?`;
        }
        return `${this.escapeColumn(k)} = ?`;
      });
      const values: any[] = [];
      for (const [k, v] of Object.entries(where)) {
        if (v === null) continue;
        if (typeof v === 'object' && v !== null) {
          values.push(Object.values(v)[0]);
        } else {
          values.push(v);
        }
      }
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM UsageRecord WHERE ${whereClauses.join(' AND ')} LIMIT 1`, values);
      return rows[0] || null;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: new Date(), ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      await this.execute(`INSERT INTO UsageRecord (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`, values);
      return insertData;
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      await this.execute(`UPDATE UsageRecord SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`, values);
      return this.usageRecord.findFirst({ where });
    },
  };

  private escapeColumn(col: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
      throw new BadRequestException(`Invalid column name: ${col}`);
    }
    return `\`${col}\``;
  }

  private normalizeColumn(table: string, col: string): string {
    if (table === 'Permission' && col === 'group') return 'grp';
    return col;
  }

  private generateUuid(): string {
    return require('crypto').randomUUID();
  }

  private resolveSelectCols(select?: Record<string, any> | null): string[] {
    if (!select) return ['*'];
    return Object.keys(select).filter(k => select[k] === true);
  }

  private buildWhereClauses(table: string, where: Record<string, any>, values: any[]): string[] {
    return Object.entries(where).flatMap(([key, value]) => {
      if (key === 'OR' && Array.isArray(value)) {
        const orClauses = value.flatMap((condition: Record<string, any>) => this.buildWhereClauses(table, condition, values));
        return orClauses.length ? [`(${orClauses.join(' OR ')})`] : [];
      }

      if (table === 'TicketTimeline' && key === 'ticket' && value && typeof value === 'object') {
        const ticketValues: any[] = [];
        const ticketClauses = this.buildWhereClauses('Ticket', value, ticketValues);
        values.push(...ticketValues);
        return [`EXISTS (SELECT 1 FROM Ticket WHERE Ticket.id = TicketTimeline.ticketId AND ${ticketClauses.join(' AND ')})`];
      }

      if (table === 'Ticket' && key === 'createdBy' && value && typeof value === 'object') {
        const userValues: any[] = [];
        const userClauses = this.buildWhereClauses('User', value, userValues);
        values.push(...userValues);
        return [`EXISTS (SELECT 1 FROM User WHERE User.id = Ticket.createdById AND ${userClauses.join(' AND ')})`];
      }

      const column = this.normalizeColumn(table, key);
      if (value === null) return [`${this.escapeColumn(column)} IS NULL`];

      if (value && typeof value === 'object') {
        if (value.contains !== undefined) {
          values.push(`%${value.contains}%`);
          return [`${this.escapeColumn(column)} LIKE ?`];
        }
        if (value.gte !== undefined) {
          values.push(value.gte);
          return [`${this.escapeColumn(column)} >= ?`];
        }
        if (value.lte !== undefined) {
          values.push(value.lte);
          return [`${this.escapeColumn(column)} <= ?`];
        }
        if (value.not !== undefined) {
          if (value.not === null) return [`${this.escapeColumn(column)} IS NOT NULL`];
          values.push(value.not);
          return [`${this.escapeColumn(column)} <> ?`];
        }
        if (Array.isArray(value.in)) {
          if (value.in.length === 0) return ['1 = 0'];
          values.push(...value.in);
          return [`${this.escapeColumn(column)} IN (${value.in.map(() => '?').join(', ')})`];
        }
      }

      values.push(value);
      return [`${this.escapeColumn(column)} = ?`];
    });
  }

  private async genericGroupBy(table: string, params: { by: string[]; where?: Record<string, any>; _count?: any; _sum?: any; _avg?: any; _min?: any; _max?: any }): Promise<RowDataPacket[]> {
    const byCols = params.by.map(c => this.escapeColumn(c)).join(', ');
    let sql = `SELECT ${byCols}`;
    if (params._count) sql += `, COUNT(*) as _count`;
    const values: any[] = [];
    let whereClause = '';
    if (params.where && Object.keys(params.where).length > 0) {
      const clauses = this.buildWhereClauses(table, params.where, values);
      whereClause = ` WHERE ${clauses.join(' AND ')}`;
    }
    sql += ` FROM ${table}${whereClause} GROUP BY ${byCols}`;
    return this.query<RowDataPacket[]>(sql, values);
  }

  private async genericFindFirst(table: string, { where, select, include }: { where: Record<string, any>; select?: Record<string, any>; include?: Record<string, any> }) {
    const cols = this.resolveSelectCols(select);
    const whereClauses = Object.entries(where).map(([k, v]) => {
      if (v === null) return `${this.escapeColumn(k)} IS NULL`;
      return `${this.escapeColumn(k)} = ?`;
    }).filter(Boolean);
    const values = Object.values(where).filter(v => v !== null);
    const rows = await this.query<RowDataPacket[]>(
      `SELECT ${cols.join(', ')} FROM ${table} WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
      values,
    );
    return rows[0] || null;
  }

  private async genericCreate(table: string, { data }: { data: Record<string, any> }) {
    const now = new Date();
    const insertData: Record<string, any> = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
    const cols = Object.keys(insertData);
    const values = Object.values(insertData);
    const placeholders = cols.map(() => '?').join(', ');
    await this.execute(`INSERT INTO ${table} (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`, values);
    const rows = await this.query<RowDataPacket[]>(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [insertData.id]);
    return rows[0];
  }

  private async genericUpdate(table: string, { where, data }: { where: Record<string, any>; data: Record<string, any> }) {
    const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
    const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
    const values = [...Object.values(data), ...Object.values(where)];
    await this.execute(`UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`, values);
    const rows = await this.query<RowDataPacket[]>(`SELECT * FROM ${table} WHERE ${whereClauses.join(' AND ')} LIMIT 1`, Object.values(where));
    return rows[0];
  }

  private async genericUpsert(table: string, { where, update, create }: { where: Record<string, any>; update: Record<string, any>; create: Record<string, any> }) {
    const existing = await this.genericFindFirst(table, { where });
    if (existing) {
      return this.genericUpdate(table, { where, data: update });
    }
    return this.genericCreate(table, { data: create });
  }

  private async genericCreateMany(table: string, { data }: { data: Record<string, any>[] }) {
    for (const item of data) {
      await this.genericCreate(table, { data: item });
    }
    return { count: data.length };
  }

  private async genericCount(table: string, { where }: { where?: Record<string, any> }) {
    let sql = `SELECT COUNT(*) as count FROM ${table}`;
    const values: any[] = [];
    if (where && Object.keys(where).length > 0) {
      const clauses = this.buildWhereClauses(table, where, values);
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }
    const rows = await this.query<RowDataPacket[]>(sql, values);
    return Number(rows[0].count);
  }

  async $connect() {
    const conn = await this.pool.getConnection();
    conn.release();
  }

  async $disconnect() {
    await this.pool.end();
  }

  async $queryRaw(strings: TemplateStringsArray, ...values: any[]) {
    const sql = strings.join('?');
    return this.query(sql, values);
  }
}

class TransactionClient {
  constructor(private conn: any) {}

  async query<T = RowDataPacket[]>(sql: string, values?: any[]): Promise<T> {
    const [rows] = await this.conn.execute(sql, values || []);
    return rows as T;
  }

  async execute(sql: string, values?: any[]): Promise<ResultSetHeader> {
    const [result] = await this.conn.execute(sql, values || []);
    return result as ResultSetHeader;
  }
}
