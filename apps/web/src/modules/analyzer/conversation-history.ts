import { readMessageExecution } from './intent';
import { toAnalyzerLabel } from './result-data';
import type { AnalyzerConversation, AnalyzerExecution, AnalyzerMessage } from './types';

export interface AnalyzerSessionSummary {
  detail: string;
  label: string;
  state: 'draft' | 'saved' | 'cleared';
}

export interface AnalyzerResultHistoryItem {
  createdAt: string;
  execution: AnalyzerExecution;
  id: string;
  rowCount: number;
  tableName: string;
  title: string;
}

export function formatAnalyzerConversationLabel(conversation: AnalyzerConversation): string {
  const title = conversation.title?.trim() || 'Conversation';
  const timestamp = formatAnalyzerTimestamp(conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt);
  return timestamp ? `${title} - ${timestamp}` : title;
}

export function summarizeAnalyzerSession(
  conversation: AnalyzerConversation | null,
  messageCount: number
): AnalyzerSessionSummary {
  if (!conversation) {
    return {
      detail: 'Ask a question to save this conversation.',
      label: 'Draft session',
      state: 'draft'
    };
  }

  const metadata = isRecord(conversation.metadata) ? conversation.metadata : {};
  const codexSession = isRecord(metadata.codexSession) ? metadata.codexSession : null;
  const timestamp = formatAnalyzerTimestamp(conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt);
  const messageText = formatMessageCount(messageCount);
  if (codexSession?.status === 'cleared') {
    return {
      detail: `${messageText} - context reset${timestamp ? ` - ${timestamp}` : ''}`,
      label: 'Session cleared',
      state: 'cleared'
    };
  }

  return {
    detail: `${messageText}${timestamp ? ` - ${timestamp}` : ''}`,
    label: 'Saved session',
    state: 'saved'
  };
}

export function buildAnalyzerResultHistory(messages: AnalyzerMessage[]): AnalyzerResultHistoryItem[] {
  return messages
    .filter(message => message.role === 'assistant')
    .map(message => {
      const execution = readMessageExecution(message);
      if (!execution) return null;
      return {
        createdAt: message.createdAt,
        execution,
        id: message.id,
        rowCount: execution.rowCount,
        tableName: execution.tableName,
        title: execution.title || toAnalyzerLabel(execution.tableName)
      };
    })
    .filter((item): item is AnalyzerResultHistoryItem => item !== null)
    .reverse();
}

function formatAnalyzerTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = MONTHS[date.getUTCMonth()] ?? '';
  return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function formatMessageCount(count: number): string {
  if (count <= 0) return 'No saved messages';
  if (count === 1) return '1 saved message';
  return `${count} saved messages`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];
