import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class PlansService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.seedDefaultPlans();
    } catch (err: any) {
      console.warn('[PlansService] Failed to seed plans (DB unavailable):', err?.message);
    }
  }

  private async seedDefaultPlans() {
    const existing = await this.prisma.plan.findMany({});
    if (existing.length > 0) return;

      const plans = [
        {
          name: 'Free',
          description: 'Basic ticket tracking for individuals',
          monthlyPrice: 0,
          maxUsers: 1,
          maxTickets: 50,
          sortOrder: 0,
          features: JSON.stringify({ tickets: true, emailNotifications: true, publicSubmit: true }),
        },
        {
          name: 'Starter',
          description: 'For individuals who need higher-volume support tracking',
          monthlyPrice: 29,
          maxUsers: 1,
          maxTickets: -1,
          sortOrder: 1,
          features: JSON.stringify({ tickets: true, dispatch: true, assets: true, emailNotifications: true, publicSubmit: true, csvExport: true, apiAccess: true }),
        },
        {
          name: 'Business',
          description: 'The single company plan with ITSM, RMM, SLA, workflows, and reporting',
          monthlyPrice: 79,
          maxUsers: -1,
          maxTickets: -1,
          sortOrder: 2,
          features: JSON.stringify({ tickets: true, dispatch: true, assets: true, emailNotifications: true, publicSubmit: true, csvExport: true, apiAccess: true, rmmIntegration: true, slaManagement: true, workflows: true, reporting: true, auditLogs: true, branding: true, timeTracking: true, contracts: true, kb: true }),
        },
      ];

    for (const plan of plans) {
      await this.prisma.plan.create({ data: plan });
    }
  }

  async findAll() {
    const data = await this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return { data };
  }

  async findById(id: string) {
    return this.prisma.plan.findUnique({ where: { id } });
  }

  async getCompanyPlan(companyId: string) {
    const cp = await this.prisma.companyPlan.findUnique({ where: { companyId }, include: { plan: true } });
    return cp || null;
  }
}
