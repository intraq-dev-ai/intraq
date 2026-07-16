import { onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  chooseDefaultDataSource,
  chooseDefaultTable,
  chooseTableForPrompt
} from '../agent-context/element-planner';
import type {
  Dashboard,
  DashboardRuntimeState
} from '../types';
import { readError } from '../workspace-utils';
import { dashboardAgentMessagesFromSnapshot } from './dashboard-agent-conversation-state';
import { isDashboardActionHandledError } from './dashboard-action-errors';
import { syncWorkspaceDataSelectionFromElement } from './dashboard-element-selection';
import { useDashboardElementActions } from './use-dashboard-element-actions';
import { useDashboardWorkspaceState } from './use-dashboard-workspace-state';
import { useDashboardWorkspaceActions } from './dashboard-workspace-actions';
import { useDashboardWorkspaceFilters } from './dashboard-workspace-filters';
import { useDashboardWorkspaceLoader } from './dashboard-workspace-loader';
import { useDashboardWorkspaceRefresh } from './dashboard-workspace-refresh';
import {
  hydrateDashboardRuntimeState,
  syncDebugEditorSelection,
  updateSelectedDashboardState
} from './dashboard-workspace-state-helpers';
import { useDashboardWorkspaceUndo } from './dashboard-workspace-undo';

let pendingAutoSubmitPrompt = '';
let pendingAutoSubmitKey = '';

