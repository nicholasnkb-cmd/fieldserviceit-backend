import { Module } from '@nestjs/common';
import { FieldServiceController } from './controllers/field-service.controller';
import { FieldServiceService } from './services/field-service.service';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [TicketsModule],
  controllers: [FieldServiceController],
  providers: [FieldServiceService],
  exports: [FieldServiceService],
})
export class FieldServiceModule {}
