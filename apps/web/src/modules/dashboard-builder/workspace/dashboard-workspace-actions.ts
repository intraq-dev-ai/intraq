import type { Router } from 'vue-router';
import {
  createDashboard,
  deleteDashboard,
  duplicateDashboard,
  publishDashboard,
  restoreDashboardVersion,
  updateDashboard
} from '../api';
import {
  createImportedDashboard,
  createSelfImportedDashboard,
  parseDashboardImportPayload,
  type DashboardImportRequest
} from '../dashboard-import-api';
import { removeDashboardRuntimeState } from '../runtime/dashboard-runtime-state';
import type {
  Dashboard,
  DashboardRuntimeState,
  DashboardSettings
} from '../types';
import { readError } from '../workspace-utils';
import type {
  ActionRunner,
  MarkDashboardDirty
} from './dashboard-element-action-context';
import { clearDashboardLayoutDrafts } from './dashboard-layout-drafts';
import {
  dashboardDraftUpdateBody,
  normalizeDashboardDraft
} from './dashboard-local-draft';
import {
  patchDashboardFavorite,
  syncSelectedDashboardRuntimeState
} from './dashboard-workspace-state-helpers';
import type { DashboardWorkspaceState } from './use-dashboard-workspace-state';

interface DashboardWorkspaceLoadStatus {
  newlyCreatedDashboardId: string;
  newlyImportedDashboardId: string;
}

interface DashboardWorkspaceActionsContext {
  flushLayoutDrafts: (dashboard: Dashboard) => Promise<Dashboard>;
  hydrateDashboardRuntimeState: (dashboard: Dashboard) => Dashboard;
  isActionRevisionCurrent: (actionRevisionAtStart: number) => boolean;
  loadStatus: DashboardWorkspaceLoadStatus;
  markDashboardDirty: MarkDashboardDirty;
  nextActionRevision: () => number;
  refreshVersions: () => Promise<void>;
  router: Router;
  runAction: ActionRunner;
  setPendingAutoSubmitPrompt: (prompt: string) => void;
  state: DashboardWorkspaceState;
  updateSelectedDashboard: (next: Dashboard, runtimeStateOverride?: DashboardRuntimeState | null) => void;
}

