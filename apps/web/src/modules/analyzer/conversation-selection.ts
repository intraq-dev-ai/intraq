import type { AnalyzerConversation, DataSourceSummary } from './types';

export function visibleAnalyzerDataSources(sources: DataSourceSummary[]): DataSourceSummary[] {
  return sources
    .filter(source => source.id.trim().length > 0 && source.name.trim().length > 0)
    .map(source => ({ id: source.id.trim(), name: source.name.trim() }));
}

export function preferredAnalyzerDataSourceId(
  sources: DataSourceSummary[],
  currentDataSourceId: string
): string {
  if (currentDataSourceId && sources.some(source => source.id === currentDataSourceId)) return currentDataSourceId;
  return sources[0]?.id ?? '';
}

export async function resolveAnalyzerConversationDataSourceId(
  conversationId: string,
  currentConversations: AnalyzerConversation[],
  fetchAllConversations: () => Promise<AnalyzerConversation[]>
): Promise<string> {
  const current = currentConversations.find(item => item.id === conversationId);
  const currentDataSourceId = readAnalyzerConversationDataSourceId(current);
  if (currentDataSourceId) return currentDataSourceId;
  try {
    const allConversations = await fetchAllConversations();
    return readAnalyzerConversationDataSourceId(allConversations.find(item => item.id === conversationId));
  } catch {
    return '';
  }
}

export function readAnalyzerConversationDataSourceId(conversation: AnalyzerConversation | undefined): string {
  const direct = conversation?.dataSourceId?.trim();
  if (direct) return direct;
  const metadataValue = conversation?.metadata?.dataSourceId;
  return typeof metadataValue === 'string' ? metadataValue.trim() : '';
}
