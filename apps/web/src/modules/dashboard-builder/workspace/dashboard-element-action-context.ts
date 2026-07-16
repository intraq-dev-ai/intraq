import type { Dashboard } from '../types';
import type { DashboardWorkspaceState } from './use-dashboard-workspace-state';

export type ActionRunner = (successMessage: string, action: () => Promise<void>) => Promise<void>;
export type MarkDashboardDirty = (message?: string) => void;
export type CaptureAiUndoState = () => void;

export interface DashboardElementActionContext {
  captureAiUndoState: CaptureAiUndoState;
  markDashboardDirty: MarkDashboardDirty;
  runAction: ActionRunner;
  state: DashboardWorkspaceState;
  updateSelectedDashboard: (next: Dashboard) => void;
}
