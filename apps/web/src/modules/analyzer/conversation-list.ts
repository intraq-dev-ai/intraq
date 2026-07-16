import type { AnalyzerConversation } from './types';

export function touchAnalyzerConversation(
  conversations: AnalyzerConversation[],
  conversationId: string,
  updates: Partial<AnalyzerConversation>
): AnalyzerConversation[] {
  return [...conversations]
    .map(conversation => conversation.id === conversationId
      ? { ...conversation, ...updates }
      : conversation)
    .sort(compareAnalyzerConversationActivity);
}

function compareAnalyzerConversationActivity(
  left: AnalyzerConversation,
  right: AnalyzerConversation
): number {
  return activityTime(right) - activityTime(left);
}

function activityTime(conversation: AnalyzerConversation): number {
  const candidates = [
    conversation.lastMessageAt,
    conversation.updatedAt,
    conversation.createdAt
  ];
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate ?? '');
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}
