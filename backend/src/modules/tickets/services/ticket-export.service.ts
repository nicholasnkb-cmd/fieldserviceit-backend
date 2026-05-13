import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class TicketExportService {
  constructor(private prisma: PrismaService) {}

  async exportCsv(companyId: string, status?: string) {
    const where: any = { companyId, deletedAt: null };
    if (status) where.status = status;

    const tickets = await this.prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        assignedTo: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    const header = 'TicketNumber,Title,Status,Priority,Category,ContactName,ContactEmail,ContactPhone,CreatedBy,AssignedTo,CreatedAt,ResolvedAt,Resolution\n';
    const rows = tickets.map((t) =>
      [
        t.ticketNumber,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        t.status,
        t.priority,
        t.category || '',
        t.contactName || '',
        t.contactEmail || '',
        t.contactPhone || '',
        t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}` : '',
        t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '',
        t.createdAt?.toISOString() || '',
        t.resolvedAt?.toISOString() || '',
        `"${(t.resolution || '').replace(/"/g, '""')}"`,
      ].join(',')
    ).join('\n');

    return header + rows;
  }
}
