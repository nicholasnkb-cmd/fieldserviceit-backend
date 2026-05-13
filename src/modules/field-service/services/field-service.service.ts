import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { TicketsGateway } from '../../tickets/events/tickets.gateway';

@Injectable()
export class FieldServiceService {
  constructor(private prisma: PrismaService, private gateway: TicketsGateway) {}

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

    const updateData: any = { status };
    if (status === 'EN_ROUTE') updateData.arrivedAt = new Date();
    if (status === 'COMPLETED') updateData.completedAt = new Date();

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
