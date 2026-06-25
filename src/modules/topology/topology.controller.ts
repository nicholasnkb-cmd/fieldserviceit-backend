import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BusinessOnly } from '../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { FeatureAccessGuard } from '../../common/guards/feature-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TopologyService } from './topology.service';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Public } from '../../common/decorators/public.decorator';

@Controller('topology')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@BusinessOnly()
@RequireFeature('network')
export class TopologyController {
  constructor(private service: TopologyService) {}

  @RequirePermissions('topology.view')
  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.service.summary(user);
  }

  @RequirePermissions('topology.view')
  @Get('map')
  map(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.map(user, query);
  }

  @RequirePermissions('topology.view')
  @Get('sites')
  listSites(@CurrentUser() user: CurrentUserType) {
    return this.service.listSites(user);
  }

  @RequirePermissions('topology.view')
  @Get('alerts/correlations')
  correlateAlerts(@CurrentUser() user: CurrentUserType) {
    return this.service.correlateAlerts(user);
  }

  @RequirePermissions('topology.manage')
  @Post('sites')
  createSite(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createSite(user, dto);
  }

  @RequirePermissions('topology.manage')
  @Post('links')
  createLink(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createLink(user, dto);
  }

  @RequirePermissions('topology.manage')
  @Patch('links/:id')
  updateLink(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateLink(user, id, dto);
  }

  @RequirePermissions('topology.manage')
  @Post('layout')
  saveLayout(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.saveLayout(user, dto);
  }

  @RequirePermissions('topology.manage')
  @Post('layout/reset')
  resetLayout(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.resetLayout(user, dto);
  }

  @RequirePermissions('topology.manage')
  @Patch('settings')
  updateSettings(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.updateSettings(user, dto);
  }

  @RequirePermissions('topology.manage')
  @Post('shares')
  createShare(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createShare(user, dto);
  }

  @RequirePermissions('topology.manage')
  @Post('assets/:assetId/actions')
  queueAction(@CurrentUser() user: CurrentUserType, @Param('assetId') assetId: string, @Body() dto: any) {
    return this.service.queueAction(user, assetId, dto);
  }

  @RequirePermissions('topology.manage')
  @Post('changes/detect')
  detectChanges(@CurrentUser() user: CurrentUserType) {
    return this.service.detectChanges(user);
  }
}

@Controller('public/topology')
export class PublicTopologyController {
  constructor(private service: TopologyService) {}

  @Public()
  @Get('shares/:token')
  publicShare(@Param('token') token: string) {
    return this.service.publicShare(token);
  }
}
