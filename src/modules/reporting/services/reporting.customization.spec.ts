import { ReportingService } from './reporting.service';

describe('ReportingService tenant preferences', () => {
  it('combines report, branding, and company fallbacks', async () => {
    const prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Acme IT',
          logo: '/legacy.png',
          branding: JSON.stringify({ primaryColor: '#123456', logoUrl: '/brand.png' }),
          settings: JSON.stringify({
            customization: { reporting: { headerText: 'Operations Review', defaultDateRange: '90d' } },
          }),
        }),
      },
    };
    const service = new ReportingService(prisma as any);

    await expect(service.getPreferences('company-1')).resolves.toMatchObject({
      companyName: 'Acme IT',
      logoUrl: '/brand.png',
      accentColor: '#123456',
      headerText: 'Operations Review',
      defaultDateRange: '90d',
    });
  });

  it('builds the public operations summary from database results', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ count: 42 }])
      .mockResolvedValueOnce([{ count: 11 }])
      .mockResolvedValueOnce([{ total: 100, compliant: 97 }])
      .mockResolvedValueOnce([
        { action: 'ASSIGNED', createdAt: new Date('2026-06-12T10:00:00Z') },
        { action: 'TIME', createdAt: new Date('2026-06-12T09:00:00Z') },
        { action: 'CREATED', createdAt: new Date('2026-06-12T08:00:00Z') },
      ]);
    const service = new ReportingService({ query } as any);

    await expect(service.getPublicOperations()).resolves.toMatchObject({
      openTickets: 42,
      onRoute: 11,
      slaMet: 97,
      activities: [
        { label: 'Service ticket assigned to a technician' },
        { label: 'Invoice-ready time entry captured' },
        { label: 'New service request entered the queue' },
      ],
    });
    expect(query).toHaveBeenCalledTimes(4);
  });
});
