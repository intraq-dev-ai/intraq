import type { RouteLocationNormalizedLoadedGeneric } from 'vue-router';
import {
  chooseDefaultDataSource,
  chooseDefaultTable
} from '../agent-context/element-planner';
import {
  applyDashboardRuntimeState,
  readDashboardRuntimeState
} from '../runtime/dashboard-runtime-state';
import { dashboardWithFavorite } from '../dashboard-sidebar-model';
import type {
  Dashboard,
  DashboardRuntimeState
} from '../types';
import { readQueryString } from '../workspace-utils';
import type { DashboardWorkspaceState } from './use-dashboard-workspace-state';

export function updateSelectedDashboardState(
  state: DashboardWorkspaceState,
  next: Dashboard,
  runtimeStateOverride?: DashboardRuntimeState | null
): void {
  const runtimeState = runtimeStateOverride ?? (
    next.id === state.selectedDashboardId.value
      ? state.dashboardRuntimeState.value
      : readDashboardRuntimeState(next.id)
  );
  const hydrated = applyDashboardRuntimeState(next, runtimeState);
  state.dashboards.value = state.dashboards.value.map(dashboard => dashboard.id === next.id ? hydrated : dashboard);
  if (next.id === state.selectedDashboardId.value) state.dashboardRuntimeState.value = runtimeState;
}

export function patchDashboardFavorite(
  dashboardList: Dashboard[],
  dashboardId: string,
  isFavorite: boolean
): Dashboard[] {
  return dashboardList.map(dashboard => dashboard.id === dashboardId
    ? dashboardWithFavorite(dashboard, isFavorite)
    : dashboard
  );
}

export function mergeRouteDashboardMenuMetadata(dashboard: Dashboard, dashboardList: Dashboard[]): Dashboard {
  const menuDashboard = dashboardList.find(item => item.id === dashboard.id);
  if (!menuDashboard) return dashboard;
  return {
    ...dashboard,
    ...(menuDashboard.isSample !== undefined ? { isSample: menuDashboard.isSample } : {}),
    ...(menuDashboard.isGlobal !== undefined ? { isGlobal: menuDashboard.isGlobal } : {}),
    ...(menuDashboard.isGloballyVisible !== undefined ? { isGloballyVisible: menuDashboard.isGloballyVisible } : {}),
    ...(menuDashboard.settings ? {
      settings: {
        ...(dashboard.settings ?? {}),
        ...menuDashboard.settings
      }
    } : {})
  };
}

export function syncSelectedDataContext(state: DashboardWorkspaceState): void {
  const source = chooseDefaultDataSource(state.dataSources.value, state.selectedDataSourceId.value);
  const previousTableId = state.selectedTableId.value;
  state.selectedDataSourceId.value = source?.id ?? '';
  state.selectedTableId.value = chooseDefaultTable(source, state.selectedTableId.value)?.id ?? '';
  if (!previousTableId || previousTableId !== state.selectedTableId.value) {
    state.selectedTableUserSelected.value = false;
  }
}

export function syncDebugModeFromRoute(
  route: RouteLocationNormalizedLoadedGeneric,
  state: DashboardWorkspaceState
): void {
  const routeDebug = readQueryString(route.query, 'debug');
  if (routeDebug === 'true') state.debugMode.value = true;
  if (routeDebug === 'false') state.debugMode.value = false;
}

export function syncDebugEditorSelection(state: DashboardWorkspaceState): void {
  if (!state.debugMode.value || state.selectedElementId.value) return;
  state.selectedElementId.value = state.selectedDashboard.value?.elements.at(-1)?.id ?? '';
}

export function hydrateDashboardRuntimeState(dashboard: Dashboard): Dashboard {
  return applyDashboardRuntimeState(dashboard, readDashboardRuntimeState(dashboard.id));
}

export function syncSelectedDashboardRuntimeState(state: DashboardWorkspaceState): void {
  state.dashboardRuntimeState.value = state.selectedDashboard.value
    ? readDashboardRuntimeState(state.selectedDashboard.value.id)
    : null;
}
