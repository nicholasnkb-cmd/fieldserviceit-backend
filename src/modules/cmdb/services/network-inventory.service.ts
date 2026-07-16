import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { AssetRepository } from '../../../database/repositories/asset.repository';
import { PrismaService } from '../../../database/prisma.service';
import { CmdbService } from './cmdb.service';

@Injectable()
export class NetworkInventoryService {
  private readonly logger = new Logger(NetworkInventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetRepository,
    private readonly cmdb: CmdbService,
  ) {}

  async bulkRetire(ids: string[], companyId: string, actorId?: string) {
    const uniqueIds = this.validBulkIds(ids);
    const placeholders = uniqueIds.map(() => '?').join(',');
    const devices = await this.prisma.query<any[]>(
      `SELECT id, name FROM Asset WHERE companyId = ? AND deletedAt IS NULL
       AND deviceCategory = 'NETWORK_DEVICE' AND id IN (${placeholders})`,
      [companyId, ...uniqueIds],
    );
    if (devices.length) {
      await this.prisma.execute(
        `UPDATE Asset SET deletedAt = NOW(3), updatedAt = NOW(3)
         WHERE companyId = ? AND deletedAt IS NULL AND deviceCategory = 'NETWORK_DEVICE' AND id IN (${placeholders})`,
        [companyId, ...uniqueIds],
      );
      await Promise.all(devices.map((device) => this.audit(companyId, actorId, 'asset.bulk-retire', 'Asset', device.id)));
    }
    return { retired: devices, skipped: uniqueIds.filter((id) => !devices.some((device) => device.id === id)) };
  }

  async bulkRestore(ids: string[], companyId: string, actorId?: string) {
    const uniqueIds = this.validBulkIds(ids);
    const placeholders = uniqueIds.map(() => '?').join(',');
    const devices = await this.prisma.query<any[]>(
      `SELECT id, name FROM Asset WHERE companyId = ? AND deletedAt IS NOT NULL
       AND deviceCategory = 'NETWORK_DEVICE' AND id IN (${placeholders})`,
      [companyId, ...uniqueIds],
    );
    if (devices.length) {
      await this.prisma.execute(
        `UPDATE Asset SET deletedAt = NULL, updatedAt = NOW(3)
         WHERE companyId = ? AND deletedAt IS NOT NULL AND deviceCategory = 'NETWORK_DEVICE' AND id IN (${placeholders})`,
        [companyId, ...uniqueIds],
      );
      await Promise.all(devices.map((device) => this.audit(companyId, actorId, 'asset.bulk-restore', 'Asset', device.id)));
    }
    return { restored: devices, skipped: uniqueIds.filter((id) => !devices.some((device) => device.id === id)) };
  }

