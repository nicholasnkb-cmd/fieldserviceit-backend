import { Global, Module } from '@nestjs/common';
import { BillingController } from './controllers/billing.controller';
import { PlansController } from './controllers/plans.controller';
import { PlansService } from './services/plans.service';
import { BillingService } from './services/billing.service';
import { UsageService } from './services/usage.service';
import { BillingProviderFactory } from './services/billing-provider.factory';

@Global()
@Module({
  controllers: [BillingController, PlansController],
  providers: [PlansService, BillingProviderFactory, BillingService, UsageService],
  exports: [PlansService, BillingService, UsageService],
})
export class BillingModule {}
