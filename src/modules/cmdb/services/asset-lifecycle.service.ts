import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AssetRepository } from '../../../database/repositories/asset.repository';
import { PrismaService } from '../../../database/prisma.service';
import { CmdbService } from './cmdb.service';

@Injectable()
export class AssetLifecycleService {
  private readonly logger = new Logger(AssetLifecycleService.name);
  constructor(private cmdb: CmdbService, private assets: AssetRepository, private prisma: PrismaService) {}

  async bulkRetire(ids: string[], companyId: string, actorId?: string) {
    const unique = this.ids(ids), retired = [];
    for (const id of unique) retired.push(await this.cmdb.remove(id, companyId, actorId));
    return { retired: retired.map((asset: any) => ({ id: asset.id, name: asset.name })) };
  }

  async bulkRestore(ids: string[], companyId: string, actorId?: string) {
    const unique = this.ids(ids), restored = [];
    for (const id of unique) restored.push(await this.cmdb.restore(id, companyId, actorId));
    return { restored: restored.map((asset: any) => ({ id: asset.id, name: asset.name })) };
  }

  async purge(id: string, companyId: string, actorId?: string) {
    const result = await this.assets.purgeRetiredTenantAsset(id, companyId, 30);
    if (actorId) await this.prisma.auditLog.create({ data: { companyId, actorId, action: 'asset.purge', resourceType: 'Asset', resourceId: id } }).catch(() => {});
    return result;
  }

  @Cron('15 3 * * *')
  async purgeExpired() {
    const result = await this.prisma.execute(`DELETE FROM Asset WHERE companyId IS NOT NULL AND deletedAt IS NOT NULL AND deletedAt < DATE_SUB(NOW(3), INTERVAL 30 DAY) AND NOT EXISTS (SELECT 1 FROM Ticket WHERE Ticket.assetId = Asset.id)`).catch((error) => { this.logger.warn(`Recycle-bin retention cleanup failed: ${error?.message || error}`); return { affectedRows: 0 } as any; });
    if (result.affectedRows) this.logger.log(`Purged ${result.affectedRows} expired retired assets`);
  }

  private ids(ids: string[]) {
    const unique = [...new Set((ids || []).map(String))].slice(0, 100);
    if (!unique.length) throw new BadRequestException('Select at least one asset');
    return unique;
  }
}
