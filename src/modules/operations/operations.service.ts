import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser } from '../../common/types';
import { CreateOperationItemDto, MODULE_KEYS, OperationModuleKey } from './dto/create-operation-item.dto';
import { UpdateOperationItemDto } from './dto/update-operation-item.dto';

type OperationItem = {
  id: string;
  companyId: string;
  moduleKey: OperationModuleKey;
  title: string;
  description?: string;
  status: string;
  priority: string;
  ownerId?: string;
  ticketId?: string;
  assetId?: string;
  dueAt?: string;
  metadata?: any;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
};

const MODULE_LABELS: Record<OperationModuleKey, string> = {
  'customer-portal': 'Customer Portal',
  'technician-mobile': 'Technician Mobile',
  inventory: 'Inventory',
  'quotes-invoices': 'Quotes and Invoices',
  sla: 'SLA Tracking',
  maintenance: 'Recurring Maintenance',
  'knowledge-base': 'Knowledge Base',
  alerting: 'Advanced Alerting',
  topology: 'Network Topology',
  'security-center': 'Security Center',
};

@Injectable()
export class OperationsService {
  constructor(private db: DatabaseService) {}

  modules() {
    return MODULE_KEYS.map((key) => ({
      key,
      label: MODULE_LABELS[key],
      path: `/${key}`,
    }));
  }

  async publicStatusNotices() {
    return this.db.query<any[]>(
      `SELECT id, title, message, noticeType, status, startsAt, endsAt, publishedAt, resolvedAt, updatedAt
       FROM StatusNotice
       WHERE publishedAt IS NOT NULL
         AND (endsAt IS NULL OR endsAt >= DATE_SUB(NOW(3), INTERVAL 7 DAY))
       ORDER BY CASE status WHEN 'INVESTIGATING' THEN 0 WHEN 'IDENTIFIED' THEN 1 WHEN 'MONITORING' THEN 2 WHEN 'SCHEDULED' THEN 3 ELSE 4 END,
                COALESCE(startsAt, publishedAt) DESC
       LIMIT 20`,
    ).catch(() => []);
  }

  async workspaceSetup(user: CurrentUser) {
    const companyId = this.requireCompany(user);
    const [companyRows, technicians, customers, devices, emailRows, backupRows] = await Promise.all([
      this.db.query<any[]>(`SELECT id, name, domain, logo, settings FROM Company WHERE id = ? AND deletedAt IS NULL LIMIT 1`, [companyId]),
      this.count(`SELECT COUNT(*) count FROM User WHERE companyId = ? AND role IN ('TECHNICIAN', 'GLOBAL_TECH') AND isActive = 1 AND deletedAt IS NULL`, [companyId]),
      this.count(`SELECT COUNT(*) count FROM User WHERE companyId = ? AND role = 'CLIENT' AND isActive = 1 AND deletedAt IS NULL`, [companyId]),
      this.count(`SELECT COUNT(*) count FROM Asset WHERE companyId = ? AND deletedAt IS NULL`, [companyId]),
      this.db.query<any[]>(`SELECT isActive, lastTestStatus FROM EmailProviderConfig WHERE id = 'global-smtp' LIMIT 1`).catch(() => []),
      this.db.query<any[]>(`SELECT status, completedAt FROM BackupRun WHERE status = 'COMPLETED' ORDER BY completedAt DESC LIMIT 1`).catch(() => []),
    ]);
    const company = companyRows[0] || {};
    const profileComplete = Boolean(company.name && (company.domain || company.logo || company.settings));
    const steps = [
      { id: 'company', label: 'Complete company profile', href: '/settings', complete: profileComplete },
      { id: 'technician', label: 'Add the first technician', href: '/admin/company', complete: technicians > 0 },
      { id: 'customer', label: 'Add the first customer', href: '/admin/company', complete: customers > 0 },
      { id: 'device', label: 'Add the first managed device', href: '/assets/new', complete: devices > 0 },
      { id: 'email', label: 'Test outbound email', href: '/admin/email-operations', complete: Boolean(emailRows[0]?.isActive && emailRows[0]?.lastTestStatus === 'PASS') },
      { id: 'backup', label: 'Complete an encrypted off-site backup', href: '/admin/security-operations', complete: Boolean(backupRows[0]) },
    ];
    const complete = steps.filter((step) => step.complete).length;
    return { steps, complete, total: steps.length, progress: Math.round((complete / steps.length) * 100) };
  }

