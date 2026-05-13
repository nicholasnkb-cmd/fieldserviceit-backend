import { Controller, Get, Patch, Put, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from '../services/settings.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard)
@BusinessOnly()
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  getSettings(@CurrentUser() user: any) {
    return this.settingsService.getSettings(user.companyId);
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  updateSettings(@Body() dto: any, @CurrentUser() user: any) {
    return this.settingsService.updateSettings(user.companyId, dto);
  }

  @Put('branding')
  @UseGuards(RolesGuard)
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  updateBranding(@Body() branding: { primaryColor?: string; logoUrl?: string; companyName?: string }, @CurrentUser() user: any) {
    return this.settingsService.updateBranding(user.companyId, branding);
  }
}
