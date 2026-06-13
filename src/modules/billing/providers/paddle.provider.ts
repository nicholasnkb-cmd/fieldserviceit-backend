import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BillingCheckoutInput, BillingProvider, BillingProviderKey, BillingPortalInput } from '../interfaces/billing-provider.interface';
import { asText, fetchJson, fromIso, hmacSha256Hex, parseJsonBody, safeEqual } from './provider-utils';

export class PaddleBillingProvider implements BillingProvider {
  key: BillingProviderKey = 'PADDLE';
  displayName = 'Paddle';

  private get baseUrl() {
    return process.env.PADDLE_ENVIRONMENT === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
  }

  configured() {
    return Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_WEBHOOK_SECRET);
  }

  readiness() {
    return {
      configured: this.configured(),
      checks: [
        { name: 'API key', ok: Boolean(process.env.PADDLE_API_KEY), detail: process.env.PADDLE_API_KEY ? 'PADDLE_API_KEY is configured.' : 'Set PADDLE_API_KEY.' },
        { name: 'Webhook secret', ok: Boolean(process.env.PADDLE_WEBHOOK_SECRET), detail: process.env.PADDLE_WEBHOOK_SECRET ? 'PADDLE_WEBHOOK_SECRET is configured.' : 'Set PADDLE_WEBHOOK_SECRET.' },
      ],
    };
  }

  async createCheckout(input: BillingCheckoutInput) {
    this.assertApi();
    const data = await this.request('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        items: input.lineItems.map((item) => ({ price_id: item.priceId, quantity: item.quantity })),
        collection_mode: 'automatic',
        custom_data: { companyId: input.companyId, planId: input.planId, interval: input.interval, seats: input.seats },
        checkout: { url: input.successUrl },
      }),
    });
    const url = data?.data?.checkout?.url;
    if (!url) throw new BadRequestException('Paddle did not return a checkout URL');
    return { url, sessionId: data.data.id, customerId: data.data.customer_id };
  }

  async createPortal(input: BillingPortalInput) {
    this.assertApi();
    if (!input.subscriptionId) throw new BadRequestException('No Paddle subscription exists for this company');
    const data = await this.request(`/subscriptions/${input.subscriptionId}`);
    const url = data?.data?.management_urls?.update_payment_method || data?.data?.management_urls?.cancel;
    if (!url) throw new BadRequestException('Paddle did not return a management URL');
    return { url };
  }

  async listInvoices(input: { customerId?: string | null }) {
    this.assertApi();
    if (!input.customerId) return [];
    const data = await this.request(`/transactions?customer_id=${encodeURIComponent(input.customerId)}&per_page=12`);
    return (data?.data || []).map((item: any) => ({
      id: item.id,
      number: item.invoice_number,
      amountPaid: Number(item.details?.totals?.grand_total || 0),
      currency: item.currency_code || 'USD',
      status: item.status,
      paid: item.status === 'completed',
      pdfUrl: null,
      hostedUrl: item.checkout?.url || null,
      createdAt: fromIso(item.created_at) || new Date(),
    }));
  }

  async verifyAndParseWebhook(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>) {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Paddle webhook secret is not configured');
    const signatureHeader = String(headers['paddle-signature'] || '');
    const timestamp = signatureHeader.match(/(?:^|;)ts=([^;]+)/)?.[1] || '';
    const signatures = [...signatureHeader.matchAll(/(?:^|;)h1=([^;]+)/g)].map((match) => match[1]);
    const expected = hmacSha256Hex(secret, `${timestamp}:${asText(rawBody)}`);
    if (!timestamp || !signatures.some((signature) => safeEqual(signature, expected))) throw new BadRequestException('Invalid Paddle signature');
    const event = parseJsonBody(rawBody);
    const data = event.data || {};
    const custom = data.custom_data || {};
    return {
      provider: this.key,
      id: event.event_id,
      type: event.event_type,
      companyId: custom.companyId || custom.company_id || null,
      planId: custom.planId || custom.plan_id || null,
      customerId: data.customer_id,
      subscriptionId: data.subscription_id || (String(data.id || '').startsWith('sub_') ? data.id : null),
      status: data.status,
      interval: custom.interval,
      seats: custom.seats ? Number(custom.seats) : null,
      cancelAtPeriodEnd: data.scheduled_change?.action === 'cancel',
      currentPeriodStart: fromIso(data.current_billing_period?.starts_at),
      currentPeriodEnd: fromIso(data.current_billing_period?.ends_at),
      trialEndsAt: fromIso(data.current_billing_period?.ends_at && data.status === 'trialing' ? data.current_billing_period.ends_at : null),
      raw: event,
    };
  }

  async testConnection() {
    if (!process.env.PADDLE_API_KEY) return { ok: false, detail: 'PADDLE_API_KEY is not configured.' };
    await this.request('/products?per_page=1');
    return { ok: true, detail: `Paddle ${process.env.PADDLE_ENVIRONMENT === 'production' ? 'production' : 'sandbox'} API connection succeeded.` };
  }

  private assertApi() {
    if (!process.env.PADDLE_API_KEY) throw new ServiceUnavailableException('Paddle is not configured');
  }

  private request(path: string, init: RequestInit = {}) {
    return fetchJson(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  }
}
