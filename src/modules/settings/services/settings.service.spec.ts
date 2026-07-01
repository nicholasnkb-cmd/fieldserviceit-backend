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

  it('resets tenant customization while preserving unrelated settings', async () => {
    const prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'company-1',
          name: 'Acme',
          logo: '/uploads/branding/company-1/logo.webp',
          branding: JSON.stringify({ primaryColor: '#123456' }),
          settings: JSON.stringify({
            timezone: 'America/New_York',
            featureOverrides: { reporting: true },
            customization: { banner: { enabled: true } },
          }),
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

    const result: any = await service.resetCustomization('company-1');

    expect(result.logo).toBeNull();
    expect(result.branding).toEqual({});
    expect(result.settings.customization).toBeUndefined();
    expect(result.settings.timezone).toBe('America/New_York');
    expect(result.settings.featureOverrides).toEqual({ reporting: true });
  });

  it('records a tenant settings snapshot before publishing customization', async () => {
    const auditLog = { create: jest.fn().mockResolvedValue({ id: 'history-1' }) };
    const prisma = {
      auditLog,
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'company-1',
          name: 'Acme',
          domain: 'acme.example',
          logo: null,
          branding: JSON.stringify({ primaryColor: '#123456' }),
          settings: JSON.stringify({ timezone: 'UTC' }),
        }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'company-1',
          name: 'Acme',
          logo: null,
          branding: JSON.stringify({ primaryColor: '#123456' }),
          settings: data.settings,
        })),
      },
    };
    const service = new SettingsService(prisma as any);

    await service.updateCustomization('company-1', { banner: { enabled: true } }, 'user-1');

    expect(auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-1',
        actorId: 'user-1',
        action: 'CUSTOMIZATION_UPDATE',
        resourceType: 'TENANT_SETTINGS',
      }),
    });
  });

  it('rolls back only a settings version owned by the current tenant', async () => {
    const snapshot = {
      name: 'Acme Previous',
      domain: 'old.acme.example',
      logo: '/uploads/branding/company-1/old.png',
      branding: { primaryColor: '#abcdef' },
      settings: { timezone: 'UTC', customization: { banner: { enabled: true } } },
    };
    const prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'history-current' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'history-1',
          companyId: 'company-1',
          resourceType: 'TENANT_SETTINGS',
          diff: JSON.stringify(snapshot),
        }),
      },
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'company-1',
          name: 'Acme Current',
          domain: 'acme.example',
          logo: null,
          branding: '{}',
          settings: '{}',
        }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'company-1',
          slug: 'acme',
          ...data,
        })),
      },
    };
    const service = new SettingsService(prisma as any);

    const result: any = await service.rollback('company-1', 'history-1', 'user-1');

    expect(result.name).toBe('Acme Previous');
    expect(result.branding.primaryColor).toBe('#abcdef');
    expect(result.settings.customization.banner.enabled).toBe(true);
  });

  it('rejects a settings history version from another tenant', async () => {
    const prisma = {
      auditLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'history-2',
          companyId: 'company-2',
          resourceType: 'TENANT_SETTINGS',
          diff: '{}',
        }),
      },
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'company-1',
          name: 'Acme',
          branding: '{}',
          settings: '{}',
        }),
      },
    };
    const service = new SettingsService(prisma as any);

    await expect(service.rollback('company-1', 'history-2', 'user-1'))
      .rejects.toThrow('Settings version not found');
  });
});
