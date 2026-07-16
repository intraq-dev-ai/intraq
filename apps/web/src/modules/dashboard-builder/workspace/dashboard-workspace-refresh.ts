import {
  fetchDashboardVersions,
  restoreBuilderConversation
} from '../api';
import { dashboardAgentMessagesFromSnapshot } from './dashboard-agent-conversation-state';
import type { DashboardWorkspaceState } from './use-dashboard-workspace-state';

interface DashboardWorkspaceRefreshContext {
  isCurrentWorkspaceLoad: (actionRevisionAtStart: number) => boolean;
  state: DashboardWorkspaceState;
}

export function useDashboardWorkspaceRefresh({
  isCurrentWorkspaceLoad,
  state
}: DashboardWorkspaceRefreshContext) {
  async function refreshVersions(): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    state.versions.value = dashboard ? await fetchDashboardVersions(dashboard.id) : [];
  }

  async function refreshSecondaryWorkspaceData(actionRevisionAtStart: number): Promise<void> {
    await Promise.allSettled([
      refreshMetadataSummaryForLoad(actionRevisionAtStart),
      refreshVersionsForLoad(actionRevisionAtStart),
      refreshBuilderConversationForLoad(actionRevisionAtStart)
    ]);
  }

  async function refreshMetadataSummaryForLoad(actionRevisionAtStart: number): Promise<void> {
    if (!isCurrentWorkspaceLoad(actionRevisionAtStart)) return;
    await refreshMetadataSummary();
  }

  async function refreshVersionsForLoad(actionRevisionAtStart: number): Promise<void> {
    if (!isCurrentWorkspaceLoad(actionRevisionAtStart)) return;
    try {
      await refreshVersions();
    } catch {
      if (isCurrentWorkspaceLoad(actionRevisionAtStart)) state.versions.value = [];
    }
  }

  async function refreshBuilderConversationForLoad(actionRevisionAtStart: number): Promise<void> {
    if (!isCurrentWorkspaceLoad(actionRevisionAtStart)) return;
    await refreshBuilderConversation(actionRevisionAtStart);
  }

  async function refreshMetadataSummary(): Promise<void> {
    state.modelContextError.value = '';
    state.modelContextSummary.value = null;
  }

  async function refreshBuilderConversation(actionRevisionAtStart?: number): Promise<void> {
    const dashboardId = state.selectedDashboardId.value;
    if (!dashboardId) {
      state.agentConversationId.value = '';
      state.agentMessages.value = dashboardAgentMessagesFromSnapshot(null);
      return;
    }
    try {
      const snapshot = await restoreBuilderConversation({
        dashboardId,
        ...(state.agentConversationId.value ? { conversationId: state.agentConversationId.value } : {})
      });
      if (actionRevisionAtStart !== undefined && !isCurrentWorkspaceLoad(actionRevisionAtStart)) return;
      state.agentConversationId.value = snapshot?.conversation.id ?? '';
      state.agentMessages.value = dashboardAgentMessagesFromSnapshot(snapshot);
      state.lastAiUndo.value = null;
    } catch {
      if (actionRevisionAtStart !== undefined && !isCurrentWorkspaceLoad(actionRevisionAtStart)) return;
      state.agentConversationId.value = '';
      state.agentMessages.value = dashboardAgentMessagesFromSnapshot(null);
      state.lastAiUndo.value = null;
    }
  }

  return {
    refreshBuilderConversation,
    refreshSecondaryWorkspaceData,
    refreshMetadataSummary,
    refreshVersions
  };
}
