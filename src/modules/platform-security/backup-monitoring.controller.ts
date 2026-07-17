import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MonitoringAccessGuard } from '../../common/guards/monitoring-access.guard';
import { PlatformSecurityService } from './platform-security.service';

@Controller('monitoring/backups')
export class BackupMonitoringController {
  constructor(private readonly service: PlatformSecurityService) {}

  @Post('restore-drill')
  @Public()
  @UseGuards(JwtAuthGuard, MonitoringAccessGuard)
  @AuthorizationExempt('Authenticated monitoring systems run the scheduled isolated restore drill', 'security-team', '2026-10-31')
  @HttpCode(HttpStatus.OK)
  runLatestRestoreDrill() {
    return this.service.runLatestRestoreDrill();
  }
}
