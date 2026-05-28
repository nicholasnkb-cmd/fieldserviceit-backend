import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { PlansService } from './plans.service';

@Injectable()
export class UsageService {
  constructor(
    private prisma: PrismaService,
    private plansService: PlansService,
  ) {}

  async getOrCreateUsageRecord(companyId: string, metric: string, periodStart: Date, periodEnd: Date) {
    let record = await this.prisma.usageRecord.findFirst({
      where: { companyId, metric, periodStart: { gte: periodStart }, periodEnd: { lte: periodEnd } },
    });
    if (!record) {
      record = await this.prisma.usageRecord.create({
        data: { companyId, metric, count: 0, periodStart, periodEnd },
      }) as any;
    }
    return record;
  }

  async incrementUsage(companyId: string, metric: string) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const record = await this.getOrCreateUsageRecord(companyId, metric, periodStart, periodEnd);
    return this.prisma.usageRecord.update({
      where: { id: record.id },
      data: { count: { increment: 1 } },
    }) as any;
  }

  async getUsage(companyId: string, metric: string) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const record = await this.prisma.usageRecord.findFirst({
      where: { companyId, metric, periodStart: { gte: periodStart }, periodEnd: { lte: periodEnd } },
    });
    return record?.count || 0;
  }

  async getActiveUserCount(companyId: string) {
    return this.prisma.user.count({
      where: { companyId, isActive: true, deletedAt: null },
    });
  }

  async checkTicketLimit(companyId: string) {
    const cp = await this.plansService.getCompanyPlan(companyId);
    if (!cp) return true;
    const plan = cp.plan as any;
    const maxTickets = plan.maxTickets ?? -1;
    if (maxTickets === -1) return true;
    const current = await this.getUsage(companyId, 'tickets');
    if (current >= maxTickets) {
      throw new ForbiddenException('Ticket limit reached for your plan. Upgrade to create more tickets.');
    }
    return true;
  }

  async checkUserLimit(companyId: string) {
    const cp = await this.plansService.getCompanyPlan(companyId);
    if (!cp) return true;
    const plan = cp.plan as any;
    const maxUsers = plan.maxUsers ?? -1;
    if (maxUsers === -1) return true;
    const current = await this.getActiveUserCount(companyId);
    if (current >= maxUsers) {
      throw new ForbiddenException('User limit reached for your plan. Upgrade to add more users.');
    }
    return true;
  }
}
