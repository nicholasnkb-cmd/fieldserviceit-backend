import { ForbiddenException } from '@nestjs/common';
import { MonitoringAccessGuard } from './monitoring-access.guard';

describe('MonitoringAccessGuard', () => {
  const context = (request: any) => ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as any;

  it('allows an authenticated administrator', () => {
    const guard = new MonitoringAccessGuard({ get: jest.fn() } as any);
    expect(guard.canActivate(context({ user: { role: 'SUPER_ADMIN' }, headers: {} }))).toBe(true);
  });

  it('allows a configured monitoring key', () => {
    const guard = new MonitoringAccessGuard({ get: jest.fn().mockReturnValue('a'.repeat(24)) } as any);
    expect(guard.canActivate(context({ headers: { 'x-monitoring-key': 'a'.repeat(24) } }))).toBe(true);
  });

  it('denies anonymous requests without a valid key', () => {
    const guard = new MonitoringAccessGuard({ get: jest.fn().mockReturnValue('a'.repeat(24)) } as any);
    expect(() => guard.canActivate(context({ headers: {} }))).toThrow(ForbiddenException);
  });
});
