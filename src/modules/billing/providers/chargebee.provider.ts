import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BillingCheckoutInput, BillingProvider, BillingProviderKey, BillingPortalInput } from '../interfaces/billing-provider.interface';
import { fetchJson, fromSeconds, parseJsonBody } from './provider-utils';

export class ChargebeeBillingProvider implements BillingProvider {
  key: BillingProviderKey = 'CHARGEBEE';
  displayName = 'Chargebee';

  configured() {
    return Boolean(process.env.CHARGEBEE_SITE && process.env.CHARGEBEE_API_KEY && process.env.CHARGEBEE_WEBHOOK_USERNAME && process.env.CHARGEBEE_WEBHOOK_PASSWORD);
  }

  readiness() {
    return {
      configured: this.configured(),
      checks: [
        { name: 'Site', ok: Boolean(process.env.CHARGEBEE_SITE), detail: process.env.CHARGEBEE_SITE ? 'CHARGEBEE_SITE is configured.' : 'Set CHARGEBEE_SITE.' },
        { name: 'API key', ok: Boolean(process.env.CHARGEBEE_API_KEY), detail: process.env.CHARGEBEE_API_KEY ? 'CHARGEBEE_API_KEY is configured.' : 'Set CHARGEBEE_API_KEY.' },
        { name: 'Webhook basic auth', ok: Boolean(process.env.CHARGEBEE_WEBHOOK_USERNAME && process.env.CHARGEBEE_WEBHOOK_PASSWORD), detail: 'Configure matching webhook basic-auth credentials in Chargebee.' },
      ],
    };
  }

  async createCheckout(input: BillingCheckoutInput) {
    this.assertApi();
    const form = new URLSearchParams();
    input.lineItems.forEach((item, index) => {
      form.set(`subscription_items[item_price_id][${index}]`, item.priceId);
      form.set(`subscription_items[quantity][${index}]`, String(item.quantity));
    });
    form.set('subscription[cf_company_id]', input.companyId);
    form.set('subscription[cf_plan_id]', input.planId);
    form.set('redirect_url', input.successUrl);
    form.set('cancel_url', input.cancelUrl);
    const data = await this.request('/hosted_pages/checkout_new_for_items', { method: 'POST', body: form });
    return { url: data.hosted_page.url, sessionId: data.hosted_page.id, customerId: data.hosted_page.content?.customer?.id };
  }

  async createPortal(input: BillingPortalInput) {
    this.assertApi();
    if (!input.customerId) throw new BadRequestException('No Chargebee customer exists for this company');
    const form = new URLSearchParams({ 'customer[id]': input.customerId, redirect_url: input.returnUrl });
    const data = await this.request('/portal_sessions', { method: 'POST', body: form });
    return { url: data.portal_session.access_url };
  }

  async listInvoices(input: { customerId?: string | null }) {
    this.assertApi();
    if (!input.customerId) return [];
    const data = await this.request(`/invoices?customer_id[is]=${encodeURIComponent(input.customerId)}&limit=12`);
    return (data.list || []).map((entry: any) => {
      const inv = entry.invoice;
      return {
        id: inv.id,
        number: inv.id,
        amountPaid: Number(inv.amount_paid || 0),
        currency: inv.currency_code || 'USD',
        status: inv.status,
        paid: inv.status === 'paid',
        pdfUrl: inv.pdf?.download_url || null,
        hostedUrl: null,
        periodStart: fromSeconds(inv.date),
        periodEnd: fromSeconds(inv.due_date),
        createdAt: fromSeconds(inv.date) || new Date(),
      };
    });
  }

  async verifyAndParseWebhook(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>) {
    const expected = Buffer.from(`${process.env.CHARGEBEE_WEBHOOK_USERNAME || ''}:${process.env.CHARGEBEE_WEBHOOK_PASSWORD || ''}`).toString('base64');
    if (!process.env.CHARGEBEE_WEBHOOK_PASSWORD || String(headers.authorization || '') !== `Basic ${expected}`) throw new BadRequestException('Invalid Chargebee webhook authorization');
    const event = parseJsonBody(rawBody);
    const content = event.content || {};
    const subscription = content.subscription || {};
    const customer = content.customer || {};
    return {
      provider: this.key,
      id: event.id,
      type: event.event_type,
      companyId: subscription.cf_company_id || customer.cf_company_id || null,
      planId: subscription.cf_plan_id || null,
      customerId: customer.id || subscription.customer_id,
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: Boolean(subscription.cancelled_at && subscription.current_term_end),
      currentPeriodStart: fromSeconds(subscription.current_term_start),
      currentPeriodEnd: fromSeconds(subscription.current_term_end),
      trialEndsAt: fromSeconds(subscription.trial_end),
      raw: event,
    };
  }

  async testConnection() {
    if (!process.env.CHARGEBEE_API_KEY) return { ok: false, detail: 'Chargebee is not configured.' };
    await this.request('/item_prices?limit=1');
    return { ok: true, detail: 'Chargebee API connection succeeded.' };
  }

  private assertApi() {
    if (!process.env.CHARGEBEE_SITE || !process.env.CHARGEBEE_API_KEY) throw new ServiceUnavailableException('Chargebee is not configured');
  }

  private request(path: string, init: RequestInit = {}) {
    const credentials = Buffer.from(`${process.env.CHARGEBEE_API_KEY}:`).toString('base64');
    return fetchJson(`https://${process.env.CHARGEBEE_SITE}.chargebee.com/api/v2${path}`, {
      ...init,
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(init.headers || {}) },
    });
  }
}
