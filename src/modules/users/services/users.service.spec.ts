import { UsersService } from './users.service';

describe('UsersService effective permissions', () => {
  const user = {
    id: 'user-1',
    email: 'admin@example.com',
    firstName: 'Tenant',
    lastName: 'Admin',
    role: 'TENANT_ADMIN',
    userType: 'BUSINESS',
    companyId: 'company-1',
    isActive: true,
    createdAt: new Date(),
  };

  it('hydrates tenant defaults and assigned permissions for /users/me', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(user) },
      query: jest.fn().mockResolvedValue([{ slug: 'temporary.custom' }]),
    };
    const authorization = {
      findUserRolePermissions: jest.fn().mockResolvedValue([{ roleId: 'role-1', slug: 'assigned.custom' }]),
      findSystemRolePermissions: jest.fn().mockResolvedValue([{ roleId: 'role-2', slug: 'system.custom' }]),
    };
    const service = new UsersService(prisma as any, authorization as any);

    const result = await service.findById(user.id);

    expect(result.permissions).toEqual(expect.arrayContaining([
      'assets.delete',
      'assigned.custom',
      'system.custom',
      'temporary.custom',
    ]));
  });

  it('returns a wildcard permission for super administrators', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ ...user, role: 'SUPER_ADMIN' }) } };
    const authorization = { findUserRolePermissions: jest.fn(), findSystemRolePermissions: jest.fn() };
    const service = new UsersService(prisma as any, authorization as any);

    const result = await service.findById(user.id);

    expect(result.permissions).toEqual(['*']);
    expect(authorization.findUserRolePermissions).not.toHaveBeenCalled();
  });
});
