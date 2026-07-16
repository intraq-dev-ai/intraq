import type { AnalyzerConversation } from '../../analyzer/types';

const DASHBOARD_ANALYZER_ORIGIN = 'dashboard-ai';

export function dashboardAnalyzerConversationInput(input: {
  dashboardId: string;
  dashboardName: string;
  dataSourceId: string;
}): {
  dataSourceId: string;
  metadata: Record<string, unknown>;
  title: string;
} {
  return {
    dataSourceId: input.dataSourceId,
    metadata: {
      dashboardId: input.dashboardId,
      dashboardName: input.dashboardName,
      origin: DASHBOARD_ANALYZER_ORIGIN
    },
    title: `${input.dashboardName} - dashboard analysis`
  };
}

export function selectDashboardAnalyzerConversation(
  conversations: AnalyzerConversation[],
  dashboardId: string,
  dataSourceId: string
): AnalyzerConversation | null {
  return conversations
    .filter(conversation => conversation.dataSourceId === dataSourceId
      && conversation.metadata?.dashboardId === dashboardId
      && conversation.metadata?.origin === DASHBOARD_ANALYZER_ORIGIN)
    .sort((left, right) => conversationActivity(right).localeCompare(conversationActivity(left)))[0] ?? null;
}

function conversationActivity(conversation: AnalyzerConversation): string {
  return conversation.lastMessageAt ?? conversation.updatedAt;
}