export function useDashboardWorkspaceActions({
  flushLayoutDrafts,
  hydrateDashboardRuntimeState,
  isActionRevisionCurrent,
  loadStatus,
  markDashboardDirty,
  nextActionRevision,
  refreshVersions,
  router,
  runAction,
  setPendingAutoSubmitPrompt,
  state,
  updateSelectedDashboard
}: DashboardWorkspaceActionsContext) {
  const favoriteUpdateIds = new Set<string>();

  async function addDashboard(name?: string, initialPrompt?: string): Promise<void> {
    const nextPrompt = initialPrompt?.trim() ?? '';
    await runAction('Dashboard created', async () => {
      const nextName = name?.trim() || state.dashboardName.value.trim() || 'New Dashboard';
      state.dashboardName.value = nextName;
      const dashboard = await createDashboard(nextName);
      state.dashboards.value = [dashboard, ...state.dashboards.value];
      state.selectedDashboardId.value = dashboard.id;
      loadStatus.newlyCreatedDashboardId = dashboard.id;
      await refreshVersions();
      await router.replace(`/dashboard/${encodeURIComponent(dashboard.id)}/edit`);
    });
    if (nextPrompt) {
      state.prompt.value = nextPrompt;
      setPendingAutoSubmitPrompt(nextPrompt);
    }
  }

  async function saveDraft(): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    await runAction('Dashboard draft saved', async () => {
      await commitDashboardDraft(dashboard);
      await refreshVersions();
    });
  }

  async function discardSelectedDashboardDraft(): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (dashboard?.id) clearDashboardLayoutDrafts(dashboard.id);
    state.selectedElementId.value = '';
    state.editorFocusElementId.value = '';
    state.hasUnsavedChanges.value = false;
    state.error.value = '';
    state.status.value = 'Dashboard changes discarded';
    state.isWorkspaceLoading.value = true;
    await router.push(dashboard ? `/dashboard/${encodeURIComponent(dashboard.id)}` : '/dashboard');
  }

  async function publishSelectedDashboard(): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    await runAction('Dashboard published', async () => {
      const savedDashboard = state.hasUnsavedChanges.value ? await commitDashboardDraft(dashboard) : dashboard;
      updateSelectedDashboard(normalizeDashboardDraft(await publishDashboard(savedDashboard.id)));
      state.lastAiUndo.value = null;
      state.hasUnsavedChanges.value = false;
      await refreshVersions();
    });
  }

  async function duplicateSelectedDashboard(): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    await runAction('Dashboard duplicated', async () => {
      const duplicate = await duplicateDashboard(dashboard.id, `${dashboard.name} Copy`);
      state.dashboards.value = [duplicate, ...state.dashboards.value];
      state.selectedDashboardId.value = duplicate.id;
      await refreshVersions();
    });
  }

  async function renameSelectedDashboard(name: string, category: string, categoryId?: string | null): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    const nextCategory = categoryId === null ? '' : (category.trim() || dashboard.category);
    const nextDashboard: Dashboard = {
      ...dashboard,
      name: name.trim() || dashboard.name,
      category: nextCategory
    };
    if (categoryId !== undefined) nextDashboard.categoryId = categoryId;
    updateSelectedDashboard(nextDashboard);
    markDashboardDirty('Dashboard details changed locally');
  }

  async function updateDashboardSettings(settings: DashboardSettings): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    const mergedSettings = Object.fromEntries(
      Object.entries({
        ...(dashboard.settings ?? {}),
        ...settings
      }).filter(([, value]) => value !== undefined)
    ) as DashboardSettings;
    const nextDashboard: Dashboard = { ...dashboard };
    if (Object.keys(mergedSettings).length > 0) {
      nextDashboard.settings = mergedSettings;
    } else {
      delete nextDashboard.settings;
    }
    updateSelectedDashboard(nextDashboard);
    markDashboardDirty('Dashboard settings changed locally');
  }

  async function setDashboardFavorite(dashboardId: string, isFavorite: boolean): Promise<void> {
    if (!dashboardId || favoriteUpdateIds.has(dashboardId)) return;
    favoriteUpdateIds.add(dashboardId);
    const actionRevisionAtStart = nextActionRevision();
    const previousDashboards = state.dashboards.value;
    state.error.value = '';
    state.dashboards.value = patchDashboardFavorite(state.dashboards.value, dashboardId, isFavorite);
    try {
      await updateDashboard(dashboardId, { settings: { isFavorite } });
    } catch (caught) {
      if (!isActionRevisionCurrent(actionRevisionAtStart)) return;
      state.dashboards.value = previousDashboards;
      state.error.value = readError(caught, 'Dashboard favorite could not be saved.');
      state.status.value = 'Dashboard favorite failed';
    } finally {
      favoriteUpdateIds.delete(dashboardId);
    }
  }

  async function deleteSelectedDashboard(): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    await runAction('Dashboard deleted', async () => {
      await deleteDashboard(dashboard.id);
      removeDashboardRuntimeState(dashboard.id);
      state.dashboards.value = state.dashboards.value.filter(item => item.id !== dashboard.id);
      state.selectedDashboardId.value = '';
      syncSelectedDashboardRuntimeState(state);
      state.selectedElementId.value = '';
      state.editorFocusElementId.value = '';
      state.hasUnsavedChanges.value = false;
      await refreshVersions();
      await router.replace('/dashboard');
    });
  }

  async function restoreVersion(id: string): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    await runAction('Dashboard version restored', async () => {
      updateSelectedDashboard(normalizeDashboardDraft(await restoreDashboardVersion(dashboard.id, id)));
      state.lastAiUndo.value = null;
      state.hasUnsavedChanges.value = false;
      await refreshVersions();
    });
  }

  async function importDashboard(request: DashboardImportRequest): Promise<boolean> {
    state.isSaving.value = true;
    state.error.value = '';
    state.status.value = 'Importing dashboard';
    try {
      const parsed = await parseDashboardImportPayload(request);
      const imported = request.type === 'self'
        ? await createSelfImportedDashboard(parsed, request)
        : await createImportedDashboard(parsed, request);
      const dashboard = hydrateDashboardRuntimeState(imported);
      state.dashboards.value = [dashboard, ...state.dashboards.value.filter(item => item.id !== dashboard.id)];
      state.selectedDashboardId.value = dashboard.id;
      loadStatus.newlyImportedDashboardId = dashboard.id;
      state.selectedElementId.value = '';
      state.editorFocusElementId.value = '';
      await refreshVersions();
      await router.replace(`/dashboard/${encodeURIComponent(dashboard.id)}/edit`);
      state.status.value = 'Dashboard imported';
      return true;
    } catch (caught) {
      state.error.value = readError(caught, 'Dashboard import failed.');
      state.status.value = 'Dashboard import failed';
      return false;
    } finally {
      state.isSaving.value = false;
    }
  }

  async function commitDashboardDraft(dashboard: Dashboard): Promise<Dashboard> {
    const dashboardWithDrafts = await flushLayoutDrafts(dashboard);
    const saved = normalizeDashboardDraft(await updateDashboard(dashboard.id, dashboardDraftUpdateBody(dashboardWithDrafts)));
    updateSelectedDashboard(saved);
    state.lastAiUndo.value = null;
    state.hasUnsavedChanges.value = false;
    clearDashboardLayoutDrafts(dashboard.id);
    return saved;
  }

  return {
    addDashboard,
    deleteSelectedDashboard,
    discardSelectedDashboardDraft,
    duplicateSelectedDashboard,
    importDashboard,
    publishSelectedDashboard,
    renameSelectedDashboard,
    restoreVersion,
    saveDraft,
    setDashboardFavorite,
    updateDashboardSettings
  };
}
