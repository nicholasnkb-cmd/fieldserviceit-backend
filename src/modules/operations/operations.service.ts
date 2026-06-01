import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
