import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    guard = new TenantGuard(reflector, {
      company: { findFirst: jest.fn() },
      query: jest.fn().mockResolvedValue([]),
    } as any);
  });

  function context(request: any) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
  }

  it('sets the authenticated tenant on the request', async () => {
    const request = {
      user: { id: 'user-1', role: 'CLIENT', userType: 'BUSINESS', companyId: 'company-1' },
      headers: {},
      params: {},
      body: {},
    };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request).toMatchObject({ companyId: 'company-1' });
  });

  it('denies a body that attempts to select another tenant', async () => {
    const request = {
      user: { id: 'user-1', role: 'CLIENT', userType: 'BUSINESS', companyId: 'company-1' },
      headers: {},
      params: {},
      body: { companyId: 'company-2' },
    };
    await expect(guard.canActivate(context(request))).rejects.toThrow(ForbiddenException);
  });

  it('denies business users without a company', async () => {
    const request = {
      user: { id: 'user-1', role: 'CLIENT', userType: 'BUSINESS', companyId: null },
      headers: {},
      params: {},
      body: {},
    };
    await expect(guard.canActivate(context(request))).rejects.toThrow('No company context available');
  });
});
