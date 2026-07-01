import { Module } from '@nestjs/common';
import { ReportingController } from './controllers/reporting.controller';
import { ReportingService } from './services/reporting.service';
import { PublicOperationsController } from './controllers/public-operations.controller';

@Module({
  controllers: [ReportingController, PublicOperationsController],
  providers: [ReportingService],
})
export class ReportingModule {}
