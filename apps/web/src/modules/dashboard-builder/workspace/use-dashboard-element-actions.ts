import { twoRowKpiCardDefaults } from '../agent-context/card-planning-defaults';
import { dashboardElementUsesDataSource } from '../dashboard-element-normalization';
import type { Dashboard } from '../types';
import { dashboardElementCreatedMessage } from './dashboard-agent-conversation';
import type {
  ActionRunner,
  CaptureAiUndoState,
  MarkDashboardDirty
} from './dashboard-element-action-context';
import {
  buildAppliedPlan,
  buildSelectedElementUpdatePlan
} from './dashboard-element-agent-plans';
import {
  agentFailureMessage,
  replaceAgentMessage,
  withUndoAction
} from './dashboard-element-agent-messages';
import type { ElementPatch } from './dashboard-element-patches';
import {
  assertSelectedElementOnlyUpdate,
  syncWorkspaceDataSelectionFromElement
} from './dashboard-element-selection';
import {
  clearDashboardLayoutDrafts,
  readDashboardLayoutDrafts,
  saveDashboardLayoutDraft
} from './dashboard-layout-drafts';
import {
  applyLayoutDraftsToDashboard,
  createLocalDashboardElement,
  createLocalDashboardFilter,
  updateDashboardElementDraft
} from './dashboard-local-draft';
import {
  manualElementName,
  nextManualElementLayout
} from './dashboard-manual-element-layout';
import { selectedElementAppliedMessage } from './dashboard-selected-element-update-message';
import type { DashboardWorkspaceState } from './use-dashboard-workspace-state';

