import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: { name: string; slug: string; domain?: string }) {
    return this.prisma.company.create({ data: dto });
  }

  async findAll(query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.company.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { users: true, tickets: true, assets: true } } },
      }),
      this.prisma.company.count({ where: { deletedAt: null } }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { users: true, tickets: true, assets: true } } },
    });

    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.prisma.company.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.company.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  async getStats(id: string) {
    const [tickets, users, assets, dispatches] = await Promise.all([
      this.prisma.ticket.count({ where: { companyId: id, deletedAt: null } }),
      this.prisma.user.count({ where: { companyId: id, deletedAt: null } }),
      this.prisma.asset.count({ where: { companyId: id, deletedAt: null } }),
      this.prisma.dispatch.count({ where: { companyId: id } }),
    ]);

    return { tickets, users, assets, dispatches };
  }
}
