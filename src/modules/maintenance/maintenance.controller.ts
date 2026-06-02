import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BusinessOnly } from '../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { FeatureAccessGuard } from '../../common/guards/feature-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { MaintenanceService } from './maintenance.service';

@Controller('maintenance')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard)
@BusinessOnly()
@RequireFeature('dispatch')
export class MaintenanceController {
  constructor(private service: MaintenanceService) {}

  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.service.summary(user);
  }

  @Get('plans')
  listPlans(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.listPlans(user, query);
  }

  @Post('plans')
  createPlan(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createPlan(user, dto);
  }

  @Patch('plans/:id')
  updatePlan(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: any) {
    return this.service.updatePlan(user, id, dto);
  }

  @Post('plans/:id/generate-ticket')
  generateTicket(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: any) {
    return this.service.generateTicket(user, id, dto);
  }

  @Post('plans/:id/complete')
  completePlan(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: any) {
    return this.service.completePlan(user, id, dto);
  }
}
