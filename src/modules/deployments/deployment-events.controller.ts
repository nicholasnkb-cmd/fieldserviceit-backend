import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MonitoringAccessGuard } from '../../common/guards/monitoring-access.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DeploymentEventsService } from './deployment-events.service';
import { RecordDeploymentEventDto } from './dto/record-deployment-event.dto';

@Controller('monitoring/deployments')
export class MonitoringDeploymentEventsController {
  constructor(private readonly service: DeploymentEventsService) {}

  @Post()
  @Public()
  @UseGuards(JwtAuthGuard, MonitoringAccessGuard)
  @AuthorizationExempt('Authenticated monitoring systems report deployment outcomes', 'security-team', '2026-10-31')
  @HttpCode(HttpStatus.OK)
  record(@Body() body: RecordDeploymentEventDto) {
    return this.service.record(body);
  }

  @Get('migrations')
  @Public()
  @UseGuards(JwtAuthGuard, MonitoringAccessGuard)
  @AuthorizationExempt('Authenticated monitoring systems inspect migration health', 'security-team', '2026-10-31')
  migrationStatus() {
    return this.service.migrationStatus();
  }
}

@Controller('admin/deployments')
@UseGuards(JwtAuthGuard, BusinessOnlyGuard, RolesGuard, PermissionsGuard)
@Roles('SUPER_ADMIN')
export class AdminDeploymentEventsController {
  constructor(private readonly service: DeploymentEventsService) {}

  @Get()
  @RequirePermissions('platform-security.view')
  list(@Query('limit') limit?: string) {
    return this.service.list(limit);
  }
}
