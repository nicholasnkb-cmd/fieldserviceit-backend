import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import * as dns from 'dns';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as zlib from 'zlib';
import { CurrentUser } from '../../common/types';
import { decryptBuffer, encryptBuffer, encryptSecret } from '../../common/security/encryption';
import { DatabaseService } from '../../database/database.service';

const SECURITY_POLICY_ID = 'global-security-policy';
const BACKUP_POLICY_ID = 'global-backup-policy';
const RETENTION_POLICY_ID = 'global-retention-policy';
const DISRUPTIVE_ACTIONS = new Set(['RESTART', 'DISABLE_PORT', 'BOUNCE_POE']);

@Injectable()
export class PlatformSecurityService {
  private readonly logger = new Logger(PlatformSecurityService.name);
  private backupRunning = false;
  private retentionRunning = false;
  private readonly backupS3: S3Client | null;
  private readonly backupBucket: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {
    const endpoint = this.config.get<string>('BACKUP_S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('BACKUP_S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('BACKUP_S3_SECRET_ACCESS_KEY');
    this.backupBucket = this.config.get<string>('BACKUP_S3_BUCKET', 'fieldserviceit-backups');
    this.backupS3 = endpoint && accessKeyId && secretAccessKey
      ? new S3Client({
          endpoint,
          region: this.config.get('BACKUP_S3_REGION', 'us-east-1'),
          credentials: { accessKeyId, secretAccessKey },
          forcePathStyle: true,
        })
      : null;
  }

  async dashboard() {
    const [
      policy,
      backupPolicy,
      retentionPolicy,
      sessions,
      mfa,
      errors,
      scans,
      approvals,
      backups,
      jobs,
      migrations,
      email,
    ] = await Promise.all([
      this.securityPolicy(),
      this.backupPolicy(),
      this.retentionPolicy(),
      this.count(`SELECT COUNT(*) count FROM Session WHERE revokedAt IS NULL AND expiresAt > NOW(3)`),
      this.db.query<any[]>(`SELECT role, COUNT(*) count, SUM(mfaEnabled = 1) enabled FROM User WHERE deletedAt IS NULL AND isActive = 1 GROUP BY role`),
      this.count(`SELECT COUNT(*) count FROM ErrorReport WHERE createdAt >= DATE_SUB(NOW(3), INTERVAL 24 HOUR)`).catch(() => 0),
      this.db.query<any[]>(`SELECT status, COUNT(*) count FROM FileScanEvent WHERE createdAt >= DATE_SUB(NOW(3), INTERVAL 7 DAY) GROUP BY status`).catch(() => []),
      this.count(`SELECT COUNT(*) count FROM NetworkDeviceAction WHERE approvalStatus = 'PENDING'`),
      this.db.query<any[]>(
        `SELECT id, status, destination, bytes, checksum, tableCount, rowCount, encryption,
                restoreTestStatus, restoreTestedAt, errorMessage, requestedById, startedAt, completedAt
         FROM BackupRun ORDER BY startedAt DESC LIMIT 5`,
      ),
      this.db.query<any[]>(`SELECT * FROM OperationalJobRun ORDER BY startedAt DESC LIMIT 10`),
      this.db.query<any[]>(`SELECT name, applied_at FROM _migrations ORDER BY id DESC LIMIT 5`),
      this.db.query<any[]>(`SELECT lastTestStatus, lastTestAt, isActive FROM EmailProviderConfig WHERE id = 'global-smtp' LIMIT 1`).catch(() => []),
    ]);
    return {
      policy,
      backupPolicy,
      retentionPolicy,
      metrics: {
        activeSessions: sessions,
        errors24h: errors,
        pendingApprovals: approvals,
        mfaByRole: mfa,
        scansByStatus: scans,
      },
      recentBackups: backups,
      recentJobs: jobs,
      recentMigrations: migrations,
      emailProvider: email[0] || null,
      environment: {
        nodeEnv: this.config.get('NODE_ENV', 'development'),
        clamAvConfigured: Boolean(this.config.get('CLAMAV_HOST')),
        encryptedBackupKeyConfigured: Boolean(this.config.get('CREDENTIAL_ENCRYPTION_KEY')),
        oidcProviders: await this.count(`SELECT COUNT(*) count FROM OidcProviderConfig WHERE enabled = 1`),
      },
    };
  }

  async securityPolicy() {
    const rows = await this.db.query<any[]>(`SELECT * FROM PlatformSecurityPolicy WHERE id = ? LIMIT 1`, [SECURITY_POLICY_ID]);
    return rows[0];
  }

  async updateSecurityPolicy(user: CurrentUser, dto: any) {
    this.assertSuperAdmin(user);
    await this.snapshotPolicy('PLATFORM_SECURITY', SECURITY_POLICY_ID, await this.securityPolicy(), user.id);
    const values = {
      requireMfaSuperAdmin: this.boolean(dto.requireMfaSuperAdmin),
      requireMfaTenantAdmin: this.boolean(dto.requireMfaTenantAdmin),
      requireMfaTechnicians: this.boolean(dto.requireMfaTechnicians),
      requirePhishingResistantSuperAdmin: this.boolean(dto.requirePhishingResistantSuperAdmin),
      sessionLifetimeDays: this.integer(dto.sessionLifetimeDays, 1, 30, 7),
      maxActiveSessions: this.integer(dto.maxActiveSessions, 1, 50, 10),
      requireNetworkApproval: this.boolean(dto.requireNetworkApproval, true),
    };
    await this.db.execute(
      `UPDATE PlatformSecurityPolicy SET
       requireMfaSuperAdmin = ?, requireMfaTenantAdmin = ?, requireMfaTechnicians = ?,
       requirePhishingResistantSuperAdmin = ?,
       sessionLifetimeDays = ?, maxActiveSessions = ?, requireNetworkApproval = ?,
       updatedById = ?, updatedAt = NOW(3) WHERE id = ?`,
      [
        values.requireMfaSuperAdmin, values.requireMfaTenantAdmin, values.requireMfaTechnicians,
        values.requirePhishingResistantSuperAdmin,
        values.sessionLifetimeDays, values.maxActiveSessions, values.requireNetworkApproval,
        user.id, SECURITY_POLICY_ID,
      ],
    );
    return this.securityPolicy();
  }

  async securityPolicyHistory() {
    const rows = await this.db.query<any[]>(
      `SELECT s.id, s.policyType, s.policyId, s.snapshot, s.createdAt,
              u.firstName, u.lastName, u.email
       FROM SecurityPolicySnapshot s LEFT JOIN User u ON u.id = s.createdById
       WHERE s.policyType = 'PLATFORM_SECURITY' AND s.policyId = ?
       ORDER BY s.createdAt DESC LIMIT 50`,
      [SECURITY_POLICY_ID],
    ).catch(() => []);
    return rows.map((row) => ({ ...row, snapshot: this.parseJson(row.snapshot, {}) }));
  }

  async rollbackSecurityPolicy(user: CurrentUser, snapshotId: string) {
    this.assertSuperAdmin(user);
    const rows = await this.db.query<any[]>(
      `SELECT snapshot FROM SecurityPolicySnapshot
       WHERE id = ? AND policyType = 'PLATFORM_SECURITY' AND policyId = ? LIMIT 1`,
      [snapshotId, SECURITY_POLICY_ID],
    );
    if (!rows[0]) throw new NotFoundException('Policy snapshot not found');
    const snapshot = this.parseJson(rows[0].snapshot, {});
    await this.snapshotPolicy('PLATFORM_SECURITY', SECURITY_POLICY_ID, await this.securityPolicy(), user.id);
    return this.updateSecurityPolicyValues(user, snapshot);
  }

  private async updateSecurityPolicyValues(user: CurrentUser, dto: any) {
    const values = {
      requireMfaSuperAdmin: this.boolean(dto.requireMfaSuperAdmin),
      requireMfaTenantAdmin: this.boolean(dto.requireMfaTenantAdmin),
      requireMfaTechnicians: this.boolean(dto.requireMfaTechnicians),
      requirePhishingResistantSuperAdmin: this.boolean(dto.requirePhishingResistantSuperAdmin),
      sessionLifetimeDays: this.integer(dto.sessionLifetimeDays, 1, 30, 7),
      maxActiveSessions: this.integer(dto.maxActiveSessions, 1, 50, 10),
      requireNetworkApproval: this.boolean(dto.requireNetworkApproval, true),
    };
    await this.db.execute(
      `UPDATE PlatformSecurityPolicy SET
       requireMfaSuperAdmin = ?, requireMfaTenantAdmin = ?, requireMfaTechnicians = ?,
       requirePhishingResistantSuperAdmin = ?,
       sessionLifetimeDays = ?, maxActiveSessions = ?, requireNetworkApproval = ?,
       updatedById = ?, updatedAt = NOW(3) WHERE id = ?`,
      [
        values.requireMfaSuperAdmin, values.requireMfaTenantAdmin, values.requireMfaTechnicians,
        values.requirePhishingResistantSuperAdmin,
        values.sessionLifetimeDays, values.maxActiveSessions, values.requireNetworkApproval,
        user.id, SECURITY_POLICY_ID,
      ],
    );
    return this.securityPolicy();
  }

  private async snapshotPolicy(policyType: string, policyId: string, snapshot: any, actorId: string) {
    await this.db.execute(
      `INSERT INTO SecurityPolicySnapshot (id, policyType, policyId, snapshot, createdById, createdAt)
       VALUES (?, ?, ?, ?, ?, NOW(3))`,
      [crypto.randomUUID(), policyType, policyId, JSON.stringify(snapshot || {}), actorId],
    ).catch(() => {});
  }

  async listOidcProviders(user: CurrentUser) {
    const companyId = this.scopeCompany(user);
    const rows = await this.db.query<any[]>(
      `SELECT id, companyId, name, issuer, clientId, allowedDomains, autoProvision, defaultRole,
              enabled, lastTestStatus, lastTestAt, lastTestError, createdAt, updatedAt,
              encryptedClientSecret IS NOT NULL as clientSecretConfigured
       FROM OidcProviderConfig
       ${companyId ? 'WHERE companyId = ?' : user.role === 'SUPER_ADMIN' ? '' : 'WHERE 1 = 0'}
       ORDER BY name`,
      companyId ? [companyId] : [],
    );
    return rows.map((row) => ({
      ...row,
      allowedDomains: this.parseJson(row.allowedDomains, []),
      callbackUrl: `${String(this.config.get('API_URL', 'http://localhost:4000')).replace(/\/+$/, '')}/v1/auth/sso/${encodeURIComponent(row.id)}/callback`,
    }));
  }

  async saveOidcProvider(user: CurrentUser, dto: any, id?: string) {
    if (!['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user.role)) throw new ForbiddenException();
    const companyId = user.role === 'SUPER_ADMIN' ? (dto.companyId || this.scopeCompany(user) || null) : user.companyId;
    const name = String(dto.name || '').trim();
    const issuer = String(dto.issuer || '').trim().replace(/\/+$/, '');
    const clientId = String(dto.clientId || '').trim();
    if (!name || !issuer || !clientId) throw new BadRequestException('Name, issuer, and client ID are required');
    this.validateIssuerUrl(issuer);
    const allowedDomains = Array.isArray(dto.allowedDomains)
      ? dto.allowedDomains.map((item: any) => String(item).trim().toLowerCase()).filter(Boolean)
      : String(dto.allowedDomains || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    const defaultRole = String(dto.defaultRole || 'CLIENT').toUpperCase();
    const allowedRoles = user.role === 'SUPER_ADMIN' ? ['CLIENT', 'TECHNICIAN', 'TENANT_ADMIN'] : ['CLIENT', 'TECHNICIAN'];
    if (!allowedRoles.includes(defaultRole)) throw new BadRequestException('Default SSO role is not allowed');
    const autoProvision = this.boolean(dto.autoProvision);
    if (companyId) {
      const companies = await this.db.query<any[]>(`SELECT id FROM Company WHERE id = ? AND isActive = 1 AND deletedAt IS NULL LIMIT 1`, [companyId]);
      if (!companies[0]) throw new BadRequestException('SSO company is not available');
    }
    if (autoProvision && (!companyId || allowedDomains.length === 0)) {
      throw new BadRequestException('Automatic provisioning requires a company and at least one allowed email domain');
    }
    const providerId = id || crypto.randomUUID();
    if (id) {
      const existing = await this.assertOidcAccess(user, id);
      const identityChanged = existing.issuer !== issuer || existing.clientId !== clientId;
      if (this.boolean(dto.enabled) && (identityChanged || existing.lastTestStatus !== 'PASS')) {
        throw new BadRequestException('Test OIDC discovery successfully before enabling this provider');
      }
      const secretUpdate = dto.clientSecret
        ? ', encryptedClientSecret = ?'
        : '';
      const values = [
        companyId, name, issuer, clientId, JSON.stringify(allowedDomains),
        autoProvision, defaultRole,
        this.boolean(dto.enabled), user.id,
      ];
      if (dto.clientSecret) values.push(encryptSecret(String(dto.clientSecret)));
      values.push(id);
      await this.db.execute(
        `UPDATE OidcProviderConfig SET companyId = ?, name = ?, issuer = ?, clientId = ?,
         allowedDomains = ?, autoProvision = ?, defaultRole = ?, enabled = ?,
         updatedById = ?, updatedAt = NOW(3)${secretUpdate}
         ${identityChanged ? ", lastTestStatus = NULL, lastTestAt = NULL, lastTestError = 'Provider identity changed; retest required'" : ''}
         WHERE id = ?`,
        values,
      );
    } else {
      if (this.boolean(dto.enabled)) throw new BadRequestException('Save and test the provider before enabling it');
      await this.db.execute(
        `INSERT INTO OidcProviderConfig
         (id, companyId, name, issuer, clientId, encryptedClientSecret, allowedDomains, autoProvision,
          defaultRole, enabled, createdById, updatedById, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [
          providerId, companyId, name, issuer, clientId,
          dto.clientSecret ? encryptSecret(String(dto.clientSecret)) : null,
          JSON.stringify(allowedDomains), autoProvision,
          defaultRole, this.boolean(dto.enabled),
          user.id, user.id,
        ],
      );
    }
    return (await this.db.query<any[]>(
      `SELECT id, companyId, name, issuer, clientId, allowedDomains, autoProvision, defaultRole,
              enabled, lastTestStatus, lastTestAt, lastTestError,
              encryptedClientSecret IS NOT NULL as clientSecretConfigured
       FROM OidcProviderConfig WHERE id = ? LIMIT 1`,
      [providerId],
    ))[0];
  }

  async testOidcProvider(user: CurrentUser, id: string) {
    const provider = await this.assertOidcAccess(user, id);
    try {
      const discovery = await this.fetchOidcDiscovery(provider.issuer);
      await this.db.execute(
        `UPDATE OidcProviderConfig SET lastTestStatus = 'PASS', lastTestAt = NOW(3), lastTestError = NULL WHERE id = ?`,
        [id],
      );
      return {
        status: 'PASS',
        issuer: discovery.issuer,
        authorizationEndpoint: discovery.authorization_endpoint,
        tokenEndpoint: discovery.token_endpoint,
        jwksUri: discovery.jwks_uri,
      };
    } catch (error: any) {
      const message = String(error?.message || error).slice(0, 2000);
      await this.db.execute(
        `UPDATE OidcProviderConfig SET lastTestStatus = 'FAIL', lastTestAt = NOW(3), lastTestError = ? WHERE id = ?`,
        [message, id],
      );
      throw new BadRequestException(`OIDC discovery failed: ${message}`);
    }
  }

  async deleteOidcProvider(user: CurrentUser, id: string) {
    await this.assertOidcAccess(user, id);
    await this.db.execute(`DELETE FROM OidcProviderConfig WHERE id = ?`, [id]);
    return { deleted: true };
  }

  async backupPolicy() {
    return (await this.db.query<any[]>(`SELECT * FROM BackupPolicy WHERE id = ? LIMIT 1`, [BACKUP_POLICY_ID]))[0];
  }

  async updateBackupPolicy(user: CurrentUser, dto: any) {
    this.assertSuperAdmin(user);
    await this.db.execute(
      `UPDATE BackupPolicy SET enabled = ?, scheduleDay = ?, scheduleHour = ?, retentionCount = ?,
       updatedById = ?, updatedAt = NOW(3) WHERE id = ?`,
      [
        this.boolean(dto.enabled), this.integer(dto.scheduleDay, 0, 6, 0),
        this.integer(dto.scheduleHour, 0, 23, 3), this.integer(dto.retentionCount, 1, 30, 4),
        user.id, BACKUP_POLICY_ID,
      ],
    );
    return this.backupPolicy();
  }

  async listBackupRuns() {
    return this.db.query<any[]>(
      `SELECT id, status, destination, bytes, checksum, tableCount, rowCount, encryption,
              restoreTestStatus, restoreTestedAt, errorMessage, requestedById, startedAt, completedAt
       FROM BackupRun ORDER BY startedAt DESC LIMIT 50`,
    );
  }

  async runBackup(requestedById?: string) {
    if (this.backupRunning) throw new BadRequestException('A backup is already running');
    this.backupRunning = true;
    const runId = crypto.randomUUID();
    const startedAt = new Date();
    await this.db.execute(
      `INSERT INTO BackupRun (id, status, destination, requestedById, startedAt)
       VALUES (?, 'RUNNING', 'OFFSITE_ENCRYPTED', ?, ?)`,
      [runId, requestedById || null, startedAt],
    );
    try {
      const { tables, payload, rowCount } = await this.db.readOnlyTransaction(async (tx) => {
        const tables = await this.databaseTables(tx);
        const payload: Record<string, any> = {
          format: 'fieldserviceit-encrypted-json-v1',
          createdAt: new Date().toISOString(),
          consistency: 'mysql-repeatable-read-consistent-snapshot',
          tables: {},
        };
        let rowCount = 0;
        for (const table of tables) {
          const rows = await tx.query<any[]>(`SELECT * FROM \`${table}\``);
          payload.tables[table] = rows;
          rowCount += rows.length;
        }
        return { tables, payload, rowCount };
      });
      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(payload, this.jsonReplacer)));
      const encrypted = encryptBuffer(compressed);
      const checksum = crypto.createHash('sha256').update(encrypted).digest('hex');
      const backupDir = this.config.get('BACKUP_DIR', path.join(process.cwd(), 'backups'));
      await fs.promises.mkdir(backupDir, { recursive: true });
      const filename = `fieldserviceit-${new Date().toISOString().replace(/[:.]/g, '-')}-${runId}.fsitbak`;
      const artifactPath = path.resolve(backupDir, filename);
      const temporaryPath = `${artifactPath}.tmp`;
      await fs.promises.writeFile(temporaryPath, encrypted, { mode: 0o600 });
      await fs.promises.rename(temporaryPath, artifactPath);
      if (!this.backupS3) throw new Error('Off-site backup storage is not configured');
      const offsiteKey = `database/${filename}`;
      await this.backupS3.send(new PutObjectCommand({
        Bucket: this.backupBucket,
        Key: offsiteKey,
        Body: encrypted,
        ContentType: 'application/octet-stream',
        Metadata: { checksum, format: 'fieldserviceit-encrypted-json-v1' },
      }));
      await this.db.execute(
        `UPDATE BackupRun SET status = 'COMPLETED', artifactPath = ?, offsiteKey = ?, bytes = ?, checksum = ?,
         tableCount = ?, rowCount = ?, encryption = 'AES-256-GCM', completedAt = NOW(3)
         WHERE id = ?`,
        [artifactPath, offsiteKey, encrypted.length, checksum, tables.length, rowCount, runId],
      );
      await this.db.execute(`UPDATE BackupPolicy SET lastRunAt = NOW(3) WHERE id = ?`, [BACKUP_POLICY_ID]);
      await this.pruneBackups();
      await this.recordJob('encrypted-database-backup', 'PASS', { runId, tables: tables.length, rows: rowCount }, startedAt);
      return this.publicBackupRun(await this.getBackupRun(runId));
    } catch (error: any) {
      const message = String(error?.message || error).slice(0, 4000);
      await this.db.execute(
        `UPDATE BackupRun SET status = 'FAILED', errorMessage = ?, completedAt = NOW(3) WHERE id = ?`,
        [message, runId],
      );
      await this.recordJob('encrypted-database-backup', 'FAIL', { runId, error: message }, startedAt);
      throw error;
    } finally {
      this.backupRunning = false;
    }
  }

  async testBackup(id: string) {
    const run = await this.getBackupRun(id);
    if ((!run.artifactPath && !run.offsiteKey) || run.status !== 'COMPLETED') throw new BadRequestException('Backup artifact is not available');
    try {
      const encrypted = await this.readBackupArtifact(run);
      const checksum = crypto.createHash('sha256').update(encrypted).digest('hex');
      if (checksum !== run.checksum) throw new Error('Backup checksum does not match');
      const parsed = JSON.parse(zlib.gunzipSync(decryptBuffer(encrypted)).toString('utf8'));
      if (parsed.format !== 'fieldserviceit-encrypted-json-v1' || !parsed.tables || typeof parsed.tables !== 'object') {
        throw new Error('Backup payload is invalid');
      }
      await this.db.execute(
        `UPDATE BackupRun SET restoreTestStatus = 'PASS', restoreTestedAt = NOW(3), errorMessage = NULL WHERE id = ?`,
        [id],
      );
      return { status: 'PASS', tableCount: Object.keys(parsed.tables).length, createdAt: parsed.createdAt };
    } catch (error: any) {
      const message = String(error?.message || error).slice(0, 2000);
      await this.db.execute(
        `UPDATE BackupRun SET restoreTestStatus = 'FAIL', restoreTestedAt = NOW(3), errorMessage = ? WHERE id = ?`,
        [message, id],
      );
      throw new BadRequestException(`Backup integrity test failed: ${message}`);
    }
  }

  async retentionPolicy() {
    return (await this.db.query<any[]>(`SELECT * FROM DataRetentionPolicy WHERE id = ? LIMIT 1`, [RETENTION_POLICY_ID]))[0];
  }

  async updateRetentionPolicy(user: CurrentUser, dto: any) {
    this.assertSuperAdmin(user);
    const fields = ['sessionDays', 'auditLogDays', 'errorReportDays', 'emailEventDays', 'networkSnapshotDays', 'syslogDays'];
    const values = fields.map((field) => this.integer(dto[field], 7, 3650, field === 'auditLogDays' ? 365 : 90));
    await this.db.execute(
      `UPDATE DataRetentionPolicy SET enabled = ?, sessionDays = ?, auditLogDays = ?, errorReportDays = ?,
       emailEventDays = ?, networkSnapshotDays = ?, syslogDays = ?, updatedById = ?, updatedAt = NOW(3)
       WHERE id = ?`,
      [this.boolean(dto.enabled, true), ...values, user.id, RETENTION_POLICY_ID],
    );
    return this.retentionPolicy();
  }

  async runRetention() {
    if (this.retentionRunning) throw new BadRequestException('Retention cleanup is already running');
    this.retentionRunning = true;
    const startedAt = new Date();
    try {
      const policy = await this.retentionPolicy();
      if (!policy?.enabled) return { skipped: true, reason: 'Retention cleanup is disabled' };
      const tasks: Array<[string, string, number]> = [
        ['sessions', `DELETE FROM Session WHERE (revokedAt IS NOT NULL OR expiresAt < NOW(3)) AND COALESCE(revokedAt, expiresAt) < DATE_SUB(NOW(3), INTERVAL ? DAY)`, policy.sessionDays],
        ['auditLogs', `DELETE FROM AuditLog WHERE createdAt < DATE_SUB(NOW(3), INTERVAL ? DAY)`, policy.auditLogDays],
        ['errorReports', `DELETE FROM ErrorReport WHERE createdAt < DATE_SUB(NOW(3), INTERVAL ? DAY)`, policy.errorReportDays],
        ['emailTracking', `DELETE FROM EmailTrackingEvent WHERE createdAt < DATE_SUB(NOW(3), INTERVAL ? DAY)`, policy.emailEventDays],
        ['networkSnapshots', `DELETE FROM NetworkHealthSnapshot WHERE createdAt < DATE_SUB(NOW(3), INTERVAL ? DAY)`, policy.networkSnapshotDays],
        ['syslog', `DELETE FROM NetworkSyslogEvent WHERE receivedAt < DATE_SUB(NOW(3), INTERVAL ? DAY)`, policy.syslogDays],
        ['oidcStates', `DELETE FROM OidcAuthState WHERE expiresAt < DATE_SUB(NOW(3), INTERVAL ? DAY)`, 1],
        ['oidcLoginCodes', `DELETE FROM OidcLoginCode WHERE expiresAt < DATE_SUB(NOW(3), INTERVAL ? DAY)`, 1],
      ];
      const deleted: Record<string, number> = {};
      for (const [name, sql, days] of tasks) {
        try {
          const result = await this.db.execute(sql, [days]);
          deleted[name] = result.affectedRows;
        } catch {
          deleted[name] = 0;
        }
      }
      await this.recordJob('data-retention-cleanup', 'PASS', deleted, startedAt);
      return { deleted };
    } catch (error: any) {
      await this.recordJob('data-retention-cleanup', 'FAIL', { error: String(error?.message || error) }, startedAt);
      throw error;
    } finally {
      this.retentionRunning = false;
    }
  }

  async pendingApprovals(user: CurrentUser) {
    const companyId = this.scopeCompany(user);
    const values: any[] = [];
    const where = companyId ? 'AND n.companyId = ?' : '';
    if (companyId) values.push(companyId);
    return this.db.query<any[]>(
      `SELECT n.*, a.name assetName, c.name companyName,
              requester.email requestedByEmail, approver.email approvedByEmail
       FROM NetworkDeviceAction n
       LEFT JOIN Asset a ON a.id = n.assetId
       LEFT JOIN Company c ON c.id = n.companyId
       LEFT JOIN User requester ON requester.id = n.requestedById
       LEFT JOIN User approver ON approver.id = n.approvedById
       WHERE n.approvalStatus = 'PENDING' ${where}
       ORDER BY n.createdAt ASC LIMIT 100`,
      values,
    );
  }

  async decideNetworkAction(user: CurrentUser, id: string, decision: 'APPROVE' | 'REJECT', note?: string) {
    if (!['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user.role)) throw new ForbiddenException('Administrator approval is required');
    const rows = await this.db.query<any[]>(`SELECT * FROM NetworkDeviceAction WHERE id = ? LIMIT 1`, [id]);
    const action = rows[0];
    if (!action) throw new NotFoundException('Network action not found');
    const companyId = this.scopeCompany(user);
    if (companyId && action.companyId !== companyId) throw new ForbiddenException('Cross-tenant approval denied');
    if (action.requestedById === user.id) throw new ForbiddenException('The requester cannot approve their own disruptive action');
    if (action.approvalStatus !== 'PENDING') throw new BadRequestException('This action is not awaiting approval');
    if (decision === 'APPROVE') {
      await this.db.execute(
        `UPDATE NetworkDeviceAction SET approvalStatus = 'APPROVED', approvedById = ?, approvedAt = NOW(3),
         approvalNote = ?, status = 'QUEUED' WHERE id = ? AND companyId = ?`,
        [user.id, String(note || '').slice(0, 500) || null, id, action.companyId],
      );
    } else {
      await this.db.execute(
        `UPDATE NetworkDeviceAction SET approvalStatus = 'REJECTED', rejectedById = ?, rejectedAt = NOW(3),
         approvalNote = ?, status = 'REJECTED' WHERE id = ? AND companyId = ?`,
        [user.id, String(note || '').slice(0, 500) || null, id, action.companyId],
      );
    }
    return (await this.db.query<any[]>(`SELECT * FROM NetworkDeviceAction WHERE id = ? LIMIT 1`, [id]))[0];
  }

  async scanSummary() {
    const [recent, totals] = await Promise.all([
      this.db.query<any[]>(`SELECT * FROM FileScanEvent ORDER BY createdAt DESC LIMIT 50`),
      this.db.query<any[]>(`SELECT status, scanner, COUNT(*) count FROM FileScanEvent GROUP BY status, scanner`),
    ]);
    return {
      configured: Boolean(this.config.get('CLAMAV_HOST')),
      required: this.config.get('CLAMAV_REQUIRED', 'false') === 'true',
      totals,
      recent,
    };
  }

  requiresApproval(action: string, policy: any) {
    return Boolean(policy?.requireNetworkApproval) && DISRUPTIVE_ACTIONS.has(String(action).toUpperCase());
  }

  @Cron('0 15 3 * * *')
  async scheduledOperations() {
    await this.runRetention().catch(() => undefined);
    const policy = await this.backupPolicy().catch(() => null);
    if (!policy?.enabled) return;
    if (Number(policy.scheduleHour) !== new Date().getHours()) return;
    const lastRun = policy.lastRunAt ? new Date(policy.lastRunAt) : null;
    if (lastRun && Date.now() - lastRun.getTime() < 20 * 60 * 60 * 1000) return;
    await this.runBackup().catch((error) => {
      this.logger.error(`Scheduled off-site backup failed: ${String(error?.message || error)}`);
    });
  }

  private async assertOidcAccess(user: CurrentUser, id: string) {
    const rows = await this.db.query<any[]>(`SELECT * FROM OidcProviderConfig WHERE id = ? LIMIT 1`, [id]);
    const provider = rows[0];
    if (!provider) throw new NotFoundException('OIDC provider not found');
    const companyId = this.scopeCompany(user);
    if (user.role !== 'SUPER_ADMIN' && provider.companyId !== companyId) throw new ForbiddenException();
    if (user.role === 'SUPER_ADMIN' && companyId && provider.companyId !== companyId) throw new ForbiddenException();
    return provider;
  }

  private async fetchOidcDiscovery(issuer: string) {
    this.validateIssuerUrl(issuer);
    await this.assertPublicIssuerNetwork(issuer);
    const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Discovery endpoint returned HTTP ${response.status}`);
    const body: any = await response.json();
    for (const field of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
      if (!body[field]) throw new Error(`Discovery response is missing ${field}`);
    }
    if (String(body.issuer).replace(/\/+$/, '') !== issuer.replace(/\/+$/, '')) throw new Error('Discovery issuer does not match configured issuer');
    await Promise.all([
      this.assertProviderEndpoint(body.authorization_endpoint),
      this.assertProviderEndpoint(body.token_endpoint),
      this.assertProviderEndpoint(body.jwks_uri),
    ]);
    return body;
  }

  private validateIssuerUrl(issuer: string) {
    let url: URL;
    try {
      url = new URL(issuer);
    } catch {
      throw new BadRequestException('OIDC issuer must be a valid URL');
    }
    const localDevelopment = this.config.get('NODE_ENV') !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localDevelopment) throw new BadRequestException('OIDC issuer must use HTTPS');
    if (url.username || url.password || url.hash || url.search) throw new BadRequestException('OIDC issuer URL is invalid');
  }

  private async assertPublicIssuerNetwork(issuer: string) {
    if (this.config.get('OIDC_ALLOW_PRIVATE_ISSUERS', 'false') === 'true') return;
    const url = new URL(issuer);
    const localDevelopment = this.config.get('NODE_ENV') !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (localDevelopment) return;
    const addresses = net.isIP(url.hostname)
      ? [{ address: url.hostname, family: net.isIP(url.hostname) }]
      : await dns.promises.lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some((item) => this.isPrivateAddress(item.address))) {
      throw new BadRequestException('OIDC issuer resolves to a private or reserved network address');
    }
  }

  private async assertProviderEndpoint(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('OIDC discovery returned an invalid endpoint URL');
    }
    const localDevelopment = this.config.get('NODE_ENV') !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localDevelopment) throw new BadRequestException('OIDC endpoints must use HTTPS');
    await this.assertPublicIssuerNetwork(url.origin);
  }

  private isPrivateAddress(address: string) {
    const normalized = address.toLowerCase();
    if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) return true;
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    const ipv4 = mapped || normalized;
    if (!net.isIPv4(ipv4)) return false;
    const [a, b] = ipv4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127);
  }

  private async databaseTables(client: Pick<DatabaseService, 'query'> = this.db) {
    const rows = await client.query<any[]>(
      `SELECT TABLE_NAME tableName FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
    );
    return rows.map((row) => String(row.tableName)).filter((name) => /^[A-Za-z0-9_]+$/.test(name));
  }

  private async getBackupRun(id: string) {
    const rows = await this.db.query<any[]>(`SELECT * FROM BackupRun WHERE id = ? LIMIT 1`, [id]);
    if (!rows[0]) throw new NotFoundException('Backup run not found');
    return rows[0];
  }

  private publicBackupRun(run: any) {
    const { artifactPath: _artifactPath, offsiteKey: _offsiteKey, ...safe } = run;
    return safe;
  }

  private async readBackupArtifact(run: any): Promise<Buffer> {
    if (this.backupS3 && run.offsiteKey) {
      const result = await this.backupS3.send(new GetObjectCommand({ Bucket: this.backupBucket, Key: run.offsiteKey }));
      const bytes = result.Body?.transformToByteArray ? await result.Body.transformToByteArray() : [];
      return Buffer.from(bytes);
    }
    if (run.artifactPath && fs.existsSync(run.artifactPath)) return fs.promises.readFile(run.artifactPath);
    throw new Error('Backup artifact is unavailable locally and off-site');
  }

  private async pruneBackups() {
    const policy = await this.backupPolicy();
    const runs = await this.db.query<any[]>(
      `SELECT id, artifactPath, offsiteKey FROM BackupRun WHERE status = 'COMPLETED' ORDER BY startedAt DESC`,
    );
    for (const run of runs.slice(Number(policy.retentionCount || 4))) {
      if (run.artifactPath) await fs.promises.unlink(run.artifactPath).catch(() => undefined);
      if (run.offsiteKey && this.backupS3) {
        await this.backupS3.send(new DeleteObjectCommand({ Bucket: this.backupBucket, Key: run.offsiteKey }));
      }
      await this.db.execute(`DELETE FROM BackupRun WHERE id = ?`, [run.id]);
    }
  }

  private async recordJob(jobName: string, status: 'PASS' | 'FAIL', detail: any, startedAt: Date) {
    await this.db.execute(
      `INSERT INTO OperationalJobRun (id, jobName, status, detail, durationMs, startedAt, completedAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
      [crypto.randomUUID(), jobName, status, JSON.stringify(detail || {}), Date.now() - startedAt.getTime(), startedAt],
    ).catch(() => undefined);
  }

  private jsonReplacer(_key: string, value: any) {
    if (typeof value === 'bigint') return value.toString();
    if (Buffer.isBuffer(value)) return { type: 'Buffer', data: value.toString('base64') };
    return value;
  }

  private scopeCompany(user: CurrentUser) {
    return user.effectiveCompanyId || user.companyId || null;
  }

  private assertSuperAdmin(user: CurrentUser) {
    if (user.role !== 'SUPER_ADMIN') throw new ForbiddenException('Super administrator access is required');
  }

  private async count(sql: string, values: any[] = []) {
    const rows = await this.db.query<any[]>(sql, values);
    return Number(rows[0]?.count || 0);
  }

  private integer(value: any, min: number, max: number, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Math.max(Math.round(number), min), max) : fallback;
  }

  private boolean(value: any, fallback = false) {
    if (value === undefined || value === null) return fallback ? 1 : 0;
    return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
  }

  private parseJson(value: any, fallback: any) {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value ?? fallback;
    } catch {
      return fallback;
    }
  }
}
