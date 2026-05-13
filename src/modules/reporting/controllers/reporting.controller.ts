import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportingService } from '../services/reporting.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard)
@BusinessOnly()
export class ReportingController {
  constructor(private reportingService: ReportingService) {}

  @Get('tickets')
  getTicketSummary(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: any) {
    return this.reportingService.getTicketSummary(user.companyId, from, to);
  }

  @Get('sla')
  getSlaCompliance(@CurrentUser() user: any) {
    return this.reportingService.getSlaCompliance(user.companyId);
  }

  @Get('technician')
  getTechnicianPerformance(@CurrentUser() user: any) {
    return this.reportingService.getTechnicianPerformance(user.companyId);
  }

  @Get('assets')
  getAssetInventory(@CurrentUser() user: any) {
    return this.reportingService.getAssetInventory(user.companyId);
  }

  @Get('activity')
  getActivityFeed(@CurrentUser() user: any) {
    return this.reportingService.getActivityFeed(user.companyId);
  }
}
