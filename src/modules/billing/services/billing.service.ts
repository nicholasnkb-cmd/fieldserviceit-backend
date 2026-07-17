import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { BillingInterval, BillingLineItem, BillingProviderKey, NormalizedBillingEvent } from '../interfaces/billing-provider.interface';
import { BillingProviderFactory } from './billing-provider.factory';
import { PlansService } from './plans.service';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../auth/legal-consent';

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private plansService: PlansService,
    private providerFactory: BillingProviderFactory,
  ) {}

  async createCheckoutSession(
    companyId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
    options: {
      userId?: string;
      termsAccepted?: boolean;
      termsVersion?: string;
      privacyVersion?: string;
      interval?: BillingInterval;
      seats?: number;
      useTrial?: boolean;
    } = {},
  ) {
    await this.recordCheckoutConsent(options);
    const provider = this.providerFactory.get('PAYPAL');
    if (!provider.configured()) throw new ServiceUnavailableException(`${provider.displayName} is not configured`);

    const plan = await this.plansService.findById(planId);
    if (!plan) throw new NotFoundException('Plan not found');
    if (!plan.isActive) throw new BadRequestException('Plan is not active');

    const interval: BillingInterval = options.interval === 'YEAR' ? 'YEAR' : 'MONTH';
    const seats = Math.max(1, Math.min(10000, Number(options.seats || 1)));
    const baseAmount = Number(interval === 'YEAR' ? plan.annualPrice : plan.monthlyPrice);
    if (baseAmount <= 0) throw new BadRequestException('Free plans do not use checkout');

    const prices = await this.getPriceMappings(planId, provider.key, interval);
    const basePrice = prices.find((price) => price.component === 'BASE')?.externalPriceId;
    if (!basePrice) throw new BadRequestException(`${provider.displayName} ${interval.toLowerCase()} price is not configured`);

    const lineItems: BillingLineItem[] = [{ priceId: basePrice, quantity: 1, component: 'BASE' }];
    // PayPal subscription quantities are included in the provider custom ID.

    const safeSuccessUrl = this.safeReturnUrl(successUrl, '/billing?success=1');
    const safeCancelUrl = this.safeReturnUrl(cancelUrl, '/billing?canceled=1');
    const [cp, company] = await Promise.all([
      this.prisma.companyPlan.findUnique({ where: { companyId } }),
      this.prisma.company.findUnique({ where: { id: companyId } }),
    ]);
    const existingProvider = String(cp?.billingProvider || 'PAYPAL') === 'PAYPAL';
    const customerId = existingProvider ? cp?.providerCustomerId : null;
    const subscriptionId = existingProvider ? cp?.providerSubscriptionId : null;

    const result = await provider.createCheckout({
      companyId,
      companyName: company?.name,
      planId,
      customerId,
      subscriptionId,
      interval,
      seats,
      trialDays: options.useTrial === false ? 0 : Number(plan.trialDays || 0),
      successUrl: safeSuccessUrl,
      cancelUrl: safeCancelUrl,
      lineItems,
    });

    await this.prisma.companyPlan.upsert({
      where: { companyId },
      update: {
        planId,
        billingProvider: provider.key,
        providerCustomerId: result.customerId || customerId || null,
        providerSubscriptionId: result.subscriptionId || result.sessionId || subscriptionId || null,
        billingInterval: interval,
        seatQuantity: seats,
        status: 'INCOMPLETE',
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        gracePeriodEndsAt: null,
        updatedAt: new Date(),
      },
      create: {
        companyId,
        planId,
        billingProvider: provider.key,
        providerCustomerId: result.customerId || customerId || null,
        providerSubscriptionId: result.subscriptionId || result.sessionId || subscriptionId || null,
        billingInterval: interval,
        seatQuantity: seats,
        status: 'INCOMPLETE',
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        gracePeriodEndsAt: null,
      },
    });
    return { ...result, provider: provider.key };
  }

  private async recordCheckoutConsent(options: { userId?: string; termsAccepted?: boolean; termsVersion?: string; privacyVersion?: string }) {
    if (!options.userId || !options.termsAccepted || options.termsVersion !== TERMS_VERSION || options.privacyVersion !== PRIVACY_VERSION) {
      throw new BadRequestException('Review and accept the current Terms of Service and Privacy Policy before checkout');
    }
    await this.prisma.execute(
      `INSERT INTO UserLegalConsent (id, userId, termsVersion, privacyVersion, acceptedAt)
       VALUES (?, ?, ?, ?, NOW(3))`,
      [crypto.randomUUID(), options.userId, options.termsVersion, options.privacyVersion],
    );
  }

  async getInvoices(companyId: string) {
    const cp = await this.prisma.companyPlan.findUnique({ where: { companyId } });
    if (!cp) return [];
    const provider = this.providerFactory.get('PAYPAL');
    if (!provider.configured()) return [];
    return provider.listInvoices({
      customerId: cp.providerCustomerId,
      subscriptionId: cp.providerSubscriptionId,
    });
  }

  async createPortalSession(companyId: string, returnUrl: string) {
    const cp = await this.prisma.companyPlan.findUnique({ where: { companyId } });
    if (!cp) throw new BadRequestException('No subscription exists for this company');
    const provider = this.providerFactory.get('PAYPAL');
    return provider.createPortal({
      companyId,
      customerId: cp.providerCustomerId,
      subscriptionId: cp.providerSubscriptionId,
      returnUrl: this.safeReturnUrl(returnUrl, '/billing'),
    });
  }

  async getBillingSummary(companyId: string) {
    const subscription = await this.plansService.getCompanyPlan(companyId);
    const providers = await this.getProviderReadiness();
    if (!subscription) return { subscription: null, entitlement: { allowed: true, state: 'NO_SUBSCRIPTION' }, providers };
    const now = Date.now();
    const graceEnd = subscription.gracePeriodEndsAt ? new Date(subscription.gracePeriodEndsAt).getTime() : 0;
    const status = String(subscription.status || 'ACTIVE').toUpperCase();
    const allowed = ['ACTIVE', 'TRIALING'].includes(status) || (status === 'PAST_DUE' && graceEnd > now);
    return {
      subscription,
      entitlement: {
        allowed,
        state: status === 'PAST_DUE' && graceEnd > now ? 'GRACE_PERIOD' : status,
        gracePeriodEndsAt: subscription.gracePeriodEndsAt || null,
      },
      providers,
    };
  }

  async getProviderReadiness() {
    const priceRows = await this.safeQuery<any[]>(`SELECT provider, COUNT(*) as priceCount FROM BillingPrice WHERE provider = 'PAYPAL' AND isActive = 1 GROUP BY provider`);
    const priceCounts = Object.fromEntries(priceRows.map((row) => [row.provider, Number(row.priceCount || 0)]));
    return this.providerFactory.all().map((provider) => ({
      key: provider.key,
      name: provider.displayName,
      ...provider.readiness(),
      priceCount: priceCounts[provider.key] || 0,
      webhookPath: `/v1/billing/webhook/${provider.key.toLowerCase()}`,
      isDefault: provider.key === this.providerFactory.defaultKey(),
    }));
  }

  async testProvider() {
    return this.providerFactory.get('PAYPAL').testConnection();
  }

  async handleWebhook(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>) {
    const provider = this.providerFactory.get('PAYPAL');
    const event = await provider.verifyAndParseWebhook(rawBody, headers);
    const existing = await this.safeQuery<any[]>(`SELECT id, status FROM BillingEvent WHERE provider = ? AND providerEventId = ? LIMIT 1`, [event.provider, event.id]);
    if (existing[0]?.status === 'PROCESSED' || existing[0]?.status === 'IGNORED') return { received: true, duplicate: true };

    const eventRecordId = existing[0]?.id || crypto.randomUUID();
    if (!existing[0]) {
      await this.prisma.execute(
        `INSERT INTO BillingEvent (id, provider, providerEventId, eventType, companyId, status, payload, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'RECEIVED', ?, NOW(3), NOW(3))`,
        [eventRecordId, event.provider, event.id, event.type, event.companyId || null, JSON.stringify(event.raw)],
      );
    }

    try {
      const processed = await this.applyEvent(event);
      await this.prisma.execute(
        `UPDATE BillingEvent SET companyId = ?, status = ?, processedAt = NOW(3), updatedAt = NOW(3), errorMessage = NULL WHERE id = ?`,
        [event.companyId || null, processed ? 'PROCESSED' : 'IGNORED', eventRecordId],
      );
      return { received: true };
    } catch (error: any) {
      await this.prisma.execute(
        `UPDATE BillingEvent SET status = 'FAILED', errorMessage = ?, updatedAt = NOW(3) WHERE id = ?`,
        [String(error?.message || error).slice(0, 4000), eventRecordId],
      );
      throw error;
    }
  }

  async listEvents(limit = 50) {
    return this.safeQuery<any[]>(
      `SELECT id, provider, providerEventId, eventType, companyId, status, errorMessage, processedAt, createdAt
       FROM BillingEvent WHERE provider = 'PAYPAL' ORDER BY createdAt DESC LIMIT ?`,
      [Math.max(1, Math.min(200, Number(limit || 50)))],
    );
  }

  async listPriceMappings() {
    return this.safeQuery<any[]>(
      `SELECT bp.*, p.name as planName FROM BillingPrice bp JOIN Plan p ON p.id = bp.planId WHERE bp.provider = 'PAYPAL' ORDER BY p.sortOrder, bp.billingInterval`,
    );
  }

  async upsertPriceMapping(input: { planId: string; interval: string; component: string; externalPriceId: string; isActive?: boolean }) {
    const provider = 'PAYPAL';
    const interval = input.interval === 'YEAR' ? 'YEAR' : 'MONTH';
    if (input.component && input.component !== 'BASE') throw new BadRequestException('PayPal billing supports base subscription plan mappings only');
    const component = 'BASE';
    if (!input.externalPriceId?.trim()) throw new BadRequestException('External price ID is required');
    await this.prisma.execute(
      `INSERT INTO BillingPrice (id, planId, provider, billingInterval, component, externalPriceId, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE externalPriceId = VALUES(externalPriceId), isActive = VALUES(isActive), updatedAt = NOW(3)`,
      [crypto.randomUUID(), input.planId, provider, interval, component, input.externalPriceId.trim(), input.isActive === false ? 0 : 1],
    );
    return this.listPriceMappings();
  }

  private async applyEvent(event: NormalizedBillingEvent) {
    const type = event.type.toLowerCase();
    const isFailedPayment = type.includes('payment_failed') || type.includes('payment.failed') || type.includes('invoice_payment_failed') || type.includes('subscription_payment_failed');
    const isPaid = type.includes('payment_succeeded') || type.includes('payment.sale.completed') || type.includes('invoice_paid') || type.includes('invoice.payment_succeeded') || type.includes('transaction.completed');
    const isSubscription = type.includes('subscription') || type.includes('checkout') || type.includes('transaction.completed');
    if (!isFailedPayment && !isPaid && !isSubscription) return false;

    let current: any = null;
    if (event.companyId) current = await this.prisma.companyPlan.findUnique({ where: { companyId: event.companyId } });
    if (!current && event.subscriptionId) {
      current = await this.prisma.companyPlan.findFirst({ where: { providerSubscriptionId: event.subscriptionId } });
    }
    const companyId = event.companyId || current?.companyId;
    if (!companyId) throw new BadRequestException('Billing event is missing company metadata');

    if (isFailedPayment) {
      const gracePeriodEndsAt = new Date(Date.now() + this.graceDays() * 86400000);
      await this.prisma.companyPlan.updateMany({
        where: { companyId },
        data: { status: 'PAST_DUE', gracePeriodEndsAt, updatedAt: new Date() },
      });
      return true;
    }

    const status = isPaid ? 'ACTIVE' : this.mapStatusFromEvent(event);
    const planId = event.planId || current?.planId;
    if (!planId) throw new BadRequestException('Billing event is missing plan metadata');
    const data: any = {
      planId,
      billingProvider: event.provider,
      providerCustomerId: event.customerId || current?.providerCustomerId || null,
      providerSubscriptionId: event.subscriptionId || current?.providerSubscriptionId || null,
      billingInterval: event.interval || current?.billingInterval || 'MONTH',
      seatQuantity: event.seats || current?.seatQuantity || 1,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? current?.cancelAtPeriodEnd ?? false,
      status,
      trialEndsAt: event.trialEndsAt || current?.trialEndsAt || null,
      currentPeriodStart: event.currentPeriodStart || current?.currentPeriodStart || null,
      currentPeriodEnd: event.currentPeriodEnd || current?.currentPeriodEnd || null,
      gracePeriodEndsAt: status === 'ACTIVE' ? null : current?.gracePeriodEndsAt || null,
      updatedAt: new Date(),
    };
    await this.prisma.companyPlan.upsert({
      where: { companyId },
      update: data,
      create: { companyId, ...data },
    });
    return true;
  }

  private async getPriceMappings(planId: string, provider: BillingProviderKey, interval: BillingInterval) {
    return this.safeQuery<any[]>(
      `SELECT component, externalPriceId FROM BillingPrice WHERE planId = ? AND provider = ? AND billingInterval = ? AND isActive = 1`,
      [planId, provider, interval],
    );
  }

  private async safeQuery<T>(sql: string, values: any[] = []): Promise<T> {
    try {
      return await this.prisma.query<T>(sql, values);
    } catch (error: any) {
      if (String(error?.message || '').includes("doesn't exist")) return [] as T;
      throw error;
    }
  }

  private safeReturnUrl(value: string | undefined, fallbackPath: string) {
    const base = process.env.FRONTEND_URL || 'http://localhost:3000';
    const fallback = new URL(fallbackPath, base).toString();
    if (!value) return fallback;
    try {
      const candidate = new URL(value);
      return candidate.origin === new URL(base).origin ? candidate.toString() : fallback;
    } catch {
      return fallback;
    }
  }

  private mapStatus(status?: string | null) {
    switch (String(status || '').toLowerCase()) {
      case 'active':
      case 'paid':
      case 'completed':
        return 'ACTIVE';
      case 'trialing':
      case 'on_trial':
        return 'TRIALING';
      case 'past_due':
      case 'past-due':
        return 'PAST_DUE';
      case 'cancelled':
      case 'canceled':
        return 'CANCELED';
      case 'suspended':
        return 'PAST_DUE';
      case 'unpaid':
        return 'UNPAID';
      default:
        return 'INCOMPLETE';
    }
  }

  private mapStatusFromEvent(event: NormalizedBillingEvent) {
    const type = String(event.type || '').toLowerCase();
    if (type.includes('activated')) return 'ACTIVE';
    if (type.includes('cancelled') || type.includes('canceled')) return 'CANCELED';
    if (type.includes('suspended')) return 'PAST_DUE';
    if (type.includes('expired')) return 'CANCELED';
    return this.mapStatus(event.status);
  }

  private graceDays() {
    return Math.max(0, Math.min(30, Number(process.env.BILLING_GRACE_PERIOD_DAYS || 7)));
  }
}
