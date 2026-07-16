import type { RouteLocationNormalizedLoadedGeneric } from 'vue-router';
import {
  fetchBuilderDataSources,
  fetchDashboard,
  fetchDashboardMenu,
  fetchDashboards
} from '../api';
import { mergeDashboard, readError, readQueryString } from '../workspace-utils';
import { applyStoredDashboardLayoutDrafts } from './dashboard-layout-drafts';
import { normalizeDashboardDraft } from './dashboard-local-draft';
import { ensureDashboardFilterElements } from './dashboard-workspace-filters';
import {
  hydrateDashboardRuntimeState,
  mergeRouteDashboardMenuMetadata,
  syncDebugEditorSelection,
  syncDebugModeFromRoute,
  syncSelectedDashboardRuntimeState,
  syncSelectedDataContext
} from './dashboard-workspace-state-helpers';
import type { DashboardWorkspaceState } from './use-dashboard-workspace-state';

interface DashboardWorkspaceLoadStatus {
  newlyCreatedDashboardId: string;
  newlyImportedDashboardId: string;
}

interface DashboardWorkspaceLoaderContext {
  getActionRevision: () => number;
  isCurrentWorkspaceLoad: (actionRevisionAtStart: number) => boolean;
  loadStatus: DashboardWorkspaceLoadStatus;
  refreshSecondaryWorkspaceData: (actionRevisionAtStart: number) => Promise<void>;
  route: RouteLocationNormalizedLoadedGeneric;
  state: DashboardWorkspaceState;
}

export function useDashboardWorkspaceLoader({
  getActionRevision,
  isCurrentWorkspaceLoad,
  loadStatus,
  refreshSecondaryWorkspaceData,
  route,
  state
}: DashboardWorkspaceLoaderContext) {
  async function loadWorkspace(): Promise<void> {
    const actionRevisionAtStart = getActionRevision();
    state.error.value = '';
    state.isWorkspaceLoading.value = true;
    state.lastAiUndo.value = null;
    state.status.value = 'Loading dashboards';
    syncDebugModeFromRoute(route, state);
    try {
      const routeDashboardRequest = state.routeDashboardId.value
        ? fetchDashboard(state.routeDashboardId.value, route.path.endsWith('/edit') ? 'edit' : 'view')
        : Promise.resolve(null);
      const shouldLoadBuilderCatalog = route.path.endsWith('/edit') || route.path.endsWith('/create');
      const shouldLoadDataSources = shouldLoadBuilderCatalog || Boolean(state.routeDashboardId.value);
      const [dashboardList, dataSourceList, routeDashboard] = await Promise.all([
        shouldLoadBuilderCatalog ? fetchDashboards() : fetchDashboardMenu(),
        shouldLoadDataSources ? fetchBuilderDataSources() : Promise.resolve([]),
        routeDashboardRequest
      ]);
      const hydratedList = dashboardList.map(normalizeDashboardDraft).map(hydrateDashboardRuntimeState).map(applyStoredDashboardLayoutDrafts);
      const routeDashboardWithFilterElements = routeDashboard
        ? ensureDashboardFilterElements(normalizeDashboardDraft(mergeRouteDashboardMenuMetadata(routeDashboard, dashboardList)))
        : null;
      const hydratedRouteDashboard = routeDashboardWithFilterElements
        ? applyStoredDashboardLayoutDrafts(hydrateDashboardRuntimeState(routeDashboardWithFilterElements))
        : null;
      state.dataSources.value = dataSourceList;
      if (shouldLoadBuilderCatalog) {
        syncSelectedDataContext(state);
      } else {
        state.selectedDataSourceId.value = '';
        state.selectedTableId.value = '';
        state.selectedTableUserSelected.value = false;
      }
      if (!isCurrentWorkspaceLoad(actionRevisionAtStart)) return;
      state.dashboards.value = hydratedRouteDashboard ? mergeDashboard(hydratedList, hydratedRouteDashboard) : hydratedList;
      state.suggestions.value = [];
      state.selectedDashboardId.value = hydratedRouteDashboard?.id ?? '';
      syncSelectedDashboardRuntimeState(state);
      state.selectedElementId.value = '';
      state.editorFocusElementId.value = '';
      syncDebugEditorSelection(state);
      if (route.path.endsWith('/create')) {
        state.dashboardName.value = readQueryString(route.query, 'name') || state.dashboardName.value;
      }
      state.hasUnsavedChanges.value = false;
      const routePrompt = readQueryString(route.query, 'prompt');
      if (routePrompt) state.prompt.value = routePrompt;
      const shouldShowCreatedStatus = routeDashboard?.id && routeDashboard.id === loadStatus.newlyCreatedDashboardId;
      const shouldShowImportedStatus = routeDashboard?.id && routeDashboard.id === loadStatus.newlyImportedDashboardId;
      if (shouldShowCreatedStatus) loadStatus.newlyCreatedDashboardId = '';
      if (shouldShowImportedStatus) loadStatus.newlyImportedDashboardId = '';
      if (!isCurrentWorkspaceLoad(actionRevisionAtStart)) return;
      if (shouldShowCreatedStatus) {
        state.status.value = 'Dashboard created';
      } else if (shouldShowImportedStatus) {
        state.status.value = 'Dashboard imported';
      } else {
        state.status.value = `${dashboardList.length} dashboard${dashboardList.length === 1 ? '' : 's'} loaded`;
      }
      state.isWorkspaceLoading.value = false;
      if (shouldLoadBuilderCatalog) {
        void refreshSecondaryWorkspaceData(actionRevisionAtStart);
      }
    } catch (caught) {
      state.error.value = readError(caught, 'Dashboard workspace could not be loaded.');
      state.status.value = 'Dashboard workspace failed';
    } finally {
      if (actionRevisionAtStart === getActionRevision()) {
        state.isWorkspaceLoading.value = false;
      }
    }
  }

  return {
    loadWorkspace
  };
}
