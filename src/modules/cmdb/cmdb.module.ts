import { Module } from '@nestjs/common';
import { CmdbController } from './controllers/cmdb.controller';
import { MdmEnrollmentController } from './controllers/mdm-enrollment.controller';
import { CmdbService } from './services/cmdb.service';

@Module({
  controllers: [CmdbController, MdmEnrollmentController],
  providers: [CmdbService],
  exports: [CmdbService],
})
export class CmdbModule {}
