import { Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from '@nestjs/common';
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
import { CustomReportDto } from '../dto/custom-report.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@BusinessOnly()
@RequireFeature('reporting')
@RequirePermissions('reports.view')
export class ReportingController {
  constructor(private reportingService: ReportingService) {}

  private getCompanyId(user: CurrentUserType): string {
    const companyId = user.effectiveCompanyId || user.companyId;
    if (!companyId) throw new ForbiddenException('Select a company context to view reports');
    return companyId;
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getPreferences(this.getCompanyId(user));
  }

  @Get('tickets')
  getTicketSummary(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: CurrentUserType) {
    return this.reportingService.getTicketSummary(this.getCompanyId(user), from, to);
  }

  @Get('operations')
  getOperationsSummary(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getOperationsSummary(this.getCompanyId(user));
  }

  @Get('sla')
  getSlaCompliance(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getSlaCompliance(this.getCompanyId(user));
  }

  @Get('technician')
  getTechnicianPerformance(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getTechnicianPerformance(this.getCompanyId(user));
  }

  @Get('outcomes')
  getServiceOutcomes(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getServiceOutcomes(this.getCompanyId(user));
  }

  @Get('assets')
  getAssetInventory(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getAssetInventory(this.getCompanyId(user));
  }

  @Get('activity')
  getActivityFeed(@CurrentUser() user: CurrentUserType) {
    return this.reportingService.getActivityFeed(this.getCompanyId(user));
  }

  @Post('custom')
  createCustomReport(@Body() dto: CustomReportDto, @CurrentUser() user: CurrentUserType) {
    return this.reportingService.createCustomReport(this.getCompanyId(user), dto);
  }
}
