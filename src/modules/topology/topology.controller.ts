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

@Controller('topology')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard)
@BusinessOnly()
@RequireFeature('network')
export class TopologyController {
  constructor(private service: TopologyService) {}

  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.service.summary(user);
  }

  @Get('map')
  map(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.map(user, query);
  }

  @Get('sites')
  listSites(@CurrentUser() user: CurrentUserType) {
    return this.service.listSites(user);
  }

  @Post('sites')
  createSite(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createSite(user, dto);
  }

  @Post('links')
  createLink(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createLink(user, dto);
  }

  @Patch('links/:id')
  updateLink(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateLink(user, id, dto);
  }
}
