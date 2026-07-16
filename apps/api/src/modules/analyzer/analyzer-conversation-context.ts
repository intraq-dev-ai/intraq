import type { IncomingMessage } from 'node:http';
import type { ConfirmedAnalyzerBusinessScope } from '@intraq/contracts';
import { analyzerHistoryAccessForRequest } from './analyzer-history-access.js';
import { parseConfirmedAnalyzerBusinessScope } from './analyzer-business-scope.js';
import type {
  AnalyzerHistoryAccess,
  AnalyzerHistoryConversation,
  AnalyzerHistoryStore
} from './history-foundation-store.js';

export interface AnalyzerConversationContext {
  access: AnalyzerHistoryAccess;
  businessScope: ConfirmedAnalyzerBusinessScope | null;
  conversation: AnalyzerHistoryConversation;
  invalidBusinessScope: boolean;
}

export async function loadAnalyzerConversationContext(
  store: AnalyzerHistoryStore,
  req: IncomingMessage,
  conversationId: string
): Promise<AnalyzerConversationContext | null> {
  const access = analyzerHistoryAccessForRequest(req);
  if (!access) return null;
  const conversation = await store.getConversation(conversationId, 'analyzer', access);
  if (!conversation) return null;
  const metadataValue = conversation.metadata.businessScope;
  const businessScope = parseConfirmedAnalyzerBusinessScope(metadataValue);
  return {
    access,
    businessScope,
    conversation,
    invalidBusinessScope: metadataValue !== undefined && !businessScope
  };
}
