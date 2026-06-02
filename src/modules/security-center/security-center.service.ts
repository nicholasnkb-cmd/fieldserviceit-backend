import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CurrentUser } from '../../common/types';
import { DatabaseService } from '../../database/database.service';

const FINDING_STATUSES = ['OPEN', 'IN_PROGRESS', 'ACCEPTED_RISK', 'RESOLVED'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const CATEGORIES = ['ACCESS', 'DEVICE', 'CREDENTIAL', 'AUDIT', 'NETWORK', 'POLICY'];

@Injectable()
export class SecurityCenterService {
  private schemaReady?: Promise<void>;

  constructor(private db: DatabaseService) {}

  async summary(user: CurrentUser) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const companyFilter = scope.companyId ? 'companyId = ? AND ' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    const userFilter = scope.companyId ? 'companyId = ? AND ' : '';
    const assetFilter = scope.companyId ? 'companyId = ? AND ' : '';
    const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      findingRows,
      severityRows,
      users,
      inactiveUsers,
      unverifiedUsers,
      staleUsers,
      assets,
      nonCompliantAssets,
      unmanagedAssets,
      staleAssets,
      credentials,
      staleCredentials,
      auditEvents,
      recentSessions,
    ] = await Promise.all([
      this.db.query<any[]>(`SELECT status, COUNT(*) as count FROM SecurityFinding WHERE ${companyFilter}status <> 'RESOLVED' GROUP BY status`, values),
      this.db.query<any[]>(`SELECT severity, COUNT(*) as count FROM SecurityFinding WHERE ${companyFilter}status <> 'RESOLVED' GROUP BY severity`, values),
      this.count(`SELECT COUNT(*) as count FROM User WHERE ${userFilter}deletedAt IS NULL`, values),
      this.count(`SELECT COUNT(*) as count FROM User WHERE ${userFilter}deletedAt IS NULL AND isActive = 0`, values),
      this.count(`SELECT COUNT(*) as count FROM User WHERE ${userFilter}deletedAt IS NULL AND emailVerified = 0`, values),
      this.count(`SELECT COUNT(*) as count FROM User WHERE ${userFilter}deletedAt IS NULL AND (lastLoginAt IS NULL OR lastLoginAt < ?)`, [...values, staleDate]),
      this.count(`SELECT COUNT(*) as count FROM Asset WHERE ${assetFilter}deletedAt IS NULL`, values),
      this.count(`SELECT COUNT(*) as count FROM Asset WHERE ${assetFilter}deletedAt IS NULL AND complianceStatus = 'NON_COMPLIANT'`, values),
      this.count(`SELECT COUNT(*) as count FROM Asset WHERE ${assetFilter}deletedAt IS NULL AND enrollmentStatus = 'UNMANAGED'`, values),
      this.count(`SELECT COUNT(*) as count FROM Asset WHERE ${assetFilter}deletedAt IS NULL AND (lastCheckInAt IS NULL OR lastCheckInAt < ?)`, [...values, staleDate]),
      this.optionalCount(`SELECT COUNT(*) as count FROM NetworkCredential WHERE ${companyFilter}1=1`, values),
      this.optionalCount(`SELECT COUNT(*) as count FROM NetworkCredential WHERE ${companyFilter}(lastTestAt IS NULL OR lastTestAt < ?)`, [...values, staleDate]),
      this.count(`SELECT COUNT(*) as count FROM AuditLog WHERE ${companyFilter}createdAt >= ?`, [...values, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]),
      this.count(
        `SELECT COUNT(*) as count
         FROM Session s
         LEFT JOIN User u ON u.id = s.userId
         WHERE s.createdAt >= ? ${scope.companyId ? 'AND u.companyId = ?' : ''}`,
        scope.companyId ? [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), scope.companyId] : [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)],
      ),
    ]);

    const findingsByStatus = this.keyedCounts(findingRows, 'status');
    const findingsBySeverity = this.keyedCounts(severityRows, 'severity');
    const complianceRate = assets > 0 ? Math.round(((assets - nonCompliantAssets) / assets) * 100) : 0;
    const riskScore = this.riskScore({
      critical: findingsBySeverity.CRITICAL || 0,
      high: findingsBySeverity.HIGH || 0,
      nonCompliantAssets,
      unmanagedAssets,
      staleCredentials,
      unverifiedUsers,
    });

    return {
      riskScore,
      complianceRate,
      openFindings: Object.values(findingsByStatus).reduce((sum, count) => sum + Number(count || 0), 0),
      findingsByStatus,
      findingsBySeverity,
      users: { total: users, inactive: inactiveUsers, unverified: unverifiedUsers, stale: staleUsers },
      devices: { total: assets, nonCompliant: nonCompliantAssets, unmanaged: unmanagedAssets, stale: staleAssets },
      credentials: { total: credentials, stale: staleCredentials },
      audit: { eventsLast7Days: auditEvents, sessionsLast7Days: recentSessions },
    };
  }

  async listFindings(user: CurrentUser, query: { status?: string; severity?: string; category?: string; search?: string; limit?: string }) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const clauses: string[] = [];
    const values: any[] = [];
    if (scope.companyId) {
      clauses.push('f.companyId = ?');
      values.push(scope.companyId);
    }
    if (query.status && query.status !== 'ALL') {
      clauses.push('f.status = ?');
      values.push(this.normalizeOption(query.status, FINDING_STATUSES, 'status'));
    }
    if (query.severity && query.severity !== 'ALL') {
      clauses.push('f.severity = ?');
      values.push(this.normalizeOption(query.severity, SEVERITIES, 'severity'));
    }
    if (query.category && query.category !== 'ALL') {
      clauses.push('f.category = ?');
      values.push(this.normalizeOption(query.category, CATEGORIES, 'category'));
    }
    if (query.search) {
      clauses.push('(f.title LIKE ? OR f.description LIKE ? OR f.remediation LIKE ? OR c.name LIKE ?)');
      const term = `%${query.search.trim()}%`;
      values.push(term, term, term, term);
    }
    values.push(this.limit(query.limit));
    return this.db.query<any[]>(
      `SELECT f.*, c.name as companyName, a.name as assetName, u.email as userEmail, owner.email as ownerEmail
       FROM SecurityFinding f
       LEFT JOIN Company c ON c.id = f.companyId
       LEFT JOIN Asset a ON a.id = f.assetId
       LEFT JOIN User u ON u.id = f.userId
       LEFT JOIN User owner ON owner.id = f.assignedToId
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY FIELD(f.severity, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'), f.updatedAt DESC
       LIMIT ?`,
      values,
    );
  }

  async createFinding(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    const data = await this.normalizeFinding(companyId, dto, true);
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO SecurityFinding
       (id, companyId, title, description, severity, category, status, assetId, userId, assignedToId, remediation, dueAt, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, data.title, data.description, data.severity, data.category, 'OPEN', data.assetId, data.userId, data.assignedToId, data.remediation, data.dueAt, user.id, new Date(), new Date()],
    );
    await this.audit(user, companyId, 'SECURITY_FINDING_CREATED', 'SecurityFinding', id, { title: data.title, severity: data.severity });
    return this.getFinding(user, id);
  }

  async updateFinding(user: CurrentUser, id: string, dto: any) {
    await this.ensureSchema();
    const existing = await this.getFinding(user, id);
    const data = await this.normalizeFinding(existing.companyId, dto, false);
    const updates: Record<string, any> = { ...data, updatedAt: new Date() };
    if (updates.status === 'RESOLVED') updates.resolvedAt = new Date();
    if (updates.status && updates.status !== 'RESOLVED') updates.resolvedAt = null;
    const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
    if (keys.length) {
      await this.db.execute(
        `UPDATE SecurityFinding SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((key) => updates[key]), id],
      );
      await this.audit(user, existing.companyId, 'SECURITY_FINDING_UPDATED', 'SecurityFinding', id, updates);
    }
    return this.getFinding(user, id);
  }

  async listEvents(user: CurrentUser, query: { action?: string; search?: string; limit?: string }) {
    const scope = this.scopeFor(user);
    const clauses: string[] = [];
    const values: any[] = [];
    if (scope.companyId) {
      clauses.push('a.companyId = ?');
      values.push(scope.companyId);
    }
    if (query.action) {
      clauses.push('a.action LIKE ?');
      values.push(`%${query.action.trim()}%`);
    }
    if (query.search) {
      clauses.push('(a.action LIKE ? OR a.resourceType LIKE ? OR actor.email LIKE ? OR c.name LIKE ?)');
      const term = `%${query.search.trim()}%`;
      values.push(term, term, term, term);
    }
    values.push(this.limit(query.limit));
    return this.db.query<any[]>(
      `SELECT a.id, a.companyId, a.actorId, a.action, a.resourceType, a.resourceId, a.ip, a.userAgent, a.createdAt,
        c.name as companyName, actor.email as actorEmail, actor.firstName as actorFirstName, actor.lastName as actorLastName
       FROM AuditLog a
       LEFT JOIN Company c ON c.id = a.companyId
       LEFT JOIN User actor ON actor.id = a.actorId
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY a.createdAt DESC
       LIMIT ?`,
      values,
    );
  }

  async accessReview(user: CurrentUser) {
    const scope = this.scopeFor(user);
    const where = scope.companyId ? 'WHERE u.companyId = ? AND u.deletedAt IS NULL' : 'WHERE u.deletedAt IS NULL';
    const values = scope.companyId ? [scope.companyId] : [];
    const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this.db.query<any[]>(
      `SELECT u.id, u.email, u.firstName, u.lastName, u.role, u.userType, u.companyId, c.name as companyName,
        u.isActive, u.emailVerified, u.lastLoginAt,
        CASE
          WHEN u.isActive = 0 THEN 'Inactive account'
          WHEN u.emailVerified = 0 THEN 'Email not verified'
          WHEN u.lastLoginAt IS NULL OR u.lastLoginAt < ? THEN 'Stale login'
          WHEN u.role IN ('SUPER_ADMIN', 'TENANT_ADMIN') THEN 'Privileged access'
          ELSE 'Review current access'
        END as reviewReason
       FROM User u
       LEFT JOIN Company c ON c.id = u.companyId
       ${where}
       ORDER BY
        CASE WHEN u.role IN ('SUPER_ADMIN', 'TENANT_ADMIN') THEN 0 ELSE 1 END,
        u.lastLoginAt ASC
       LIMIT 100`,
      [staleDate, ...values],
    );
  }

  async devicePosture(user: CurrentUser) {
    const scope = this.scopeFor(user);
    const where = scope.companyId ? 'WHERE a.companyId = ? AND a.deletedAt IS NULL' : 'WHERE a.deletedAt IS NULL';
    const values = scope.companyId ? [scope.companyId] : [];
    return this.db.query<any[]>(
      `SELECT a.id, a.companyId, c.name as companyName, a.name, a.assetType, a.deviceCategory, a.enrollmentStatus,
        a.complianceStatus, a.complianceReasons, a.lastCheckInAt, a.encryptionStatus, a.firewallEnabled, a.antivirusStatus
       FROM Asset a
       LEFT JOIN Company c ON c.id = a.companyId
       ${where}
       ORDER BY
        CASE a.complianceStatus WHEN 'NON_COMPLIANT' THEN 0 WHEN 'UNKNOWN' THEN 1 ELSE 2 END,
        a.lastCheckInAt ASC
       LIMIT 100`,
      values,
    );
  }

  private async getFinding(user: CurrentUser, id: string) {
    const scope = this.scopeFor(user);
    const values: any[] = [id];
    const companyClause = scope.companyId ? 'AND f.companyId = ?' : '';
    if (scope.companyId) values.push(scope.companyId);
    const rows = await this.db.query<any[]>(
      `SELECT f.*, c.name as companyName, a.name as assetName, u.email as userEmail, owner.email as ownerEmail
       FROM SecurityFinding f
       LEFT JOIN Company c ON c.id = f.companyId
       LEFT JOIN Asset a ON a.id = f.assetId
       LEFT JOIN User u ON u.id = f.userId
       LEFT JOIN User owner ON owner.id = f.assignedToId
       WHERE f.id = ? ${companyClause}
       LIMIT 1`,
      values,
    );
    if (!rows[0]) throw new NotFoundException('Security finding not found');
    return rows[0];
  }

  private async normalizeFinding(companyId: string, dto: any, required: boolean) {
    const has = (key: string) => Object.prototype.hasOwnProperty.call(dto, key);
    const title = dto.title?.trim();
    if (required && !title) throw new BadRequestException('Finding title is required');
    const assetId = has('assetId') ? dto.assetId || null : undefined;
    if (assetId) await this.assertAsset(companyId, assetId);
    const userId = has('userId') ? dto.userId || null : undefined;
    if (userId) await this.assertUser(companyId, userId);
    const assignedToId = has('assignedToId') ? dto.assignedToId || null : undefined;
    if (assignedToId) await this.assertUser(companyId, assignedToId);
    return {
      title: has('title') ? title || undefined : undefined,
      description: has('description') ? dto.description?.trim() || null : undefined,
      severity: has('severity') ? this.normalizeOption(dto.severity || 'MEDIUM', SEVERITIES, 'severity') : required ? 'MEDIUM' : undefined,
      category: has('category') ? this.normalizeOption(dto.category || 'POLICY', CATEGORIES, 'category') : required ? 'POLICY' : undefined,
      status: has('status') ? this.normalizeOption(dto.status || 'OPEN', FINDING_STATUSES, 'status') : undefined,
      assetId,
      userId,
      assignedToId,
      remediation: has('remediation') ? dto.remediation?.trim() || null : undefined,
      dueAt: has('dueAt') ? dto.dueAt ? new Date(dto.dueAt) : null : undefined,
    };
  }

  private async assertAsset(companyId: string, assetId: string) {
    const rows = await this.db.query<any[]>('SELECT id FROM Asset WHERE id = ? AND companyId = ? AND deletedAt IS NULL LIMIT 1', [assetId, companyId]);
    if (!rows[0]) throw new BadRequestException('Asset is not available for this company');
  }

  private async assertUser(companyId: string, userId: string) {
    const rows = await this.db.query<any[]>('SELECT id FROM User WHERE id = ? AND companyId = ? AND deletedAt IS NULL LIMIT 1', [userId, companyId]);
    if (!rows[0]) throw new BadRequestException('User is not available for this company');
  }

  private async audit(user: CurrentUser, companyId: string, action: string, resourceType: string, resourceId: string, diff: any) {
    await this.db.execute(
      `INSERT INTO AuditLog (id, companyId, actorId, action, resourceType, resourceId, diff, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), companyId, user.id, action, resourceType, resourceId, JSON.stringify(diff), new Date()],
    ).catch(() => {});
  }

  private scopeFor(user: CurrentUser) {
    if (user.companyId) return { companyId: user.companyId };
    if (user.role === 'SUPER_ADMIN') return { companyId: user.effectiveCompanyId || null };
    throw new ForbiddenException('Select a company context to use the security center');
  }

  private resolveWriteCompany(user: CurrentUser, requestedCompanyId?: string) {
    if (user.companyId) return user.companyId;
    if (user.role === 'SUPER_ADMIN' && (user.effectiveCompanyId || requestedCompanyId)) return user.effectiveCompanyId || requestedCompanyId;
    throw new ForbiddenException('Select a company context before creating security findings');
  }

  private async count(sql: string, values: any[]) {
    const rows = await this.db.query<any[]>(sql, values);
    return Number(rows[0]?.count || 0);
  }

  private async optionalCount(sql: string, values: any[]) {
    try {
      return await this.count(sql, values);
    } catch {
      return 0;
    }
  }

  private keyedCounts(rows: any[], key: string) {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row[key] || 'UNKNOWN'] = Number(row.count || 0);
      return acc;
    }, {});
  }

  private riskScore(input: Record<string, number>) {
    const score = 100
      - input.critical * 18
      - input.high * 10
      - input.nonCompliantAssets * 5
      - input.unmanagedAssets * 4
      - input.staleCredentials * 6
      - input.unverifiedUsers * 3;
    return Math.max(0, Math.min(100, score));
  }

  private normalizeOption(value: string, allowed: string[], label: string) {
    const normalized = String(value || '').toUpperCase();
    if (!allowed.includes(normalized)) throw new BadRequestException(`Invalid ${label}`);
    return normalized;
  }

  private limit(value?: string) {
    return Math.min(Math.max(Number(value) || 100, 1), 200);
  }

  private ensureSchema() {
    if (!this.schemaReady) this.schemaReady = this.createSchema();
    return this.schemaReady;
  }

  private async createSchema() {
    await this.db.query(`
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
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
  }
}
