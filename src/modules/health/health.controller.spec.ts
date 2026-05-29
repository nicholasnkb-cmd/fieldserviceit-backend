import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: jest.fn(),
    };
    controller = new HealthController(mockPrisma as any);
  });

  describe('check', () => {
    it('should return ok when DB responds', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([[{ 1: 1 }]]);

      const result: any = await controller.check();
      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });

    it('should return degraded when DB is down', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      const result: any = await controller.check();
      expect(result.status).toBe('degraded');
      expect(result.database.status).toBe('error');
    });

    it('should report pool info when available', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([[{ 1: 1 }]]);
      (mockPrisma as any).pool = { config: { connectionLimit: 10 } };

      const result: any = await controller.check();
      expect(result.pool.status).toBe('ok');
    });
  });

  describe('ping', () => {
    it('should return pong', async () => {
      const result: any = await controller.ping();
      expect(result.pong).toBe(true);
      expect(result.timestamp).toBeDefined();
    });
  });
});
