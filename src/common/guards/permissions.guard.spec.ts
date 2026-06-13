import { PermissionsGuard } from './permissions.guard';
import { Reflector } from '@nestjs/core';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let mockPrisma: any;

  beforeEach(() => {
    reflector = new Reflector();
    mockPrisma = {
      query: jest.fn().mockResolvedValue([]),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    };
    const authorizationRepository = {
      findUserRolePermissions: jest.fn().mockResolvedValue([]),
      findSystemRolePermissions: jest.fn().mockResolvedValue([]),
    };
    guard = new PermissionsGuard(reflector, mockPrisma, authorizationRepository as any);
    (guard as any).authorizationRepository = authorizationRepository;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow when no permissions required', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'CLIENT' } }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow SUPER_ADMIN without checking permissions', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'SUPER_ADMIN' } }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['tickets:read']);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw when user has insufficient permissions', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'CLIENT', id: 'user-1' } }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['tickets:delete']);
    await expect(guard.canActivate(context)).rejects.toThrow('Insufficient permissions');
  });

  it('should allow when user has required permissions', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'TECHNICIAN', id: 'user-1' } }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['tickets:read', 'tickets:create']);

    (guard as any).authorizationRepository.findUserRolePermissions.mockResolvedValue([
      { roleId: 'role-1', slug: 'tickets:read' },
      { roleId: 'role-1', slug: 'tickets:create' },
      { roleId: 'role-1', slug: 'assets:read' },
    ]);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow service accounts with explicit permissions', async () => {
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'SERVICE_ACCOUNT', serviceAccount: true, permissionSlugs: ['tickets.view'] } }),
      }),
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['tickets.view']);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });
});
