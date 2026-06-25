import { ForbiddenException } from '@nestjs/common';
import { UsageService } from './usage.service';
import { PlansService } from './plans.service';

describe('UsageService', () => {
  let service: UsageService;
  let mockPrisma: any;
  let mockPlansService: any;

  beforeEach(() => {
    mockPrisma = {
      usageRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        count: jest.fn(),
      },
      companyPlan: {
        findUnique: jest.fn(),
      },
    };

    const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    mockPlansService = new PlansService(mockPrisma as any, mockLogger as any);
    jest.spyOn(mockPlansService, 'getCompanyPlan').mockImplementation(async (companyId: string) => {
      if (companyId === 'company-no-plan') return null;
      return {
        id: 'cp-1',
        companyId,
        planId: 'plan-free',
        status: 'ACTIVE',
        plan: {
          id: 'plan-free',
          name: 'Free',
          maxUsers: 2,
          maxTickets: 50,
          features: '{}',
          monthlyPrice: 0,
          description: 'Free plan',
          sortOrder: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      } as any;
    });

    service = new UsageService(mockPrisma as any, mockPlansService);
  });

  describe('getOrCreateUsageRecord', () => {
    it('should return existing record if found', async () => {
      const existing = { id: 'record-1', companyId: 'c1', metric: 'tickets', count: 5 };
      mockPrisma.usageRecord.findFirst.mockResolvedValue(existing);

      const result = await service.getOrCreateUsageRecord('c1', 'tickets', new Date('2026-05-01'), new Date('2026-05-31'));
      expect(result).toEqual(existing);
      expect(mockPrisma.usageRecord.create).not.toHaveBeenCalled();
    });

    it('should create new record if not found', async () => {
      mockPrisma.usageRecord.findFirst.mockResolvedValue(null);
      const created = { id: 'record-new', companyId: 'c1', metric: 'tickets', count: 0 };
      mockPrisma.usageRecord.create.mockResolvedValue(created);

      const result = await service.getOrCreateUsageRecord('c1', 'tickets', new Date('2026-05-01'), new Date('2026-05-31'));
      expect(result).toEqual(created);
      expect(mockPrisma.usageRecord.create).toHaveBeenCalledWith({
        data: { companyId: 'c1', metric: 'tickets', count: 0, periodStart: expect.any(Date), periodEnd: expect.any(Date) },
      });
    });
  });

  describe('incrementUsage', () => {
    it('should increment count on existing record', async () => {
      const existing = { id: 'record-1', companyId: 'c1', metric: 'tickets', count: 5 };
      mockPrisma.usageRecord.findFirst.mockResolvedValue(existing);
      mockPrisma.usageRecord.update.mockResolvedValue({ ...existing, count: 6 });

      await service.incrementUsage('c1', 'tickets');
      expect(mockPrisma.usageRecord.update).toHaveBeenCalledWith({
        where: { id: 'record-1' },
        data: { count: 6 },
      });
    });

    it('should create and increment on non-existing record', async () => {
      mockPrisma.usageRecord.findFirst.mockResolvedValue(null);
      const created = { id: 'record-new', companyId: 'c1', metric: 'tickets', count: 0 };
      mockPrisma.usageRecord.create.mockResolvedValue(created);
      mockPrisma.usageRecord.update.mockResolvedValue({ ...created, count: 1 });

      await service.incrementUsage('c1', 'tickets');
      expect(mockPrisma.usageRecord.create).toHaveBeenCalled();
      expect(mockPrisma.usageRecord.update).toHaveBeenCalledWith({
        where: { id: 'record-new' },
        data: { count: 1 },
      });
    });
  });

  describe('getUsage', () => {
    it('should return count from existing record', async () => {
      mockPrisma.usageRecord.findFirst.mockResolvedValue({ id: 'r1', count: 12 });

      const result = await service.getUsage('c1', 'tickets');
      expect(result).toBe(12);
    });

    it('should return 0 if no record exists', async () => {
      mockPrisma.usageRecord.findFirst.mockResolvedValue(null);

      const result = await service.getUsage('c1', 'tickets');
      expect(result).toBe(0);
    });
  });

  describe('getActiveUserCount', () => {
    it('should return count of active users', async () => {
      mockPrisma.user.count.mockResolvedValue(3);

      const result = await service.getActiveUserCount('c1');
      expect(result).toBe(3);
      expect(mockPrisma.user.count).toHaveBeenCalledWith({
        where: { companyId: 'c1', isActive: true, deletedAt: null },
      });
    });
  });

  describe('checkTicketLimit', () => {
    it('should allow when within limit', async () => {
      mockPrisma.usageRecord.findFirst.mockResolvedValue({ id: 'r1', count: 30 });

      const result = await service.checkTicketLimit('c1');
      expect(result).toBe(true);
    });

    it('should allow when limit is -1 (unlimited)', async () => {
      mockPlansService.getCompanyPlan.mockResolvedValue({
        plan: { maxTickets: -1 },
      });

      const result = await service.checkTicketLimit('c1');
      expect(result).toBe(true);
    });

    it('should allow when no plan assigned', async () => {
      const result = await service.checkTicketLimit('company-no-plan');
      expect(result).toBe(true);
    });

    it('should throw when limit exceeded', async () => {
      mockPrisma.usageRecord.findFirst.mockResolvedValue({ id: 'r1', count: 50 });

      await expect(service.checkTicketLimit('c1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw at exact limit', async () => {
      mockPrisma.usageRecord.findFirst.mockResolvedValue({ id: 'r1', count: 51 });

      await expect(service.checkTicketLimit('c1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('checkUserLimit', () => {
    it('should allow when within limit', async () => {
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.checkUserLimit('c1');
      expect(result).toBe(true);
    });

    it('should allow when limit is -1 (unlimited)', async () => {
      mockPlansService.getCompanyPlan.mockResolvedValue({
        plan: { maxUsers: -1 },
      });

      const result = await service.checkUserLimit('c1');
      expect(result).toBe(true);
    });

    it('should allow when no plan assigned', async () => {
      const result = await service.checkUserLimit('company-no-plan');
      expect(result).toBe(true);
    });

    it('should throw when limit reached', async () => {
      mockPrisma.user.count.mockResolvedValue(2);

      await expect(service.checkUserLimit('c1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw when over limit', async () => {
      mockPrisma.user.count.mockResolvedValue(3);

      await expect(service.checkUserLimit('c1')).rejects.toThrow(ForbiddenException);
    });
  });
});
