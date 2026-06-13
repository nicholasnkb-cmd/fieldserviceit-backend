import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTenantAsset(id: string, companyId: string, include?: Record<string, any>) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, companyId, deletedAt: null },
      include,
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async updateTenantAsset(id: string, companyId: string, data: Record<string, any>) {
    await this.findTenantAsset(id, companyId);
    return this.prisma.asset.update({
      where: { id, companyId },
      data,
    });
  }

  async retireTenantAsset(id: string, companyId: string) {
    return this.updateTenantAsset(id, companyId, { deletedAt: new Date() });
  }
}
