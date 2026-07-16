import type { Dashboard } from '../types';

type LayoutPatch = Record<string, number>;

const STORAGE_PREFIX = 'intraq-dashboard-layout-draft';

export function applyStoredDashboardLayoutDrafts(dashboard: Dashboard): Dashboard {
  // Unsaved dashboard layout edits should not survive reload. The Save button is
  // the only persistence path, so stale local draft storage is cleared and
  // ignored whenever a dashboard is reloaded.
  clearDashboardLayoutDrafts(dashboard.id);
  return dashboard;
}

export function clearDashboardLayoutDrafts(dashboardId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(storageKey(dashboardId));
}

export function readDashboardLayoutDrafts(_dashboardId: string): Record<string, LayoutPatch> {
  return {};
}

export function saveDashboardLayoutDraft(_dashboardId: string, _elementId: string, _layout: LayoutPatch): void {
  // Intentionally disabled. Layout edits remain in the in-memory draft until
  // the user saves the dashboard.
}

function storageKey(dashboardId: string): string {
  return `${STORAGE_PREFIX}:${dashboardId}`;
}
