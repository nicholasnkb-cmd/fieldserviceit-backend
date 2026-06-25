import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CurrentUser } from '../../common/types';
import { DatabaseService } from '../../database/database.service';
import { CmdbService } from '../cmdb/services/cmdb.service';

const REMOTE_PROVIDERS = ['ANYDESK', 'SPLASHTOP', 'TEAMVIEWER', 'SCREENCONNECT'];
const PATCH_SEVERITIES = ['CRITICAL', 'IMPORTANT', 'MODERATE', 'LOW', 'UNKNOWN'];

@Injectable()
export class EndpointOperationsService {
  private schemaReady?: Promise<void>;

  constructor(
    private db: DatabaseService,
    private cmdb: CmdbService,
  ) {}

  async remoteSummary(user: CurrentUser) {
    const companyId = this.companyId(user);
    await this.ensureSchema();
    const [endpointRows, sessionRows] = await Promise.all([
      this.db.query<any[]>(
        `SELECT COUNT(*) total,
          SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) enabled
         FROM RemoteAccessEndpoint WHERE companyId = ?`,
        [companyId],
      ),
      this.db.query<any[]>(
        `SELECT COUNT(*) sessions,
          SUM(CASE WHEN requestedAt >= DATE_SUB(NOW(3), INTERVAL 30 DAY) THEN 1 ELSE 0 END) recent
         FROM RemoteAccessSession WHERE companyId = ?`,
        [companyId],
      ),
    ]);
    return {
      totalEndpoints: Number(endpointRows[0]?.total || 0),
      enabledEndpoints: Number(endpointRows[0]?.enabled || 0),
      totalSessions: Number(sessionRows[0]?.sessions || 0),
      sessionsLast30Days: Number(sessionRows[0]?.recent || 0),
      supportedProviders: REMOTE_PROVIDERS,
    };
  }

