import { Module } from '@nestjs/common';
import { PlatformSecurityController } from './platform-security.controller';
import { PlatformSecurityService } from './platform-security.service';
import { BackupMonitoringController } from './backup-monitoring.controller';
import { MonitoringAccessGuard } from '../../common/guards/monitoring-access.guard';

@Module({
  controllers: [PlatformSecurityController, BackupMonitoringController],
  providers: [PlatformSecurityService, MonitoringAccessGuard],
  exports: [PlatformSecurityService],
})
export class PlatformSecurityModule {}
