import type { DashboardRunConfiguration } from '../types';

export const DEFAULT_VIEW_MODE_ROW_LIMIT = 10_000;

export function resolveDashboardRunRowLimit(
  configuration: DashboardRunConfiguration,
  canEditDashboard: boolean
): number | undefined {
  if (canEditDashboard) return configuration.editModeRowLimit;
  return configuration.viewModeRowLimit ?? DEFAULT_VIEW_MODE_ROW_LIMIT;
}
