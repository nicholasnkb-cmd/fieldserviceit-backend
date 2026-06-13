import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: any;
  let plans: any;
  let provider: any;
  let factory: any;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://fieldserviceit.com';
    prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ name: 'Acme IT' }) },
      companyPlan: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      query: jest.fn(),
      execute: jest.fn(),
    };
    plans = { findById: jest.fn(), getCompanyPlan: jest.fn() };
    provider = {
      key: 'STRIPE',
      displayName: 'Stripe',
      configured: jest.fn().mockReturnValue(true),
      readiness: jest.fn().mockReturnValue({ configured: true, checks: [] }),
      createCheckout: jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test', sessionId: 'cs_1', customerId: 'cus_1' }),
      createPortal: jest.fn(),
      listInvoices: jest.fn(),
      verifyAndParseWebhook: jest.fn(),
      testConnection: jest.fn(),
    };
    factory = {
      get: jest.fn().mockReturnValue(provider),
      all: jest.fn().mockReturnValue([provider]),
      defaultKey: jest.fn().mockReturnValue('STRIPE'),
    };
    service = new BillingService(prisma, plans, factory);
  });

  it('rejects checkout when the selected provider is unavailable', async () => {
    provider.configured.mockReturnValue(false);
    await expect(service.createCheckoutSession('company-1', 'plan-1', '', '')).rejects.toThrow(ServiceUnavailableException);
  });

  it('creates annual checkout with base, seat, trial, and safe URLs', async () => {
    plans.findById.mockResolvedValue({
      id: 'business',
      isActive: true,
      monthlyPrice: 79,
      annualPrice: 790,
      seatMonthlyPrice: 12,
      seatAnnualPrice: 120,
      trialDays: 14,
    });
    prisma.query.mockResolvedValue([
      { component: 'BASE', externalPriceId: 'price_annual' },
      { component: 'SEAT', externalPriceId: 'price_seat_annual' },
    ]);
    prisma.companyPlan.findUnique.mockResolvedValue({ id: 'cp-1', billingProvider: 'STRIPE', providerCustomerId: 'cus_existing' });

    await service.createCheckoutSession(
      'company-1',
      'business',
      'https://fieldserviceit.com/billing?success=1',
      'https://example.invalid/cancel',
      { interval: 'YEAR', seats: 5 },
    );

    expect(provider.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      interval: 'YEAR',
      seats: 5,
      trialDays: 14,
      customerId: 'cus_existing',
      cancelUrl: 'https://fieldserviceit.com/billing?canceled=1',
      lineItems: [
        { priceId: 'price_annual', quantity: 1, component: 'BASE' },
        { priceId: 'price_seat_annual', quantity: 4, component: 'SEAT' },
      ],
    }));
  });

  it('uses the legacy monthly Stripe price during migration', async () => {
    plans.findById.mockResolvedValue({ id: 'business', isActive: true, monthlyPrice: 79, annualPrice: 790, stripePriceId: 'price_legacy' });
    prisma.query.mockResolvedValue([]);
    prisma.companyPlan.findUnique.mockResolvedValue(null);

    await service.createCheckoutSession('company-1', 'business', '', '');

    expect(provider.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      lineItems: [{ priceId: 'price_legacy', quantity: 1, component: 'BASE' }],
    }));
  });

  it('requires a configured seat price when seats are billable', async () => {
    plans.findById.mockResolvedValue({ id: 'business', isActive: true, monthlyPrice: 79, seatMonthlyPrice: 12, stripePriceId: 'price_base' });
    prisma.query.mockResolvedValue([]);
    await expect(service.createCheckoutSession('company-1', 'business', '', '', { seats: 2 })).rejects.toThrow(BadRequestException);
  });

  it('records failed payments and starts a grace period', async () => {
    provider.verifyAndParseWebhook.mockResolvedValue({
      provider: 'STRIPE',
      id: 'evt_failed',
      type: 'invoice.payment_failed',
      companyId: 'company-1',
      subscriptionId: 'sub-1',
      raw: { id: 'evt_failed' },
    });
    prisma.query.mockResolvedValue([]);
    prisma.execute.mockResolvedValue({});

    await service.handleWebhook('STRIPE', 'raw', { 'stripe-signature': 'sig' });

    expect(prisma.companyPlan.updateMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      data: {
        status: 'PAST_DUE',
        gracePeriodEndsAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
    expect(prisma.execute).toHaveBeenLastCalledWith(expect.stringContaining("status = ?"), expect.arrayContaining(['PROCESSED']));
  });

  it('skips webhook events already processed', async () => {
    provider.verifyAndParseWebhook.mockResolvedValue({ provider: 'STRIPE', id: 'evt_1', type: 'invoice.paid', raw: {} });
    prisma.query.mockResolvedValue([{ id: 'record-1', status: 'PROCESSED' }]);

    await expect(service.handleWebhook('STRIPE', 'raw', {})).resolves.toEqual({ received: true, duplicate: true });
    expect(prisma.companyPlan.upsert).not.toHaveBeenCalled();
  });

  it('reports grace-period entitlement without locking billing', async () => {
    plans.getCompanyPlan.mockResolvedValue({
      status: 'PAST_DUE',
      gracePeriodEndsAt: new Date(Date.now() + 86400000),
    });
    prisma.query.mockResolvedValue([]);

    const result = await service.getBillingSummary('company-1');
    expect(result.entitlement).toMatchObject({ allowed: true, state: 'GRACE_PERIOD' });
  });
});
