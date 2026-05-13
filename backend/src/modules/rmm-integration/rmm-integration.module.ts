import { Module, OnModuleInit } from '@nestjs/common';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { RmmIntegrationService } from './services/rmm-integration.service';
import { RmmSyncService } from './services/rmm-sync.service';
import { RmmIntegrationController } from './controllers/rmm-integration.controller';
import { RmmProviderFactory } from './services/rmm-provider-factory.service';
import { PrismaService } from '../../database/prisma.service';
import { TicketTimelineService } from '../tickets/services/ticket-timeline.service';
import { NotificationsService } from '../notifications/services/notifications.service';
import { TicketsGateway } from '../tickets/events/tickets.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule, TicketsModule],
  controllers: [RmmIntegrationController],
  providers: [
    RmmIntegrationService,
    RmmSyncService,
    RmmProviderFactory,
    PrismaService,
    TicketTimelineService,
  ],
  exports: [RmmIntegrationService, RmmSyncService, RmmProviderFactory],
})
export class RmmIntegrationModule {}
