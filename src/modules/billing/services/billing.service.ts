import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { PlansService } from './plans.service';

@Injectable()
export class BillingService {
  private stripe: any = null;

  constructor(
    private prisma: PrismaService,
    private plansService: PlansService,
  ) {
    if (process.env.STRIPE_SECRET_KEY) {
      this.stripe = new (require('stripe'))(process.env.STRIPE_SECRET_KEY);
    }
  }

  async createCheckoutSession(companyId: string, planId: string, successUrl: string, cancelUrl: string) {
    if (!this.stripe) throw new Error('Stripe not configured');

    const plan = await this.plansService.findById(planId);
    if (!plan) throw new Error('Plan not found');
    if (!plan.stripePriceId) throw new Error('Plan has no Stripe price');

    let cp = await this.prisma.companyPlan.findUnique({ where: { companyId } });
    let customerId = cp?.stripeCustomerId;

    if (!customerId) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      const customer = await this.stripe.customers.create({
        name: company?.name || 'Unknown',
        metadata: { companyId },
      });
      customerId = customer.id;
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { companyId, planId },
    });

    return { url: session.url, sessionId: session.id };
  }

  async getInvoices(companyId: string) {
    if (!this.stripe) throw new Error('Stripe not configured');

    const cp = await this.prisma.companyPlan.findUnique({ where: { companyId } });
    if (!cp?.stripeCustomerId) return [];

    const invoices = await this.stripe.invoices.list({
      customer: cp.stripeCustomerId,
      limit: 12,
    });

    return invoices.data.map((inv: any) => ({
      id: inv.id,
      number: inv.number,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      paid: inv.paid,
      pdfUrl: inv.invoice_pdf,
      hostedUrl: inv.hosted_invoice_url,
      periodStart: new Date(inv.period_start * 1000),
      periodEnd: new Date(inv.period_end * 1000),
      createdAt: new Date(inv.created * 1000),
    }));
  }

  async createPortalSession(companyId: string, returnUrl: string) {
    if (!this.stripe) throw new Error('Stripe not configured');

    const cp = await this.prisma.companyPlan.findUnique({ where: { companyId } });
    if (!cp?.stripeCustomerId) throw new Error('No Stripe customer');

    const session = await this.stripe.billingPortal.sessions.create({
      customer: cp.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  async handleWebhook(rawBody: string, signature: string) {
    if (!this.stripe) throw new Error('Stripe not configured');

    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!endpointSecret) throw new Error('Webhook secret not configured');

    const event = this.stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const companyId = session.metadata.companyId;
        const planId = session.metadata.planId;
        const subscriptionId = session.subscription;
        const customerId = session.customer;

        await this.prisma.companyPlan.upsert({
          where: { companyId },
          update: {
            planId,
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId: customerId,
            status: 'ACTIVE',
            currentPeriodStart: new Date(session.created * 1000),
            currentPeriodEnd: new Date((session.created + 30 * 24 * 3600) * 1000),
          },
          create: {
            companyId,
            planId,
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId: customerId,
            status: 'ACTIVE',
            currentPeriodStart: new Date(session.created * 1000),
            currentPeriodEnd: new Date((session.created + 30 * 24 * 3600) * 1000),
          },
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (subscriptionId) {
          const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
          const companyPlan = await this.prisma.companyPlan.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
          if (companyPlan) {
            await this.prisma.companyPlan.update({
              where: { id: companyPlan.id },
              data: {
                currentPeriodStart: new Date(sub.current_period_start * 1000),
                currentPeriodEnd: new Date(sub.current_period_end * 1000),
                status: 'ACTIVE',
              },
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await this.prisma.companyPlan.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: sub.status === 'active' ? 'ACTIVE' : 'CANCELED' },
        });
        break;
      }
    }

    return { received: true };
  }
}
