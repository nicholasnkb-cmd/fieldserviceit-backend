import { RmmIntegrationController } from './rmm-integration.controller';

describe('RmmIntegrationController configuration tests', () => {
  it('merges saved secrets into an edited draft before testing', async () => {
    const validateCredentials = jest.fn().mockResolvedValue(true);
    const prisma = {
      rmmProviderConfig: {
        findFirst: jest.fn().mockResolvedValue({
          credentials: JSON.stringify({
            instanceUrl: 'https://app.ninjarmm.com',
            clientId: 'saved-client',
            clientSecret: 'saved-secret',
          }),
        }),
      },
    };
    const controller = new RmmIntegrationController(
      {} as any,
      {} as any,
      { getProvider: () => ({ validateCredentials }) } as any,
      prisma as any,
    );

    await expect(controller.testUnsavedConfig(
      { provider: 'ninjaone', credentials: { scope: 'monitoring management' } },
      { companyId: 'company-1' } as any,
    )).resolves.toEqual({ provider: 'ninjaone', status: 'PASS' });

    expect(validateCredentials).toHaveBeenCalledWith({
      instanceUrl: 'https://app.ninjarmm.com',
      clientId: 'saved-client',
      clientSecret: 'saved-secret',
      scope: 'monitoring management',
    });
  });

  it('uses the effective tenant context for super administrators', async () => {
    const prisma = {
      rmmProviderConfig: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const controller = new RmmIntegrationController(
      {} as any,
      {} as any,
      {} as any,
      prisma as any,
    );

    await controller.listConfigs({
      companyId: null,
      effectiveCompanyId: 'selected-company',
    } as any);

    expect(prisma.rmmProviderConfig.findMany).toHaveBeenCalledWith({
      where: { companyId: 'selected-company' },
    });
  });
});
