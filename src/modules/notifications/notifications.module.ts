import { Module } from '@nestjs/common';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsService } from './services/notifications.service';
import { EmailService } from './services/email.service';
import { EmailDeliveryService } from './services/email-delivery.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, EmailDeliveryService],
  exports: [NotificationsService, EmailService, EmailDeliveryService],
})
export class NotificationsModule {}
