import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StepUpGuard } from './step-up.guard';

describe('StepUpGuard', () => {
  let reflector: Reflector;
  let prisma: any;
  let guard: StepUpGuard;

  beforeEach(() => {
    reflector = new Reflector();
    prisma = { query: jest.fn() };
    guard = new StepUpGuard(reflector, prisma);
  });

  const context = (user: any): any => ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  });

  it('allows routes without step-up metadata', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    await expect(guard.canActivate(context({ id: 'u1' }))).resolves.toBe(true);
  });

  it('rejects when MFA freshness is missing', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    prisma.query.mockResolvedValue([{ mfaEnabled: 1, mfaVerifiedAt: null }]);
    await expect(guard.canActivate(context({ id: 'u1', sessionId: 's1' }))).rejects.toThrow(ForbiddenException);
  });

  it('allows a recently verified MFA session', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    prisma.query.mockResolvedValue([{ mfaEnabled: 1, mfaVerifiedAt: new Date() }]);
    await expect(guard.canActivate(context({ id: 'u1', sessionId: 's1' }))).resolves.toBe(true);
  });
});
