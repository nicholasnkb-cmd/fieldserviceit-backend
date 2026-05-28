import { Global, Module } from '@nestjs/common';
import { BillingController } from './controllers/billing.controller';
import { PlansController } from './controllers/plans.controller';
import { PlansService } from './services/plans.service';
import { BillingService } from './services/billing.service';
import { UsageService } from './services/usage.service';

@Global()
@Module({
  controllers: [BillingController, PlansController],
  providers: [PlansService, BillingService, UsageService],
  exports: [PlansService, UsageService],
})
export class BillingModule {}
