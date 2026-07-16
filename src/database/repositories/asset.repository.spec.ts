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
});
