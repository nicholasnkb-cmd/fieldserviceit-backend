import { isFeatureEnabled, parseFeatureMap, resolveFeatureMap } from './feature-entitlements';

describe('feature entitlements', () => {
  it('requires the feature to be included in the plan', () => {
    expect(isFeatureEnabled('reporting', '{}', '{}', '{"reporting":true}')).toBe(false);
  });

  it('allows either override layer to disable a plan feature', () => {
    expect(isFeatureEnabled('reporting', { reporting: true }, { reporting: false }, {})).toBe(false);
    expect(isFeatureEnabled('reporting', { reporting: true }, {}, { reporting: false })).toBe(false);
  });

  it('keeps billing available for account recovery', () => {
    expect(isFeatureEnabled('billing', {}, { billing: false }, { billing: false })).toBe(true);
  });

  it('returns explicit false values for known but unavailable features', () => {
    expect(resolveFeatureMap({ tickets: true }, {}, {}, ['tickets', 'assets'])).toEqual({
      tickets: true,
      assets: false,
    });
  });

  it('rejects malformed and non-boolean feature values', () => {
    expect(parseFeatureMap('{bad json')).toEqual({});
    expect(parseFeatureMap({ tickets: 'yes', assets: true })).toEqual({ assets: true });
  });
});
