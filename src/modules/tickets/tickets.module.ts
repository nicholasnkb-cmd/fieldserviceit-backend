import { Module } from '@nestjs/common';
import { TicketsController } from './controllers/tickets.controller';
import { TicketsService } from './services/tickets.service';
import { TicketTimelineService } from './services/ticket-timeline.service';
import { TicketExportService } from './services/ticket-export.service';
import { TicketsGateway } from './events/tickets.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { TicketParticipantNotifierService } from './services/ticket-participant-notifier.service';
import { WsAuthGuard } from '../../common/guards/ws-auth.guard';

@Module({
  imports: [NotificationsModule, AuthModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketTimelineService, TicketExportService, TicketsGateway, TicketParticipantNotifierService, WsAuthGuard],
  exports: [TicketsService, TicketsGateway, TicketTimelineService, TicketParticipantNotifierService],
})
export class TicketsModule {}
