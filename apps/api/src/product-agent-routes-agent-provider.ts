import type { AnalyzerResult } from '@intraq/contracts';
import type { CodexAgentResult } from './modules/codex-agent/codex-agent-runtime.js';

export function withAgentProvider<T extends object>(
  payload: T,
  agentProvider: CodexAgentResult
): T & { agentProvider: CodexAgentResult } {
  return { ...payload, agentProvider };
}

export function agentUnavailableAnalyzerResult(_question: string): AnalyzerResult {
  return {
    workflow: 'analyzer',
    answer: 'Analyzer AI agent is unavailable.',
    suggestedFollowUps: [],
    knowledgeReferences: []
  };
}

export function agentUnavailableDetails(agentProvider: CodexAgentResult): Record<string, string> {
  return {
    provider: agentProvider.provider,
    auth: agentProvider.auth,
    model: agentProvider.model,
    reason: agentProvider.fallbackReason ?? 'agent_unavailable'
  };
}

export function localAgentProvider(reason: string): CodexAgentResult {
  return {
    provider: 'codex',
    auth: 'oauth',
    model: 'deterministic-policy',
    used: false,
    responseText: null,
    fallbackReason: reason
  };
}

export function agentUnavailableMessage(productName: string, provider: CodexAgentResult): string {
  if (provider.fallbackReason === 'openai_api_key_not_configured') {
    return `${productName} requires an OpenAI API key to be configured.`;
  }
  if (provider.fallbackReason === 'openai_agent_disabled') {
    return `${productName} OpenAI agent is disabled.`;
  }
  if (provider.fallbackReason === 'openai_request_failed') {
    return `${productName} could not complete the OpenAI request.`;
  }
  if (provider.fallbackReason === 'openai_tool_loop_turn_limit') {
    return `${productName} reached its OpenAI tool-loop turn limit.`;
  }
  if (provider.fallbackReason === 'codex_oauth_not_configured') {
    return `${productName} requires Codex OAuth to be connected.`;
  }
  if (provider.fallbackReason === 'codex_agent_disabled') {
    return `${productName} agent is disabled.`;
  }
  if (provider.fallbackReason === 'codex_request_failed') {
    return `${productName} could not complete the Codex OAuth request.`;
  }
  return `${productName} is unavailable.`;
}
