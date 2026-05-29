import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { RmmIntegrationService } from '../services/rmm-integration.service';
import { RmmSyncService } from '../services/rmm-sync.service';
import { RmmProviderFactory } from '../services/rmm-provider-factory.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { PrismaService } from '../../../database/prisma.service';

@Controller('integrations/rmm')
@UseGuards(JwtAuthGuard, TenantGuard)
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
    return this.rmmIntegration.syncAsset(body.provider, body.assetData, user.companyId);
  }

  @Post('alert')
  createFromAlert(@Body() body: { provider: string; alert: any }, @CurrentUser() user: CurrentUserType) {
    return this.rmmIntegration.createTicketFromAlert(body.provider, body.alert, user.companyId);
  }

  @Get('configs')
  listConfigs(@CurrentUser() user: CurrentUserType) {
    return this.prisma.rmmProviderConfig.findMany({ where: { companyId: user.companyId } });
  }

  @Post('configs')
  async saveConfig(@Body() body: { provider: string; credentials: any; syncIntervalMin?: number }, @CurrentUser() user: CurrentUserType) {
    const config = await this.prisma.rmmProviderConfig.upsert({
      where: { companyId_provider: { companyId: user.companyId, provider: body.provider } },
      update: { credentials: JSON.stringify(body.credentials), syncIntervalMin: body.syncIntervalMin ?? 60, isActive: true },
      create: { companyId: user.companyId, provider: body.provider, credentials: JSON.stringify(body.credentials), syncIntervalMin: body.syncIntervalMin ?? 60 },
    });
    await this.rmmSync.refreshSyncSchedule(user.companyId, body.provider);
    return config;
  }

  @Delete('configs/:provider')
  async removeConfig(@Param('provider') provider: string, @CurrentUser() user: CurrentUserType) {
    const config = await this.prisma.rmmProviderConfig.update({
      where: { companyId_provider: { companyId: user.companyId, provider } },
      data: { isActive: false },
    });
    await this.rmmSync.refreshSyncSchedule(user.companyId, provider);
    return config;
  }

  @Post('sync-now/:provider')
  syncNow(@Param('provider') provider: string, @CurrentUser() user: CurrentUserType) {
    return this.rmmSync.syncProviderNow(user.companyId, provider);
  }
}
