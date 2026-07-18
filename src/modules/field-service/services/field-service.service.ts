import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { TicketsGateway } from '../../tickets/events/tickets.gateway';
import { TicketParticipantNotifierService } from '../../tickets/services/ticket-participant-notifier.service';

@Injectable()
export class FieldServiceService {
  constructor(
    private prisma: PrismaService,
    private gateway: TicketsGateway,
    private participantNotifier: TicketParticipantNotifierService,
  ) {}

  async mobileSummary(companyId: string | null, user?: { id?: string; role?: string }) {
    const board = await this.getDispatchBoard(companyId);
    const technicianBoard = user?.role === 'TECHNICIAN'
      ? board.filter((item: any) => item.technicianId === user.id)
      : board;
    const counts = technicianBoard.reduce<Record<string, number>>((acc, item: any) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    const active = technicianBoard.filter((item: any) => !['COMPLETED', 'CANCELLED'].includes(item.status));
    return {
      counts,
      activeCount: active.length,
      enRouteCount: counts.EN_ROUTE || 0,
      onSiteCount: counts.ON_SITE || 0,
      completedToday: technicianBoard.filter((item: any) => item.completedAt && new Date(item.completedAt).toDateString() === new Date().toDateString()).length,
    };
  }

  async recommendTechnicians(ticketId: string, companyId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, companyId, deletedAt: null },
      include: { asset: true, sla: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const technicians = await this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        role: { in: ['TECHNICIAN', 'TENANT_ADMIN'] },
      },
      include: {
        dispatches: {
          where: { status: { in: ['DISPATCHED', 'EN_ROUTE', 'ON_SITE'] } },
          include: { ticket: { select: { priority: true, location: true, asset: { select: { assetType: true } } } } },
        },
        assignedTickets: {
          where: { deletedAt: null, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'] } },
          select: { id: true, priority: true, category: true, location: true, asset: { select: { assetType: true } } },
        },
      },
    });

    const recommendations = technicians.map((tech: any) => {
      const activeDispatches = tech.dispatches.length;
      const activeTickets = tech.assignedTickets.length;
      const sameLocationJobs = [...tech.dispatches, ...tech.assignedTickets]
        .filter((item: any) => item.ticket?.location === ticket.location || item.location === ticket.location).length;
      const sameAssetTypeJobs = [...tech.dispatches, ...tech.assignedTickets]
        .filter((item: any) => (item.ticket?.asset?.assetType || item.asset?.assetType) === ticket.asset?.assetType).length;
      const workloadPenalty = activeDispatches * 12 + activeTickets * 6;
      const slaUrgency = ticket.slaId || ['CRITICAL', 'HIGH'].includes(String(ticket.priority).toUpperCase()) ? 18 : 0;
      const locationScore = ticket.location && sameLocationJobs ? 14 : 0;
      const assetScore = ticket.asset?.assetType && sameAssetTypeJobs ? 12 : 0;
      const score = Math.max(0, 70 + slaUrgency + locationScore + assetScore - workloadPenalty);
      const reasons = [
        slaUrgency ? 'SLA or high-priority work needs faster assignment' : null,
        locationScore ? 'Already has nearby work' : null,
        assetScore ? `Recent work on ${ticket.asset?.assetType} assets` : null,
        activeDispatches || activeTickets ? `${activeDispatches + activeTickets} active job${activeDispatches + activeTickets === 1 ? '' : 's'}` : 'No active workload found',
      ].filter(Boolean);
      return {
        technicianId: tech.id,
        name: [tech.firstName, tech.lastName].filter(Boolean).join(' ') || tech.email,
        role: tech.role,
        score,
        activeDispatches,
        activeTickets,
        reasons,
      };
    });

