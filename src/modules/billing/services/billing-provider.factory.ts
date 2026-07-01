import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingProvider, BillingProviderKey } from '../interfaces/billing-provider.interface';
import { PayPalBillingProvider } from '../providers/paypal.provider';

@Injectable()
export class BillingProviderFactory {
  private readonly providers: Record<BillingProviderKey, BillingProvider>;

  constructor() {
    this.providers = {
      PAYPAL: new PayPalBillingProvider(),
    };
  }

  get(provider?: string | null): BillingProvider {
    if (provider && String(provider).toUpperCase() !== 'PAYPAL') {
      throw new BadRequestException('PayPal is the only supported billing provider');
    }
    return this.providers.PAYPAL;
  }

  all() {
    return Object.values(this.providers);
  }

  defaultKey(): BillingProviderKey {
    return 'PAYPAL';
  }

}
