import { Module } from '@nestjs/common';
import { CmdbController } from './controllers/cmdb.controller';
import { MdmEnrollmentController } from './controllers/mdm-enrollment.controller';
import { CmdbService } from './services/cmdb.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CmdbController, MdmEnrollmentController],
  providers: [CmdbService],
  exports: [CmdbService],
})
export class CmdbModule {}
