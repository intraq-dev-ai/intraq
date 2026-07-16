const SERVER_OWNED_CONVERSATION_METADATA = [
  'businessScope',
  'codexSession',
  'dataSourceId',
  'memoryTurns',
  'surface',
  'tenantId',
  'userId'
] as const;

export function sanitizeAnalyzerConversationClientMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const sanitized = { ...metadata };
  for (const key of SERVER_OWNED_CONVERSATION_METADATA) delete sanitized[key];
  return sanitized;
}

export function mergeAnalyzerConversationClientMetadata(
  existing: Record<string, unknown>,
  clientMetadata: Record<string, unknown>
): Record<string, unknown> {
  const merged = sanitizeAnalyzerConversationClientMetadata(clientMetadata);
  for (const key of SERVER_OWNED_CONVERSATION_METADATA) {
    if (existing[key] !== undefined) merged[key] = existing[key];
  }
  return merged;
}