  async importDevices(devices: Record<string, any>[], companyId: string, actorId?: string) {
    if (!Array.isArray(devices) || devices.length === 0) throw new BadRequestException('Provide at least one network device');
    if (devices.length > 250) throw new BadRequestException('Import is limited to 250 devices at a time');
    const existing = await this.prisma.query<any[]>(
      `SELECT id, name, serialNumber, macAddress, ipAddress FROM Asset
       WHERE companyId = ? AND deletedAt IS NULL AND deviceCategory = 'NETWORK_DEVICE' LIMIT 5000`,
      [companyId],
    );
    const identifiers = new Map<string, string>();
    for (const item of existing) {
      for (const [field, value] of [['serialNumber', item.serialNumber], ['macAddress', item.macAddress], ['ipAddress', item.ipAddress]] as const) {
        if (value) identifiers.set(`${field}:${String(value).trim().toLowerCase()}`, item.name);
      }
    }
    const created: any[] = [];
    const duplicates: Array<{ row: number; name: string; reason: string }> = [];
    const invalid: Array<{ row: number; name: string; reason: string }> = [];
    for (let index = 0; index < devices.length; index += 1) {
      const input = devices[index] || {};
      const name = String(input.name || '').trim();
      if (!name) {
        invalid.push({ row: index + 2, name: '', reason: 'Name is required' });
        continue;
      }
      if (name.length > 191) {
        invalid.push({ row: index + 2, name, reason: 'Name must be 191 characters or fewer' });
        continue;
      }
      if (input.ipAddress && !this.validIpv4(String(input.ipAddress))) {
        invalid.push({ row: index + 2, name, reason: 'IP address is not a valid IPv4 address' });
        continue;
      }
      if (input.macAddress && !/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(String(input.macAddress))) {
        invalid.push({ row: index + 2, name, reason: 'MAC address is invalid' });
        continue;
      }
      if (['purchaseDate', 'warrantyExpiresAt'].some((field) => input[field] && Number.isNaN(Date.parse(String(input[field]))))) {
        invalid.push({ row: index + 2, name, reason: 'Purchase and warranty values must be valid dates' });
        continue;
      }
      const duplicate = (['serialNumber', 'macAddress', 'ipAddress'] as const)
        .map((field) => ({ field, value: String(input[field] || '').trim().toLowerCase() }))
        .find(({ field, value }) => value && identifiers.has(`${field}:${value}`));
      if (duplicate) {
        duplicates.push({ row: index + 2, name, reason: `${duplicate.field} already belongs to ${identifiers.get(`${duplicate.field}:${duplicate.value}`)}` });
        continue;
      }
      try {
        const asset = await this.cmdb.create({
          name,
          deviceCategory: 'NETWORK_DEVICE',
          assetType: 'NETWORK_DEVICE',
          manufacturer: input.manufacturer || undefined,
          model: input.model || undefined,
          serialNumber: input.serialNumber || undefined,
          location: input.location || undefined,
          ipAddress: input.ipAddress || undefined,
          macAddress: input.macAddress || undefined,
          purchaseDate: input.purchaseDate || undefined,
          warrantyExpiresAt: input.warrantyExpiresAt || undefined,
          enrollmentStatus: 'UNMANAGED',
          managementMode: 'NETWORK',
          complianceStatus: 'UNKNOWN',
          notes: input.notes || undefined,
        }, companyId);
        created.push(asset);
        for (const field of ['serialNumber', 'macAddress', 'ipAddress'] as const) {
          const value = String(input[field] || '').trim().toLowerCase();
          if (value) identifiers.set(`${field}:${value}`, name);
        }
        await this.audit(companyId, actorId, 'asset.import', 'Asset', asset.id, { source: 'csv' });
      } catch (error: any) {
        invalid.push({ row: index + 2, name, reason: error?.message || 'Could not create device' });
      }
    }
    return { created, duplicates, invalid, total: devices.length };
  }

  async removalImpact(id: string, companyId: string) {
    const asset = await this.assets.findTenantAsset(id, companyId);
    const [tickets, links, alerts, reservations] = await Promise.all([
      this.prisma.query<any[]>(`SELECT COUNT(*) count FROM Ticket WHERE assetId = ? AND deletedAt IS NULL AND status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')`, [id]),
      this.prisma.query<any[]>(`SELECT COUNT(*) count FROM NetworkTopologyLink WHERE companyId = ? AND (sourceAssetId = ? OR targetAssetId = ?)`, [companyId, id, id]),
      this.prisma.query<any[]>(`SELECT COUNT(*) count FROM NetworkAlertEvent WHERE companyId = ? AND assetId = ? AND status = 'ACTIVE'`, [companyId, id]),
      this.prisma.query<any[]>(`SELECT COUNT(*) count FROM NetworkIpReservation WHERE companyId = ? AND assetId = ?`, [companyId, id]),
    ]);
    return {
      id: asset.id,
      name: asset.name,
      activeTickets: Number(tickets[0]?.count || 0),
      topologyLinks: Number(links[0]?.count || 0),
      activeAlerts: Number(alerts[0]?.count || 0),
      ipReservations: Number(reservations[0]?.count || 0),
      action: 'The device will be hidden from active inventory. Related records remain available and the device can be restored.',
    };
  }

