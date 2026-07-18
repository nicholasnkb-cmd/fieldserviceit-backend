import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  async listRetiredTenantAssets(companyId: string, deviceCategory?: string) {
    const categoryClause = deviceCategory ? ' AND deviceCategory = ?' : '';
    return this.prisma.query<any[]>(
      `SELECT * FROM Asset
       WHERE companyId = ? AND deletedAt IS NOT NULL${categoryClause}
       ORDER BY deletedAt DESC
       LIMIT 100`,
      deviceCategory ? [companyId, deviceCategory] : [companyId],
    );
  }

  async restoreTenantAsset(id: string, companyId: string) {
    const retired = await this.prisma.query<Array<{ id: string }>>(
      `SELECT id FROM Asset WHERE id = ? AND companyId = ? AND deletedAt IS NOT NULL LIMIT 1`,
      [id, companyId],
    );
    if (!retired[0]) throw new NotFoundException('Retired asset not found');
    await this.prisma.asset.update({ where: { id, companyId }, data: { deletedAt: null } });
    return this.findTenantAsset(id, companyId);
  }

  async purgeRetiredTenantAsset(id: string, companyId: string, minimumAgeDays = 30) {
    const rows = await this.prisma.query<Array<{ id: string; deletedAt: Date }>>(
      `SELECT id, deletedAt FROM Asset
       WHERE id = ? AND companyId = ? AND deletedAt IS NOT NULL
       LIMIT 1`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('Retired asset not found');
    const ageMs = Date.now() - new Date(rows[0].deletedAt).getTime();
    if (ageMs < minimumAgeDays * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(`Retired assets remain recoverable for ${minimumAgeDays} days`);
    }
    await this.prisma.execute(`DELETE FROM Asset WHERE id = ? AND companyId = ? AND deletedAt IS NOT NULL`, [id, companyId]);
    return { id, purged: true };
  }
}
