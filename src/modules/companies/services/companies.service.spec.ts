import { NotFoundException } from '@nestjs/common';
import { CompaniesService } from './companies.service';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      company: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      ticket: { count: jest.fn() },
      user: { count: jest.fn() },
      asset: { count: jest.fn() },
      dispatch: { count: jest.fn() },
    };

    service = new CompaniesService(mockPrisma as any);
  });

  describe('create', () => {
    it('should create a company', async () => {
      const dto = { name: 'Test Corp', slug: 'test-corp' };
      mockPrisma.company.create.mockResolvedValue({ id: 'c1', ...dto });

      const result = await service.create(dto);
      expect(result.id).toBe('c1');
      expect(mockPrisma.company.create).toHaveBeenCalledWith({ data: dto });
    });
  });

  describe('findAll', () => {
    it('should return paginated companies', async () => {
      const companies = [{ id: 'c1', name: 'Test Corp' }];
      mockPrisma.company.findMany.mockResolvedValue(companies);
      mockPrisma.company.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toEqual(companies);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should use default page/limit when not provided', async () => {
      mockPrisma.company.findMany.mockResolvedValue([]);
      mockPrisma.company.count.mockResolvedValue(0);

      await service.findAll({});
      expect(mockPrisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 25 }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a company by id', async () => {
      const company = { id: 'c1', name: 'Test Corp' };
      mockPrisma.company.findFirst.mockResolvedValue(company);

      const result = await service.findOne('c1');
      expect(result).toEqual(company);
    });

    it('should throw NotFoundException when company not found', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);
      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update and return the company', async () => {
      const company = { id: 'c1', name: 'Old Name' };
      mockPrisma.company.findFirst.mockResolvedValue(company);
      mockPrisma.company.update.mockResolvedValue({ ...company, name: 'New Name' });

      const result = await service.update('c1', { name: 'New Name' });
      expect(result.name).toBe('New Name');
    });

    it('should throw if company not found', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);
      await expect(service.update('nonexistent', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete the company', async () => {
      const company = { id: 'c1', name: 'Test Corp' };
      mockPrisma.company.findFirst.mockResolvedValue(company);
      mockPrisma.company.update.mockResolvedValue({ ...company, deletedAt: new Date() });

      await service.remove('c1');
      expect(mockPrisma.company.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { deletedAt: expect.any(Date), isActive: false },
      });
    });
  });

  describe('getStats', () => {
    it('should return aggregated counts', async () => {
      mockPrisma.ticket.count.mockResolvedValue(10);
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.asset.count.mockResolvedValue(20);
      mockPrisma.dispatch.count.mockResolvedValue(3);

      const stats = await service.getStats('c1');
      expect(stats).toEqual({ tickets: 10, users: 5, assets: 20, dispatches: 3 });
    });
  });
});