  async history(id: string, companyId: string) {
    await this.assets.findTenantAsset(id, companyId);
    const rows = await this.prisma.query<any[]>(
      `SELECT a.id, a.action, a.diff, a.createdAt, u.firstName, u.lastName, u.email
       FROM AuditLog a LEFT JOIN User u ON u.id = a.actorId
       WHERE a.companyId = ? AND a.resourceType IN ('Asset', 'assets') AND a.resourceId = ?
       ORDER BY a.createdAt DESC LIMIT 100`,
      [companyId, id],
    );
    return rows.map((row) => ({ ...row, actorName: [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email || 'System' }));
  }

  async getDiscoverySchedule(companyId: string) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkDiscoverySchedule WHERE companyId = ? LIMIT 1`, [companyId]);
    return rows[0] || { companyId, subnet: '192.168.1.0/24', intervalMinutes: 1440, hostLimit: 64, enabled: false };
  }

  async updateDiscoverySchedule(companyId: string, dto: any = {}, actorId?: string) {
    const subnet = String(dto.subnet || '').trim();
    const [address, prefix] = subnet.split('/');
    if (!this.validIpv4(address) || !/^\d+$/.test(prefix || '') || Number(prefix) < 24 || Number(prefix) > 30) throw new BadRequestException('Provide an IPv4 CIDR subnet between /24 and /30, such as 192.168.1.0/24');
    const intervalMinutes = Math.max(60, Math.min(10080, Number(dto.intervalMinutes || 1440)));
    const hostLimit = Math.max(1, Math.min(254, Number(dto.hostLimit || 64)));
    const enabled = dto.enabled === true || dto.enabled === 1 ? 1 : 0;
    await this.prisma.execute(
      `INSERT INTO NetworkDiscoverySchedule
       (id, companyId, subnet, intervalMinutes, hostLimit, enabled, nextRunAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, IF(? = 1, NOW(3), NULL), NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE subnet = VALUES(subnet), intervalMinutes = VALUES(intervalMinutes),
         hostLimit = VALUES(hostLimit), enabled = VALUES(enabled),
         nextRunAt = IF(VALUES(enabled) = 1, COALESCE(nextRunAt, NOW(3)), NULL), updatedAt = NOW(3)`,
      [randomUUID(), companyId, subnet, intervalMinutes, hostLimit, enabled, enabled],
    );
    await this.audit(companyId, actorId, 'network.discovery.schedule', 'NetworkDiscoverySchedule', companyId, { subnet, intervalMinutes, hostLimit, enabled: Boolean(enabled) });
    return this.getDiscoverySchedule(companyId);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runScheduledDiscovery() {
    try {
      const schedules = await this.prisma.query<any[]>(`SELECT * FROM NetworkDiscoverySchedule WHERE enabled = 1 AND (nextRunAt IS NULL OR nextRunAt <= NOW()) LIMIT 20`);
      for (const schedule of schedules) {
        try {
          const results = await this.cmdb.scanSubnet(schedule.companyId, { subnet: schedule.subnet, limit: schedule.hostLimit || 64 });
          await this.prisma.execute(
            `UPDATE NetworkDiscoverySchedule SET lastRunAt = NOW(3), lastResultCount = ?, lastError = NULL,
             nextRunAt = DATE_ADD(NOW(3), INTERVAL ? MINUTE), updatedAt = NOW(3) WHERE id = ?`,
            [results.length, Math.max(60, Number(schedule.intervalMinutes || 1440)), schedule.id],
          );
        } catch (error: any) {
          await this.prisma.execute(
            `UPDATE NetworkDiscoverySchedule SET lastRunAt = NOW(3), lastError = ?,
             nextRunAt = DATE_ADD(NOW(3), INTERVAL ? MINUTE), updatedAt = NOW(3) WHERE id = ?`,
            [String(error?.message || error).slice(0, 500), Math.max(60, Number(schedule.intervalMinutes || 1440)), schedule.id],
          );
        }
      }
    } catch (error: any) {
      this.logger.warn(`Scheduled network discovery failed: ${error?.message || error}`);
    }
  }

  private validBulkIds(ids: string[]) {
    if (!Array.isArray(ids)) throw new BadRequestException('Device ids are required');
    const uniqueIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
    if (uniqueIds.length === 0) throw new BadRequestException('Select at least one device');
    if (uniqueIds.length > 100) throw new BadRequestException('Bulk actions are limited to 100 devices');
    return uniqueIds;
  }

  private validIpv4(value: string) {
    const parts = value.trim().split('.');
    return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  }

  private async audit(companyId: string, actorId: string | undefined, action: string, resourceType: string, resourceId: string, diff?: any) {
    if (!actorId) return;
    await this.prisma.auditLog.create({ data: { companyId, actorId, action, resourceType, resourceId, diff: diff ? JSON.stringify(diff) : undefined } }).catch(() => {});
  }
}
