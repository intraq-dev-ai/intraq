import type { AnalyzerMessage } from './types';

let localFailureMessageCounter = 0;

export function analyzerFailureText(message: string): string {
  const detail = message.trim() || 'The AI service did not return a usable response.';
  return `AI failed to complete this request. ${detail}`;
}

export function analyzerFailureAppendBody(message: string): {
  content: string;
  metadata: Record<string, unknown>;
  role: 'assistant';
} {
  return {
    role: 'assistant',
    content: analyzerFailureText(message),
    metadata: { error: true, source: 'analyzer_failure' }
  };
}

export async function persistedOrLocalAnalyzerFailureMessage(
  conversationId: string,
  message: string,
  persist: (body: ReturnType<typeof analyzerFailureAppendBody>) => Promise<AnalyzerMessage>
): Promise<AnalyzerMessage> {
  try {
    return await persist(analyzerFailureAppendBody(message));
  } catch {
    return localAnalyzerFailureMessage(conversationId, message);
  }
}

export function localAnalyzerFailureMessage(
  conversationId: string,
  message: string
): AnalyzerMessage {
  localFailureMessageCounter += 1;
  return {
    id: `local-analyzer-failure-${localFailureMessageCounter}`,
    conversationId,
    role: 'assistant',
    content: analyzerFailureText(message),
    createdAt: new Date().toISOString(),
    metadata: {
      error: true,
      source: 'analyzer_failure',
      transient: true
    }
  };
}
