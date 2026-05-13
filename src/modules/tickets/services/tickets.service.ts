import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { UpdateTicketDto } from '../dto/update-ticket.dto';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { TicketsGateway } from '../events/tickets.gateway';
import { TicketTimelineService } from './ticket-timeline.service';
import { EmailService } from '../../notifications/services/email.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import * as crypto from 'crypto';

const validTransitions: Record<string, string[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'OPEN', 'ON_HOLD'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED', 'ASSIGNED', 'OPEN', 'ON_HOLD'],
  ON_HOLD: ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'OPEN'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private gateway: TicketsGateway,
    private timeline: TicketTimelineService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
  ) {}

  private validateTransition(from: string, to: string) {
    if (from === to) return;
    const allowed = validTransitions[from];
    if (!allowed || !allowed.includes(to)) {
      throw new BadRequestException(`Invalid status transition from ${from} to ${to}`);
    }
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
    const ticketNumber = `${prefix}-${(count + 1).toString().padStart(5, '0')}`;
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

    if (companyIdForTicket) this.gateway.notifyTicketUpdate(companyIdForTicket, 'ticket:created', ticket);
    return ticket;
  }

  async findAll(user: any, query: { page?: number; limit?: number; status?: string; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (user.userType === 'PUBLIC') {
      where.createdById = user.id;
    } else {
      where.companyId = user.companyId;
    }

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

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, user: any) {
    const where: any = { id, deletedAt: null };

    if (user.userType === 'PUBLIC') {
      where.createdById = user.id;
    } else {
      where.companyId = user.companyId;
    }

    const ticket = await this.prisma.ticket.findFirst({
      where,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        asset: true,
        sla: true,
        timeline: { orderBy: { createdAt: 'desc' }, take: 50, include: { actor: { select: { id: true, firstName: true, lastName: true } } } },
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
    return ticket;
  }

  async update(id: string, dto: UpdateTicketDto, companyId: string, userId?: string) {
    const ticket = await this.findOne(id, { companyId, userType: 'BUSINESS' });
    const newStatus = dto.status;
    if (newStatus && newStatus !== ticket.status) {
      this.validateTransition(ticket.status, newStatus);
      if (newStatus === 'ON_HOLD' && !dto.onHoldReason) {
        throw new BadRequestException('onHoldReason is required when placing a ticket on hold');
      }
    }
    const data: any = { ...dto };
    if (dto.assignedToId) {
      data.assignedToId = dto.assignedToId;
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
        const holdActor = await this.prisma.user.findUnique({ where: { id: userId } });
        if (ticket.assignedToId) {
          const assignedUser = await this.prisma.user.findUnique({ where: { id: ticket.assignedToId } });
          if (assignedUser) {
            await this.notificationsService.create({ userId: assignedUser.id, companyId, title: `Ticket ${ticket.ticketNumber} on hold`, body: dto.onHoldReason, type: 'info', link: `/tickets/${id}` });
            if (assignedUser.email) {
              this.emailService.sendNotificationEmail(assignedUser.email, `Ticket ${ticket.ticketNumber} on hold`, `<p>Ticket <strong>${ticket.ticketNumber}</strong> has been placed on hold.</p><p>Reason: ${dto.onHoldReason}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${id}">View Ticket</a></p>`).catch(() => {});
            }
          }
        }
      }
      if (newStatus === 'RESOLVED') {
        await this.timeline.addEntry(id, userId!, 'RESOLVED', dto.resolution || 'Ticket resolved', ticket.status, 'RESOLVED');
        if (ticket.createdById) {
          await this.notificationsService.create({ userId: ticket.createdById, companyId, title: `Ticket ${ticket.ticketNumber} resolved`, body: dto.resolution || 'Ticket has been resolved', type: 'success', link: `/tickets/${id}` });
          if ((ticket as any).contactEmail) {
            this.emailService.sendNotificationEmail((ticket as any).contactEmail, `Ticket ${ticket.ticketNumber} resolved`, `<p>Your ticket <strong>${ticket.ticketNumber}</strong> has been resolved.</p><p>Resolution: ${dto.resolution || 'N/A'}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${id}">View Ticket</a></p>`).catch(() => {});
          }
        }
      }
    }

    if (dto.assignedToId && dto.assignedToId !== ticket.assignedToId) {
      await this.timeline.addEntry(id, userId!, 'ASSIGNED', `Assigned to user ${dto.assignedToId}`, ticket.assignedToId || 'unassigned', dto.assignedToId);
      const assignedUser = await this.prisma.user.findUnique({ where: { id: dto.assignedToId } });
      if (assignedUser) {
        await this.notificationsService.create({ userId: assignedUser.id, companyId, title: `Ticket ${ticket.ticketNumber} assigned to you`, body: ticket.title, type: 'info', link: `/tickets/${id}` });
        if (assignedUser.email) {
          this.emailService.sendNotificationEmail(assignedUser.email, `Ticket ${ticket.ticketNumber} assigned to you`, `<p>Ticket <strong>${ticket.ticketNumber}</strong> has been assigned to you.</p><p>Title: ${ticket.title}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${id}">View Ticket</a></p>`).catch(() => {});
        }
      }
    }

    this.gateway.notifyTicketUpdate(companyId, 'ticket:updated', updated);
    return updated;
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, { companyId, userType: 'BUSINESS' });
    const deleted = await this.prisma.ticket.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    this.gateway.notifyTicketUpdate(companyId, 'ticket:deleted', { id });
    return deleted;
  }

  async assign(id: string, targetUserId: string, companyId: string, actorUserId?: string) {
    const ticket = await this.findOne(id, { companyId, userType: 'BUSINESS' });
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
    if (assignedUser) {
      await this.notificationsService.create({ userId: assignedUser.id, companyId, title: `Ticket ${ticket.ticketNumber} assigned to you`, body: ticket.title, type: 'info', link: `/tickets/${id}` });
      if (assignedUser.email) {
        this.emailService.sendNotificationEmail(assignedUser.email, `Ticket ${ticket.ticketNumber} assigned to you`, `<p>Ticket <strong>${ticket.ticketNumber}</strong> has been assigned to you.</p><p>Title: ${ticket.title}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${id}">View Ticket</a></p>`).catch(() => {});
      }
    }
    this.gateway.notifyTicketUpdate(companyId, 'ticket:assigned', updated);
    return updated;
  }

  async resolve(id: string, resolution: string, companyId: string, userId?: string) {
    const ticket = await this.findOne(id, { companyId, userType: 'BUSINESS' });
    this.validateTransition(ticket.status, 'RESOLVED');
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { status: 'RESOLVED', resolution, resolvedAt: new Date(), resolvedById: userId },
      include: {
        resolvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    await this.timeline.addEntry(id, userId!, 'RESOLVED', resolution || 'Ticket resolved', ticket.status, 'RESOLVED');
    if (ticket.createdById) {
      await this.notificationsService.create({ userId: ticket.createdById, companyId, title: `Ticket ${ticket.ticketNumber} resolved`, body: resolution || 'Ticket has been resolved', type: 'success', link: `/tickets/${id}` });
      if ((ticket as any).contactEmail) {
        this.emailService.sendNotificationEmail((ticket as any).contactEmail, `Ticket ${ticket.ticketNumber} resolved`, `<p>Your ticket <strong>${ticket.ticketNumber}</strong> has been resolved.</p><p>Resolution: ${resolution || 'N/A'}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${id}">View Ticket</a></p>`).catch(() => {});
      }
    }
    this.gateway.notifyTicketUpdate(companyId, 'ticket:resolved', updated);
    return updated;
  }
}
