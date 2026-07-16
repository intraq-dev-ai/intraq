export type DashboardDataCachePolicy = 'live' | '15m' | '1h' | '1d';

export interface DashboardDataCacheOption {
  label: string;
  value: DashboardDataCachePolicy;
}

export const defaultDashboardDataCachePolicy: DashboardDataCachePolicy = 'live';

export const dashboardDataCacheOptions: DashboardDataCacheOption[] = [
  { value: 'live', label: 'Live (no cache)' },
  { value: '15m', label: 'Cache for 15 minutes' },
  { value: '1h', label: 'Cache for 1 hour' },
  { value: '1d', label: 'Cache for 1 day' }
];

const CACHE_POLICY_TTL_MS: Record<DashboardDataCachePolicy, number> = {
  live: 0,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000
};

export function normalizeDashboardDataCachePolicy(value: unknown): DashboardDataCachePolicy {
  return value === '15m' || value === '1h' || value === '1d' || value === 'live'
    ? value
    : defaultDashboardDataCachePolicy;
}

export function dashboardDataCacheTtlMs(policy: DashboardDataCachePolicy): number {
  return CACHE_POLICY_TTL_MS[policy];
}

export function dashboardDataCachePolicyFromSettings(
  settings: { dataCachePolicy?: unknown } | undefined
): DashboardDataCachePolicy {
  return normalizeDashboardDataCachePolicy(settings?.dataCachePolicy);
}
