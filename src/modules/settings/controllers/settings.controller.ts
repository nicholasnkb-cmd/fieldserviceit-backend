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
import { RequireFeature } from '../../../common/decorators/feature.decorator';
import { FeatureAccessGuard } from '../../../common/guards/feature-access.guard';
import { AuthorizationExempt } from '../../../common/decorators/authorization-exempt.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantBranding, TenantCustomization } from '../tenant-customization';


@Controller('settings')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@BusinessOnly()
@RequireFeature('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @RequirePermissions('settings.view')
  @Get()
  getSettings(@CurrentUser() user: CurrentUserType) {
    return this.settingsService.getSettings(user.companyId);
  }

  @RequirePermissions('settings.manage')
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

  @RequirePermissions('settings.manage')
  @Put('branding')
  @UseGuards(RolesGuard)
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  updateBranding(@Body() branding: TenantBranding, @CurrentUser() user: CurrentUserType) {
    return this.settingsService.updateBranding(user.companyId, branding);
  }

  @RequirePermissions('settings.manage')
  @Put('customization')
  @UseGuards(RolesGuard)
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  updateCustomization(@Body() customization: TenantCustomization, @CurrentUser() user: CurrentUserType) {
    return this.settingsService.updateCustomization(user.companyId, customization);
  }
}
