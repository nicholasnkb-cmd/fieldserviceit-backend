import { PermissionsGuard } from './permissions.guard';
import { Reflector } from '@nestjs/core';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let mockPrisma: any;

  beforeEach(() => {
    reflector = new Reflector();
    mockPrisma = {
      userRole: {
        findMany: jest.fn(),
      },
    };
    guard = new PermissionsGuard(reflector, mockPrisma);
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
    mockPrisma.userRole.findMany.mockResolvedValue([]);

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

    mockPrisma.userRole.findMany.mockResolvedValue([
      {
        role: {
          permissions: [
            { permission: { slug: 'tickets:read' } },
            { permission: { slug: 'tickets:create' } },
            { permission: { slug: 'assets:read' } },
          ],
        },
      },
    ]);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });
});
