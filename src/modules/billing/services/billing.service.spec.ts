import { BillingService } from './billing.service';
import { PlansService } from './plans.service';

describe('BillingService', () => {
  let service: BillingService;
  let mockPrisma: any;
  let mockPlansService: any;

  beforeEach(() => {
    mockPrisma = {
      companyPlan: {
        findUnique: jest.fn(),
      },
    };

    mockPlansService = new PlansService(mockPrisma as any);
    service = new BillingService(mockPrisma as any, mockPlansService as any);
  });

  describe('getInvoices', () => {
    it('should return empty array when no Stripe customer', async () => {
      mockPrisma.companyPlan.findUnique.mockResolvedValue(null);
      (service as any).stripe = {} as any;

      const result = await service.getInvoices('c1');
      expect(result).toEqual([]);
    });

    it('should throw when Stripe not configured', async () => {
      (service as any).stripe = null;
      mockPrisma.companyPlan.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_123' });

      await expect(service.getInvoices('c1')).rejects.toThrow('Stripe not configured');
    });

    it('should return mapped invoices when Stripe is configured', async () => {
      mockPrisma.companyPlan.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_123' });
      const mockStripeInvoices = {
        data: [
          {
            id: 'in_1',
            number: 'INV-001',
            amount_paid: 2900,
            currency: 'usd',
            status: 'paid',
            paid: true,
            invoice_pdf: 'https://stripe.com/inv-001.pdf',
            hosted_invoice_url: 'https://stripe.com/hosted/1',
            period_start: 1717000000,
            period_end: 1719599999,
            created: 1717000000,
          },
        ],
      };
      (service as any).stripe = {
        invoices: {
          list: jest.fn().mockResolvedValue(mockStripeInvoices),
        },
      };

      const result = await service.getInvoices('c1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('in_1');
      expect(result[0].number).toBe('INV-001');
      expect(result[0].amountPaid).toBe(2900);
      expect(result[0].paid).toBe(true);
      expect(result[0].pdfUrl).toBe('https://stripe.com/inv-001.pdf');
    });

    it('should pass customer ID to Stripe API', async () => {
      mockPrisma.companyPlan.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_456' });
      const listMock = jest.fn().mockResolvedValue({ data: [] });
      (service as any).stripe = { invoices: { list: listMock } };

      await service.getInvoices('c1');
      expect(listMock).toHaveBeenCalledWith({
        customer: 'cus_456',
        limit: 12,
      });
    });
  });
});
