import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class CmdbService {
  constructor(private prisma: PrismaService) {}

  async create(dto: any, companyId: string) {
    return this.prisma.asset.create({ data: { ...dto, companyId } });
  }

  async findAll(companyId: string, query: { page?: number; limit?: number; assetType?: string; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = { companyId, deletedAt: null };
    if (query.assetType) where.assetType = query.assetType;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { serialNumber: { contains: query.search } },
        { ipAddress: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.asset.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.asset.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, companyId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { tickets: { take: 10, orderBy: { createdAt: 'desc' } } },
    });

    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async update(id: string, dto: any, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.asset.update({ where: { id }, data: dto });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
