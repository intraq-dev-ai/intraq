const BUILDER_RAIL_COLLAPSED_KEY = 'intraq:dashboard-builder-rail-collapsed';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readBuilderRailCollapsed(storage: StorageLike | null | undefined = browserStorage()): boolean {
  return storage?.getItem(BUILDER_RAIL_COLLAPSED_KEY) === 'true';
}

export function writeBuilderRailCollapsed(
  collapsed: boolean,
  storage: StorageLike | null | undefined = browserStorage()
): void {
  try {
    storage?.setItem(BUILDER_RAIL_COLLAPSED_KEY, collapsed ? 'true' : 'false');
  } catch {
    // Local preference persistence is optional. The builder still works without storage.
  }
}

function browserStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}
