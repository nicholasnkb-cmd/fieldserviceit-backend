import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    service = new NotificationsService(mockPrisma as any);
  });

  describe('create', () => {
    it('should create a notification with defaults', async () => {
      const dto = { userId: 'u1', companyId: 'c1', title: 'Test notification' };
      mockPrisma.notification.create.mockResolvedValue({ id: 'n1', ...dto, type: 'info' });

      const result = await service.create(dto);
      expect(result.id).toBe('n1');
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: { userId: 'u1', companyId: 'c1', title: 'Test notification', body: undefined, type: 'info', link: undefined },
      });
    });

    it('should create with explicit type and link', async () => {
      const dto = { userId: 'u1', companyId: 'c1', title: 'Alert', body: 'Something happened', type: 'warning', link: '/tickets/t1' };
      mockPrisma.notification.create.mockResolvedValue({ id: 'n2', ...dto });

      const result = await service.create(dto);
      expect(result.type).toBe('warning');
      expect(result.link).toBe('/tickets/t1');
    });
  });

  describe('findAll', () => {
    it('should return paginated notifications', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([{ id: 'n1' }]);
      mockPrisma.notification.count.mockResolvedValue(1);

      const result = await service.findAll('u1', { page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter unread only when specified', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await service.findAll('u1', { unreadOnly: true });
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', isRead: false } }),
      );
    });

    it('should use default pagination', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await service.findAll('u1', {});
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 25 }),
      );
    });
  });

  describe('markAsRead', () => {
    it('should mark a single notification as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markAsRead('n1', 'u1');
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n1', userId: 'u1' },
        data: { isRead: true },
      });
      expect(result.count).toBe(1);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead('u1');
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isRead: false },
        data: { isRead: true },
      });
      expect(result.count).toBe(3);
    });
  });

  describe('unreadCount', () => {
    it('should return unread count', async () => {
      mockPrisma.notification.count.mockResolvedValue(5);

      const result = await service.unreadCount('u1');
      expect(result).toEqual({ count: 5 });
    });

    it('should return zero when no unread', async () => {
      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await service.unreadCount('u1');
      expect(result.count).toBe(0);
    });
  });
});
