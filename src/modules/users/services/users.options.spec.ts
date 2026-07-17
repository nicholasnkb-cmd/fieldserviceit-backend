import { UsersService } from './users.service';

describe('UsersService form options', () => {
  it('lists only active users from the current tenant', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new UsersService({ user: { findMany } } as any);

    await service.listOptions('company-1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        companyId: 'company-1',
        deletedAt: null,
        isActive: true,
      },
    }));
  });

  it('limits role-filtered options to supported tenant roles', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new UsersService({ user: { findMany } } as any);

    await service.listOptions('company-1', 'TECHNICIAN,TENANT_ADMIN,SUPER_ADMIN');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'company-1',
        role: { in: ['TECHNICIAN', 'TENANT_ADMIN'] },
      }),
    }));
  });
});
