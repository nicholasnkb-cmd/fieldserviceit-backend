import { Module } from '@nestjs/common';
import { ReportingController } from './controllers/reporting.controller';
import { ReportingService } from './services/reporting.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
