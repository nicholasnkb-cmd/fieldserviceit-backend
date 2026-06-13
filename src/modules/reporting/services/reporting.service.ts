import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { safeJson, TenantCustomization } from '../../settings/tenant-customization';

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService) {}

  async getPublicOperations() {
    const [openRows, routeRows, slaRows, activityRows] = await Promise.all([
      this.prisma.query<any[]>(
        `SELECT COUNT(*) count FROM Ticket
         WHERE deletedAt IS NULL AND status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')`,
      ),
      this.prisma.query<any[]>(
        `SELECT COUNT(*) count FROM Dispatch WHERE status = 'EN_ROUTE'`,
      ),
      this.prisma.query<any[]>(
        `SELECT
           COUNT(*) total,
           SUM(CASE
             WHEN TIMESTAMPDIFF(MINUTE, t.createdAt, t.resolvedAt) <= s.resolutionTimeMin THEN 1
             ELSE 0
           END) compliant
         FROM Ticket t
         INNER JOIN SLA s ON s.id = t.slaId
         WHERE t.deletedAt IS NULL AND t.resolvedAt IS NOT NULL`,
      ),
      this.prisma.query<any[]>(
        `SELECT action, createdAt FROM TicketTimeline
         WHERE action IN ('ASSIGNED', 'STATUS_CHANGED', 'TIME', 'CREATED', 'RESOLVED')
         ORDER BY createdAt DESC LIMIT 12`,
      ),
    ]);

    const totalSla = Number(slaRows[0]?.total || 0);
    const compliantSla = Number(slaRows[0]?.compliant || 0);
    const activityLabels: Record<string, string> = {
      ASSIGNED: 'Service ticket assigned to a technician',
      STATUS_CHANGED: 'Ticket workflow status updated',
      TIME: 'Invoice-ready time entry captured',
      CREATED: 'New service request entered the queue',
      RESOLVED: 'Service request resolution recorded',
    };
    const activities = activityRows
      .map((row) => ({ label: activityLabels[row.action], occurredAt: row.createdAt }))
      .filter((row) => Boolean(row.label))
      .slice(0, 3);

    return {
      openTickets: Number(openRows[0]?.count || 0),
      onRoute: Number(routeRows[0]?.count || 0),
      slaMet: totalSla ? Math.round((compliantSla / totalSla) * 100) : 100,
      activities,
      updatedAt: new Date().toISOString(),
    };
  }

  async getPreferences(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, logo: true, branding: true, settings: true },
    });
    const branding = safeJson<Record<string, any>>(company?.branding, {});
    const settings = safeJson<Record<string, any>>(company?.settings, {});
    const reporting = (settings.customization as TenantCustomization | undefined)?.reporting || {};
    return {
      companyName: branding.companyName || company?.name || '',
      logoUrl: reporting.logoUrl || branding.logoUrl || company?.logo || '',
      accentColor: reporting.accentColor || branding.accentColor || branding.primaryColor || '#2563eb',
      headerText: reporting.headerText || '',
      footerText: reporting.footerText || '',
      defaultDateRange: reporting.defaultDateRange || '30d',
      pageOrientation: reporting.pageOrientation || 'portrait',
      showCompanyLogo: reporting.showCompanyLogo !== false,
    };
  }

  async getTicketSummary(companyId: string, from?: string, to?: string) {
    if (!from && !to) {
      const preferences = await this.getPreferences(companyId);
      from = this.startDateForRange(preferences.defaultDateRange).toISOString();
    }
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

  private startDateForRange(range: string) {
    const date = new Date();
    if (range === '7d') date.setDate(date.getDate() - 7);
    else if (range === '90d') date.setDate(date.getDate() - 90);
    else if (range === 'quarter') date.setMonth(Math.floor(date.getMonth() / 3) * 3, 1);
    else if (range === 'year') date.setMonth(0, 1);
    else date.setDate(date.getDate() - 30);
    date.setHours(0, 0, 0, 0);
    return date;
  }
}
