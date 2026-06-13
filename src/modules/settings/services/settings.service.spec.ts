import { SettingsService } from './settings.service';

describe('SettingsService tenant customization', () => {
  it('merges customization without removing unrelated company settings', async () => {
    const prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'company-1',
          name: 'Acme',
          settings: JSON.stringify({ timezone: 'UTC', customization: { banner: { enabled: false } } }),
          branding: null,
        }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'company-1',
          name: 'Acme',
          logo: null,
          branding: null,
          settings: data.settings,
        })),
      },
    };
    const service = new SettingsService(prisma as any);

    const result: any = await service.updateCustomization('company-1', {
      banner: { enabled: true, text: 'Welcome' },
      reporting: { defaultDateRange: '30d' },
    });

    expect(result.settings.timezone).toBe('UTC');
    expect(result.settings.customization.banner).toEqual({ enabled: true, text: 'Welcome' });
    expect(result.settings.customization.reporting.defaultDateRange).toBe('30d');
  });
});