export function useDashboardBuilderWorkspace() {
  const route = useRoute();
  const router = useRouter();
  let actionRevision = 0;
  const loadStatus = {
    newlyCreatedDashboardId: '',
    newlyImportedDashboardId: ''
  };
  const workspaceState = useDashboardWorkspaceState(route);
  const {
    actionPlan,
    agentConversationId,
    agentMessages,
    canEditDashboard,
    canUseDashboard,
    dashboardName,
    dashboardRuntimeState,
    dashboards,
    dataModelRecommendation,
    dataSources,
    debugActiveTab,
    debugMode,
    debugPayload,
    editorFocusElementId,
    error,
    filterCreateRequestKey,
    hasUnsavedChanges,
    isSaving,
    isWorkspaceLoading,
    lastAgentPrompt,
    pageTitle,
    prompt,
    samplePrompts,
    selectedDashboard,
    selectedDataSource,
    selectedDataSourceId,
    selectedElement,
    selectedElementId,
    selectedTable,
    selectedTableId,
    selectedTableUserSelected,
    status,
    suggestions,
    modelContextError,
    modelContextSummary,
    utilityActions,
    versions
  } = workspaceState;
  const { cancelDashboardRun, configureDashboardRun, copyDashboardEmbed, dashboardRunConfiguration, exportDashboard, isDashboardRunning, runDashboard, sendEmailReport } =
    utilityActions;
  const { captureAiUndoState, undoLastAiChange } = useDashboardWorkspaceUndo(workspaceState, updateSelectedDashboard);
  const {
    applyAgentToSelectedElement,
    cloneElement,
    clearElementSelection,
    createElement,
    createManualElement,
    editElement,
    flushLayoutDrafts,
    removeElement,
    saveElement,
    updateElementConfig,
    updateElementLayout
  } = useDashboardElementActions(workspaceState, runAction, updateSelectedDashboard, markDashboardDirty, captureAiUndoState);
  const {
    refreshSecondaryWorkspaceData,
    refreshMetadataSummary,
    refreshVersions
  } = useDashboardWorkspaceRefresh({
    isCurrentWorkspaceLoad,
    state: workspaceState
  });
  const {
    addFilter,
    changeFilter,
    createFilter,
    newFilterDraft,
    removeFilter
  } = useDashboardWorkspaceFilters(workspaceState, updateSelectedDashboard, markDashboardDirty);
  const {
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
  } = useDashboardWorkspaceActions({
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
    state: workspaceState,
    updateSelectedDashboard
  });
  const { loadWorkspace } = useDashboardWorkspaceLoader({
    getActionRevision,
    isCurrentWorkspaceLoad,
    loadStatus,
    refreshSecondaryWorkspaceData,
    route,
    state: workspaceState
  });

  onMounted(() => {
    void loadWorkspace();
  });
  watch(() => route.fullPath, () => {
    void loadWorkspace();
  });
  watch(
    [prompt, selectedDataSource, selectedElement],
    ([nextPrompt, source, element]) => {
      if (element || selectedTableUserSelected.value) return;
      const nextTable = chooseTableForPrompt(source, nextPrompt, selectedTableId.value, { allowSelectedFallback: false })
        ?? chooseDefaultTable(source, selectedTableId.value);
      if (nextTable && nextTable.id !== selectedTableId.value) selectedTableId.value = nextTable.id;
    },
    { flush: 'post' }
  );
  watch(selectedElement, element => {
    syncWorkspaceDataSelectionFromElement(workspaceState, element);
  }, { flush: 'post' });

  watch(
    () => [isWorkspaceLoading.value, isSaving.value, selectedDataSourceId.value],
    () => { void submitPendingPromptIfReady(); }
  );

  return {
    actionPlan,
    agentConversationId,
    agentMessages,
    addDashboard,
    addFilter,
    applyAgentToSelectedElement,
    canEditDashboard,
    canUseDashboard,
    cancelDashboardRun,
    changeFilter,
    cloneElement,
    clearElementSelection,
    configureDashboardRun,
    copyDashboardEmbed,
    createFilter,
    createElement,
    createManualElement,
    dashboardName,
    dashboardRuntimeState,
    dashboards,
    dataModelRecommendation,
    dataSources,
    dashboardRunConfiguration,
    debugActiveTab,
    debugMode,
    debugPayload,
    deleteSelectedDashboard,
    duplicateSelectedDashboard,
    editElement,
    error,
    editorFocusElementId,
    exportDashboard,
    filterCreateRequestKey,
    hasUnsavedChanges,
    importDashboard,
    isDashboardRunning,
    isSaving,
    isWorkspaceLoading,
    lastAgentPrompt,
    newFilterDraft,
    pageTitle,
    prompt,
    publishSelectedDashboard,
    removeElement,
    removeFilter,
    renameSelectedDashboard,
    restoreVersion,
    runDashboard,
    samplePrompts,
    saveDraft,
    discardSelectedDashboardDraft,
    saveElement,
    selectedDashboard,
    selectedDataSource,
    selectedElement,
    selectedTable,
    selectDataSource,
    selectDataTable,
    sendEmailReport,
    setDashboardFavorite,
    status,
    suggestions,
    modelContextError,
    modelContextSummary,
    toggleDebugMode,
    undoLastAiChange,
    updateElementConfig,
    updateElementLayout,
    updateDashboardSettings,
    versions
  };

  async function submitPendingPromptIfReady(): Promise<void> {
    if (!pendingAutoSubmitPrompt || isWorkspaceLoading.value || isSaving.value) return;
    if (!selectedDataSourceId.value) return;
    const key = `${pendingAutoSubmitPrompt}::${selectedDataSourceId.value}`;
    if (pendingAutoSubmitKey === key) return;
    pendingAutoSubmitKey = key;
    prompt.value = pendingAutoSubmitPrompt;
    pendingAutoSubmitPrompt = '';
    await createElement();
  }

  function selectDataSource(id: string): void {
    selectedDataSourceId.value = id;
    const source = chooseDefaultDataSource(dataSources.value, id);
    selectedTableId.value = chooseDefaultTable(source)?.id ?? '';
    selectedTableUserSelected.value = false;
    dataModelRecommendation.value = null;
    agentConversationId.value = '';
    agentMessages.value = dashboardAgentMessagesFromSnapshot(null);
    void refreshMetadataSummary();
  }

  function selectDataTable(id: string): void {
    selectedTableId.value = id;
    selectedTableUserSelected.value = Boolean(id);
    dataModelRecommendation.value = null;
  }

  function toggleDebugMode(): void {
    debugMode.value = !debugMode.value;
    syncDebugEditorSelection(workspaceState);
  }

  async function runAction(successMessage: string, action: () => Promise<void>): Promise<void> {
    nextActionRevision();
    isSaving.value = true;
    error.value = '';
    status.value = 'Saving changes';
    try {
      await action();
      status.value = successMessage;
    } catch (caught) {
      if (isDashboardActionHandledError(caught)) {
        error.value = '';
        status.value = caught.status;
        return;
      }
      error.value = readError(caught, 'Dashboard action failed.');
      status.value = 'Dashboard action failed';
    } finally {
      isSaving.value = false;
    }
  }

  function updateSelectedDashboard(next: Dashboard, runtimeStateOverride?: DashboardRuntimeState | null): void {
    updateSelectedDashboardState(workspaceState, next, runtimeStateOverride);
  }

  function markDashboardDirty(message = 'Unsaved dashboard changes'): void {
    hasUnsavedChanges.value = true;
    status.value = message;
  }

  function setPendingAutoSubmitPrompt(nextPrompt: string): void {
    pendingAutoSubmitPrompt = nextPrompt;
    pendingAutoSubmitKey = '';
  }

  function nextActionRevision(): number {
    actionRevision += 1;
    return actionRevision;
  }

  function getActionRevision(): number {
    return actionRevision;
  }

  function isActionRevisionCurrent(actionRevisionAtStart: number): boolean {
    return actionRevisionAtStart === actionRevision;
  }

  function isCurrentWorkspaceLoad(actionRevisionAtStart: number): boolean {
    return isActionRevisionCurrent(actionRevisionAtStart) && !isSaving.value;
  }
}
