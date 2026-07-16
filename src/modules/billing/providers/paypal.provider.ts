import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BillingCheckoutInput, BillingInvoice, BillingProvider, BillingProviderKey, BillingPortalInput } from '../interfaces/billing-provider.interface';
import { fetchJson, fromIso, parseJsonBody } from './provider-utils';

type PayPalToken = {
  accessToken: string;
  expiresAt: number;
};

export class PayPalBillingProvider implements BillingProvider {
  key: BillingProviderKey = 'PAYPAL';
  displayName = 'PayPal';
  private token: PayPalToken | null = null;

  private get baseUrl() {
    return process.env.PAYPAL_ENVIRONMENT === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  configured() {
    return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_WEBHOOK_ID);
  }

  readiness() {
    return {
      configured: this.configured(),
      checks: [
        { name: 'Client ID', ok: Boolean(process.env.PAYPAL_CLIENT_ID), detail: process.env.PAYPAL_CLIENT_ID ? 'PAYPAL_CLIENT_ID is configured.' : 'Set PAYPAL_CLIENT_ID.' },
        { name: 'Client secret', ok: Boolean(process.env.PAYPAL_CLIENT_SECRET), detail: process.env.PAYPAL_CLIENT_SECRET ? 'PAYPAL_CLIENT_SECRET is configured.' : 'Set PAYPAL_CLIENT_SECRET.' },
        { name: 'Webhook ID', ok: Boolean(process.env.PAYPAL_WEBHOOK_ID), detail: process.env.PAYPAL_WEBHOOK_ID ? 'PAYPAL_WEBHOOK_ID is configured.' : 'Set PAYPAL_WEBHOOK_ID.' },
      ],
    };
  }

  async createCheckout(input: BillingCheckoutInput) {
    this.assertApi();
    const basePlan = input.lineItems.find((item) => item.component === 'BASE') || input.lineItems[0];
    if (!basePlan) throw new BadRequestException('PayPal plan ID is not configured');
    const data = await this.request('/v1/billing/subscriptions', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
        'PayPal-Request-Id': `${input.companyId}-${input.planId}-${Date.now()}`.slice(0, 108),
      },
      body: JSON.stringify({
        plan_id: basePlan.priceId,
        quantity: String(Math.max(1, input.seats || 1)),
        custom_id: this.customId(input),
        application_context: {
          brand_name: input.companyName || 'FieldserviceIT',
          user_action: 'SUBSCRIBE_NOW',
          payment_method: {
            payer_selected: 'PAYPAL',
            payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED',
          },
          return_url: input.successUrl,
          cancel_url: input.cancelUrl,
        },
      }),
    });
    const approval = (data.links || []).find((link: any) => link.rel === 'approve')?.href;
    if (!approval) throw new BadRequestException('PayPal did not return an approval URL');
    return {
      url: approval,
      sessionId: data.id,
      subscriptionId: data.id,
      customerId: data.subscriber?.payer_id || null,
    };
  }

  async createPortal(input: BillingPortalInput) {
    this.assertApi();
    if (!input.subscriptionId) throw new BadRequestException('No PayPal subscription exists for this company');
    return { url: process.env.PAYPAL_SUBSCRIPTION_MANAGE_URL || 'https://www.paypal.com/myaccount/autopay/' };
  }

  async listInvoices(input: { subscriptionId?: string | null }) {
    this.assertApi();
    if (!input.subscriptionId) return [];
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
    const data = await this.request(
      `/v1/billing/subscriptions/${encodeURIComponent(input.subscriptionId)}/transactions?start_time=${encodeURIComponent(start.toISOString())}&end_time=${encodeURIComponent(end.toISOString())}`,
    );
    return (data.transactions || []).slice(0, 12).map((transaction: any): BillingInvoice => ({
      id: transaction.id,
      number: transaction.invoice_id || transaction.id,
      amountPaid: Math.round(Number(transaction.amount_with_breakdown?.gross_amount?.value || transaction.amount?.value || 0) * 100),
      currency: transaction.amount_with_breakdown?.gross_amount?.currency_code || transaction.amount?.currency_code || 'USD',
      status: transaction.status,
      paid: String(transaction.status || '').toUpperCase() === 'COMPLETED',
      pdfUrl: null,
      hostedUrl: null,
      createdAt: fromIso(transaction.time) || new Date(),
    }));
  }

  async verifyAndParseWebhook(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>) {
    const event = parseJsonBody(rawBody);
    await this.verifyWebhook(event, headers);
    const resource = event.resource || {};
    const custom = this.parseCustomId(resource.custom_id);
    const billingInfo = resource.billing_info || {};
    const payer = resource.subscriber || resource.payer || {};
    return {
      provider: this.key,
      id: event.id,
      type: event.event_type,
      companyId: custom.companyId || resource.custom_id || null,
      planId: custom.planId || resource.plan_id || null,
      customerId: payer.payer_id || resource.subscriber?.payer_id || null,
      subscriptionId: resource.id || resource.billing_agreement_id || null,
      status: resource.status,
      interval: custom.interval || null,
      seats: custom.seats ? Number(custom.seats) : resource.quantity ? Number(resource.quantity) : null,
      cancelAtPeriodEnd: ['CANCELLED', 'SUSPENDED'].includes(String(resource.status || '').toUpperCase()),
      currentPeriodStart: fromIso(resource.start_time),
      currentPeriodEnd: fromIso(billingInfo.next_billing_time || resource.status_update_time),
      trialEndsAt: null,
      raw: event,
    };
  }

  async testConnection() {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return { ok: false, detail: 'PayPal API credentials are not configured.' };
    await this.request('/v1/billing/plans?page_size=1');
    return { ok: true, detail: `PayPal ${process.env.PAYPAL_ENVIRONMENT === 'production' ? 'production' : 'sandbox'} API connection succeeded.` };
  }

  private async verifyWebhook(event: any, headers: Record<string, string | string[] | undefined>) {
    if (!process.env.PAYPAL_WEBHOOK_ID) throw new ServiceUnavailableException('PayPal webhook ID is not configured');
    const data = await this.request('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: JSON.stringify({
        transmission_id: this.header(headers, 'paypal-transmission-id'),
        transmission_time: this.header(headers, 'paypal-transmission-time'),
        cert_url: this.header(headers, 'paypal-cert-url'),
        auth_algo: this.header(headers, 'paypal-auth-algo'),
        transmission_sig: this.header(headers, 'paypal-transmission-sig'),
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      }),
    });
    if (data.verification_status !== 'SUCCESS') throw new BadRequestException('Invalid PayPal webhook signature');
  }

  private parseCustomId(value?: string | null) {
    if (!value) return {};
    const parts = value.split('|');
    if (parts.length === 4) {
      return { companyId: parts[0], planId: parts[1], interval: parts[2], seats: Number(parts[3]) };
    }
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  private customId(input: BillingCheckoutInput) {
    return `${input.companyId}|${input.planId}|${input.interval}|${input.seats}`.slice(0, 127);
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string) {
    const value = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
    return Array.isArray(value) ? value[0] : String(value || '');
  }

  private assertApi() {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) throw new ServiceUnavailableException('PayPal is not configured');
  }

  private async accessToken() {
    this.assertApi();
    if (this.token && this.token.expiresAt > Date.now() + 60000) return this.token.accessToken;
    const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    const data = await fetchJson(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    this.token = {
      accessToken: data.access_token,
      expiresAt: Date.now() + Number(data.expires_in || 300) * 1000,
    };
    return this.token.accessToken;
  }

  private async request(path: string, init: RequestInit = {}) {
    const token = await this.accessToken();
    return fetchJson(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  }
}
