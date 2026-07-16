import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { UpdateTicketDto } from '../dto/update-ticket.dto';
import { TicketsGateway } from '../events/tickets.gateway';
import { TicketTimelineService } from './ticket-timeline.service';
import { EmailDeliveryService } from '../../notifications/services/email-delivery.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { UsageService } from '../../billing/services/usage.service';
import { LoggerService } from '../../../common/logger/logger.service';
import { TicketParticipantNotifierService } from './ticket-participant-notifier.service';
import * as crypto from 'crypto';

const validTransitions: Record<string, string[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'],
  ASSIGNED: ['IN_PROGRESS', 'RESOLVED', 'OPEN', 'ON_HOLD'],
  IN_PROGRESS: ['RESOLVED', 'ASSIGNED', 'OPEN', 'ON_HOLD'],
  ON_HOLD: ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'OPEN'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private gateway: TicketsGateway,
    private timeline: TicketTimelineService,
    private participantNotifier: TicketParticipantNotifierService,
    private emailDeliveryService: EmailDeliveryService,
    private notificationsService: NotificationsService,
    private usageService: UsageService,
    private readonly logger: LoggerService,
  ) {}

  private validateTransition(from: string, to: string) {
    if (from === to) return;
    const allowed = validTransitions[from];
    if (!allowed || !allowed.includes(to)) {
      throw new BadRequestException(`Invalid status transition from ${from} to ${to}`);
    }
  }

  private isGlobalTech(user: any) {
    return user?.role === 'GLOBAL_TECH';
  }

  private applyGlobalTechTicketScope(where: any) {
    where.OR = [
      { companyId: null },
      { createdBy: { userType: 'PUBLIC' } },
    ];
  }

  private async nextTicketNumber(prefix: string, startingCount: number) {
    let next = startingCount + 1;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const ticketNumber = `${prefix}-${next.toString().padStart(5, '0')}`;
      const existing = await this.prisma.ticket.findFirst({
        where: { ticketNumber },
        select: { id: true },
      });
      if (!existing) return ticketNumber;
      next += 1;
    }
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }

  async create(dto: CreateTicketDto, companyId: string | null, userId: string, userType: string) {
    if (!dto.contactName || !dto.contactEmail || !dto.contactPhone) {
      throw new BadRequestException('contactName, contactEmail, and contactPhone are required');
    }
    if (!dto.title) {
      throw new BadRequestException('title is required');
    }
    const companyIdForTicket = userType === 'PUBLIC' ? null : companyId;

    const count = await this.prisma.ticket.count({
      where: companyIdForTicket ? { companyId: companyIdForTicket } : { createdById: userId },
    });

    const prefix = companyIdForTicket
      ? `TKT-${companyIdForTicket.slice(0, 4).toUpperCase()}`
      : `TKT-PUB`;
    const ticketNumber = await this.nextTicketNumber(prefix, count);
    const trackingToken = crypto.randomBytes(16).toString('hex');

    const ticket = await this.prisma.ticket.create({
      data: {
        title: dto.title,
        description: dto.description,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        category: dto.category,
        subcategory: dto.subcategory,
        location: dto.location,
        latitude: dto.latitude,
        longitude: dto.longitude,
        priority: dto.priority,
        type: dto.type,
        assetId: dto.assetId,
        slaId: dto.slaId,
        ticketNumber,
        companyId: companyIdForTicket,
        createdById: userId,
        trackingToken,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        asset: true,
      },
    });

    await this.timeline.addEntry(ticket.id, userId, 'CREATED', `Ticket created with status ${dto.priority || 'MEDIUM'} priority`);
    await this.participantNotifier.notify(ticket.id, {
      action: 'Ticket opened',
      detail: `Priority: ${dto.priority || 'MEDIUM'}\nStatus: OPEN`,
      actorId: userId,
    });

    if (companyIdForTicket) {
      this.usageService.incrementUsage(companyIdForTicket, 'tickets').catch((e) => {
        this.logger.error('[UsageService] Failed to increment ticket usage: ' + e?.message);
      });
      this.gateway.notifyTicketUpdate(companyIdForTicket, 'ticket:created', ticket);
    }
    return ticket;
  }

  async createPublic(dto: CreateTicketDto) {
    const email = dto.contactEmail.toLowerCase().trim();
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          firstName: dto.contactName.trim() || email,
          lastName: 'Requester',
          phone: dto.contactPhone,
          role: 'CLIENT',
          userType: 'PUBLIC',
          emailVerified: true,
        },
      });
    }

    return this.create(dto, null, user.id, 'PUBLIC');
  }

  async findAll(user: any, query: { page?: number; limit?: number; status?: string; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (user.role === 'SUPER_ADMIN' && !user.companyId) {
      // Global super admin view: no tenant selected means all tickets, including public/free users.
    } else if (this.isGlobalTech(user)) {
      this.applyGlobalTechTicketScope(where);
    } else if (user.userType === 'PUBLIC') {
      where.createdById = user.id;
    } else {
      where.companyId = user.companyId;
    }
    await this.applyTicketScopes(where, user.permissionScopes, user);

    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search } },
        { ticketNumber: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          resolvedBy: { select: { id: true, firstName: true, lastName: true } },
          asset: { select: { id: true, name: true, assetType: true } },
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      data: data.map((ticket: any) => this.maskSensitiveTicket(ticket, user)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: any, maskSensitive = true) {
    const where: any = { id, deletedAt: null };

    if (user.role === 'SUPER_ADMIN' && !user.companyId) {
      // Global super admin detail view.
    } else if (this.isGlobalTech(user)) {
      this.applyGlobalTechTicketScope(where);
    } else if (user.userType === 'PUBLIC') {
      where.createdById = user.id;
    } else {
      where.companyId = user.companyId;
    }
    await this.applyTicketScopes(where, user.permissionScopes, user);
    const includeInternalTimeline = this.canViewInternalTimeline(user);

    const ticket = await this.prisma.ticket.findFirst({
      where,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        asset: true,
        sla: true,
        timeline: {
          where: includeInternalTimeline ? undefined : { isInternal: false },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { actor: { select: { id: true, firstName: true, lastName: true } } },
        },
        attachments: { include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } } },
        dispatches: true,
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.sla) {
      const elapsedMs = Date.now() - ticket.createdAt.getTime();
      const resolutionMs = ticket.sla.resolutionTimeMin * 60 * 1000;
      const pct = Math.min(100, Math.round((elapsedMs / resolutionMs) * 100));
      (ticket as any).slaStatus = pct >= 100 ? 'breached' : pct >= 75 ? 'at_risk' : 'within_sla';
      (ticket as any).slaProgress = pct;
    }
    return maskSensitive ? this.maskSensitiveTicket(ticket, user) : ticket;
  }

  private maskSensitiveTicket(ticket: any, user: any) {
    if (user?.role === 'SUPER_ADMIN' || user?.userType === 'PUBLIC' || user?.permissionSlugs?.includes('tickets.sensitive.view')) return ticket;
    const copy: any = { ...ticket };
    if (copy.contactEmail) {
      const [local, domain] = String(copy.contactEmail).split('@');
      copy.contactEmail = domain ? `${local.slice(0, 1)}***@${domain}` : '***';
    }
    if (copy.contactPhone) {
      const digits = String(copy.contactPhone).replace(/\D/g, '');
      copy.contactPhone = digits.length >= 4 ? `***-***-${digits.slice(-4)}` : '***';
    }
    if (copy.contactName) copy.contactName = `${String(copy.contactName).slice(0, 1)}***`;
    if (Array.isArray(copy.timeline)) {
      copy.timeline = this.canViewInternalTimeline(user)
        ? copy.timeline
        : copy.timeline.filter((entry: any) => !entry.isInternal);
    }
    return copy;
  }

  private canViewInternalTimeline(user: any) {
    return ['SUPER_ADMIN', 'GLOBAL_TECH', 'TENANT_ADMIN', 'TECHNICIAN'].includes(user?.role)
      || user?.permissionSlugs?.includes('tickets.sensitive.view');
  }

  private async applyTicketScopes(where: any, scopes: any[] | undefined, user: any) {
    const matching = (scopes || []).filter((scope) => String(scope.permissionSlug || '').startsWith('tickets.'));
    if (!matching.length || matching.some((scope) => scope.scopeType === 'ALL')) return;
    const alternatives: any[] = [];
    for (const scope of matching) {
      if (scope.scopeType === 'ASSIGNED') alternatives.push({ assignedToId: user.id });
      if (scope.scopeType === 'LOCATION' && user.location) alternatives.push({ location: user.location });
      if (scope.scopeType === 'CUSTOMERS') {
        const values = this.parseScopeValues(scope.scopeValues);
        if (values.length) alternatives.push({ companyId: { in: values } });
      }
      if (scope.scopeType === 'RELATIONSHIP') {
        const relationships = await this.prisma.query<any[]>(
          `SELECT resourceType, resourceId FROM AuthorizationRelationship
           WHERE subjectType = 'USER' AND subjectId = ?
             AND relationName IN ('viewer', 'editor', 'owner', 'technician')
             AND (expiresAt IS NULL OR expiresAt > NOW(3))
             AND resourceType IN ('TICKET', 'COMPANY')`,
          [user.id],
        ).catch(() => []);
        const ticketIds = relationships.filter((item: any) => item.resourceType === 'TICKET').map((item: any) => item.resourceId);
        const companyIds = relationships.filter((item: any) => item.resourceType === 'COMPANY').map((item: any) => item.resourceId);
        if (ticketIds.length) alternatives.push({ id: { in: ticketIds } });
        if (companyIds.length) alternatives.push({ companyId: { in: companyIds } });
      }
    }
    where.AND = [...(where.AND || []), alternatives.length ? { OR: alternatives } : { id: '__scope_denied__' }];
  }

  private parseScopeValues(value: any): string[] {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  async update(id: string, dto: UpdateTicketDto, user: any, userId?: string) {
    const ticket = await this.findOne(id, user, false);
    const companyId = ticket.companyId;
    const newStatus = dto.status;
    if (newStatus && newStatus !== ticket.status) {
      this.validateTransition(ticket.status, newStatus);
      if (newStatus === 'ON_HOLD' && !dto.onHoldReason) {
        throw new BadRequestException('onHoldReason is required when placing a ticket on hold');
      }
    }
    const data: any = {
      status: dto.status,
      priority: dto.priority,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      subcategory: dto.subcategory,
      location: dto.location,
      assignedToId: dto.assignedToId,
      onHoldReason: dto.onHoldReason,
      resolution: dto.resolution,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
    };
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    if (dto.assignedToId) {
      await this.assertAssignableUser(companyId, dto.assignedToId);
      if (!newStatus && ticket.status === 'OPEN') {
        data.status = 'ASSIGNED';
      }
    }
    if (newStatus && newStatus !== 'ON_HOLD' && ticket.status === 'ON_HOLD') {
      data.onHoldReason = null;
    }
    if (newStatus === 'RESOLVED' && ticket.status !== 'RESOLVED') {
      data.resolvedAt = new Date();
      data.resolvedById = userId;
      if (!data.resolution) {
        data.resolution = dto.resolution || '';
      }
    }
    if (newStatus && newStatus !== 'RESOLVED' && ticket.status === 'RESOLVED') {
      data.resolvedAt = null;
      data.resolvedById = null;
      data.resolution = null;
    }
    const updated = await this.prisma.ticket.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (newStatus && newStatus !== ticket.status) {
      await this.timeline.addEntry(id, userId!, 'STATUS_CHANGED', `Status changed from ${ticket.status} to ${newStatus}`, ticket.status, newStatus);
      if (newStatus === 'ON_HOLD') {
        await this.timeline.addEntry(id, userId!, 'HOLD', dto.onHoldReason || 'Ticket placed on hold');
        if (ticket.assignedToId) {
          const assignedUser = await this.prisma.user.findUnique({ where: { id: ticket.assignedToId } });
          if (assignedUser && companyId) {
            await this.notificationsService.create({ userId: assignedUser.id, companyId, title: `Ticket ${ticket.ticketNumber} on hold`, body: dto.onHoldReason, type: 'info', link: `/tickets/${id}` });
            if (assignedUser.email) {
              this.queueAssigneeEmail(ticket, assignedUser, 'Ticket placed on hold', 'Review the ticket for the current hold status.').catch(() => {});
            }
          }
        }
      }
      if (newStatus === 'RESOLVED') {
        await this.timeline.addEntry(id, userId!, 'RESOLVED', dto.resolution || 'Ticket resolved', ticket.status, 'RESOLVED');
        if (ticket.createdById && companyId) {
          await this.notificationsService.create({ userId: ticket.createdById, companyId, title: `Ticket ${ticket.ticketNumber} resolved`, body: dto.resolution || 'Ticket has been resolved', type: 'success', link: `/tickets/${id}` });
        }
      }
    }

    if (dto.assignedToId && dto.assignedToId !== ticket.assignedToId) {
      await this.timeline.addEntry(id, userId!, 'ASSIGNED', `Assigned to user ${dto.assignedToId}`, ticket.assignedToId || 'unassigned', dto.assignedToId);
      const assignedUser = await this.prisma.user.findUnique({ where: { id: dto.assignedToId } });
      if (assignedUser && companyId) {
        await this.notificationsService.create({ userId: assignedUser.id, companyId, title: `Ticket ${ticket.ticketNumber} assigned to you`, body: ticket.title, type: 'info', link: `/tickets/${id}` });
        if (assignedUser.email) {
          this.queueAssigneeEmail(ticket, assignedUser, 'Ticket assigned to you').catch(() => {});
        }
      }
    }

    const participantUpdate = this.describeTicketUpdate(ticket, updated, dto);
    if (participantUpdate) {
      await this.participantNotifier.notify(id, {
        action: participantUpdate.action,
        detail: participantUpdate.detail,
        actorId: userId,
      });
    }

    if (companyId) this.gateway.notifyTicketUpdate(companyId, 'ticket:updated', updated);
    return updated;
  }

  async remove(id: string, user: any) {
    const ticket = await this.findOne(id, user, false);
    const deleted = await this.prisma.ticket.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.participantNotifier.notify(id, {
      action: 'Ticket deleted',
      detail: 'The ticket was removed from the active ticket list.',
      actorId: user?.id,
    });
    if (ticket.companyId) this.gateway.notifyTicketUpdate(ticket.companyId, 'ticket:deleted', { id });
    return deleted;
  }

  async assign(id: string, targetUserId: string, user: any, actorUserId?: string) {
    const ticket = await this.findOne(id, user, false);
    const companyId = ticket.companyId;
    await this.assertAssignableUser(companyId, targetUserId);
    this.validateTransition(ticket.status, 'ASSIGNED');
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { assignedToId: targetUserId, status: 'ASSIGNED' },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    await this.timeline.addEntry(id, actorUserId || targetUserId, 'ASSIGNED', `Assigned to user`, ticket.assignedToId || 'unassigned', targetUserId);
    const assignedUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (assignedUser && companyId) {
      await this.notificationsService.create({ userId: assignedUser.id, companyId, title: `Ticket ${ticket.ticketNumber} assigned to you`, body: ticket.title, type: 'info', link: `/tickets/${id}` });
      if (assignedUser.email) {
        this.queueAssigneeEmail(ticket, assignedUser, 'Ticket assigned to you').catch(() => {});
      }
    }
    await this.participantNotifier.notify(id, {
      action: 'Ticket assigned',
      detail: assignedUser
        ? `Assigned to: ${[assignedUser.firstName, assignedUser.lastName].filter(Boolean).join(' ') || assignedUser.email}`
        : 'The ticket assignment changed.',
      actorId: actorUserId,
    });
    if (companyId) this.gateway.notifyTicketUpdate(companyId, 'ticket:assigned', updated);
    return updated;
  }

  async profitability(id: string, user: any) {
    const ticket = await this.findOne(id, user, false);
    const [timeEntries, dispatches] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: { ticketId: id },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.dispatch.findMany({ where: { ticketId: id, companyId: ticket.companyId || undefined } }),
    ]);

    const defaultLaborRate = Number(process.env.DEFAULT_LABOR_RATE_USD || 125);
    const defaultLaborCost = Number(process.env.DEFAULT_LABOR_COST_USD || 65);
    const travelFlatCost = Number(process.env.DEFAULT_TRAVEL_COST_USD || 35);
    const billableMinutes = timeEntries
      .filter((entry: any) => entry.billable)
      .reduce((sum: number, entry: any) => sum + this.timeEntryMinutes(entry), 0);
    const nonBillableMinutes = timeEntries
      .filter((entry: any) => !entry.billable)
      .reduce((sum: number, entry: any) => sum + this.timeEntryMinutes(entry), 0);
    const laborRevenue = Math.round((billableMinutes / 60) * defaultLaborRate * 100) / 100;
    const laborCost = Math.round(((billableMinutes + nonBillableMinutes) / 60) * defaultLaborCost * 100) / 100;
    const travelCost = dispatches.length * travelFlatCost;
    const estimatedCost = Math.round((laborCost + travelCost) * 100) / 100;
    const estimatedMargin = Math.round((laborRevenue - estimatedCost) * 100) / 100;

    return {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        status: ticket.status,
        contract: ticket.contract ? { id: ticket.contract.id, name: ticket.contract.name, status: ticket.contract.status } : null,
      },
      totals: {
        billableMinutes,
        nonBillableMinutes,
        dispatchCount: dispatches.length,
        laborRevenue,
        laborCost,
        travelCost,
        estimatedCost,
        estimatedMargin,
        marginPct: laborRevenue ? Math.round((estimatedMargin / laborRevenue) * 1000) / 10 : 0,
      },
      assumptions: {
        laborRateUsd: defaultLaborRate,
        laborCostUsd: defaultLaborCost,
        travelCostUsd: travelFlatCost,
        partsCostUsd: 0,
      },
      timeEntries: timeEntries.map((entry: any) => ({
        id: entry.id,
        technician: entry.user ? [entry.user.firstName, entry.user.lastName].filter(Boolean).join(' ') : entry.userId,
        minutes: this.timeEntryMinutes(entry),
        billable: entry.billable,
        description: entry.description,
      })),
    };
  }

  async requestApproval(id: string, user: any, dto: { checkpoint?: string; detail?: string; amount?: number }) {
    const ticket = await this.findOne(id, user, false);
    const checkpoint = String(dto.checkpoint || 'WORK_APPROVAL').toUpperCase();
    const payload = {
      approvalId: crypto.randomUUID(),
      checkpoint,
      detail: dto.detail?.trim() || 'Customer approval requested before work continues.',
      amount: Number.isFinite(Number(dto.amount)) ? Number(dto.amount) : null,
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    };
    const entry = await this.timeline.addEntry(id, user.id, 'APPROVAL_REQUESTED', JSON.stringify(payload), undefined, 'PENDING', false);
    if (ticket.companyId) this.gateway.notifyTicketUpdate(ticket.companyId, 'ticket:approval-requested', entry);
    return { ...payload, timelineEntryId: entry.id };
  }

  async decideApproval(id: string, approvalId: string, user: any, dto: { decision?: string; comment?: string }) {
    const ticket = await this.findOne(id, user, false);
    const decision = String(dto.decision || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new BadRequestException('decision must be APPROVED or REJECTED');
    }
    const approval = await this.findApprovalTimeline(id, approvalId);
    const payload = {
      approvalId,
      decision,
      comment: dto.comment?.trim() || null,
      decidedAt: new Date().toISOString(),
      requestedCheckpoint: approval?.checkpoint || null,
    };
    const entry = await this.timeline.addEntry(id, user.id, `APPROVAL_${decision}`, JSON.stringify(payload), 'PENDING', decision, false);
    if (ticket.companyId) this.gateway.notifyTicketUpdate(ticket.companyId, 'ticket:approval-decided', entry);
    return { ...payload, timelineEntryId: entry.id };
  }

  async listApprovals(id: string, user: any) {
    await this.findOne(id, user, false);
    const rows = await this.prisma.ticketTimeline.findMany({
      where: { ticketId: id, action: { in: ['APPROVAL_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED'] } },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    });
    const approvals = new Map<string, any>();
    for (const row of rows as any[]) {
      const payload = this.safeParse(row.comment);
      const approvalId = payload.approvalId || row.id;
      const current = approvals.get(approvalId) || {};
      if (row.action === 'APPROVAL_REQUESTED') {
        approvals.set(approvalId, { ...payload, timelineEntryId: row.id, requestedBy: row.actor, status: current.status || 'PENDING' });
      } else {
        approvals.set(approvalId, { ...current, status: payload.decision, decision: payload.decision, decidedAt: payload.decidedAt, decisionComment: payload.comment, decidedBy: row.actor });
      }
    }
    return Array.from(approvals.values()).reverse();
  }

  private async assertAssignableUser(companyId: string | null, userId: string) {
    if (!companyId) throw new BadRequestException('Ticket has no company context');
    const target = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, role: true },
    });
    if (!target || !['TECHNICIAN', 'TENANT_ADMIN'].includes(String(target.role))) {
      throw new BadRequestException('Assignee must be an active user in the current tenant');
    }
  }

  private timeEntryMinutes(entry: any) {
    if (Number.isFinite(Number(entry.duration)) && Number(entry.duration) > 0) return Number(entry.duration);
    if (entry.startTime && entry.endTime) {
      return Math.max(0, Math.round((new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / 60000));
    }
    return 0;
  }

  private async findApprovalTimeline(ticketId: string, approvalId: string) {
    const rows = await this.prisma.ticketTimeline.findMany({
      where: { ticketId, action: 'APPROVAL_REQUESTED' },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row: any) => this.safeParse(row.comment)).find((payload) => payload.approvalId === approvalId) || null;
  }

  private safeParse(value: any) {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value || {};
    } catch {
      return {};
    }
  }

  async resolve(id: string, resolution: string, user: any, userId?: string) {
    const ticket = await this.findOne(id, user, false);
    const companyId = ticket.companyId;
    this.validateTransition(ticket.status, 'RESOLVED');
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { status: 'RESOLVED', resolution, resolvedAt: new Date(), resolvedById: userId },
      include: {
        resolvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    await this.timeline.addEntry(id, userId!, 'RESOLVED', resolution || 'Ticket resolved', ticket.status, 'RESOLVED');
    if (ticket.createdById && companyId) {
      await this.notificationsService.create({ userId: ticket.createdById, companyId, title: `Ticket ${ticket.ticketNumber} resolved`, body: resolution || 'Ticket has been resolved', type: 'success', link: `/tickets/${id}` });
    }
    await this.participantNotifier.notify(id, {
      action: 'Ticket resolved',
      detail: resolution || 'The ticket has been resolved.',
      actorId: userId,
    });
    if (companyId) this.gateway.notifyTicketUpdate(companyId, 'ticket:resolved', updated);
    return updated;
  }

  private async queueAssigneeEmail(ticket: any, assignedUser: any, action: string, detail?: string) {
    if (!assignedUser?.email) return;
    const prepared = await this.emailDeliveryService.prepareTicketEmail({
      companyId: ticket.companyId,
      recipientEmail: assignedUser.email,
      recipientName: [assignedUser.firstName, assignedUser.lastName].filter(Boolean).join(' '),
      ticketNumber: ticket.ticketNumber,
      ticketTitle: ticket.title,
      action,
      detail,
      ticketUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${ticket.id}`,
      eventType: 'TICKET_PARTICIPANT',
    });
    await this.emailDeliveryService.enqueue({
      companyId: ticket.companyId,
      ticketId: ticket.id,
      userId: assignedUser.id,
      recipientEmail: assignedUser.email,
      recipientName: [assignedUser.firstName, assignedUser.lastName].filter(Boolean).join(' '),
      eventType: 'TICKET_ASSIGNEE',
      eventCategory: 'ticket_assignment',
      ...prepared,
    });
  }

  private describeTicketUpdate(ticket: any, updated: any, dto: UpdateTicketDto) {
    const changes: string[] = [];
    const addChange = (label: string, oldValue: any, newValue: any) => {
      if (newValue !== undefined && String(oldValue ?? '') !== String(newValue ?? '')) {
        changes.push(`${label}: ${oldValue || 'None'} -> ${newValue || 'None'}`);
      }
    };

    addChange('Status', ticket.status, updated.status);
    addChange('Priority', ticket.priority, updated.priority);
    addChange('Title', ticket.title, updated.title);
    addChange('Description', ticket.description, updated.description);
    addChange('Category', ticket.category, updated.category);
    addChange('Subcategory', ticket.subcategory, updated.subcategory);
    addChange('Location', ticket.location, updated.location);
    addChange('Affected user', ticket.contactName, updated.contactName);
    addChange('Affected user email', ticket.contactEmail, updated.contactEmail);
    addChange('Affected user phone', ticket.contactPhone, updated.contactPhone);

    if (dto.assignedToId !== undefined && dto.assignedToId !== ticket.assignedToId) {
      const assignee = updated.assignedTo
        ? [updated.assignedTo.firstName, updated.assignedTo.lastName].filter(Boolean).join(' ')
        : null;
      changes.push(`Assignment: ${assignee || 'Unassigned'}`);
    }
    if (dto.onHoldReason && dto.onHoldReason !== ticket.onHoldReason) {
      changes.push(`Hold reason: ${dto.onHoldReason}`);
    }
    if (dto.resolution && dto.resolution !== ticket.resolution) {
      changes.push(`Resolution: ${dto.resolution}`);
    }
    if (!changes.length) return null;

    let action = 'Ticket details updated';
    if (updated.status === 'RESOLVED' && ticket.status !== 'RESOLVED') action = 'Ticket resolved';
    else if (updated.status === 'ON_HOLD' && ticket.status !== 'ON_HOLD') action = 'Ticket placed on hold';
    else if (updated.status !== ticket.status) action = `Status changed to ${String(updated.status).replaceAll('_', ' ')}`;
    else if (dto.assignedToId !== undefined && dto.assignedToId !== ticket.assignedToId) action = 'Ticket assignment changed';

    return { action, detail: changes.join('\n') };
  }
}
