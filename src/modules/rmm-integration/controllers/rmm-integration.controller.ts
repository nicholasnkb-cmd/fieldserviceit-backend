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

@Controller('integrations/rmm')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard)
export class RmmIntegrationController {
  constructor(
    private rmmIntegration: RmmIntegrationService,
    private rmmSync: RmmSyncService,
    private providerFactory: RmmProviderFactory,
    private prisma: PrismaService,
  ) {}

  @Get('providers')
  listProviders() {
    return { providers: this.providerFactory.listProviders() };
  }

  @Post('sync-asset')
  syncAsset(@Body() body: { provider: string; assetData: any }, @CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    return this.rmmIntegration.syncAsset(body.provider, body.assetData, companyId);
  }

  @Post('alert')
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

  @Post('configs')
  async saveConfig(@Body() body: { provider: string; credentials: any; syncIntervalMin?: number }, @CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    const provider = this.normalizeProvider(body.provider);
    this.providerFactory.getProvider(provider);

    const syncIntervalMin = Math.max(5, Number(body.syncIntervalMin) || 60);
    const credentials = JSON.stringify(body.credentials || {});
    const existing = await this.prisma.rmmProviderConfig.findFirst({ where: { companyId, provider } });
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

  @Post('sync-now/:provider')
  syncNow(@Param('provider') provider: string, @CurrentUser() user: CurrentUserType) {
    const companyId = this.requireCompanyId(user);
    return this.rmmSync.syncProviderNow(companyId, this.normalizeProvider(provider));
  }

  private requireCompanyId(user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('Select a company context before using RMM integrations');
    return user.companyId;
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
}
