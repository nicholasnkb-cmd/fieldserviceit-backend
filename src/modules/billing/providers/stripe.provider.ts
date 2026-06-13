import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BillingCheckoutInput, BillingProvider, BillingProviderKey, BillingPortalInput } from '../interfaces/billing-provider.interface';
import { fromSeconds } from './provider-utils';

export class StripeBillingProvider implements BillingProvider {
  key: BillingProviderKey = 'STRIPE';
  displayName = 'Stripe';
  private stripe: any = null;

  constructor() {
    if (process.env.STRIPE_SECRET_KEY) {
      this.stripe = new (require('stripe'))(process.env.STRIPE_SECRET_KEY);
    }
  }

  configured() {
    return Boolean(this.stripe);
  }

  readiness() {
    return {
      configured: this.configured(),
      checks: [
        { name: 'Secret key', ok: Boolean(process.env.STRIPE_SECRET_KEY), detail: process.env.STRIPE_SECRET_KEY ? 'STRIPE_SECRET_KEY is configured.' : 'Set STRIPE_SECRET_KEY.' },
        { name: 'Webhook secret', ok: Boolean(process.env.STRIPE_WEBHOOK_SECRET), detail: process.env.STRIPE_WEBHOOK_SECRET ? 'STRIPE_WEBHOOK_SECRET is configured.' : 'Set STRIPE_WEBHOOK_SECRET.' },
      ],
    };
  }

  async createCheckout(input: BillingCheckoutInput) {
    if (!this.stripe) throw new ServiceUnavailableException('Stripe is not configured');
    let customerId = input.customerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({ name: input.companyName || 'Unknown', metadata: { companyId: input.companyId } });
      customerId = customer.id;
    }
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: input.lineItems.map((item) => ({ price: item.priceId, quantity: item.quantity })),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.companyId,
      allow_promotion_codes: true,
      metadata: { companyId: input.companyId, planId: input.planId, provider: this.key, interval: input.interval, seats: String(input.seats) },
      subscription_data: {
        metadata: { companyId: input.companyId, planId: input.planId, provider: this.key, interval: input.interval, seats: String(input.seats) },
        ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
      },
    });
    return { url: session.url, sessionId: session.id, customerId };
  }

  async createPortal(input: BillingPortalInput) {
    if (!this.stripe) throw new ServiceUnavailableException('Stripe is not configured');
    if (!input.customerId) throw new BadRequestException('No Stripe customer exists for this company');
    const session = await this.stripe.billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl });
    return { url: session.url };
  }

  async listInvoices(input: { customerId?: string | null }) {
    if (!this.stripe) throw new ServiceUnavailableException('Stripe is not configured');
    if (!input.customerId) return [];
    const invoices = await this.stripe.invoices.list({ customer: input.customerId, limit: 12 });
    return invoices.data.map((inv: any) => ({
      id: inv.id,
      number: inv.number,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      paid: inv.paid,
      pdfUrl: inv.invoice_pdf,
      hostedUrl: inv.hosted_invoice_url,
      periodStart: fromSeconds(inv.period_start),
      periodEnd: fromSeconds(inv.period_end),
      createdAt: fromSeconds(inv.created) || new Date(),
    }));
  }

  async verifyAndParseWebhook(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>) {
    if (!this.stripe) throw new ServiceUnavailableException('Stripe is not configured');
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = String(headers['stripe-signature'] || '');
    if (!endpointSecret) throw new ServiceUnavailableException('Webhook secret is not configured');
    if (!rawBody) throw new BadRequestException('Webhook raw body missing');
    if (!signature) throw new BadRequestException('Stripe signature missing');
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
    const obj = event.data.object;
    const metadata = obj.metadata || {};
    const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : obj.id?.startsWith?.('sub_') ? obj.id : obj.subscription?.id;
    const subscription = subscriptionId && !obj.id?.startsWith?.('sub_')
      ? await this.stripe.subscriptions.retrieve(subscriptionId)
      : obj;
    const subscriptionMetadata = subscription?.metadata || metadata;
    return {
      provider: this.key,
      id: event.id,
      type: event.type,
      companyId: metadata.companyId || subscriptionMetadata.companyId || obj.client_reference_id || null,
      planId: metadata.planId || subscriptionMetadata.planId || null,
      customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || subscription?.customer,
      subscriptionId,
      status: subscription?.status || obj.status,
      interval: subscriptionMetadata.interval,
      seats: subscriptionMetadata.seats ? Number(subscriptionMetadata.seats) : null,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? obj.cancel_at_period_end ?? null,
      currentPeriodStart: fromSeconds(subscription?.current_period_start),
      currentPeriodEnd: fromSeconds(subscription?.current_period_end),
      trialEndsAt: fromSeconds(subscription?.trial_end),
      raw: event,
    };
  }

  async testConnection() {
    if (!this.stripe) return { ok: false, detail: 'STRIPE_SECRET_KEY is not configured.' };
    await this.stripe.balance.retrieve();
    return { ok: true, detail: 'Stripe API connection succeeded.' };
  }
}
