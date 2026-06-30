import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MonitoringAccessGuard } from '../../common/guards/monitoring-access.guard';
import { ConfigService } from '@nestjs/config';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: MonitoringAccessGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: HealthService,
          useValue: {
            check: jest.fn().mockResolvedValue({
              status: 'ok',
              timestamp: new Date().toISOString(),
              version: '1.0.0',
              database: { status: 'ok', latency: 10 },
            }),
            ready: jest.fn().mockResolvedValue({
              status: 'ok',
              timestamp: new Date().toISOString(),
              version: '1.0.0',
              database: { status: 'ok', latency: 10 },
            }),
            live: jest.fn().mockResolvedValue({
              status: 'ok',
              timestamp: new Date().toISOString(),
              version: '1.0.0',
            }),
            dashboard: jest.fn().mockResolvedValue({
              status: 'ok',
              timestamp: new Date().toISOString(),
              version: '1.0.0',
              uptime: { seconds: 3600, readable: '0d 1h 0m 0s' },
              database: { status: 'ok', latency: 10 },
              requests: {
                total: '1000',
                errors: '5',
                errorRate: '0.5%',
                averageLatency: '145ms',
              },
              slowQueries: {
                total: '2',
                threshold: '1000ms',
              },
              memory: {
                heapUsed: '150 MB',
                heapTotal: '200 MB',
                rss: '250 MB',
              },
              operations: {},
              dependencies: {
                email: { status: 'configured', provider: 'SMTP' },
                queue: { status: 'ok', queued: 0, failed: 0, paused: false },
                payments: { status: 'configured', provider: 'PAYPAL' },
              },
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  describe('check', () => {
    it('should return health status', async () => {
      const result = await controller.check();
      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(service.check).toHaveBeenCalled();
    });
  });

  describe('ready', () => {
    it('should return readiness status', async () => {
      const result = await controller.ready();
      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('ok');
      expect(service.ready).toHaveBeenCalled();
    });
  });

  describe('live', () => {
    it('should return liveness status', async () => {
      const result = await controller.live();
      expect(result.status).toBe('ok');
      expect(service.live).toHaveBeenCalled();
    });
  });

  describe('dashboard', () => {
    it('should return comprehensive health metrics', async () => {
      const result = await controller.dashboard();
      expect(result.status).toBe('ok');
      expect(result.uptime).toBeDefined();
      expect(result.uptime.seconds).toBe(3600);
      expect(result.database).toBeDefined();
      expect(result.requests).toBeDefined();
      expect(result.memory).toBeDefined();
      expect(result.dependencies).toBeDefined();
      expect(service.dashboard).toHaveBeenCalled();
    });
  });
});