export function useDashboardElementActions(
  state: DashboardWorkspaceState,
  runAction: ActionRunner,
  updateSelectedDashboard: (next: Dashboard) => void,
  markDashboardDirty: MarkDashboardDirty,
  captureAiUndoState: CaptureAiUndoState
) {
  async function createElement(): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;

    await runAction('Dashboard element created', async () => {
      const { appliedPlan, fieldLabels, progressMessageId } = await buildAppliedPlan(state, dashboard.id, dashboard.elements.length);
      try {
        const currentDashboard = state.selectedDashboard.value ?? dashboard;
        captureAiUndoState();
        const filters = appliedPlan.filters.map(filterDraft => createLocalDashboardFilter(currentDashboard, filterDraft));
        const element = createLocalDashboardElement(currentDashboard, appliedPlan.element);
        updateSelectedDashboard({
          ...currentDashboard,
          elements: [...currentDashboard.elements, element],
          filters: [...currentDashboard.filters, ...filters]
        });
        markDashboardDirty('Dashboard element added locally');
        if (state.debugMode.value) state.selectedElementId.value = element.id;
        replaceAgentMessage(state, progressMessageId, withUndoAction(dashboardElementCreatedMessage(element.name, fieldLabels, element.type)));
      } catch (caught) {
        replaceAgentMessage(
          state,
          progressMessageId,
          agentFailureMessage('I planned the component, but could not add it to the local dashboard draft. Please try again.')
        );
        throw caught;
      }
    });
  }

  async function applyAgentToSelectedElement(): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    const element = state.selectedElement.value;
    if (!dashboard || !element) return;
    let updateApplied = false;
    await runAction('Dashboard element updated by AI agent', async () => {
      const { assistantMessage, fieldLabels, patch, plan, progressMessageId } =
        await buildSelectedElementUpdatePlan(state, dashboard.id, element);
      if (!patch) {
        replaceAgentMessage(state, progressMessageId, assistantMessage);
        return;
      }
      updateApplied = true;
      try {
        captureAiUndoState();
        const updatedDashboard = updateDashboardElementDraft(dashboard, element.id, patch);
        assertSelectedElementOnlyUpdate(dashboard, updatedDashboard, element.id);
        const updated = updatedDashboard.elements.find(item => item.id === element.id) ?? element;
        updateSelectedDashboard(updatedDashboard);
        markDashboardDirty('Dashboard element changed locally');
        replaceAgentMessage(state, progressMessageId, withUndoAction(selectedElementAppliedMessage(element, updated, plan, fieldLabels)));
      } catch (caught) {
        replaceAgentMessage(
          state,
          progressMessageId,
          agentFailureMessage('I planned the update, but could not apply it to the local dashboard draft. Please try again.')
        );
        throw caught;
      }
    });
    if (!updateApplied) state.status.value = 'Dashboard AI needs more detail for the selected component.';
  }

  async function saveElement(elementPatch: ElementPatch): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    const element = state.selectedElement.value;
    if (!dashboard || !element) return;
    updateSelectedDashboard(updateDashboardElementDraft(dashboard, element.id, elementPatch));
    markDashboardDirty('Dashboard element changed locally');
  }

  async function removeElement(id: string): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    state.selectedElementId.value = '';
    state.editorFocusElementId.value = '';
    updateSelectedDashboard({ ...dashboard, elements: dashboard.elements.filter(element => element.id !== id) });
    markDashboardDirty('Dashboard element removed locally');
  }

  async function updateElementLayout(id: string, layout: Record<string, number>): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    const element = dashboard?.elements.find(item => item.id === id);
    if (!dashboard || !element) return;
    const nextLayout = { ...(element.layout ?? {}), ...layout };
    saveDashboardLayoutDraft(dashboard.id, id, nextLayout as Record<string, number>);
    updateSelectedDashboard({
      ...dashboard,
      elements: dashboard.elements.map(item => item.id === id ? { ...item, layout: nextLayout } : item)
    });
    markDashboardDirty('Layout updated locally');
  }

  async function updateElementConfig(
    id: string,
    patch: { chartType?: string; config: Record<string, unknown>; name?: string }
  ): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    const element = dashboard?.elements.find(item => item.id === id);
    if (!dashboard || !element) return;
    updateSelectedDashboard(updateDashboardElementDraft(dashboard, id, {
      ...(patch.chartType ? { chartType: patch.chartType } : {}),
      config: { ...(element.config ?? {}), ...patch.config },
      name: patch.name?.trim() || element.name
    }));
    markDashboardDirty('Dashboard component settings changed locally');
  }

  async function flushLayoutDrafts(dashboard: Dashboard): Promise<Dashboard> {
    const drafts = readDashboardLayoutDrafts(dashboard.id);
    const entries = Object.entries(drafts);
    if (entries.length === 0) return dashboard;
    const updatedDashboard = applyLayoutDraftsToDashboard(dashboard, drafts);
    if (state.selectedDashboard.value?.id === dashboard.id) {
      updateSelectedDashboard(updatedDashboard);
    }
    clearDashboardLayoutDrafts(dashboard.id);
    return updatedDashboard;
  }

  async function cloneElement(id: string): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    const element = dashboard?.elements.find(item => item.id === id);
    if (!dashboard || !element) return;
    const clone = createLocalDashboardElement(dashboard, {
      name: `${element.name} Copy`,
      type: element.type,
      ...(element.chartType ? { chartType: element.chartType } : {}),
      ...(element.dataSourceId ? { dataSourceId: element.dataSourceId } : {}),
      config: { ...(element.config ?? {}), title: `${element.name} Copy` },
      layout: { ...(element.layout ?? {}), y: dashboard.elements.length * 5 }
    });
    updateSelectedDashboard({ ...dashboard, elements: [...dashboard.elements, clone] });
    state.selectedElementId.value = clone.id;
    state.editorFocusElementId.value = clone.id;
    markDashboardDirty('Dashboard element cloned locally');
  }

  function editElement(id: string): void {
    state.selectedElementId.value = id;
    state.editorFocusElementId.value = id;
    syncWorkspaceDataSelectionFromElement(state, state.selectedElement.value);
    const elementName = state.selectedElement.value?.name ?? 'selected component';
    state.status.value = `${elementName} selected in AI Chart Editor`;
  }

  function clearElementSelection(): void {
    state.selectedElementId.value = '';
    state.editorFocusElementId.value = '';
    state.status.value = 'AI Chart Editor selection cleared';
  }

  async function createManualElement(type: string, chartType?: string, dropX?: number, dropY?: number): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    await runAction('Dashboard element created', async () => {
      const sameTypeCount = dashboard.elements.filter(element =>
        element.type === type && (!chartType || element.chartType === chartType)
      ).length;
      const name = manualElementName(type, chartType, sameTypeCount + 1);
      const layout = nextManualElementLayout(dashboard, type, dropX, dropY);
      const config: Record<string, unknown> = { title: name };
      if (type === 'chart' && chartType === 'stacked') config.stackBars = true;
      if (type === 'card') {
        Object.assign(config, twoRowKpiCardDefaults());
      }
      if (type === 'container' || type === 'filter-container') {
        Object.assign(config, {
          backgroundColor: '',
          borderColor: '',
          borderRadius: '8',
          borderWidth: '1',
          columns: 4,
          gap: '12',
          padding: '14',
          showTitle: false
        });
      }
      if (type === 'news') {
        config.newsTitle = name;
        config.sourceLabel = 'Dashboard updates';
        config.maxItems = 5;
      }
      if (type === 'chatbot') {
        config.botTitle = name;
        config.welcomeMessage = 'Ask a question about this dashboard.';
        config.placeholder = 'Type a question...';
        config.enableChartRecommendations = true;
      }
      if (type === 'text') {
        config.showIcon = true;
        config.text = '';
        config.textVariant = 'insight';
        config.tone = 'neutral';
      }
      const bindsToDataSource = dashboardElementUsesDataSource(type);
      if (bindsToDataSource && state.selectedDataSourceId.value) config.dataSourceId = state.selectedDataSourceId.value;
      if (bindsToDataSource && state.selectedTableId.value) config.dataSourceTableId = state.selectedTableId.value;
      const element = createLocalDashboardElement(dashboard, {
        name,
        type,
        ...(chartType ? { chartType } : {}),
        ...(bindsToDataSource && state.selectedDataSourceId.value ? { dataSourceId: state.selectedDataSourceId.value } : {}),
        config,
        layout
      });
      updateSelectedDashboard({
        ...dashboard,
        elements: [...dashboard.elements, element]
      });
      state.selectedElementId.value = element.id;
      state.editorFocusElementId.value = element.id;
      markDashboardDirty('Dashboard element added locally');
    });
  }

  return {
    applyAgentToSelectedElement,
    cloneElement,
    createElement,
    createManualElement,
    clearElementSelection,
    editElement,
    removeElement,
    saveElement,
    flushLayoutDrafts,
    updateElementConfig,
    updateElementLayout
  };
}
