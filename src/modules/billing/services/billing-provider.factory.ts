import { Injectable } from '@nestjs/common';
import { BillingProvider, BillingProviderKey } from '../interfaces/billing-provider.interface';
import { StripeBillingProvider } from '../providers/stripe.provider';
import { PaddleBillingProvider } from '../providers/paddle.provider';
import { LemonSqueezyBillingProvider } from '../providers/lemon-squeezy.provider';
import { ChargebeeBillingProvider } from '../providers/chargebee.provider';

@Injectable()
export class BillingProviderFactory {
  private readonly providers: Record<BillingProviderKey, BillingProvider>;

  constructor() {
    this.providers = {
      STRIPE: new StripeBillingProvider(),
      PADDLE: new PaddleBillingProvider(),
      LEMON_SQUEEZY: new LemonSqueezyBillingProvider(),
      CHARGEBEE: new ChargebeeBillingProvider(),
    };
  }

  get(provider?: string | null): BillingProvider {
    const key = this.normalize(provider);
    return this.providers[key] || this.providers.STRIPE;
  }

  all() {
    return Object.values(this.providers);
  }

  defaultKey(): BillingProviderKey {
    return this.normalize(process.env.BILLING_PROVIDER || 'STRIPE');
  }

  private normalize(provider?: string | null): BillingProviderKey {
    const key = String(provider || 'STRIPE').toUpperCase().replace(/-/g, '_') as BillingProviderKey;
    return ['STRIPE', 'PADDLE', 'LEMON_SQUEEZY', 'CHARGEBEE'].includes(key) ? key : 'STRIPE';
  }
}
