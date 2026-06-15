import { BadRequestException, Controller, Delete, ForbiddenException, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { RmmIntegrationService } from '../services/rmm-integration.service';
import { RmmSyncService } from '../services/rmm-sync.service';
import { RmmProviderFactory } from '../services/rmm-provider-factory.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { PrismaService } from '../../../database/prisma.service';
import { RequireFeature } from '../../../common/decorators/feature.decorator';
import { FeatureAccessGuard } from '../../../common/guards/feature-access.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import * as crypto from 'crypto';

@Controller('integrations/rmm')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@RequireFeature('rmmIntegration')
@RequirePermissions('assets.view')
export class RmmIntegrationController {
  constructor(
    private rmmIntegration: RmmIntegrationService,
    private rmmSync: RmmSyncService,
    private providerFactory: RmmProviderFactory,
    private prisma: PrismaService,
  ) {}

  @Get('providers')
  listProviders() {
    return {
      providers: this.providerFactory.listProviders(),
      definitions: this.providerFactory.listProviderDefinitions(),
    };
  }

  @Post('sync-asset')
  @RequirePermissions('assets.edit')
  syncAsset(@Body() body: { provider: string; assetData: any }, @CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    return this.rmmIntegration.syncAsset(body.provider, body.assetData, companyId);
  }

  @Post('alert')
  @RequirePermissions('tickets.create')
  createFromAlert(@Body() body: { provider: string; alert: any }, @CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    return this.rmmIntegration.createTicketFromAlert(body.provider, body.alert, companyId);
  }

  @Get('configs')
  async listConfigs(@CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    const configs = await this.prisma.rmmProviderConfig.findMany({ where: { companyId } });
    return configs.map((config: any) => this.sanitizeConfig(config));
  }

  @Get('sync-history')
  async listSyncHistory(@CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    return this.prisma.query(
      `SELECT * FROM RmmSyncRun WHERE companyId = ? ORDER BY startedAt DESC LIMIT 50`,
      [companyId],
    );
  }

  @Post('configs/test')
  @RequirePermissions('assets.edit')
  async testUnsavedConfig(@Body() body: { provider: string; credentials: any }, @CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    const provider = this.normalizeProvider(body.provider);
    const rmmProvider = this.providerFactory.getProvider(provider);
    const existing = await this.prisma.rmmProviderConfig.findFirst({ where: { companyId, provider } });
    const credentials = this.mergeCredentials(existing?.credentials, body.credentials || {});
    const valid = await rmmProvider.validateCredentials(credentials);
    return { provider, status: valid ? 'PASS' : 'FAIL' };
  }

  @Post('configs')
  @RequirePermissions('assets.edit')
  async saveConfig(@Body() body: { provider: string; credentials: any; syncIntervalMin?: number }, @CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    const provider = this.normalizeProvider(body.provider);
    this.providerFactory.getProvider(provider);

    const existing = await this.prisma.rmmProviderConfig.findFirst({ where: { companyId, provider } });
    const syncIntervalMin = Math.min(10080, Math.max(5, Number(body.syncIntervalMin) || 60));
    const credentials = this.encryptSecret(JSON.stringify(this.mergeCredentials(existing?.credentials, body.credentials || {})));
    const config = existing
      ? await this.prisma.rmmProviderConfig.update({
          where: { id: existing.id },
          data: { credentials, syncIntervalMin, isActive: true },
        })
      : await this.prisma.rmmProviderConfig.create({
          data: { companyId, provider, credentials, syncIntervalMin, isActive: true },
        });

    await this.rmmSync.refreshSyncSchedule(companyId, provider);
    return this.sanitizeConfig(config);
  }

  @Delete('configs/:provider')
  @RequirePermissions('assets.edit')
  async removeConfig(@Param('provider') provider: string, @CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    const normalizedProvider = this.normalizeProvider(provider);
    const existing = await this.prisma.rmmProviderConfig.findFirst({ where: { companyId, provider: normalizedProvider } });
    if (!existing) throw new BadRequestException('RMM configuration not found');

    const config = await this.prisma.rmmProviderConfig.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    await this.rmmSync.refreshSyncSchedule(companyId, normalizedProvider);
    return this.sanitizeConfig(config);
  }

  @Post('configs/:provider/test')
  @RequirePermissions('assets.edit')
  async testSavedConfig(@Param('provider') provider: string, @CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    const normalizedProvider = this.normalizeProvider(provider);
    const config = await this.prisma.rmmProviderConfig.findFirst({ where: { companyId, provider: normalizedProvider } });
    if (!config) throw new BadRequestException('RMM configuration not found');

    const rmmProvider = this.providerFactory.getProvider(normalizedProvider);
    const credentials = this.parseCredentials(config.credentials);
    const valid = await rmmProvider.validateCredentials(credentials);
    const status = valid ? 'PASS' : 'FAIL';

    await this.prisma.rmmProviderConfig.update({
      where: { id: config.id },
      data: { lastTestStatus: status, lastTestAt: new Date() },
    });

    return { provider: normalizedProvider, status };
  }

  @Post('sync-now/:provider')
  @RequirePermissions('assets.edit')
  syncNow(@Param('provider') provider: string, @CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    return this.rmmSync.syncProviderNow(companyId, this.normalizeProvider(provider));
  }

  private requireCompanyId(user: CurrentUserType) {
    const companyId = user.effectiveCompanyId || user.companyId;
    if (!companyId) throw new ForbiddenException('Select a company context before using RMM integrations');
    return companyId;
  }

  private normalizeProvider(provider: string) {
    const normalized = String(provider || '').trim().toLowerCase();
    if (!normalized) throw new BadRequestException('RMM provider is required');
    return normalized;
  }

  private sanitizeConfig(config: any) {
    const { credentials, ...safeConfig } = config;
    return {
      ...safeConfig,
      hasCredentials: Boolean(credentials),
    };
  }

  private encryptionKey() {
    return crypto.createHash('sha256').update(process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fieldserviceit-dev-key').digest();
  }

  private encryptSecret(value: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `ENC:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
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

  private mergeCredentials(existingCredentials: string | undefined, nextCredentials: Record<string, any>) {
    const existing = existingCredentials ? this.parseCredentials(existingCredentials) : {};
    const cleaned = Object.fromEntries(
      Object.entries(nextCredentials || {}).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== '********'),
    );
    return { ...existing, ...cleaned };
  }
}
