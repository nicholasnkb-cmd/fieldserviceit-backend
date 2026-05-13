import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class TicketTimelineService {
  constructor(private prisma: PrismaService) {}

  async addEntry(ticketId: string, actorId: string, action: string, comment?: string, oldValue?: string, newValue?: string, isInternal?: boolean) {
    return this.prisma.ticketTimeline.create({
      data: { ticketId, actorId, action, comment, oldValue, newValue, isInternal: isInternal ?? false },
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async getTimeline(ticketId: string) {
    return this.prisma.ticketTimeline.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    });
  }
}
