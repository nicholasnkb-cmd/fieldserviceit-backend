import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService) {}

  async getTicketSummary(companyId: string, from?: string, to?: string) {
    const dateFilter: any = { companyId, deletedAt: null };
    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.gte = new Date(from);
      if (to) dateFilter.createdAt.lte = new Date(to);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const resolvedTodayFilter = { companyId, status: 'RESOLVED', resolvedAt: { gte: todayStart }, deletedAt: null };

    const [total, byStatus, byPriority, resolvedToday, resolvedTickets] = await Promise.all([
      this.prisma.ticket.count({ where: dateFilter }),
      this.prisma.ticket.groupBy({ by: ['status'], where: dateFilter, _count: true }),
      this.prisma.ticket.groupBy({ by: ['priority'], where: dateFilter, _count: true }),
      this.prisma.ticket.count({ where: resolvedTodayFilter }),
      this.prisma.ticket.findMany({ where: { companyId, status: 'RESOLVED', resolvedAt: { not: null }, deletedAt: null }, select: { createdAt: true, resolvedAt: true } }),
    ]);

    const avgResolutionTime = resolvedTickets.length
      ? Math.round(resolvedTickets.reduce((sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0) / resolvedTickets.length / (1000 * 60))
      : 0;

    return { total, byStatus, byPriority, resolvedToday, avgResolutionTime };
  }

  async getSlaCompliance(companyId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { companyId, slaId: { not: null }, status: 'RESOLVED', resolvedAt: { not: null } },
      include: { sla: true },
    });

    const compliant = tickets.filter((t) => {
      if (!t.resolvedAt || !t.sla) return false;
      const resolutionMs = t.resolvedAt.getTime() - t.createdAt.getTime();
      return resolutionMs <= t.sla.resolutionTimeMin * 60 * 1000;
    });

    return { total: tickets.length, compliant: compliant.length, rate: tickets.length ? (compliant.length / tickets.length) * 100 : 0 };
  }

  async getTechnicianPerformance(companyId: string) {
    const technicians = await this.prisma.user.findMany({
      where: { companyId, role: 'TECHNICIAN' },
      include: {
        assignedTickets: { where: { status: 'RESOLVED' }, select: { id: true, createdAt: true, resolvedAt: true } },
        dispatches: true,
      },
    });

    return technicians.map((t) => ({
      id: t.id,
      name: `${t.firstName} ${t.lastName}`,
      resolvedTickets: t.assignedTickets.length,
      avgResolutionTime: this.calculateAvgResolution(t.assignedTickets),
      totalDispatches: t.dispatches.length,
    }));
  }

  async getAssetInventory(companyId: string) {
    return this.prisma.asset.groupBy({
      by: ['assetType'],
      where: { companyId, deletedAt: null },
      _count: true,
    });
  }

  async getActivityFeed(companyId: string, limit = 30) {
    return this.prisma.ticketTimeline.findMany({
      where: { ticket: { companyId, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
        ticket: { select: { id: true, ticketNumber: true, title: true, status: true } },
      },
    });
  }

  private calculateAvgResolution(tickets: any[]): number {
    if (!tickets.length) return 0;
    const total = tickets.reduce((sum: number, t: any) => {
      if (!t.resolvedAt) return sum;
      return sum + (t.resolvedAt.getTime() - t.createdAt.getTime());
    }, 0);
    return Math.round(total / tickets.length / (1000 * 60));
  }
}