  async listSavedViews(resourceKey: string, user: CurrentUser) {
    this.assertSavedViewResource(resourceKey);
    const companyId = this.savedViewCompany(user);
    const rows = await this.db.query<any[]>(
      `SELECT id, resourceKey, name, filters, isDefault, createdAt, updatedAt
       FROM SavedView WHERE companyId = ? AND userId = ? AND resourceKey = ?
       ORDER BY isDefault DESC, name`,
      [companyId, user.id, resourceKey],
    );
    return rows.map((row) => ({ ...row, isDefault: Boolean(row.isDefault), filters: this.parseJson(row.filters, {}) }));
  }

  async saveView(resourceKey: string, body: { name: string; filters: Record<string, unknown>; isDefault?: boolean }, user: CurrentUser) {
    this.assertSavedViewResource(resourceKey);
    const companyId = this.savedViewCompany(user);
    const name = String(body.name || '').trim().slice(0, 120);
    if (!name) throw new BadRequestException('View name is required');
    if (!body.filters || typeof body.filters !== 'object' || Array.isArray(body.filters)) throw new BadRequestException('View filters must be an object');
    if (body.isDefault) await this.db.execute(`UPDATE SavedView SET isDefault = 0, updatedAt = NOW(3) WHERE userId = ? AND resourceKey = ?`, [user.id, resourceKey]);
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO SavedView (id, companyId, userId, resourceKey, name, filters, isDefault, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE filters = VALUES(filters), isDefault = VALUES(isDefault), updatedAt = NOW(3)`,
      [id, companyId, user.id, resourceKey, name, JSON.stringify(body.filters), body.isDefault ? 1 : 0],
    );
    return { saved: true, resourceKey, name };
  }

  async deleteSavedView(resourceKey: string, id: string, user: CurrentUser) {
    this.assertSavedViewResource(resourceKey);
    const companyId = this.savedViewCompany(user);
    const result = await this.db.execute(`DELETE FROM SavedView WHERE id = ? AND companyId = ? AND userId = ? AND resourceKey = ?`, [id, companyId, user.id, resourceKey]);
    if (!result.affectedRows) throw new NotFoundException('Saved view not found');
    return { id, deleted: true };
  }

  async summary(user: CurrentUser) {
    const companyId = this.requireCompany(user);
    const rows = await this.db.query<any[]>(
      `SELECT moduleKey, status, COUNT(*) as count
       FROM OperationalWorkspaceItem
       WHERE companyId = ?
       GROUP BY moduleKey, status`,
      [companyId],
    );

    return this.modules().map((module) => {
      const moduleRows = rows.filter((row) => row.moduleKey === module.key);
      const counts = moduleRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = Number(row.count || 0);
        return acc;
      }, {});
      return {
        ...module,
        counts,
        total: moduleRows.reduce((sum, row) => sum + Number(row.count || 0), 0),
      };
    });
  }

  async list(moduleKey: OperationModuleKey, user: CurrentUser, query: { status?: string; search?: string; limit?: string }) {
    this.assertModule(moduleKey);
    const companyId = this.requireCompany(user);
    const values: any[] = [companyId, moduleKey];
    const clauses = ['companyId = ?', 'moduleKey = ?'];

    if (query.status) {
      clauses.push('status = ?');
      values.push(query.status);
    }

    if (query.search) {
      clauses.push('(title LIKE ? OR description LIKE ?)');
      values.push(`%${query.search}%`, `%${query.search}%`);
    }

    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    values.push(limit);
    const rows = await this.db.query<any[]>(
      `SELECT * FROM OperationalWorkspaceItem
       WHERE ${clauses.join(' AND ')}
       ORDER BY updatedAt DESC, createdAt DESC
       LIMIT ?`,
      values,
    );

    return rows.map((row) => this.parseItem(row));
  }

  async create(dto: CreateOperationItemDto, user: CurrentUser) {
    this.assertModule(dto.moduleKey);
    const companyId = this.requireCompany(user);
    const id = randomUUID();
    const now = new Date();
    await this.db.execute(
      `INSERT INTO OperationalWorkspaceItem
       (id, companyId, moduleKey, title, description, status, priority, ownerId, ticketId, assetId, dueAt, metadata, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        dto.moduleKey,
        dto.title,
        dto.description || null,
        dto.status || 'ACTIVE',
        dto.priority || 'MEDIUM',
        dto.ownerId || null,
        dto.ticketId || null,
        dto.assetId || null,
        dto.dueAt ? new Date(dto.dueAt) : null,
        dto.metadata ? JSON.stringify(dto.metadata) : null,
        user.id,
        now,
        now,
      ],
    );
    return this.findOne(id, user);
  }

