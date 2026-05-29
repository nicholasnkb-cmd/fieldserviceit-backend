import { Controller, Get, Patch, Put, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from '../services/settings.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';


@Controller('settings')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard)
@BusinessOnly()
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  getSettings(@CurrentUser() user: CurrentUserType) {
    return this.settingsService.getSettings(user.companyId);
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  updateSettings(@Body() dto: {
    name?: string;
    domain?: string;
    logo?: string;
    timezone?: string;
    locale?: string;
    featureOverrides?: Record<string, boolean>;
    restrictions?: Record<string, string | number | boolean>;
  }, @CurrentUser() user: CurrentUserType) {
    return this.settingsService.updateSettings(user.companyId, dto);
  }

  @Put('branding')
  @UseGuards(RolesGuard)
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  updateBranding(@Body() branding: { primaryColor?: string; logoUrl?: string; companyName?: string }, @CurrentUser() user: CurrentUserType) {
    return this.settingsService.updateBranding(user.companyId, branding);
  }
}
