import { FeatureGuard, CHECK_TICKET_LIMIT, CHECK_USER_LIMIT } from './feature.guard';
import { Reflector } from '@nestjs/core';

describe('FeatureGuard', () => {
  let guard: FeatureGuard;
  let reflector: Reflector;
  let mockUsageService: any;

  beforeEach(() => {
    reflector = new Reflector();
    mockUsageService = {
      checkTicketLimit: jest.fn().mockResolvedValue(true),
      checkUserLimit: jest.fn().mockResolvedValue(true),
    };
    guard = new FeatureGuard(reflector as any, mockUsageService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow when no limit checks are set', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { companyId: 'c1' } }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockUsageService.checkTicketLimit).not.toHaveBeenCalled();
    expect(mockUsageService.checkUserLimit).not.toHaveBeenCalled();
  });

  it('should allow when no user (unauthenticated)', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: null }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow when user has no companyId', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'u1' } }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should check ticket limit when CHECK_TICKET_LIMIT is set', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { companyId: 'c1' } }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === CHECK_TICKET_LIMIT) return true;
      return undefined;
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockUsageService.checkTicketLimit).toHaveBeenCalledWith('c1');
    expect(mockUsageService.checkUserLimit).not.toHaveBeenCalled();
  });

  it('should check user limit when CHECK_USER_LIMIT is set', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { companyId: 'c1' } }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === CHECK_USER_LIMIT) return true;
      return undefined;
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockUsageService.checkUserLimit).toHaveBeenCalledWith('c1');
    expect(mockUsageService.checkTicketLimit).not.toHaveBeenCalled();
  });

  it('should check both limits when both are set', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { companyId: 'c1' } }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === CHECK_TICKET_LIMIT || key === CHECK_USER_LIMIT) return true;
      return undefined;
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockUsageService.checkTicketLimit).toHaveBeenCalledWith('c1');
    expect(mockUsageService.checkUserLimit).toHaveBeenCalledWith('c1');
  });

  it('should propagate ForbiddenException from usage service', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { companyId: 'c1' } }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === CHECK_TICKET_LIMIT) return true;
      return undefined;
    });
    mockUsageService.checkTicketLimit.mockRejectedValue(new Error('Ticket limit reached'));

    await expect(guard.canActivate(context)).rejects.toThrow('Ticket limit reached');
  });
});
