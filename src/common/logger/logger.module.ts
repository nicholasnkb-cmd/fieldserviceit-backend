import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { StructuredLogger } from './structured-logger.service';

@Global()
@Module({
  providers: [LoggerService, StructuredLogger],
  exports: [LoggerService, StructuredLogger],
})
export class LoggerModule {}
