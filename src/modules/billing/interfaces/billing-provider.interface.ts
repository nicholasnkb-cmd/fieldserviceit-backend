export type BillingProviderKey = 'PAYPAL';
export type BillingInterval = 'MONTH' | 'YEAR';
export type BillingComponent = 'BASE';

export interface BillingLineItem {
  priceId: string;
  quantity: number;
  component: BillingComponent;
}

export interface BillingCheckoutInput {
  companyId: string;
  companyName?: string | null;
  planId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  interval: BillingInterval;
  seats: number;
  trialDays?: number;
  successUrl: string;
  cancelUrl: string;
  lineItems: BillingLineItem[];
}

export interface BillingPortalInput {
  companyId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  returnUrl: string;
}

export interface BillingInvoice {
  id: string;
  number?: string | null;
  amountPaid: number;
  currency: string;
  status: string;
  paid: boolean;
  pdfUrl?: string | null;
  hostedUrl?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  createdAt: Date;
}

export interface NormalizedBillingEvent {
  provider: BillingProviderKey;
  id: string;
  type: string;
  companyId?: string | null;
  planId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  status?: string | null;
  interval?: BillingInterval | null;
  seats?: number | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  raw: any;
}

export interface BillingProvider {
  key: BillingProviderKey;
  displayName: string;
  configured(): boolean;
  readiness(): { configured: boolean; checks: { name: string; ok: boolean; detail: string }[] };
  createCheckout(input: BillingCheckoutInput): Promise<{ url: string; sessionId?: string; customerId?: string | null }>;
  createPortal(input: BillingPortalInput): Promise<{ url: string }>;
  listInvoices(input: { customerId?: string | null; subscriptionId?: string | null }): Promise<BillingInvoice[]>;
  verifyAndParseWebhook(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>): Promise<NormalizedBillingEvent>;
  testConnection(): Promise<{ ok: boolean; detail: string }>;
}
