import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssetQueryDto } from './asset-query.dto';

describe('AssetQueryDto', () => {
  it('accepts the filters supported by the asset service', async () => {
    const query = plainToInstance(AssetQueryDto, {
      page: '1',
      limit: '100',
      assetType: 'NETWORK_DEVICE',
      deviceCategory: 'NETWORK_DEVICE',
      enrollmentStatus: 'UNMANAGED',
      complianceStatus: 'UNKNOWN',
      ownership: 'COMPANY',
    });

    await expect(validate(query, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
    expect(query.limit).toBe(100);
  });
});
