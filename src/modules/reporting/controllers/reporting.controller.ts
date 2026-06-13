import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportingService } from '../services/reporting.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { RequireFeature } from '../../../common/decorators/feature.decorator';
import { FeatureAccessGuard } from '../../../common/guards/feature-access.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@BusinessOnly()
@RequireFeature('reporting')
@RequirePermissions('reports.view')
export class ReportingController {
  constructor(private reportingService: ReportingService) {}

  @Get('preferences')
  getPreferences(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getPreferences(user.companyId);
  }

  @Get('tickets')
  getTicketSummary(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: CurrentUserType) {
    return this.reportingService.getTicketSummary(user.companyId, from, to);
  }

  @Get('sla')
  getSlaCompliance(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getSlaCompliance(user.companyId);
  }

  @Get('technician')
  getTechnicianPerformance(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getTechnicianPerformance(user.companyId);
  }

  @Get('assets')
  getAssetInventory(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getAssetInventory(user.companyId);
  }

  @Get('activity')
  getActivityFeed(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getActivityFeed(user.companyId);
  }
}
