import { buildAssetScope, buildCompanyScope, buildTicketScope, mergeScopes } from './query-builders';

describe('tenant query builders', () => {
  it('always includes the requested company', () => {
    expect(buildCompanyScope('company-1', { status: 'ACTIVE' })).toEqual({
      AND: [{ companyId: 'company-1' }, { status: 'ACTIVE' }],
    });
    expect(buildAssetScope('company-1', { status: 'active' }).AND[0]).toEqual({ companyId: 'company-1' });
    expect(buildTicketScope('company-1', { priority: 'HIGH' }).AND[0]).toEqual({ companyId: 'company-1' });
  });

  it('preserves tenant conditions when scopes are merged', () => {
    expect(mergeScopes([buildCompanyScope('company-1'), { deletedAt: null }])).toEqual({
      AND: [{ companyId: 'company-1' }, { deletedAt: null }],
    });
  });
});
