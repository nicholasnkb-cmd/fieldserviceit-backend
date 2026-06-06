import { BadRequestException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue(Buffer.from('abcdef1234567890abcdef1234567890', 'hex')),
}));

type CreateTicketInput = {
  title: string;
  description?: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  priority?: string;
  category?: string;
  subcategory?: string;
};

describe('TicketsService', () => {
  let service: TicketsService;
  let mockPrisma: any;
  let mockGateway: any;
  let mockTimeline: any;
  let mockParticipantNotifier: any;
  let mockEmail: any;
  let mockNotifications: any;
  let mockUsageService: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      ticket: {
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    mockGateway = {
      notifyTicketUpdate: jest.fn(),
    };
    mockTimeline = {
      addEntry: jest.fn().mockResolvedValue(undefined),
    };
    mockParticipantNotifier = {
      notify: jest.fn().mockResolvedValue(undefined),
    };
    mockEmail = {};
    mockNotifications = {};
    mockUsageService = {
      incrementUsage: jest.fn().mockResolvedValue(undefined),
    };

    const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service = new TicketsService(
      mockPrisma as any,
      mockGateway as any,
      mockTimeline as any,
      mockParticipantNotifier as any,
      mockEmail as any,
      mockNotifications as any,
      mockUsageService as any,
      mockLogger as any,
    );
  });

  describe('create', () => {
    const validDto: CreateTicketInput = {
      title: 'Test Ticket',
      description: 'A test ticket',
      contactName: 'John Doe',
      contactEmail: 'john@example.com',
      contactPhone: '555-1234',
      priority: 'HIGH',
      category: 'Software',
    };

    it('should throw if contactName missing', async () => {
      await expect(service.create({ ...validDto, contactName: '' } as any, 'c1', 'u1', 'BUSINESS')).rejects.toThrow(BadRequestException);
    });

    it('should throw if contactEmail missing', async () => {
      await expect(service.create({ ...validDto, contactEmail: '' } as any, 'c1', 'u1', 'BUSINESS')).rejects.toThrow(BadRequestException);
    });

    it('should throw if contactPhone missing', async () => {
      await expect(service.create({ ...validDto, contactPhone: '' } as any, 'c1', 'u1', 'BUSINESS')).rejects.toThrow(BadRequestException);
    });

    it('should throw if title missing', async () => {
      await expect(service.create({ ...validDto, title: '' } as any, 'c1', 'u1', 'BUSINESS')).rejects.toThrow(BadRequestException);
    });

    it('should create ticket and increment usage for company users', async () => {
      const mockTicket = {
        id: 'ticket-1',
        ticketNumber: 'TKT-C1-00001',
        title: 'Test Ticket',
        companyId: 'c1',
        createdById: 'u1',
      };

      mockPrisma.ticket.count.mockResolvedValue(0);
      mockPrisma.ticket.findFirst.mockResolvedValue(null);
      mockPrisma.ticket.create.mockResolvedValue(mockTicket);

      const result = await service.create(validDto as any, 'c1', 'u1', 'BUSINESS');

      expect(mockPrisma.ticket.count).toHaveBeenCalledWith({ where: { companyId: 'c1' } });
      expect(mockPrisma.ticket.create).toHaveBeenCalled();
      expect(mockUsageService.incrementUsage).toHaveBeenCalledWith('c1', 'tickets');
      expect(mockGateway.notifyTicketUpdate).toHaveBeenCalledWith('c1', 'ticket:created', mockTicket);
      expect(mockParticipantNotifier.notify).toHaveBeenCalledWith('ticket-1', expect.objectContaining({
        action: 'Ticket opened',
        actorId: 'u1',
      }));
      expect(result.ticketNumber).toBe('TKT-C1-00001');
    });

    it('should not increment usage for PUBLIC users', async () => {
      const mockTicket = {
        id: 'ticket-pub',
        ticketNumber: 'TKT-PUB-00001',
        title: 'Public Ticket',
        companyId: null,
        createdById: 'u-pub',
      };

      mockPrisma.ticket.count.mockResolvedValue(0);
      mockPrisma.ticket.findFirst.mockResolvedValue(null);
      mockPrisma.ticket.create.mockResolvedValue(mockTicket);

      const result = await service.create(validDto as any, null, 'u-pub', 'PUBLIC');

      expect(mockUsageService.incrementUsage).not.toHaveBeenCalled();
      expect(mockGateway.notifyTicketUpdate).not.toHaveBeenCalled();
      expect(result.ticketNumber).toBe('TKT-PUB-00001');
    });

    it('should create a public requester when submitting an unauthenticated ticket', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'public-user-1' });
      mockPrisma.ticket.count.mockResolvedValue(0);
      mockPrisma.ticket.findFirst.mockResolvedValue(null);
      mockPrisma.ticket.create.mockImplementation(async ({ data }: any) => ({
        id: 'ticket-public-submit',
        ticketNumber: data.ticketNumber,
        companyId: data.companyId,
        createdById: data.createdById,
      }));

      const result = await service.createPublic(validDto as any);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          email: 'john@example.com',
          userType: 'PUBLIC',
        }),
      }));
      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          companyId: null,
          createdById: 'public-user-1',
        }),
      }));
      expect(result.ticketNumber).toBe('TKT-PUB-00001');
    });

    it('should handle incrementUsage failure gracefully', async () => {
      const mockTicket = {
        id: 'ticket-2',
        ticketNumber: 'TKT-C1-00002',
        title: 'Graceful Test',
        companyId: 'c1',
        createdById: 'u1',
      };

      mockPrisma.ticket.count.mockResolvedValue(1);
      mockPrisma.ticket.findFirst.mockResolvedValue(null);
      mockPrisma.ticket.create.mockResolvedValue(mockTicket);
      mockUsageService.incrementUsage.mockRejectedValue(new Error('DB error'));

      const result = await service.create(validDto as any, 'c1', 'u1', 'BUSINESS');

      expect(result.id).toBe('ticket-2');
      expect(mockGateway.notifyTicketUpdate).toHaveBeenCalled();
    });

    it('should generate correct sequential ticket numbers', async () => {
      mockPrisma.ticket.count.mockResolvedValue(42);
      mockPrisma.ticket.findFirst.mockResolvedValue(null);
      mockPrisma.ticket.create.mockImplementation(async ({ data }: any) => ({
        id: 'ticket-seq',
        ticketNumber: data.ticketNumber,
        companyId: data.companyId,
        createdById: data.createdById,
      }));

      const result = await service.create(validDto as any, 'company-id', 'u1', 'BUSINESS');
      expect(result.ticketNumber).toMatch(/^TKT-COMP-00043$/);
    });

    it('should skip colliding ticket numbers', async () => {
      mockPrisma.ticket.count.mockResolvedValue(0);
      mockPrisma.ticket.findFirst
        .mockResolvedValueOnce({ id: 'existing' })
        .mockResolvedValueOnce(null);
      mockPrisma.ticket.create.mockImplementation(async ({ data }: any) => ({
        id: 'ticket-next',
        ticketNumber: data.ticketNumber,
        companyId: data.companyId,
        createdById: data.createdById,
      }));

      const result = await service.create(validDto as any, null, 'u1', 'BUSINESS');
      expect(result.ticketNumber).toBe('TKT-PUB-00002');
    });
  });

  describe('findAll', () => {
    it('should let global SUPER_ADMIN list all tickets without a company filter', async () => {
      mockPrisma.ticket.findMany = jest.fn().mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await service.findAll({ id: 'super-1', role: 'SUPER_ADMIN', userType: 'BUSINESS', companyId: null }, {});

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { deletedAt: null },
      }));
      expect(mockPrisma.ticket.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    });

    it('should keep public users scoped to their own tickets', async () => {
      mockPrisma.ticket.findMany = jest.fn().mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await service.findAll({ id: 'public-1', role: 'CLIENT', userType: 'PUBLIC', companyId: null }, {});

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { deletedAt: null, createdById: 'public-1' },
      }));
    });

    it('should scope GLOBAL_TECH users to individual public tickets', async () => {
      mockPrisma.ticket.findMany = jest.fn().mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await service.findAll({ id: 'global-tech-1', role: 'GLOBAL_TECH', userType: 'BUSINESS', companyId: null }, {});

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { companyId: null },
            { createdBy: { userType: 'PUBLIC' } },
          ],
        },
      }));
    });
  });
});
