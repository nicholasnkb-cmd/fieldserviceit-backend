import { Module } from '@nestjs/common';
import { CmdbController } from './controllers/cmdb.controller';
import { MdmEnrollmentController } from './controllers/mdm-enrollment.controller';
import { CmdbService } from './services/cmdb.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketsModule } from '../tickets/tickets.module';
import { NetworkInventoryService } from './services/network-inventory.service';

@Module({
  imports: [NotificationsModule, TicketsModule],
  controllers: [CmdbController, MdmEnrollmentController],
  providers: [CmdbService, NetworkInventoryService],
  exports: [CmdbService, NetworkInventoryService],
})
export class CmdbModule {}