  async listRemoteEndpoints(user: CurrentUser, query: any = {}) {
    const companyId = this.companyId(user);
    await this.ensureSchema();
    const values: any[] = [companyId];
    let filter = '';
    if (query.provider) {
      filter = ' AND e.provider = ?';
      values.push(this.option(query.provider, REMOTE_PROVIDERS, 'provider'));
    }
    const rows = await this.db.query<any[]>(
      `SELECT e.*, a.name assetName, a.os, a.osVersion, a.lastCheckInAt, a.enrollmentStatus
       FROM RemoteAccessEndpoint e
       INNER JOIN Asset a ON a.id = e.assetId AND a.companyId = e.companyId AND a.deletedAt IS NULL
       WHERE e.companyId = ?${filter}
       ORDER BY a.name, e.provider`,
      values,
    );
    return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled) }));
  }

  async saveRemoteEndpoint(user: CurrentUser, body: any) {
    const companyId = this.companyId(user);
    await this.ensureSchema();
    const assetId = String(body.assetId || '').trim();
    if (!assetId) throw new BadRequestException('Asset is required');
    await this.assertAsset(companyId, assetId);
    const provider = this.option(body.provider, REMOTE_PROVIDERS, 'provider');
    const externalDeviceId = String(body.externalDeviceId || '').trim();
    if (!externalDeviceId) throw new BadRequestException('Provider device ID is required');
    const launchUrl = this.validateLaunchUrl(body.launchUrl);
    const existing = await this.db.query<any[]>(
      'SELECT id FROM RemoteAccessEndpoint WHERE companyId = ? AND assetId = ? AND provider = ? LIMIT 1',
      [companyId, assetId, provider],
    );
    const now = new Date();
    const id = existing[0]?.id || randomUUID();
    if (existing[0]) {
      await this.db.execute(
        `UPDATE RemoteAccessEndpoint
         SET externalDeviceId = ?, launchUrl = ?, enabled = ?, updatedAt = ?
         WHERE id = ? AND companyId = ?`,
        [externalDeviceId, launchUrl, body.enabled === false ? 0 : 1, now, id, companyId],
      );
    } else {
      await this.db.execute(
        `INSERT INTO RemoteAccessEndpoint
         (id, companyId, assetId, provider, externalDeviceId, launchUrl, enabled, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, companyId, assetId, provider, externalDeviceId, launchUrl, body.enabled === false ? 0 : 1, now, now],
      );
    }
    return (await this.db.query<any[]>('SELECT * FROM RemoteAccessEndpoint WHERE id = ? LIMIT 1', [id]))[0];
  }

  async launchRemoteSession(user: CurrentUser, endpointId: string, authorizationConfirmed = false) {
    if (!authorizationConfirmed) throw new BadRequestException('Confirm authorization before launching remote access');
    const companyId = this.companyId(user);
    await this.ensureSchema();
    const rows = await this.db.query<any[]>(
      `SELECT e.*, a.name assetName
       FROM RemoteAccessEndpoint e INNER JOIN Asset a ON a.id = e.assetId
       WHERE e.id = ? AND e.companyId = ? LIMIT 1`,
      [endpointId, companyId],
    );
    const endpoint = rows[0];
    if (!endpoint) throw new NotFoundException('Remote access endpoint not found');
    if (!endpoint.enabled) throw new BadRequestException('Remote access is disabled for this endpoint');
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO RemoteAccessSession
       (id, companyId, endpointId, assetId, provider, requestedById, status, launchUrl, requestedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'LAUNCHED', ?, ?)`,
      [id, companyId, endpoint.id, endpoint.assetId, endpoint.provider, user.id, endpoint.launchUrl, new Date()],
    );
    return { id, status: 'LAUNCHED', provider: endpoint.provider, assetId: endpoint.assetId, assetName: endpoint.assetName, launchUrl: endpoint.launchUrl };
  }

  async listRemoteSessions(user: CurrentUser) {
    const companyId = this.companyId(user);
    await this.ensureSchema();
    return this.db.query(
      `SELECT s.*, a.name assetName, u.email requestedByEmail
       FROM RemoteAccessSession s
       LEFT JOIN Asset a ON a.id = s.assetId
       LEFT JOIN User u ON u.id = s.requestedById
       WHERE s.companyId = ?
       ORDER BY s.requestedAt DESC LIMIT 100`,
      [companyId],
    );
  }

  async patchSummary(user: CurrentUser) {
    const companyId = this.companyId(user);
    await this.ensureSchema();
    const [inventory, jobs, policies] = await Promise.all([
      this.db.query<any[]>(
        `SELECT COUNT(*) total,
          SUM(CASE WHEN status = 'MISSING' THEN 1 ELSE 0 END) missing,
          SUM(CASE WHEN status = 'MISSING' AND severity = 'CRITICAL' THEN 1 ELSE 0 END) critical
         FROM PatchInventory WHERE companyId = ?`,
        [companyId],
      ),
      this.db.query<any[]>(
        `SELECT COUNT(*) total,
          SUM(CASE WHEN status IN ('PENDING', 'RUNNING') THEN 1 ELSE 0 END) active,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) failed
         FROM PatchJob WHERE companyId = ?`,
        [companyId],
      ),
      this.db.query<any[]>('SELECT COUNT(*) count FROM PatchPolicy WHERE companyId = ? AND enabled = 1', [companyId]),
    ]);
    return {
      inventory: Number(inventory[0]?.total || 0),
      missing: Number(inventory[0]?.missing || 0),
      criticalMissing: Number(inventory[0]?.critical || 0),
      jobs: Number(jobs[0]?.total || 0),
      activeJobs: Number(jobs[0]?.active || 0),
      failedJobs: Number(jobs[0]?.failed || 0),
      activePolicies: Number(policies[0]?.count || 0),
    };
  }

  async listPatchInventory(user: CurrentUser, query: any = {}) {
    const companyId = this.companyId(user);
    await this.ensureSchema();
    const clauses = ['p.companyId = ?'];
    const values: any[] = [companyId];
    if (query.status) {
      clauses.push('p.status = ?');
      values.push(String(query.status).toUpperCase());
    }
    if (query.assetId) {
      clauses.push('p.assetId = ?');
      values.push(String(query.assetId));
    }
    return this.db.query(
      `SELECT p.*, a.name assetName, a.os, a.osVersion
       FROM PatchInventory p INNER JOIN Asset a ON a.id = p.assetId
       WHERE ${clauses.join(' AND ')}
       ORDER BY FIELD(p.severity, 'CRITICAL', 'IMPORTANT', 'MODERATE', 'LOW', 'UNKNOWN'), p.detectedAt DESC
       LIMIT 500`,
      values,
    );
  }

  async ingestPatchInventory(user: CurrentUser, body: any) {
    const companyId = this.companyId(user);
    await this.ensureSchema();
    const assetId = String(body.assetId || '').trim();
    await this.assertAsset(companyId, assetId);
    const patches = Array.isArray(body.patches) ? body.patches : [];
    if (!patches.length) throw new BadRequestException('At least one patch is required');
    let stored = 0;
    for (const patch of patches.slice(0, 1000)) {
      const patchKey = String(patch.patchKey || patch.kb || patch.id || '').trim();
      const title = String(patch.title || '').trim();
      if (!patchKey || !title) continue;
      const severity = this.option(patch.severity || 'UNKNOWN', PATCH_SEVERITIES, 'severity');
      const status = String(patch.status || 'MISSING').toUpperCase() === 'INSTALLED' ? 'INSTALLED' : 'MISSING';
      const existing = await this.db.query<any[]>(
        'SELECT id FROM PatchInventory WHERE companyId = ? AND assetId = ? AND patchKey = ? LIMIT 1',
        [companyId, assetId, patchKey],
      );
      const now = new Date();
      if (existing[0]) {
        await this.db.execute(
          `UPDATE PatchInventory SET title = ?, severity = ?, status = ?, releaseDate = ?, requiresReboot = ?, detectedAt = ?, installedAt = ?, metadata = ?
           WHERE id = ? AND companyId = ?`,
          [title, severity, status, this.dateOrNull(patch.releaseDate), patch.requiresReboot ? 1 : 0, now, status === 'INSTALLED' ? now : null, JSON.stringify(patch.metadata || {}), existing[0].id, companyId],
        );
      } else {
        await this.db.execute(
          `INSERT INTO PatchInventory
           (id, companyId, assetId, patchKey, title, severity, status, releaseDate, requiresReboot, detectedAt, installedAt, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), companyId, assetId, patchKey, title, severity, status, this.dateOrNull(patch.releaseDate), patch.requiresReboot ? 1 : 0, now, status === 'INSTALLED' ? now : null, JSON.stringify(patch.metadata || {})],
        );
      }
      stored += 1;
    }
    return { assetId, stored };
  }

  async listPatchPolicies(user: CurrentUser) {
    const companyId = this.companyId(user);
    await this.ensureSchema();
    const rows = await this.db.query<any[]>('SELECT * FROM PatchPolicy WHERE companyId = ? ORDER BY createdAt DESC', [companyId]);
    return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled), autoApprove: Boolean(row.autoApprove), rebootAllowed: Boolean(row.rebootAllowed) }));
  }

  async createPatchPolicy(user: CurrentUser, body: any) {
    const companyId = this.companyId(user);
    await this.ensureSchema();
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('Policy name is required');
    const id = randomUUID();
    const now = new Date();
    await this.db.execute(
      `INSERT INTO PatchPolicy
       (id, companyId, name, osFamily, severities, delayDays, maintenanceWindow, autoApprove, rebootAllowed, enabled, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, companyId, name, String(body.osFamily || 'ALL').toUpperCase(),
        JSON.stringify((Array.isArray(body.severities) ? body.severities : ['CRITICAL', 'IMPORTANT']).map((item: string) => this.option(item, PATCH_SEVERITIES, 'severity'))),
        Math.max(0, Math.min(90, Number(body.delayDays || 0))), String(body.maintenanceWindow || '').trim() || null,
        body.autoApprove === false ? 0 : 1, body.rebootAllowed ? 1 : 0, body.enabled === false ? 0 : 1, user.id, now, now,
      ],
    );
    return (await this.db.query<any[]>('SELECT * FROM PatchPolicy WHERE id = ? LIMIT 1', [id]))[0];
  }

  async listPatchJobs(user: CurrentUser) {
    const companyId = this.companyId(user);
    await this.ensureSchema();
    const rows = await this.db.query<any[]>(
      `SELECT j.*, a.name assetName, p.name policyName, c.status commandStatus, c.completedAt commandCompletedAt
       FROM PatchJob j
       INNER JOIN Asset a ON a.id = j.assetId
       LEFT JOIN PatchPolicy p ON p.id = j.policyId
       LEFT JOIN MdmCommand c ON c.id = j.commandId
       WHERE j.companyId = ?
       ORDER BY j.createdAt DESC LIMIT 100`,
      [companyId],
    );
    return rows.map((row) => ({
      ...row,
      status: row.commandStatus || row.status,
      completedAt: row.commandCompletedAt || row.completedAt,
      patchKeys: this.json(row.patchKeys, []),
    }));
  }

  async createPatchJob(user: CurrentUser, body: any) {
    const companyId = this.companyId(user);
    await this.ensureSchema();
    const assetId = String(body.assetId || '').trim();
    await this.assertAsset(companyId, assetId);
    const patchKeys = Array.isArray(body.patchKeys) ? [...new Set(body.patchKeys.map((item: any) => String(item).trim()).filter(Boolean))] : [];
    if (!patchKeys.length) throw new BadRequestException('Select at least one patch');
    const placeholders = patchKeys.map(() => '?').join(', ');
    const inventory = await this.db.query<any[]>(
      `SELECT patchKey FROM PatchInventory
       WHERE companyId = ? AND assetId = ? AND status = 'MISSING' AND patchKey IN (${placeholders})`,
      [companyId, assetId, ...patchKeys],
    );
    if (inventory.length !== patchKeys.length) {
      throw new BadRequestException('One or more selected patches are not missing on this asset');
    }
    if (body.policyId) {
      const policy = await this.db.query<any[]>('SELECT id FROM PatchPolicy WHERE id = ? AND companyId = ? LIMIT 1', [body.policyId, companyId]);
      if (!policy[0]) throw new NotFoundException('Patch policy not found');
    }
    const commandResult: any = await this.cmdb.runDeviceAction(
      assetId,
      'INSTALL_PATCHES',
      { patchKeys, policyId: body.policyId || null, rebootAllowed: Boolean(body.rebootAllowed) },
      companyId,
      user.id,
    );
    const id = randomUUID();
    const now = new Date();
    await this.db.execute(
      `INSERT INTO PatchJob
       (id, companyId, assetId, policyId, commandId, patchKeys, status, requestedById, scheduledAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      [id, companyId, assetId, body.policyId || null, commandResult.queuedCommand?.id || null, JSON.stringify(patchKeys), user.id, this.dateOrNull(body.scheduledAt) || now, now, now],
    );
    return (await this.db.query<any[]>('SELECT * FROM PatchJob WHERE id = ? LIMIT 1', [id]))[0];
  }

  private companyId(user: CurrentUser) {
    if (!user.companyId) throw new ForbiddenException('Select a company context first');
    return user.companyId;
  }

  private async assertAsset(companyId: string, assetId: string) {
    if (!assetId) throw new BadRequestException('Asset is required');
    const rows = await this.db.query<any[]>('SELECT id FROM Asset WHERE id = ? AND companyId = ? AND deletedAt IS NULL LIMIT 1', [assetId, companyId]);
    if (!rows[0]) throw new NotFoundException('Asset not found');
  }

  private option(value: any, allowed: string[], label: string) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!allowed.includes(normalized)) throw new BadRequestException(`Unsupported ${label}`);
    return normalized;
  }

  private validateLaunchUrl(value: any) {
    const raw = String(value || '').trim();
    if (!raw) throw new BadRequestException('Launch URL is required');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('Launch URL is invalid');
    }
    if (!['https:', 'anydesk:', 'teamviewer10:', 'st-business:'].includes(url.protocol)) {
      throw new BadRequestException('Launch URL must use HTTPS or a supported remote-access protocol');
    }
    return raw;
  }

  private dateOrNull(value: any) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Date is invalid');
    return date;
  }

  private json(value: any, fallback: any) {
    if (!value) return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return fallback; }
  }

  private ensureSchema() {
    if (!this.schemaReady) this.schemaReady = this.createSchema();
    return this.schemaReady;
  }

  private async createSchema() {
    const statements = [
      `CREATE TABLE IF NOT EXISTS RemoteAccessEndpoint (
        id VARCHAR(191) PRIMARY KEY, companyId VARCHAR(191) NOT NULL, assetId VARCHAR(191) NOT NULL,
        provider VARCHAR(32) NOT NULL, externalDeviceId VARCHAR(255) NOT NULL, launchUrl TEXT NOT NULL,
        enabled TINYINT(1) DEFAULT 1, createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY remote_endpoint_unique (companyId, assetId, provider),
        INDEX(companyId), INDEX(assetId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS RemoteAccessSession (
        id VARCHAR(191) PRIMARY KEY, companyId VARCHAR(191) NOT NULL, endpointId VARCHAR(191) NOT NULL,
        assetId VARCHAR(191) NOT NULL, provider VARCHAR(32) NOT NULL, requestedById VARCHAR(191),
        status VARCHAR(32) DEFAULT 'LAUNCHED', launchUrl TEXT NOT NULL, requestedAt DATETIME(3) NOT NULL,
        endedAt DATETIME(3), INDEX(companyId, requestedAt), INDEX(assetId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS PatchPolicy (
        id VARCHAR(191) PRIMARY KEY, companyId VARCHAR(191) NOT NULL, name VARCHAR(191) NOT NULL,
        osFamily VARCHAR(32) DEFAULT 'ALL', severities TEXT, delayDays INT DEFAULT 0,
        maintenanceWindow VARCHAR(191), autoApprove TINYINT(1) DEFAULT 1, rebootAllowed TINYINT(1) DEFAULT 0,
        enabled TINYINT(1) DEFAULT 1, createdById VARCHAR(191), createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3), INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS PatchInventory (
        id VARCHAR(191) PRIMARY KEY, companyId VARCHAR(191) NOT NULL, assetId VARCHAR(191) NOT NULL,
        patchKey VARCHAR(191) NOT NULL, title VARCHAR(500) NOT NULL, severity VARCHAR(32) DEFAULT 'UNKNOWN',
        status VARCHAR(32) DEFAULT 'MISSING', releaseDate DATETIME(3), requiresReboot TINYINT(1) DEFAULT 0,
        detectedAt DATETIME(3) NOT NULL, installedAt DATETIME(3), metadata TEXT,
        UNIQUE KEY patch_inventory_unique (companyId, assetId, patchKey), INDEX(companyId, status), INDEX(assetId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS PatchJob (
        id VARCHAR(191) PRIMARY KEY, companyId VARCHAR(191) NOT NULL, assetId VARCHAR(191) NOT NULL,
        policyId VARCHAR(191), commandId VARCHAR(191), patchKeys TEXT NOT NULL, status VARCHAR(32) DEFAULT 'PENDING',
        requestedById VARCHAR(191), scheduledAt DATETIME(3), startedAt DATETIME(3), completedAt DATETIME(3),
        result TEXT, createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3), updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId, status), INDEX(assetId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    ];
    for (const statement of statements) await this.db.execute(statement);
  }
}
