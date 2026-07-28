import { Module } from '@nestjs/common';
import { PrivacyRequestsController } from './privacy-requests.controller';
import { PrivacyRequestsService } from './privacy-requests.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PrivacyRequestsController],
  providers: [PrivacyRequestsService],
})
export class PrivacyRequestsModule {}
