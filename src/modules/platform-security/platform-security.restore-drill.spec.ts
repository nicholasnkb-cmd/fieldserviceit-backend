import { PlatformSecurityService } from './platform-security.service';

describe('PlatformSecurityService restore drill', () => {
  it('creates a fresh encrypted backup when no completed backup exists', async () => {
    const service = Object.create(PlatformSecurityService.prototype) as PlatformSecurityService;
    (service as any).db = { query: jest.fn().mockResolvedValue([]) };
    service.runBackup = jest.fn().mockResolvedValue({ id: 'fresh-backup' } as any);
    service.testBackup = jest.fn().mockResolvedValue({ status: 'PASS' } as any);

    await expect(service.runLatestRestoreDrill()).resolves.toEqual({ status: 'PASS' });
    expect(service.runBackup).toHaveBeenCalledTimes(1);
    expect(service.testBackup).toHaveBeenCalledWith('fresh-backup');
  });

  it('restores the latest completed backup without creating another one', async () => {
    const service = Object.create(PlatformSecurityService.prototype) as PlatformSecurityService;
    (service as any).db = { query: jest.fn().mockResolvedValue([{ id: 'latest-backup' }]) };
    service.runBackup = jest.fn();
    service.testBackup = jest.fn().mockResolvedValue({ status: 'PASS' } as any);

    await expect(service.runLatestRestoreDrill()).resolves.toEqual({ status: 'PASS' });
    expect(service.runBackup).not.toHaveBeenCalled();
    expect(service.testBackup).toHaveBeenCalledWith('latest-backup');
  });

  it('replaces a stale completed backup whose artifact cannot be restored', async () => {
    const service = Object.create(PlatformSecurityService.prototype) as PlatformSecurityService;
    (service as any).db = { query: jest.fn().mockResolvedValue([{ id: 'stale-backup' }]) };
    (service as any).logger = { warn: jest.fn() };
    service.runBackup = jest.fn().mockResolvedValue({ id: 'fresh-backup' } as any);
    service.testBackup = jest.fn()
      .mockRejectedValueOnce(new Error('Backup artifact is unavailable locally and off-site'))
      .mockResolvedValueOnce({ status: 'PASS' } as any);

    await expect(service.runLatestRestoreDrill()).resolves.toEqual({ status: 'PASS' });
    expect(service.runBackup).toHaveBeenCalledTimes(1);
    expect(service.testBackup).toHaveBeenNthCalledWith(1, 'stale-backup');
    expect(service.testBackup).toHaveBeenNthCalledWith(2, 'fresh-backup');
  });
});
