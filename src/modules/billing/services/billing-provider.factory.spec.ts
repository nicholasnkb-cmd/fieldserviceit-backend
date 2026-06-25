import { BillingProviderFactory } from './billing-provider.factory';

describe('BillingProviderFactory', () => {
  const originalProvider = process.env.BILLING_PROVIDER;

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.BILLING_PROVIDER;
    } else {
      process.env.BILLING_PROVIDER = originalProvider;
    }
  });

  it('resolves PayPal as a supported provider', () => {
    const factory = new BillingProviderFactory();
    const provider = factory.get('paypal');

    expect(provider.key).toBe('PAYPAL');
    expect(provider.displayName).toBe('PayPal');
  });

  it('allows PayPal to be the default billing provider', () => {
    process.env.BILLING_PROVIDER = 'PAYPAL';
    const factory = new BillingProviderFactory();

    expect(factory.defaultKey()).toBe('PAYPAL');
  });

  it('rejects every non-PayPal provider', () => {
    const factory = new BillingProviderFactory();

    expect(() => factory.get('card-gateway')).toThrow('PayPal is the only supported billing provider');
  });
});
