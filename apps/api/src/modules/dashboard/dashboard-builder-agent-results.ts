import type {
  BuilderAgentConversationResult,
  BuilderAgentRequest,
  BuilderAgentResponse,
  BuilderAgentResult
} from '@intraq/contracts';
import type { CodexAgentResult } from '../codex-agent/codex-agent-runtime.js';
import { suggestedDashboardBuilderActionsForRequest } from './dashboard-builder-evidence-gate.js';
import {
  isKnowledgeReferences,
  isRecord,
  parseComponentType,
  parseMode
} from './dashboard-builder-agent-values.js';

export function isSelectedComponentUpdateRequest(request: BuilderAgentRequest): boolean {
  return request.mode === 'update' && Boolean(request.elementId);
}

export function conversationResult(
  request: BuilderAgentRequest,
  content: {
    title: string;
    summary: string;
    suggestedActions: string[];
  }
): BuilderAgentConversationResult {
  const suggestedActions = isSelectedComponentUpdateRequest(request)
    ? suggestedDashboardBuilderActionsForRequest(request)
    : content.suggestedActions.length > 0
      ? content.suggestedActions
      : suggestedDashboardBuilderActionsForRequest(request);
  return {
    type: 'conversation',
    workflow: 'dashboard-builder',
    message: request.prompt,
    title: sanitizeDashboardBuilderText(content.title),
    summary: sanitizeDashboardBuilderText(content.summary),
    suggestedActions: suggestedActions.map(sanitizeDashboardBuilderText),
    knowledgeReferences: []
  };
}

export function sanitizeDashboardBuilderResponse(response: BuilderAgentResponse): BuilderAgentResponse {
  if (response.type === 'conversation') {
    return {
      ...response,
      title: sanitizeDashboardBuilderText(response.title),
      summary: sanitizeDashboardBuilderText(response.summary),
      suggestedActions: response.suggestedActions.map(sanitizeDashboardBuilderText)
    };
  }
  return {
    ...response,
    title: sanitizeDashboardBuilderText(response.title),
    summary: sanitizeDashboardBuilderText(response.summary)
  };
}

function sanitizeDashboardBuilderText(value: string): string {
  return replaceInsensitivePhrases(value, [
    ['evidence', 'context']
  ]);
}

function replaceInsensitivePhrases(value: string, replacements: Array<[string, string]>): string {
  return replacements.reduce((output, [search, replacement]) =>
    replaceInsensitivePhrase(output, search, replacement), value);
}

function replaceInsensitivePhrase(value: string, search: string, replacement: string): string {
  if (!search) return value;
  let output = '';
  let remaining = value;
  const loweredSearch = search.toLowerCase();
  while (remaining.toLowerCase().includes(loweredSearch)) {
    const index = remaining.toLowerCase().indexOf(loweredSearch);
    output += remaining.slice(0, index) + replacement;
    remaining = remaining.slice(index + search.length);
  }
  return output + remaining;
}

export function isBuilderAgentResponse(value: unknown): value is BuilderAgentResponse {
  return isBuilderAgentResult(value)
    || isBuilderAgentConversationResult(value);
}

function isBuilderAgentResult(value: unknown): value is BuilderAgentResult {
  return isRecord(value)
    && value.type === 'action-plan'
    && value.workflow === 'dashboard-builder'
    && parseMode(value.mode) !== null
    && parseComponentType(value.componentType) !== null
    && typeof value.message === 'string'
    && typeof value.title === 'string'
    && typeof value.summary === 'string'
    && Array.isArray(value.actions)
    && isRecord(value.params)
    && Array.isArray(value.visualizations)
    && isKnowledgeReferences(value.knowledgeReferences);
}

function isBuilderAgentConversationResult(value: unknown): value is BuilderAgentConversationResult {
  return isRecord(value)
    && value.type === 'conversation'
    && value.workflow === 'dashboard-builder'
    && typeof value.message === 'string'
    && typeof value.title === 'string'
    && typeof value.summary === 'string'
    && Array.isArray(value.suggestedActions)
    && value.suggestedActions.every(item => typeof item === 'string')
    && isKnowledgeReferences(value.knowledgeReferences);
}

export function dashboardBuilderUnavailableMessage(provider: CodexAgentResult): string {
  if (provider.fallbackReason === 'openai_api_key_not_configured') {
    return 'Dashboard Builder AI requires an OpenAI API key to be configured.';
  }
  if (provider.fallbackReason === 'openai_agent_disabled') {
    return 'Dashboard Builder OpenAI agent is disabled.';
  }
  if (provider.fallbackReason === 'openai_request_failed') {
    return 'Dashboard Builder AI could not complete the OpenAI request.';
  }
  if (provider.fallbackReason === 'openai_request_timeout') {
    return 'Dashboard Builder OpenAI request timed out.';
  }
  if (provider.fallbackReason === 'openai_tool_loop_turn_limit') {
    return 'Dashboard Builder AI reached its tool-loop turn limit.';
  }
  if (provider.fallbackReason === 'codex_oauth_not_configured') {
    return 'Dashboard Builder AI requires Codex OAuth to be connected.';
  }
  if (provider.fallbackReason === 'codex_agent_disabled') {
    return 'Dashboard Builder AI agent is disabled.';
  }
  if (provider.fallbackReason === 'codex_request_failed') {
    return 'Dashboard Builder AI could not complete the Codex OAuth request.';
  }
  if (provider.fallbackReason === 'codex_tool_loop_turn_limit') {
    return 'Dashboard Builder AI reached its tool-loop turn limit.';
  }
  return 'Dashboard Builder AI is unavailable.';
}
