import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { MalwareScannerService } from './malware-scanner.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, MalwareScannerService],
  exports: [UploadsService],
})
export class UploadsModule {}
