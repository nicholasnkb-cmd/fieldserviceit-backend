import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../../../database/prisma.service';
import { RmmProviderFactory } from './rmm-provider-factory.service';
import * as fs from 'fs';
import * as crypto from 'crypto';

@Injectable()
export class RmmSyncService implements OnModuleInit {
  private readonly logger = new Logger(RmmSyncService.name);

  constructor(
    private prisma: PrismaService,
    private providerFactory: RmmProviderFactory,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    try {
      await this.registerDynamicSyncJobs();
    } catch (err) {
      this.logger.error('Failed to register dynamic sync jobs, continuing without them');
      this.logger.error(err instanceof Error ? err.message : String(err));
    }
  }

  private async registerDynamicSyncJobs() {
    const configs = await this.prisma.rmmProviderConfig.findMany({
      where: { isActive: true },
    });

    for (const config of configs) {
      const jobName = `rmm-sync-${config.companyId}-${config.provider}`;
      const intervalMs = (config.syncIntervalMin || 60) * 60 * 1000;

      if (this.schedulerRegistry.doesExist('interval', jobName)) {
        this.schedulerRegistry.deleteInterval(jobName);
      }

      const interval = setInterval(async () => {
        try {
          await this.syncProviderAssets(config as any);
        } catch (err: any) {
          this.logger.error(`Dynamic sync failed for ${config.provider}/${config.companyId}: ${err.message}`);
        }
      }, intervalMs);

      this.schedulerRegistry.addInterval(jobName, interval);
      this.logger.log(`Registered dynamic sync for ${config.provider}/${config.companyId} every ${config.syncIntervalMin}min`);
    }
  }

  private async syncProviderAssets(config: { id: string; companyId: string; provider: string; credentials: string }) {
    const runId = crypto.randomUUID();
    const startedAt = new Date();
    await this.prisma.execute(
      `INSERT INTO RmmSyncRun (id, companyId, provider, status, startedAt, createdAt) VALUES (?, ?, ?, 'RUNNING', ?, ?)`,
      [runId, config.companyId, config.provider, startedAt, startedAt],
    ).catch(() => undefined);

    const provider = this.providerFactory.getProvider(config.provider);
    const credentials = this.parseCredentials(config.credentials);

    const valid = await provider.validateCredentials(credentials);
    if (!valid) {
      this.logger.warn(`Invalid credentials for provider ${config.provider} (company ${config.companyId})`);
      await this.finishSyncRun(runId, config.id, 'FAILED', 0, 0, 0, 'Invalid credentials');
      return;
    }

    try {
      const assets = await provider.syncAllAssets(credentials);
      let assetsCreated = 0;
      let assetsUpdated = 0;
      let assetsSkipped = 0;

      for (const asset of assets) {
        const name = asset.name || 'Unknown Asset';
        const assetType = asset.assetType || 'OTHER';
        const serialNumber = asset.serialNumber || undefined;
        const manufacturer = asset.manufacturer || undefined;
        const model = asset.model || undefined;
        const os = asset.os || undefined;
        const ipAddress = asset.ipAddress || undefined;
        const location = asset.location || undefined;
        const status = asset.status || 'ACTIVE';

        if (serialNumber) {
          const existing = await this.prisma.asset.findFirst({ where: { serialNumber, companyId: config.companyId, deletedAt: null } });
          if (existing) {
            await this.prisma.asset.update({ where: { id: existing.id }, data: { name, assetType, manufacturer, model, os, ipAddress, location, status } });
            assetsUpdated += 1;
          } else {
            await this.prisma.asset.create({ data: { name, assetType, serialNumber, manufacturer, model, os, ipAddress, location, status, companyId: config.companyId } });
            assetsCreated += 1;
          }
        } else {
          await this.prisma.asset.create({ data: { name, assetType, serialNumber, manufacturer, model, os, ipAddress, location, status, companyId: config.companyId } });
          assetsCreated += 1;
        }
      }

      await this.finishSyncRun(runId, config.id, 'SUCCESS', assetsCreated, assetsUpdated, assetsSkipped);
      this.logger.log(`Synced ${assets.length} assets from ${config.provider} for company ${config.companyId}`);
    } catch (err: any) {
      await this.finishSyncRun(runId, config.id, 'FAILED', 0, 0, 0, err?.message || 'Sync failed');
      throw err;
    }
  }

  private async finishSyncRun(runId: string, configId: string, status: string, assetsCreated: number, assetsUpdated: number, assetsSkipped: number, errorMessage?: string) {
    const completedAt = new Date();
    await this.prisma.execute(
      `UPDATE RmmSyncRun SET status = ?, completedAt = ?, assetsCreated = ?, assetsUpdated = ?, assetsSkipped = ?, errorMessage = ? WHERE id = ?`,
      [status, completedAt, assetsCreated, assetsUpdated, assetsSkipped, errorMessage || null, runId],
    ).catch(() => undefined);
    await this.prisma.rmmProviderConfig.update({
      where: { id: configId },
      data: {
        lastSyncAt: completedAt,
        lastSyncStatus: status,
        lastSyncMessage: errorMessage || `${assetsCreated} created, ${assetsUpdated} updated, ${assetsSkipped} skipped`,
      },
    });
  }

  /**
   * Called after a config is created/updated to reschedule its sync interval.
   */
  async refreshSyncSchedule(companyId: string, provider: string) {
    const jobName = `rmm-sync-${companyId}-${provider}`;
    if (this.schedulerRegistry.doesExist('interval', jobName)) {
      this.schedulerRegistry.deleteInterval(jobName);
    }

    const config = await this.prisma.rmmProviderConfig.findFirst({
      where: { companyId, provider },
    });

    if (config && config.isActive) {
      const intervalMs = (config.syncIntervalMin || 60) * 60 * 1000;
      const interval = setInterval(async () => {
        try {
          await this.syncProviderAssets(config as any);
        } catch (err: any) {
          this.logger.error(`Dynamic sync failed for ${provider}/${companyId}: ${err.message}`);
        }
      }, intervalMs);
      this.schedulerRegistry.addInterval(jobName, interval);
      this.logger.log(`Rescheduled sync for ${provider}/${companyId} every ${config.syncIntervalMin}min`);
    }
  }

  async syncProviderNow(companyId: string, provider: string) {
    this.logger.log(`syncProviderNow called: companyId=${companyId} provider=${provider}`);
    const config = await this.prisma.rmmProviderConfig.findFirst({
      where: { companyId, provider },
    });
    if (!config) {
      return { synced: false, error: `No RMM configuration found for ${provider} in this company` };
    }
    if (!config.isActive) {
      return { synced: false, error: `${provider} configuration is inactive` };
    }
    await this.syncProviderAssets(config as any);
    return { synced: true, provider, companyId };
  }

  private encryptionKey() {
    return crypto.createHash('sha256').update(process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fieldserviceit-dev-key').digest();
  }

  private decryptSecret(value: string) {
    if (!value?.startsWith('ENC:')) return value;
    const [, iv, tag, encrypted] = value.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  }

  private parseCredentials(value: string) {
    return JSON.parse(this.decryptSecret(value || '{}'));
  }
}
