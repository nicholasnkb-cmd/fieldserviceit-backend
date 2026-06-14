import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EndpointOperationsService } from './endpoint-operations.service';

describe('EndpointOperationsService', () => {
  const db = {
    query: jest.fn(),
    execute: jest.fn(),
  };
  const cmdb = {
    runDeviceAction: jest.fn(),
  };
  let service: EndpointOperationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EndpointOperationsService(db as any, cmdb as any);
    (service as any).schemaReady = Promise.resolve();
  });

  it('requires a tenant context', async () => {
    await expect(service.remoteSummary({ id: 'user-1', companyId: null } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unsafe remote access URLs', async () => {
    db.query.mockResolvedValueOnce([{ id: 'asset-1' }]);
    await expect(service.saveRemoteEndpoint(
      { id: 'user-1', companyId: 'company-1' } as any,
      { assetId: 'asset-1', provider: 'ANYDESK', externalDeviceId: '123', launchUrl: 'javascript:alert(1)' },
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('queues validated patch jobs through the device command channel', async () => {
    db.query
      .mockResolvedValueOnce([{ id: 'asset-1' }])
      .mockResolvedValueOnce([{ patchKey: 'KB500001' }])
      .mockResolvedValueOnce([{ id: 'job-1', status: 'PENDING' }]);
    db.execute.mockResolvedValue(undefined);
    cmdb.runDeviceAction.mockResolvedValue({ queuedCommand: { id: 'command-1' } });

    const result = await service.createPatchJob(
      { id: 'user-1', companyId: 'company-1' } as any,
      { assetId: 'asset-1', patchKeys: ['KB500001'] },
    );

    expect(cmdb.runDeviceAction).toHaveBeenCalledWith(
      'asset-1',
      'INSTALL_PATCHES',
      expect.objectContaining({ patchKeys: ['KB500001'] }),
      'company-1',
      'user-1',
    );
    expect(result).toEqual(expect.objectContaining({ id: 'job-1' }));
  });

  it('rejects patches that do not belong to the target asset', async () => {
    db.query
      .mockResolvedValueOnce([{ id: 'asset-1' }])
      .mockResolvedValueOnce([]);

    await expect(service.createPatchJob(
      { id: 'user-1', companyId: 'company-1' } as any,
      { assetId: 'asset-1', patchKeys: ['KB-NOT-ON-ASSET'] },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(cmdb.runDeviceAction).not.toHaveBeenCalled();
  });
});
