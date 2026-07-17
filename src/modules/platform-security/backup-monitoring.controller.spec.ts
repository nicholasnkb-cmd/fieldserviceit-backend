import { BackupMonitoringController } from './backup-monitoring.controller';

describe('BackupMonitoringController', () => {
  it('returns a structured failed drill outcome for monitoring systems', async () => {
    const service = { runLatestRestoreDrill: jest.fn().mockRejectedValue(new Error('Off-site backup storage is not configured')) };
    const controller = new BackupMonitoringController(service as any);

    await expect(controller.runLatestRestoreDrill()).resolves.toEqual({
      status: 'FAIL',
      error: 'Off-site backup storage is not configured',
    });
  });

  it('returns the successful drill result unchanged', async () => {
    const result = { status: 'PASS', restoredTables: 42, restoredRows: 100 };
    const service = { runLatestRestoreDrill: jest.fn().mockResolvedValue(result) };
    const controller = new BackupMonitoringController(service as any);

    await expect(controller.runLatestRestoreDrill()).resolves.toBe(result);
  });
});