    return {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        priority: ticket.priority,
        location: ticket.location,
        assetType: ticket.asset?.assetType || null,
      },
      recommendations: recommendations.sort((a, b) => b.score - a.score),
    };
  }

  async offlineJobPacket(id: string, companyId: string) {
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id, companyId },
      include: {
        technician: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        ticket: {
          include: {
            asset: true,
            sla: true,
            attachments: true,
            timeline: { orderBy: { createdAt: 'desc' }, take: 20 },
          },
        },
      },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');

    const relatedArticles = await this.prisma.query<any[]>(
      `SELECT id, title, summary, category, tags, updatedAt
       FROM KbArticle
       WHERE companyId = ?
         AND status IN ('PUBLISHED', 'REVIEW')
         AND (
           category = ? OR tags LIKE ? OR title LIKE ?
         )
       ORDER BY updatedAt DESC
       LIMIT 8`,
      [
        companyId,
        dispatch.ticket.category || '',
        `%${dispatch.ticket.subcategory || dispatch.ticket.category || dispatch.ticket.asset?.assetType || ''}%`,
        `%${dispatch.ticket.asset?.assetType || dispatch.ticket.category || ''}%`,
      ],
    ).catch(() => []);

    return {
      generatedAt: new Date().toISOString(),
      cacheHint: 'Store this packet for mobile offline use before the technician leaves service coverage.',
      dispatch,
      checklist: [
        'Confirm customer contact and site access',
        'Review asset history and recent ticket timeline',
        'Capture before and after photos',
        'Record labor, parts, and resolution notes',
        'Collect customer signature when work is complete',
      ],
      relatedArticles,
    };
  }

  async dispatch(ticketId: string, technicianId: string, companyId: string, actorUserId?: string) {
    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, companyId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const technician = await this.prisma.user.findFirst({
      where: {
        id: technicianId,
        companyId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, role: true },
    });
    if (!technician || !['TECHNICIAN', 'TENANT_ADMIN'].includes(String(technician.role))) {
      throw new BadRequestException('Technician must be an active user in the current tenant');
    }

    const result = await this.prisma.dispatch.create({
      data: { ticketId, technicianId, companyId, status: 'DISPATCHED' },
      include: { ticket: true, technician: { select: { id: true, firstName: true, lastName: true } } },
    });
    await this.participantNotifier.notify(ticketId, {
      action: 'Technician dispatched',
      detail: `Technician: ${[result.technician?.firstName, result.technician?.lastName].filter(Boolean).join(' ') || technicianId}`,
      actorId: actorUserId,
    });
    this.gateway.notifyTicketUpdate(companyId, 'dispatch:created', result);
    return result;
  }

  async getDispatchBoard(companyId: string | null) {
    return this.prisma.dispatch.findMany({
      where: companyId ? { companyId } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        ticket: { select: { id: true, ticketNumber: true, title: true, priority: true, status: true } },
        technician: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
  }

  async updateStatus(id: string, status: string, companyId: string, actorUserId?: string) {
    const dispatch = await this.prisma.dispatch.findFirst({ where: { id, companyId } });
    if (!dispatch) throw new NotFoundException('Dispatch not found');
    const normalized = String(status || '').toUpperCase();
    if (!['DISPATCHED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELLED'].includes(normalized)) {
      throw new BadRequestException('Invalid dispatch status');
    }

    const updateData: any = { status: normalized };
    if (normalized === 'ON_SITE') updateData.arrivedAt = new Date();
    if (normalized === 'COMPLETED') updateData.completedAt = new Date();

    const result = await this.prisma.dispatch.update({ where: { id }, data: updateData });
    await this.participantNotifier.notify(dispatch.ticketId, {
      action: `Field visit status changed to ${normalized.replaceAll('_', ' ')}`,
      detail: `Previous status: ${dispatch.status}\nNew status: ${normalized}`,
      actorId: actorUserId,
    });
    this.gateway.notifyTicketUpdate(companyId, 'dispatch:updated', result);
    return result;
  }

  async bulkUpdateStatus(ids: string[], status: string, companyId: string, actorUserId?: string) {
    const uniqueIds = [...new Set((ids || []).map(String))].slice(0, 100);
    if (!uniqueIds.length) throw new BadRequestException('Select at least one dispatch');
    const updated = [];
    for (const id of uniqueIds) updated.push(await this.updateStatus(id, status, companyId, actorUserId));
    return { updated: updated.length };
  }

  async addNotes(id: string, notes: string, companyId: string, actorUserId?: string) {
    const dispatch = await this.prisma.dispatch.findFirst({ where: { id, companyId } });
    if (!dispatch) throw new NotFoundException('Dispatch not found');

    const result = await this.prisma.dispatch.update({ where: { id }, data: { notes } });
    await this.participantNotifier.notify(dispatch.ticketId, {
      action: 'Field service notes updated',
      detail: 'The technician updated the field visit notes.',
      actorId: actorUserId,
      eventCategory: 'dispatch',
    });
    this.gateway.notifyTicketUpdate(companyId, 'dispatch:updated', result);
    return result;
  }

  async addSignature(id: string, signature: string, companyId: string, actorUserId?: string) {
    const dispatch = await this.prisma.dispatch.findFirst({ where: { id, companyId } });
    if (!dispatch) throw new NotFoundException('Dispatch not found');

    const result = await this.prisma.dispatch.update({ where: { id }, data: { customerSignature: signature, status: 'COMPLETED', completedAt: new Date() } });
    await this.participantNotifier.notify(dispatch.ticketId, {
      action: 'Customer signature captured',
      detail: 'The field visit was marked completed.',
      actorId: actorUserId,
    });
    this.gateway.notifyTicketUpdate(companyId, 'dispatch:completed', result);
    return result;
  }

  async addPhotos(id: string, photoUrls: string[], companyId: string, actorUserId?: string) {
    const dispatch = await this.prisma.dispatch.findFirst({ where: { id, companyId } });
    if (!dispatch) throw new NotFoundException('Dispatch not found');

    const existing: string[] = JSON.parse(dispatch.photoUrls || '[]');
    const updated = [...existing, ...photoUrls];

    const result = await this.prisma.dispatch.update({ where: { id }, data: { photoUrls: JSON.stringify(updated) } });
    await this.participantNotifier.notify(dispatch.ticketId, {
      action: 'Field service photos added',
      detail: `${photoUrls.length} photo${photoUrls.length === 1 ? '' : 's'} added.`,
      actorId: actorUserId,
    });
    this.gateway.notifyTicketUpdate(companyId, 'dispatch:updated', result);
    return result;
  }
}
