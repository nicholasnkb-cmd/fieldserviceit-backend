import { UnauthorizedException } from '@nestjs/common';
import { hashCredential } from '../../../common/security/credential-hash';
import { CmdbService } from './cmdb.service';

describe('CmdbService device credentials', () => {
  function serviceWith(command: any) {
    const prisma = {
      query: jest.fn()
        .mockResolvedValueOnce(command ? [command] : [])
        .mockResolvedValueOnce([{ id: 'command-1', payload: '{}', result: '{}' }]),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    };
    return { prisma, service: new CmdbService(prisma as any, {} as any, {} as any, {} as any, {} as any) };
  }

  it('accepts a hashed device credential when completing a command', async () => {
    const { prisma, service } = serviceWith({
      id: 'command-1',
      mdmDeviceId: 'provider-device-id',
      mdmDeviceTokenHash: hashCredential('device-secret'),
      companyId: 'company-1',
    });

    await expect(service.completeDeviceCommand('command-1', 'device-secret')).resolves.toMatchObject({
      id: 'command-1',
    });
    expect(prisma.execute).toHaveBeenCalled();
  });

  it('rejects an incorrect device credential', async () => {
    const { service } = serviceWith({
      id: 'command-1',
      mdmDeviceTokenHash: hashCredential('device-secret'),
    });

    await expect(service.completeDeviceCommand('command-1', 'wrong-secret')).rejects.toThrow(UnauthorizedException);
  });
});
