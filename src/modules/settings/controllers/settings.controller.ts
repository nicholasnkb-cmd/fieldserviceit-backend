import { Controller, Delete, Get, Param, Patch, Post, Put, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from '../services/settings.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { AuthorizationExempt } from '../../../common/decorators/authorization-exempt.decorator';
import { TenantBranding, TenantCustomization } from '../tenant-customization';


@Controller('settings')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard)
@BusinessOnly()
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  private companyId(user: CurrentUserType) {
    return user.effectiveCompanyId || user.companyId;
  }

  @AuthorizationExempt('Authenticated business users may view settings for their resolved tenant only', 'platform-operations', '2026-12-31')
  @Get()
  getSettings(@CurrentUser() user: CurrentUserType) {
    return this.settingsService.getSettings(this.companyId(user));
  }

  @AuthorizationExempt('Company settings history is tenant-scoped and restricted to administrators', 'platform-operations', '2026-12-31')
  @Get('history')
  @UseGuards(RolesGuard)
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  getHistory(@CurrentUser() user: CurrentUserType) {
    return this.settingsService.getHistory(this.companyId(user));
  }

  @AuthorizationExempt('Company setting changes are tenant-scoped and restricted to administrators', 'platform-operations', '2026-12-31')
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
    return this.settingsService.updateSettings(this.companyId(user), dto, user.id);
  }

  @AuthorizationExempt('Company branding changes are tenant-scoped and restricted to administrators', 'platform-operations', '2026-12-31')
  @Put('branding')
  @UseGuards(RolesGuard)
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  updateBranding(@Body() branding: TenantBranding, @CurrentUser() user: CurrentUserType) {
    return this.settingsService.updateBranding(this.companyId(user), branding, user.id);
  }

  @AuthorizationExempt('Company customization changes are tenant-scoped and restricted to administrators', 'platform-operations', '2026-12-31')
  @Put('customization')
  @UseGuards(RolesGuard)
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  updateCustomization(@Body() customization: TenantCustomization, @CurrentUser() user: CurrentUserType) {
    return this.settingsService.updateCustomization(this.companyId(user), customization, user.id);
  }

  @AuthorizationExempt('Company customization resets are tenant-scoped and restricted to administrators', 'platform-operations', '2026-12-31')
  @Delete('customization')
  @UseGuards(RolesGuard)
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  resetCustomization(@CurrentUser() user: CurrentUserType) {
    return this.settingsService.resetCustomization(this.companyId(user), user.id);
  }

  @AuthorizationExempt('Company settings rollback is tenant-scoped and restricted to administrators', 'platform-operations', '2026-12-31')
  @Post('history/:id/rollback')
  @UseGuards(RolesGuard)
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  rollback(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.settingsService.rollback(this.companyId(user), id, user.id);
  }
}
