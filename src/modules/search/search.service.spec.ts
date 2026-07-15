import { SearchService } from './search.service';

describe('SearchService', () => {
  const prisma = {
    query: jest.fn(),
    ticket: { findMany: jest.fn() },
    asset: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    company: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.query.mockResolvedValue([]);
    prisma.ticket.findMany.mockResolvedValue([]);
    prisma.asset.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.company.findMany.mockResolvedValue([]);
  });

  it('returns matching application pages', async () => {
    const service = new SearchService(prisma as any);

    const result = await service.search({
      id: 'user-1',
      role: 'CLIENT',
      userType: 'BUSINESS',
      companyId: 'company-1',
      permissionSlugs: [],
      permissionScopes: [],
    }, 'profile');

    expect(result.pages).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Profile', href: '/profile' }),
    ]));
  });

  it('searches users when the current user has users.view', async () => {
    prisma.user.findMany.mockResolvedValue([{
      id: 'user-2',
      email: 'alex@example.com',
      firstName: 'Alex',
      lastName: 'Rivera',
      role: 'CLIENT',
      userType: 'BUSINESS',
      company: { name: 'Acme' },
      isActive: true,
    }]);
    const service = new SearchService(prisma as any);

    const result = await service.search({
      id: 'admin-1',
      role: 'TENANT_ADMIN',
      userType: 'BUSINESS',
      companyId: 'company-1',
      permissionSlugs: ['users.view'],
      permissionScopes: [],
    }, 'alex');

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'company-1' }),
    }));
    expect(result.users).toEqual([
      expect.objectContaining({
        title: 'Alex Rivera',
        subtitle: 'alex@example.com',
        href: '/admin/company?search=alex%40example.com',
      }),
    ]);
  });

  it('allows super admins to search companies and admin pages', async () => {
    prisma.company.findMany.mockResolvedValue([{
      id: 'company-1',
      name: 'Acme Services',
      slug: 'acme-services',
      domain: 'acme.test',
      isActive: true,
    }]);
    const service = new SearchService(prisma as any);

    const result = await service.search({
      id: 'super-1',
      role: 'SUPER_ADMIN',
      userType: 'BUSINESS',
      companyId: null,
      permissionScopes: [],
    }, 'companies');

    expect(result.pages).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Companies', href: '/admin/companies' }),
    ]));
    expect(prisma.company.findMany).toHaveBeenCalled();
  });
});
