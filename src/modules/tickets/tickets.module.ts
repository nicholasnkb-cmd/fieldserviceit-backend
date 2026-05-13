import { Module } from '@nestjs/common';
import { TicketsController } from './controllers/tickets.controller';
import { TicketsService } from './services/tickets.service';
import { TicketTimelineService } from './services/ticket-timeline.service';
import { TicketExportService } from './services/ticket-export.service';
import { TicketsGateway } from './events/tickets.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketTimelineService, TicketExportService, TicketsGateway],
  exports: [TicketsService, TicketsGateway, TicketTimelineService],
})
export class TicketsModule {}
