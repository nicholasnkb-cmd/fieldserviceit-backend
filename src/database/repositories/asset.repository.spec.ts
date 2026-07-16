import { NotFoundException } from '@nestjs/common';
import { AssetRepository } from './asset.repository';

describe('AssetRepository', () => {
  it('always scopes asset lookup by company', async () => {
    const prisma = { asset: { findFirst: jest.fn().mockResolvedValue({ id: 'asset-1' }) } };
    const repository = new AssetRepository(prisma as any);

    await repository.findTenantAsset('asset-1', 'company-1');

    expect(prisma.asset.findFirst).toHaveBeenCalledWith({
      where: { id: 'asset-1', companyId: 'company-1', deletedAt: null },
      include: undefined,
    });
  });

  it('rejects assets outside the tenant scope', async () => {
    const prisma = { asset: { findFirst: jest.fn().mockResolvedValue(null) } };
    const repository = new AssetRepository(prisma as any);

    await expect(repository.findTenantAsset('asset-1', 'company-2')).rejects.toThrow(NotFoundException);
  });

  it('lists only retired assets in the requested tenant and category', async () => {
    const prisma = { query: jest.fn().mockResolvedValue([{ id: 'asset-1' }]) };
    const repository = new AssetRepository(prisma as any);

    await repository.listRetiredTenantAssets('company-1', 'NETWORK_DEVICE');

    expect(prisma.query).toHaveBeenCalledWith(
      expect.stringContaining('companyId = ? AND deletedAt IS NOT NULL AND deviceCategory = ?'),
      ['company-1', 'NETWORK_DEVICE'],
    );
  });

  it('restores a retired asset only after verifying the tenant scope', async () => {
    const prisma = {
      query: jest.fn().mockResolvedValue([{ id: 'asset-1' }]),
      asset: {
        update: jest.fn().mockResolvedValue({ id: 'asset-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'asset-1', deletedAt: null }),
      },
    };
    const repository = new AssetRepository(prisma as any);

    await repository.restoreTenantAsset('asset-1', 'company-1');

    expect(prisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1', companyId: 'company-1' },
      data: { deletedAt: null },
    });
    expect(prisma.asset.findFirst).toHaveBeenCalledWith({
      where: { id: 'asset-1', companyId: 'company-1', deletedAt: null },
      include: undefined,
    });
  });

  it('rejects restore attempts for active or cross-tenant assets', async () => {
    const prisma = { query: jest.fn().mockResolvedValue([]) };
    const repository = new AssetRepository(prisma as any);

    await expect(repository.restoreTenantAsset('asset-1', 'company-2')).rejects.toThrow('Retired asset not found');
  });
});
