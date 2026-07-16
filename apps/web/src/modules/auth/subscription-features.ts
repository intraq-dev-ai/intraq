const featureAliases: Record<string, string> = {
  ADMIN_PANEL: 'adminPanel',
  ADMIN_SYSTEM_SETTINGS: 'admin_system_settings',
  ADMIN_TENANT_MANAGEMENT: 'admin_tenant_management',
  ADMIN_USER_MANAGEMENT: 'admin_user_management',
  DASHBOARD_BUILDER: 'dashboard_builder',
  DASHBOARD_VIEW: 'dashboard_view',
  DATA_ENGINEERING: 'dataEngineering',
  DATA_SOURCES: 'dataSources'
};

export function normalizeSubscriptionFeatureName(value: string): string {
  const trimmed = value.trim();
  return featureAliases[trimmed] ?? trimmed;
}

export function normalizeSubscriptionFeatures(values: Iterable<string>): string[] {
  const features = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    features.add(trimmed);
    features.add(normalizeSubscriptionFeatureName(trimmed));
  }
  return [...features];
}

export function readSubscriptionFeatureSet(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(normalizeSubscriptionFeatures(parsed.filter(isString)));
    if (isRecord(parsed)) {
      return new Set(normalizeSubscriptionFeatures(
        Object.entries(parsed)
          .filter(([, enabled]) => enabled === true)
          .map(([key]) => key)
      ));
    }
  } catch {
    return new Set(normalizeSubscriptionFeatures(raw.split(',').map(item => item.trim()).filter(Boolean)));
  }
  return new Set();
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
