import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { LoggerService } from '../../../common/logger/logger.service';
import { PRODUCT_CATALOG } from '../../../config/product-catalog.generated';

@Injectable()
export class PlansService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    try {
      await this.seedDefaultPlans();
    } catch (err: any) {
      this.logger.warn('[PlansService] Failed to seed plans (DB unavailable): ' + err?.message);
    }
  }

  private async seedDefaultPlans() {
    const existing = await this.prisma.plan.findMany({});
    if (existing.length > 0) return;

      const plans = PRODUCT_CATALOG.plans.map(({ id: _id, slug: _slug, audience: _audience, ...plan }) => ({
        ...plan,
        features: JSON.stringify(plan.features),
      }));

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
