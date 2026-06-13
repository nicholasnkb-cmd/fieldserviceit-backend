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

  it('automatically configures an uploaded tenant logo and report logo', async () => {
    const prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'company-1',
          name: 'Acme',
          logo: null,
          branding: JSON.stringify({ primaryColor: '#123456' }),
          settings: JSON.stringify({ timezone: 'UTC' }),
        }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'company-1',
          name: 'Acme',
          logo: data.logo,
          branding: data.branding,
          settings: data.settings,
        })),
      },
    };
    const service = new SettingsService(prisma as any);

    const result: any = await service.configureUploadedImage(
      'company-1',
      'logoUrl',
      '/uploads/branding/company-1/logo.png',
    );

    expect(result.logo).toBe('/uploads/branding/company-1/logo.png');
    expect(result.branding).toMatchObject({
      primaryColor: '#123456',
      logoUrl: '/uploads/branding/company-1/logo.png',
    });
    expect(result.settings.customization.reporting).toMatchObject({
      logoUrl: '/uploads/branding/company-1/logo.png',
      showCompanyLogo: true,
    });
  });
});
