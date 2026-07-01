import { UnauthorizedException } from '@nestjs/common';
import { ServiceAccountGuard } from './service-account.guard';

describe('ServiceAccountGuard', () => {
  let prisma: any;
  let guard: ServiceAccountGuard;

  beforeEach(() => {
    prisma = { query: jest.fn(), execute: jest.fn().mockResolvedValue({}) };
    guard = new ServiceAccountGuard(prisma);
  });

  const context = (headers: Record<string, string> = {}): any => {
    const request: any = { headers, ip: '127.0.0.1', socket: {}, user: null };
    return {
      request,
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    };
  };

  it('requires a service token', async () => {
    await expect(guard.canActivate(context())).rejects.toThrow(UnauthorizedException);
  });

  it('hydrates a service account identity', async () => {
    const ctx = context({ 'x-service-token': 'fsit_sa_test' });
    prisma.query.mockResolvedValue([{
      id: 'svc-1',
      name: 'Automation',
      companyId: 'company-1',
      permissionSlugs: JSON.stringify(['tickets.view']),
      scopeType: 'ALL',
      scopeValues: JSON.stringify([]),
    }]);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.request.user.role).toBe('SERVICE_ACCOUNT');
    expect(ctx.request.user.permissionSlugs).toEqual(['tickets.view']);
  });
});
