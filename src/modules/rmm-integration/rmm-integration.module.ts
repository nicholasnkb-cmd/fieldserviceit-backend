import { Module, OnModuleInit } from '@nestjs/common';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { RmmIntegrationService } from './services/rmm-integration.service';
import { RmmSyncService } from './services/rmm-sync.service';
import { RmmIntegrationController } from './controllers/rmm-integration.controller';
import { RmmProviderFactory } from './services/rmm-provider-factory.service';
import { NinjaOneProvider } from './providers/ninjaone.provider';
import { DattoProvider } from './providers/datto.provider';
import { ConnectWiseProvider } from './providers/connectwise.provider';
import { AteraProvider } from './providers/atera.provider';
import { SyncroProvider } from './providers/syncro.provider';
import { KaseyaProvider } from './providers/kaseya.provider';
import { NableProvider } from './providers/nable.provider';
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
    NinjaOneProvider,
    DattoProvider,
    ConnectWiseProvider,
    AteraProvider,
    SyncroProvider,
    KaseyaProvider,
    NableProvider,
    TicketTimelineService,
  ],
  exports: [RmmIntegrationService, RmmSyncService, RmmProviderFactory],
})
export class RmmIntegrationModule {}
