import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CurrentUser } from '../../common/types';
import { DatabaseService } from '../../database/database.service';
import { TicketsService } from '../tickets/services/tickets.service';
import { TicketParticipantNotifierService } from '../tickets/services/ticket-participant-notifier.service';

const FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM'];
const PLAN_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'];

@Injectable()
export class MaintenanceService {
  private schemaReady?: Promise<void>;

  constructor(
    private db: DatabaseService,
    private tickets: TicketsService,
    private participantNotifier: TicketParticipantNotifierService,
  ) {}

  async summary(user: CurrentUser) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const { where, values } = this.planWhere(scope, 'p');
    const now = new Date();
    const soon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [statusRows, dueRows, completedRows, ticketRows] = await Promise.all([
      this.db.query<any[]>(`SELECT p.status, COUNT(*) as count FROM MaintenancePlan p ${where} GROUP BY p.status`, values),
      this.db.query<any[]>(
        `SELECT
          SUM(CASE WHEN p.status = 'ACTIVE' AND p.nextDueAt < ? THEN 1 ELSE 0 END) as overdue,
          SUM(CASE WHEN p.status = 'ACTIVE' AND p.nextDueAt >= ? AND p.nextDueAt <= ? THEN 1 ELSE 0 END) as dueSoon
         FROM MaintenancePlan p ${where}`,
        [now, now, soon, ...values],
      ),
      this.db.query<any[]>(
        `SELECT COUNT(*) as count FROM MaintenanceRun r ${scope.companyId ? 'WHERE r.companyId = ? AND ' : 'WHERE '}r.status = 'COMPLETED' AND r.completedAt >= ?`,
        scope.companyId ? [scope.companyId, monthStart] : [monthStart],
      ),
      this.db.query<any[]>(
        `SELECT COUNT(*) as count
         FROM MaintenanceRun r
         LEFT JOIN Ticket t ON t.id = r.ticketId
         ${scope.companyId ? 'WHERE r.companyId = ? AND ' : 'WHERE '}r.ticketId IS NOT NULL AND t.status NOT IN ('RESOLVED', 'CLOSED')`,
        scope.companyId ? [scope.companyId] : [],
      ),
    ]);
    const byStatus = statusRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = Number(row.count || 0);
      return acc;
    }, {});
    return {
      byStatus,
      activePlans: Number(byStatus.ACTIVE || 0),
      pausedPlans: Number(byStatus.PAUSED || 0),
      overduePlans: Number(dueRows[0]?.overdue || 0),
      dueSoonPlans: Number(dueRows[0]?.dueSoon || 0),
      completedThisMonth: Number(completedRows[0]?.count || 0),
      openMaintenanceTickets: Number(ticketRows[0]?.count || 0),
    };
  }

  async listPlans(user: CurrentUser, query: { status?: string; search?: string; limit?: string }) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const clauses: string[] = [];
    const values: any[] = [];
    if (scope.companyId) {
      clauses.push('p.companyId = ?');
      values.push(scope.companyId);
    }
    if (query.status && query.status !== 'ALL') {
      clauses.push('p.status = ?');
      values.push(this.normalizeOption(query.status, PLAN_STATUSES, 'status'));
    }
    if (query.search) {
      clauses.push('(p.name LIKE ? OR p.description LIKE ? OR p.location LIKE ? OR a.name LIKE ?)');
      const term = `%${query.search.trim()}%`;
      values.push(term, term, term, term);
    }
    values.push(this.limit(query.limit));
    const rows = await this.db.query<any[]>(
      `SELECT p.*, c.name as companyName, a.name as assetName, a.assetType, a.serialNumber, a.ipAddress,
        u.firstName as assignedFirstName, u.lastName as assignedLastName, u.email as assignedEmail,
        latest.ticketId as latestTicketId, t.ticketNumber as latestTicketNumber, t.status as latestTicketStatus
       FROM MaintenancePlan p
       LEFT JOIN Company c ON c.id = p.companyId
       LEFT JOIN Asset a ON a.id = p.assetId
       LEFT JOIN User u ON u.id = p.assignedToId
       LEFT JOIN (
         SELECT planId, MAX(createdAt) as createdAt
         FROM MaintenanceRun
         GROUP BY planId
       ) lr ON lr.planId = p.id
       LEFT JOIN MaintenanceRun latest ON latest.planId = lr.planId AND latest.createdAt = lr.createdAt
       LEFT JOIN Ticket t ON t.id = latest.ticketId
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY
         CASE WHEN p.status = 'ACTIVE' AND p.nextDueAt < NOW(3) THEN 0 ELSE 1 END,
         p.nextDueAt ASC,
         p.updatedAt DESC
       LIMIT ?`,
      values,
    );
    return rows.map((row) => ({ ...row, checklist: this.parseChecklist(row.checklist) }));
  }

  async createPlan(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    const data = await this.normalizePlan(companyId, dto, true);
    const id = randomUUID();
    const now = new Date();
    await this.db.execute(
      `INSERT INTO MaintenancePlan
       (id, companyId, name, description, assetId, location, frequency, intervalDays, nextDueAt, checklist, ticketTemplateTitle, ticketTemplateDescription, assignedToId, status, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, companyId, data.name, data.description, data.assetId, data.location, data.frequency, data.intervalDays,
        data.nextDueAt, JSON.stringify(data.checklist), data.ticketTemplateTitle, data.ticketTemplateDescription,
        data.assignedToId, data.status, user.id, now, now,
      ],
    );
    return this.getPlan(user, id);
  }

  async updatePlan(user: CurrentUser, id: string, dto: any) {
    await this.ensureSchema();
    const existing = await this.getPlan(user, id);
    const companyId = this.resolveWriteCompany(user, existing.companyId);
    const data = await this.normalizePlan(companyId, dto, false);
    const updates: Record<string, any> = { ...data, updatedAt: new Date() };
    if (Array.isArray(updates.checklist)) updates.checklist = JSON.stringify(updates.checklist);
    const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
    if (keys.length) {
      await this.db.execute(`UPDATE MaintenancePlan SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE id = ? AND companyId = ?`, [
        ...keys.map((key) => updates[key]),
        id,
        companyId,
      ]);
    }
    return this.getPlan(user, id);
  }

  async generateTicket(user: CurrentUser, id: string, dto: any) {
    await this.ensureSchema();
    const plan = await this.getPlan(user, id);
    const companyId = this.resolveWriteCompany(user, plan.companyId);
    if (plan.status !== 'ACTIVE') throw new BadRequestException('Only active maintenance plans can generate tickets');
    const actor = await this.userContact(user.id);
    const checklist = this.parseChecklist(plan.checklist);
    const ticketPayload: any = {
      title: dto.title?.trim() || plan.ticketTemplateTitle || `Maintenance: ${plan.name}`,
      description: dto.description?.trim() || this.ticketDescription(plan, checklist),
      contactName: actor.name,
      contactEmail: actor.email,
      contactPhone: actor.phone,
      category: 'Maintenance',
      subcategory: plan.frequency,
      location: plan.location || undefined,
      priority: dto.priority || 'MEDIUM',
      type: 'CHANGE',
      assetId: plan.assetId || undefined,
    };
    const ticket = await this.tickets.create(
      ticketPayload,
      companyId,
      user.id,
      user.userType,
    );
    if (plan.assignedToId) {
      await this.db.execute(
        'UPDATE Ticket SET assignedToId = ?, status = ? WHERE id = ? AND companyId = ?',
        [plan.assignedToId, 'ASSIGNED', ticket.id, companyId],
      );
      await this.db.execute(
        `INSERT INTO TicketTimeline (id, ticketId, action, actorId, comment, isInternal, createdAt)
         VALUES (?, ?, 'ASSIGNED', ?, ?, 1, ?)`,
        [randomUUID(), ticket.id, user.id, `Assigned from recurring maintenance plan ${plan.name}`, new Date()],
      );
      await this.participantNotifier.notify(ticket.id, {
        action: 'Ticket assigned from maintenance plan',
        detail: `Maintenance plan: ${plan.name}`,
        actorId: user.id,
      });
    }
    const runId = randomUUID();
    await this.db.execute(
      `INSERT INTO MaintenanceRun (id, companyId, planId, ticketId, status, dueAt, notes, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'SCHEDULED', ?, ?, ?, ?, ?)`,
      [runId, companyId, plan.id, ticket.id, dto.dueAt ? new Date(dto.dueAt) : plan.nextDueAt, dto.notes?.trim() || null, user.id, new Date(), new Date()],
    );
    return { ticket, run: (await this.db.query<any[]>('SELECT * FROM MaintenanceRun WHERE id = ? LIMIT 1', [runId]))[0] };
  }

  async completePlan(user: CurrentUser, id: string, dto: any) {
    await this.ensureSchema();
    const plan = await this.getPlan(user, id);
    const companyId = this.resolveWriteCompany(user, plan.companyId);
    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    const nextDueAt = dto.nextDueAt ? new Date(dto.nextDueAt) : this.nextDueDate(completedAt, plan.frequency, Number(plan.intervalDays || 0));
    let runId = dto.runId;
    if (runId) {
      await this.assertRunAccess(companyId, plan.id, runId);
      await this.db.execute(
        `UPDATE MaintenanceRun SET status = 'COMPLETED', completedAt = ?, completedById = ?, notes = ?, updatedAt = ? WHERE id = ? AND companyId = ?`,
        [completedAt, user.id, dto.notes?.trim() || null, new Date(), runId, companyId],
      );
    } else {
      const pending = await this.db.query<any[]>(
        `SELECT id FROM MaintenanceRun WHERE companyId = ? AND planId = ? AND status IN ('DUE', 'SCHEDULED') ORDER BY dueAt ASC LIMIT 1`,
        [companyId, plan.id],
      );
      runId = pending[0]?.id || randomUUID();
      if (pending[0]) {
        await this.db.execute(
          `UPDATE MaintenanceRun SET status = 'COMPLETED', completedAt = ?, completedById = ?, notes = ?, updatedAt = ? WHERE id = ? AND companyId = ?`,
          [completedAt, user.id, dto.notes?.trim() || null, new Date(), runId, companyId],
        );
      } else {
        await this.db.execute(
          `INSERT INTO MaintenanceRun (id, companyId, planId, ticketId, status, dueAt, completedAt, completedById, notes, createdById, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, ?)`,
          [runId, companyId, plan.id, dto.ticketId || null, plan.nextDueAt, completedAt, user.id, dto.notes?.trim() || null, user.id, new Date(), new Date()],
        );
      }
    }
    await this.db.execute(
      'UPDATE MaintenancePlan SET lastCompletedAt = ?, nextDueAt = ?, updatedAt = ? WHERE id = ? AND companyId = ?',
      [completedAt, nextDueAt, new Date(), plan.id, companyId],
    );
    return { plan: await this.getPlan(user, plan.id), run: (await this.db.query<any[]>('SELECT * FROM MaintenanceRun WHERE id = ? LIMIT 1', [runId]))[0] };
  }

  async suggestPlans(user: CurrentUser) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const companyClause = scope.companyId ? 't.companyId = ? AND ' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    const rows = await this.db.query<any[]>(
      `SELECT
         t.assetId,
         a.name as assetName,
         a.assetType,
         COALESCE(NULLIF(t.category, ''), 'General') as category,
         COUNT(*) as ticketCount,
         MAX(t.resolvedAt) as lastResolvedAt,
         GROUP_CONCAT(t.ticketNumber ORDER BY t.resolvedAt DESC SEPARATOR ', ') as ticketNumbers
       FROM Ticket t
       LEFT JOIN Asset a ON a.id = t.assetId
       WHERE ${companyClause}t.deletedAt IS NULL
         AND t.status IN ('RESOLVED', 'CLOSED')
         AND t.resolvedAt >= DATE_SUB(NOW(3), INTERVAL 180 DAY)
       GROUP BY t.assetId, a.name, a.assetType, COALESCE(NULLIF(t.category, ''), 'General')
       HAVING COUNT(*) >= 2
       ORDER BY ticketCount DESC, lastResolvedAt DESC
       LIMIT 25`,
      values,
    );

    return rows.map((row) => ({
      name: `${row.assetName || row.category} preventive maintenance`,
      description: `${row.ticketCount} related resolved tickets in the last 180 days.`,
      assetId: row.assetId,
      assetName: row.assetName,
      assetType: row.assetType,
      category: row.category,
      frequency: Number(row.ticketCount) >= 4 ? 'MONTHLY' : 'QUARTERLY',
      checklist: [
        `Review recent ${row.category} tickets: ${row.ticketNumbers}`,
        'Inspect current asset health and configuration',
        'Apply preventive fix or update runbook',
        'Document follow-up recommendations',
      ],
      confidence: Math.min(95, 45 + Number(row.ticketCount) * 12),
      lastResolvedAt: row.lastResolvedAt,
    }));
  }

  private async getPlan(user: CurrentUser, id: string) {
    const scope = this.scopeFor(user);
    const values: any[] = [id];
    const companyClause = scope.companyId ? 'AND p.companyId = ?' : '';
    if (scope.companyId) values.push(scope.companyId);
    const rows = await this.db.query<any[]>(
      `SELECT p.*, c.name as companyName, a.name as assetName, a.assetType
       FROM MaintenancePlan p
       LEFT JOIN Company c ON c.id = p.companyId
       LEFT JOIN Asset a ON a.id = p.assetId
       WHERE p.id = ? ${companyClause}
       LIMIT 1`,
      values,
    );
    if (!rows[0]) throw new NotFoundException('Maintenance plan not found');
    return { ...rows[0], checklist: this.parseChecklist(rows[0].checklist) };
  }

  private async normalizePlan(companyId: string, dto: any, required: boolean) {
    const has = (key: string) => Object.prototype.hasOwnProperty.call(dto, key);
    const name = dto.name?.trim();
    if (required && !name) throw new BadRequestException('Plan name is required');
    const frequency = has('frequency') ? this.normalizeOption(dto.frequency || 'MONTHLY', FREQUENCIES, 'frequency') : required ? 'MONTHLY' : undefined;
    const intervalDays = frequency === 'CUSTOM'
      ? Math.max(1, Number(dto.intervalDays) || 30)
      : has('intervalDays') ? Math.max(0, Number(dto.intervalDays) || 0) : required ? 0 : undefined;
    const nextDueAt = has('nextDueAt')
      ? this.requiredDate(dto.nextDueAt, 'Next due date')
      : required ? this.nextDueDate(new Date(), frequency || 'MONTHLY', intervalDays || 0) : undefined;
    const assetId = has('assetId') ? dto.assetId || null : undefined;
    if (assetId) await this.assertAsset(companyId, assetId);
    const assignedToId = has('assignedToId') ? dto.assignedToId || null : undefined;
    if (assignedToId) await this.assertUser(companyId, assignedToId);
    return {
      name: has('name') ? name || undefined : undefined,
      description: has('description') ? dto.description?.trim() || null : undefined,
      assetId,
      location: has('location') ? dto.location?.trim() || null : undefined,
      frequency,
      intervalDays,
      nextDueAt,
      checklist: has('checklist') ? this.normalizeChecklist(dto.checklist) : required ? [] : undefined,
      ticketTemplateTitle: has('ticketTemplateTitle') ? dto.ticketTemplateTitle?.trim() || null : undefined,
      ticketTemplateDescription: has('ticketTemplateDescription') ? dto.ticketTemplateDescription?.trim() || null : undefined,
      assignedToId,
      status: has('status') ? this.normalizeOption(dto.status || 'ACTIVE', PLAN_STATUSES, 'status') : required ? 'ACTIVE' : undefined,
    };
  }

  private async userContact(userId: string) {
    const rows = await this.db.query<any[]>('SELECT email, firstName, lastName, phone FROM User WHERE id = ? LIMIT 1', [userId]);
    const user = rows[0] || {};
    const email = user.email || 'maintenance@fieldserviceit.local';
    return {
      email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || email,
      phone: user.phone || 'N/A',
    };
  }

  private ticketDescription(plan: any, checklist: string[]) {
    const parts = [
      plan.ticketTemplateDescription || plan.description || `Recurring maintenance generated for ${plan.name}.`,
      plan.assetName ? `Asset: ${plan.assetName}` : null,
      plan.location ? `Location: ${plan.location}` : null,
      checklist.length ? `Checklist:\n${checklist.map((item) => `- ${item}`).join('\n')}` : null,
    ];
    return parts.filter(Boolean).join('\n\n');
  }

  private async assertAsset(companyId: string, assetId: string) {
    const rows = await this.db.query<any[]>('SELECT id FROM Asset WHERE id = ? AND companyId = ? AND deletedAt IS NULL LIMIT 1', [assetId, companyId]);
    if (!rows[0]) throw new BadRequestException('Asset is not available for this company');
  }

  private async assertUser(companyId: string, userId: string) {
    const rows = await this.db.query<any[]>('SELECT id FROM User WHERE id = ? AND companyId = ? AND deletedAt IS NULL LIMIT 1', [userId, companyId]);
    if (!rows[0]) throw new BadRequestException('Assigned user is not available for this company');
  }

  private async assertRunAccess(companyId: string, planId: string, runId: string) {
    const rows = await this.db.query<any[]>('SELECT id FROM MaintenanceRun WHERE id = ? AND planId = ? AND companyId = ? LIMIT 1', [runId, planId, companyId]);
    if (!rows[0]) throw new NotFoundException('Maintenance run not found');
  }

  private scopeFor(user: CurrentUser) {
    if (user.companyId) return { companyId: user.companyId };
    if (user.role === 'SUPER_ADMIN') return { companyId: user.effectiveCompanyId || null };
    throw new ForbiddenException('Select a company context to manage recurring maintenance');
  }

  private resolveWriteCompany(user: CurrentUser, requestedCompanyId?: string): string {
    if (user.companyId) return user.companyId;
    if (user.role === 'SUPER_ADMIN') {
      const companyId = user.effectiveCompanyId || requestedCompanyId;
      if (companyId) return companyId;
    }
    throw new ForbiddenException('Select a company context before changing recurring maintenance');
  }

  private planWhere(scope: { companyId: string | null }, alias: string) {
    if (!scope.companyId) return { where: '', values: [] as any[] };
    return { where: `WHERE ${alias}.companyId = ?`, values: [scope.companyId] };
  }

  private normalizeChecklist(value: any) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 50);
    if (typeof value === 'string') return value.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 50);
    return [];
  }

  private parseChecklist(value: any) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return String(value).split('\n').map((item) => item.trim()).filter(Boolean);
    }
  }

  private nextDueDate(base: Date, frequency: string, intervalDays: number) {
    const next = new Date(base);
    if (frequency === 'WEEKLY') next.setDate(next.getDate() + 7);
    else if (frequency === 'MONTHLY') next.setMonth(next.getMonth() + 1);
    else if (frequency === 'QUARTERLY') next.setMonth(next.getMonth() + 3);
    else if (frequency === 'SEMI_ANNUAL') next.setMonth(next.getMonth() + 6);
    else if (frequency === 'ANNUAL') next.setFullYear(next.getFullYear() + 1);
    else next.setDate(next.getDate() + Math.max(1, intervalDays || 30));
    return next;
  }

  private requiredDate(value: any, label: string) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) throw new BadRequestException(`${label} is required`);
    return date;
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
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.db.query(`
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
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
  }
}
