import { Module } from '@nestjs/common';
import { MonitoringAccessGuard } from '../../common/guards/monitoring-access.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminDeploymentEventsController, MonitoringDeploymentEventsController } from './deployment-events.controller';
import { DeploymentEventsService } from './deployment-events.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MonitoringDeploymentEventsController, AdminDeploymentEventsController],
  providers: [DeploymentEventsService, MonitoringAccessGuard],
  exports: [DeploymentEventsService],
})
export class DeploymentsModule {}
