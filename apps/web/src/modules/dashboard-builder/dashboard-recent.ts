const RECENT_DASHBOARD_STORAGE_KEY = 'intraq-dashboard-recent-id';
const RECENT_DASHBOARD_LIST_STORAGE_KEY = 'intraq-dashboard-recent-ids';
const MAX_RECENT_DASHBOARDS = 6;

export function readRecentDashboardId(storage: Storage | undefined = browserStorage()): string {
  return readRecentDashboardIds(storage)[0] ?? '';
}

export function readRecentDashboardIds(storage: Storage | undefined = browserStorage()): string[] {
  if (!storage) return [];
  const values = parseStoredIds(storage.getItem(RECENT_DASHBOARD_LIST_STORAGE_KEY));
  const legacyId = storage.getItem(RECENT_DASHBOARD_STORAGE_KEY)?.trim();
  return uniqueDashboardIds([...(legacyId ? [legacyId] : []), ...values]).slice(0, MAX_RECENT_DASHBOARDS);
}

export function writeRecentDashboardId(dashboardId: string, storage: Storage | undefined = browserStorage()): string[] {
  const id = dashboardId.trim();
  if (!id || !storage) return readRecentDashboardIds(storage);
  const ids = uniqueDashboardIds([id, ...readRecentDashboardIds(storage)]).slice(0, MAX_RECENT_DASHBOARDS);
  storage.setItem(RECENT_DASHBOARD_STORAGE_KEY, id);
  storage.setItem(RECENT_DASHBOARD_LIST_STORAGE_KEY, JSON.stringify(ids));
  return ids;
}

function parseStoredIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function uniqueDashboardIds(values: string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function browserStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}
