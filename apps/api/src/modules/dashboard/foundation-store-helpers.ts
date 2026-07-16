import { isViewerRole } from './dashboard-access.js';
import { isRecord } from './foundation-store-utils.js';
import type {
  Dashboard,
  DashboardAccessScope
} from './foundation-store-types.js';

export function dashboardMenuVisible(dashboard: Pick<Dashboard, 'settings'>): boolean {
  const settings = isRecord(dashboard.settings) ? dashboard.settings : {};
  const dashboardSettings = isRecord(settings.dashboard) ? settings.dashboard : {};
  const menuSettings = isRecord(settings.menu) ? settings.menu : {};
  const navigationSettings = isRecord(settings.navigation) ? settings.navigation : {};
  return settings.menuVisible !== false
    && dashboardSettings.visible !== false
    && menuSettings.visible !== false
    && navigationSettings.visible !== false;
}

export function mergeDashboardSettings(
  existingSettings: Record<string, unknown>,
  nextSettings: Record<string, unknown>
): Record<string, unknown> {
  return localDashboardSettings({
    ...existingSettings,
    ...nextSettings
  });
}

function localDashboardSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      ...recordSetting(settings, 'dashboard'),
      ...recordSetting(settings, 'menu'),
      ...recordSetting(settings, 'navigation'),
      ...stringSetting(settings, 'currencySymbol'),
      ...cachePolicySetting(settings.dataCachePolicy),
      ...booleanSetting(settings, 'closeDropdownOnSelect'),
      ...booleanSetting(settings, 'hideMultiSelectSummary'),
      ...booleanSetting(settings, 'isFavorite'),
      ...booleanSetting(settings, 'menuVisible')
    }).filter(([, value]) => value !== undefined && value !== null)
  );
}

function recordSetting(settings: Record<string, unknown>, key: string): Record<string, unknown> {
  return isRecord(settings[key]) ? { [key]: settings[key] } : {};
}

function stringSetting(settings: Record<string, unknown>, key: string): Record<string, string> {
  return typeof settings[key] === 'string' ? { [key]: settings[key] } : {};
}

function booleanSetting(settings: Record<string, unknown>, key: string): Record<string, boolean> {
  return typeof settings[key] === 'boolean' ? { [key]: settings[key] } : {};
}

function cachePolicySetting(value: unknown): Record<string, string> {
  return value === 'live' || value === '15m' || value === '1h' || value === '1d'
    ? { dataCachePolicy: value }
    : {};
}

export function assignBooleanMetadata(dashboard: Dashboard, input: Record<string, unknown>): void {
  if (typeof input.isGlobal === 'boolean') dashboard.isGlobal = input.isGlobal;
  if (typeof input.isGloballyVisible === 'boolean') dashboard.isGloballyVisible = input.isGloballyVisible;
  if (typeof input.isPublic === 'boolean') dashboard.isPublic = input.isPublic;
  if (typeof input.isSample === 'boolean') dashboard.isSample = input.isSample;
}

export function dashboardWithLiveSettings(snapshot: Dashboard, dashboard: Dashboard): Dashboard {
  return {
    ...snapshot,
    settings: localDashboardSettings({
      ...(snapshot.settings ?? {}),
      ...(dashboard.settings ?? {})
    })
  };
}

export function canReadDashboardByScope(
  dashboard: Dashboard | undefined,
  scope?: DashboardAccessScope,
  hasPublishedSnapshot = false
): dashboard is Dashboard {
  if (!dashboard) return false;
  return !scope || !isViewerRole(scope.role) || dashboard.status === 'published' || hasPublishedSnapshot;
}