  async update(id: string, dto: UpdateOperationItemDto, user: CurrentUser) {
    const existing = await this.findOne(id, user);
    if (!existing) throw new NotFoundException('Operation item not found');

    const updates: Record<string, any> = {};
    for (const key of ['title', 'description', 'status', 'priority', 'ownerId', 'ticketId', 'assetId'] as const) {
      if (dto[key] !== undefined) updates[key] = dto[key];
    }
    if (dto.dueAt !== undefined) updates.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.metadata !== undefined) updates.metadata = JSON.stringify(dto.metadata);
    updates.updatedAt = new Date();

    const keys = Object.keys(updates);
    await this.db.execute(
      `UPDATE OperationalWorkspaceItem SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE id = ?`,
      [...keys.map((key) => updates[key]), id],
    );
    return this.findOne(id, user);
  }

  private async findOne(id: string, user: CurrentUser): Promise<OperationItem> {
    const companyId = this.requireCompany(user);
    const rows = await this.db.query<any[]>('SELECT * FROM OperationalWorkspaceItem WHERE id = ? AND companyId = ? LIMIT 1', [id, companyId]);
    if (!rows[0]) throw new NotFoundException('Operation item not found');
    return this.parseItem(rows[0]);
  }

  private requireCompany(user: CurrentUser) {
    const companyId = user.effectiveCompanyId || user.companyId;
    if (!companyId) throw new ForbiddenException('Select a company context first');
    return companyId;
  }

  private async count(sql: string, values: any[] = []) {
    const rows = await this.db.query<any[]>(sql, values);
    return Number(rows[0]?.count || 0);
  }

  private assertSavedViewResource(resourceKey: string) {
    if (!['tickets', 'assets', 'network', 'users', 'dispatch'].includes(resourceKey)) {
      throw new NotFoundException('Saved-view resource not found');
    }
  }

  private savedViewCompany(user: CurrentUser) {
    return user.effectiveCompanyId || user.companyId || 'platform';
  }

  private parseJson(value: any, fallback: any) {
    if (typeof value !== 'string') return value ?? fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  }

  private assertModule(moduleKey: string): asserts moduleKey is OperationModuleKey {
    if (!MODULE_KEYS.includes(moduleKey as OperationModuleKey)) {
      throw new NotFoundException('Operation module not found');
    }
  }

  private parseItem(row: any): OperationItem {
    if (row?.metadata && typeof row.metadata === 'string') {
      try { row.metadata = JSON.parse(row.metadata); } catch { row.metadata = {}; }
    }
    return row;
  }
}
