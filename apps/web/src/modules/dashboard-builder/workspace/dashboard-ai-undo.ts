import type { Dashboard, DashboardRuntimeState } from '../types';

export interface DashboardAiUndoState {
  dashboard: Dashboard;
  editorFocusElementId: string;
  hasUnsavedChanges: boolean;
  runtimeState: DashboardRuntimeState | null;
  selectedElementId: string;
}

export function cloneDashboardAiUndoState(input: DashboardAiUndoState): DashboardAiUndoState {
  return {
    dashboard: deepClone(input.dashboard),
    editorFocusElementId: input.editorFocusElementId,
    hasUnsavedChanges: input.hasUnsavedChanges,
    runtimeState: deepClone(input.runtimeState),
    selectedElementId: input.selectedElementId
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
