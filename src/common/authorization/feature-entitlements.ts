export type FeatureMap = Record<string, boolean>;

export const ALWAYS_AVAILABLE_FEATURES = new Set(['billing']);

export function parseFeatureMap(value: unknown): FeatureMap {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, enabled]) => typeof enabled === 'boolean'),
    ) as FeatureMap;
  } catch {
    return {};
  }
}

export function resolveFeatureMap(
  planFeatures: unknown,
  companyOverrides: unknown,
  userOverrides: unknown,
  knownFeatures: readonly string[] = [],
): FeatureMap {
  const plan = parseFeatureMap(planFeatures);
  const company = parseFeatureMap(companyOverrides);
  const user = parseFeatureMap(userOverrides);
  const keys = new Set([...knownFeatures, ...Object.keys(plan), ...Object.keys(company), ...Object.keys(user)]);
  const resolved: FeatureMap = {};

  for (const feature of keys) {
    if (ALWAYS_AVAILABLE_FEATURES.has(feature)) {
      resolved[feature] = true;
      continue;
    }

    const includedInPlan = plan[feature] === true;
    resolved[feature] = includedInPlan && company[feature] !== false && user[feature] !== false;
  }

  return resolved;
}

export function isFeatureEnabled(
  feature: string,
  planFeatures: unknown,
  companyOverrides: unknown,
  userOverrides: unknown,
): boolean {
  return resolveFeatureMap(planFeatures, companyOverrides, userOverrides, [feature])[feature] === true;
}
