import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { StatusController } from './status.controller';

@Module({
  controllers: [OperationsController, StatusController],
  providers: [OperationsService],
})
export class OperationsModule {}
