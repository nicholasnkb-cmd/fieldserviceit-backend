import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MonitoringAccessGuard } from '../../common/guards/monitoring-access.guard';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [HealthService, MonitoringAccessGuard],
})
export class HealthModule {}
