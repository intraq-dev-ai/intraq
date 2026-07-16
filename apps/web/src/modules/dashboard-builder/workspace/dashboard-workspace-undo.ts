import type {
  Dashboard,
  DashboardAgentMessage,
  DashboardRuntimeState
} from '../types';
import { cloneDashboardAiUndoState } from './dashboard-ai-undo';
import type { DashboardWorkspaceState } from './use-dashboard-workspace-state';

type UpdateSelectedDashboard = (next: Dashboard, runtimeStateOverride?: DashboardRuntimeState | null) => void;

export function useDashboardWorkspaceUndo(
  state: DashboardWorkspaceState,
  updateSelectedDashboard: UpdateSelectedDashboard
) {
  function captureAiUndoState(): void {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) {
      state.lastAiUndo.value = null;
      return;
    }
    state.lastAiUndo.value = cloneDashboardAiUndoState({
      dashboard,
      editorFocusElementId: state.editorFocusElementId.value,
      hasUnsavedChanges: state.hasUnsavedChanges.value,
      runtimeState: state.dashboardRuntimeState.value,
      selectedElementId: state.selectedElementId.value
    });
  }

  function undoLastAiChange(): void {
    const snapshot = state.lastAiUndo.value;
    if (!snapshot) {
      appendAssistantStatusMessage(state, 'No recent AI change to undo.');
      state.status.value = 'No recent AI change to undo';
      return;
    }
    updateSelectedDashboard(snapshot.dashboard, snapshot.runtimeState);
    state.selectedElementId.value = snapshot.selectedElementId;
    state.editorFocusElementId.value = snapshot.editorFocusElementId;
    state.hasUnsavedChanges.value = snapshot.hasUnsavedChanges;
    state.error.value = '';
    state.lastAiUndo.value = null;
    appendAssistantStatusMessage(state, 'Changes reverted to the previous state.');
    state.status.value = 'Dashboard AI change undone';
  }

  return {
    captureAiUndoState,
    undoLastAiChange
  };
}

function appendAssistantStatusMessage(state: DashboardWorkspaceState, body: string): void {
  const message: DashboardAgentMessage = {
    id: `dashboard-agent-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'assistant',
    kind: 'status',
    title: 'Dashboard AI',
    body
  };
  state.agentMessages.value = [
    ...state.agentMessages.value,
    message
  ].slice(-10);
}
