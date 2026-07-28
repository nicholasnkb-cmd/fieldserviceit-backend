import { RmmSyncService } from './rmm-sync.service';

describe('RmmSyncService synchronization lock', () => {
  it('acquires and releases the named lock on the same dedicated connection', async () => {
    const connection = {
      query: jest.fn()
        .mockResolvedValueOnce([{ acquired: 1 }])
        .mockResolvedValueOnce([{ released: 1 }]),
    };
    const prisma = {
      transaction: jest.fn(async (callback) => callback(connection)),
    };
    const service = new RmmSyncService(prisma as any, {} as any, {} as any);
    jest.spyOn(service as any, 'syncProviderAssets').mockResolvedValue({ synced: true });

    await expect((service as any).runSyncWithRetry({
      id: 'config-1', companyId: 'company-1', provider: 'ninjaone', credentials: '{}',
    }, 1)).resolves.toEqual({ synced: true, attempts: 1 });

    expect(prisma.transaction).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenNthCalledWith(1, 'SELECT GET_LOCK(?, 0) AS acquired', ['rmm:company-1:ninjaone']);
    expect(connection.query).toHaveBeenNthCalledWith(2, 'SELECT RELEASE_LOCK(?) AS released', ['rmm:company-1:ninjaone']);
  });
});
