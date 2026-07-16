import { BadRequestException } from '@nestjs/common';
import { NetworkInventoryService } from './network-inventory.service';

describe('NetworkInventoryService', () => {
  const prisma = {
    query: jest.fn(),
    execute: jest.fn(),
    auditLog: { create: jest.fn() },
  };
  const assets = { findTenantAsset: jest.fn() };
  const cmdb = { create: jest.fn(), scanSubnet: jest.fn() };
  let service: NetworkInventoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NetworkInventoryService(prisma as any, assets as any, cmdb as any);
  });

  it('skips duplicate identifiers without creating a device', async () => {
    prisma.query.mockResolvedValue([{ id: 'existing', name: 'Core Switch', serialNumber: 'ABC-100' }]);
    const result = await service.importDevices([{ name: 'Replacement', serialNumber: 'abc-100' }], 'company-1', 'user-1');
    expect(result.created).toEqual([]);
    expect(result.duplicates[0].reason).toContain('Core Switch');
    expect(cmdb.create).not.toHaveBeenCalled();
  });

  it('rejects invalid network identifiers in an import row', async () => {
    prisma.query.mockResolvedValue([]);
    const result = await service.importDevices([{ name: 'Router', ipAddress: '999.1.1.1' }], 'company-1');
    expect(result.invalid).toEqual([{ row: 2, name: 'Router', reason: 'IP address is not a valid IPv4 address' }]);
    expect(cmdb.create).not.toHaveBeenCalled();
  });

  it('creates a normalized tenant-scoped network device', async () => {
    prisma.query.mockResolvedValue([]);
    cmdb.create.mockResolvedValue({ id: 'asset-1', name: 'Edge Router' });
    prisma.auditLog.create.mockResolvedValue({});
    const result = await service.importDevices([{ name: 'Edge Router', ipAddress: '10.0.0.1' }], 'company-1', 'user-1');
    expect(result.created).toHaveLength(1);
    expect(cmdb.create).toHaveBeenCalledWith(expect.objectContaining({ assetType: 'NETWORK_DEVICE', deviceCategory: 'NETWORK_DEVICE' }), 'company-1');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId: 'company-1', resourceId: 'asset-1' }) });
  });

  it('requires a safely bounded discovery subnet', async () => {
    await expect(service.updateDiscoverySchedule('company-1', { subnet: '10.0.0.0/16', enabled: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.execute).not.toHaveBeenCalled();
  });
});
