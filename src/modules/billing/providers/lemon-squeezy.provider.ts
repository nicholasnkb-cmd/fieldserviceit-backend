import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BillingCheckoutInput, BillingProvider, BillingProviderKey, BillingPortalInput } from '../interfaces/billing-provider.interface';
import { asText, fetchJson, fromIso, hmacSha256Hex, parseJsonBody, safeEqual } from './provider-utils';

export class LemonSqueezyBillingProvider implements BillingProvider {
  key: BillingProviderKey = 'LEMON_SQUEEZY';
  displayName = 'Lemon Squeezy';
  private baseUrl = 'https://api.lemonsqueezy.com/v1';

  configured() {
    return Boolean(process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID && process.env.LEMONSQUEEZY_WEBHOOK_SECRET);
  }

  readiness() {
    return {
      configured: this.configured(),
      checks: [
        { name: 'API key', ok: Boolean(process.env.LEMONSQUEEZY_API_KEY), detail: process.env.LEMONSQUEEZY_API_KEY ? 'LEMONSQUEEZY_API_KEY is configured.' : 'Set LEMONSQUEEZY_API_KEY.' },
        { name: 'Store ID', ok: Boolean(process.env.LEMONSQUEEZY_STORE_ID), detail: process.env.LEMONSQUEEZY_STORE_ID ? 'LEMONSQUEEZY_STORE_ID is configured.' : 'Set LEMONSQUEEZY_STORE_ID.' },
        { name: 'Webhook secret', ok: Boolean(process.env.LEMONSQUEEZY_WEBHOOK_SECRET), detail: process.env.LEMONSQUEEZY_WEBHOOK_SECRET ? 'LEMONSQUEEZY_WEBHOOK_SECRET is configured.' : 'Set LEMONSQUEEZY_WEBHOOK_SECRET.' },
      ],
    };
  }

  async createCheckout(input: BillingCheckoutInput) {
    this.assertApi();
    if (input.lineItems.length !== 1) throw new BadRequestException('Lemon Squeezy checkout requires a combined variant for seat pricing');
    const data = await this.request('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_options: { embed: false },
            checkout_data: { custom: { company_id: input.companyId, plan_id: input.planId, interval: input.interval, seats: String(input.seats) } },
            product_options: { redirect_url: input.successUrl },
          },
          relationships: {
            store: { data: { type: 'stores', id: String(process.env.LEMONSQUEEZY_STORE_ID) } },
            variant: { data: { type: 'variants', id: input.lineItems[0].priceId } },
          },
        },
      }),
    });
    return { url: data.data.attributes.url, sessionId: data.data.id };
  }

  async createPortal(input: BillingPortalInput) {
    this.assertApi();
    if (!input.customerId) throw new BadRequestException('No Lemon Squeezy customer exists for this company');
    const data = await this.request(`/customers/${input.customerId}`);
    const url = data?.data?.attributes?.urls?.customer_portal;
    if (!url) throw new BadRequestException('Lemon Squeezy did not return a customer portal URL');
    return { url };
  }

  async listInvoices(input: { customerId?: string | null }) {
    this.assertApi();
    if (!input.customerId) return [];
    const data = await this.request(`/orders?filter[customer-id]=${encodeURIComponent(input.customerId)}&page[size]=12`);
    return (data?.data || []).map((item: any) => ({
      id: item.id,
      number: String(item.attributes?.order_number || item.id),
      amountPaid: Number(item.attributes?.total || 0),
      currency: item.attributes?.currency || 'USD',
      status: item.attributes?.status || 'paid',
      paid: item.attributes?.status === 'paid',
      pdfUrl: null,
      hostedUrl: item.attributes?.urls?.receipt || null,
      createdAt: fromIso(item.attributes?.created_at) || new Date(),
    }));
  }

  async verifyAndParseWebhook(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>) {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Lemon Squeezy webhook secret is not configured');
    const signature = String(headers['x-signature'] || '');
    if (!safeEqual(signature, hmacSha256Hex(secret, asText(rawBody)))) throw new BadRequestException('Invalid Lemon Squeezy signature');
    const event = parseJsonBody(rawBody);
    const data = event.data || {};
    const attributes = data.attributes || {};
    const custom = event.meta?.custom_data || {};
    return {
      provider: this.key,
      id: String(event.meta?.event_id || `${event.meta?.event_name}:${data.id}:${attributes.updated_at || attributes.created_at}`),
      type: event.meta?.event_name,
      companyId: custom.company_id || null,
      planId: custom.plan_id || null,
      customerId: String(attributes.customer_id || ''),
      subscriptionId: String(attributes.subscription_id || (data.type === 'subscriptions' ? data.id : '')),
      status: attributes.status,
      interval: custom.interval,
      seats: custom.seats ? Number(custom.seats) : null,
      cancelAtPeriodEnd: Boolean(attributes.cancelled),
      currentPeriodStart: fromIso(attributes.created_at),
      currentPeriodEnd: fromIso(attributes.renews_at || attributes.ends_at),
      trialEndsAt: fromIso(attributes.trial_ends_at),
      raw: event,
    };
  }

  async testConnection() {
    if (!process.env.LEMONSQUEEZY_API_KEY) return { ok: false, detail: 'LEMONSQUEEZY_API_KEY is not configured.' };
    await this.request('/users/me');
    return { ok: true, detail: 'Lemon Squeezy API connection succeeded.' };
  }

  private assertApi() {
    if (!process.env.LEMONSQUEEZY_API_KEY) throw new ServiceUnavailableException('Lemon Squeezy is not configured');
  }

  private request(path: string, init: RequestInit = {}) {
    return fetchJson(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`, Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json', ...(init.headers || {}) },
    });
  }
}
