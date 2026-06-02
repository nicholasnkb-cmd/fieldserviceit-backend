import { Module } from '@nestjs/common';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';

@Module({
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService],
})
export class CustomerPortalModule {}
