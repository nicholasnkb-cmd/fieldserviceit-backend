import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { TicketsGateway } from '../../tickets/events/tickets.gateway';

@Injectable()
export class FieldServiceService {
  constructor(private prisma: PrismaService, private gateway: TicketsGateway) {}

  async mobileSummary(companyId: string, user?: { id?: string; role?: string }) {
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

  async dispatch(ticketId: string, technicianId: string, companyId: string) {
    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, companyId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const result = await this.prisma.dispatch.create({
      data: { ticketId, technicianId, companyId, status: 'DISPATCHED' },
      include: { ticket: true, technician: { select: { id: true, firstName: true, lastName: true } } },
    });
    this.gateway.notifyTicketUpdate(companyId, 'dispatch:created', result);
    return result;
  }

  async getDispatchBoard(companyId: string) {
    return this.prisma.dispatch.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        ticket: { select: { id: true, ticketNumber: true, title: true, priority: true, status: true } },
        technician: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
  }

  async updateStatus(id: string, status: string, companyId: string) {
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
    this.gateway.notifyTicketUpdate(companyId, 'dispatch:updated', result);
    return result;
  }

  async addNotes(id: string, notes: string, companyId: string) {
    const dispatch = await this.prisma.dispatch.findFirst({ where: { id, companyId } });
    if (!dispatch) throw new NotFoundException('Dispatch not found');

    const result = await this.prisma.dispatch.update({ where: { id }, data: { notes } });
    this.gateway.notifyTicketUpdate(companyId, 'dispatch:updated', result);
    return result;
  }

  async addSignature(id: string, signature: string, companyId: string) {
    const dispatch = await this.prisma.dispatch.findFirst({ where: { id, companyId } });
    if (!dispatch) throw new NotFoundException('Dispatch not found');

    const result = await this.prisma.dispatch.update({ where: { id }, data: { customerSignature: signature, status: 'COMPLETED', completedAt: new Date() } });
    this.gateway.notifyTicketUpdate(companyId, 'dispatch:completed', result);
    return result;
  }

  async addPhotos(id: string, photoUrls: string[], companyId: string) {
    const dispatch = await this.prisma.dispatch.findFirst({ where: { id, companyId } });
    if (!dispatch) throw new NotFoundException('Dispatch not found');

    const existing: string[] = JSON.parse(dispatch.photoUrls || '[]');
    const updated = [...existing, ...photoUrls];

    const result = await this.prisma.dispatch.update({ where: { id }, data: { photoUrls: JSON.stringify(updated) } });
    this.gateway.notifyTicketUpdate(companyId, 'dispatch:updated', result);
    return result;
  }
}
