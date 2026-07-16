import { CodexResponseError, type CodexResponsesOutput } from './codex-responses-client.js';
import type { CodexAgentToolLoopProvider } from './codex-agent-tool-loop.js';
import type { CodexAgentResult, CodexAgentSurface, RuntimeProvider } from './codex-agent-runtime.js';

export const CODEX_AGENT_MODELS = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2'] as const;
export const DEFAULT_OPENAI_AGENT_MODEL = 'gpt-4.1-mini';
export const DEFAULT_GEMINI_AGENT_MODEL = 'gemini-2.5-flash-lite';

export function resolveCodexModel(model: string | undefined, env: NodeJS.ProcessEnv): string {
  return model?.trim() || env.CODEX_MODEL?.trim() || CODEX_AGENT_MODELS[0];
}

export function resolveOpenAIModel(env: NodeJS.ProcessEnv): string {
  return env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_AGENT_MODEL;
}

export function resolveGeminiModel(model: string | undefined, env: NodeJS.ProcessEnv): string {
  return model?.trim() || env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_AGENT_MODEL;
}

export function resolveExplicitAgentProvider(env: NodeJS.ProcessEnv): RuntimeProvider | null {
  const value = env.AI_AGENT_PROVIDER?.trim().toLowerCase()
    || env.INTRAQ_AI_PROVIDER?.trim().toLowerCase()
    || env.AGENT_PROVIDER?.trim().toLowerCase();
  if (value === 'gemini' || value === 'gemma' || value === 'google_gemini' || value === 'google-gemini') return 'gemini';
  if (value === 'openai' || value === 'custom_openai' || value === 'custom-openai') return 'openai';
  return value === 'codex' ? 'codex' : null;
}

export function defaultDisabled(provider: RuntimeProvider, env: NodeJS.ProcessEnv): boolean {
  if (provider === 'openai') {
    if (env.OPENAI_AGENT_DISABLED === 'true') return true;
    if (env.OPENAI_AGENT_ENABLED === 'true') return false;
    return Boolean(env.VITEST) || env.NODE_ENV === 'test';
  }
  if (provider === 'gemini') {
    if (env.GEMINI_AGENT_DISABLED === 'true') return true;
    if (env.GEMINI_AGENT_ENABLED === 'true') return false;
    return Boolean(env.VITEST) || env.NODE_ENV === 'test';
  }
  if (env.CODEX_AGENT_DISABLED === 'true') return true;
  if (env.CODEX_AGENT_ENABLED === 'true') return false;
  return Boolean(env.VITEST) || env.NODE_ENV === 'test';
}

export function hasOpenAIKey(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

export function hasGeminiKey(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim() || env.GOOGLE_GEMINI_API_KEY?.trim());
}

export function codexProvider(): CodexAgentToolLoopProvider {
  return {
    provider: 'codex',
    auth: 'oauth',
    disabledReason: 'codex_agent_disabled',
    requestFailedReason: 'codex_request_failed',
    toolLoopTurnLimitReason: 'codex_tool_loop_turn_limit'
  };
}

export function geminiProvider(): CodexAgentToolLoopProvider {
  return {
    provider: 'gemini',
    auth: 'api_key',
    disabledReason: 'gemini_agent_disabled',
    requestFailedReason: 'gemini_request_failed',
    toolLoopTurnLimitReason: 'gemini_tool_loop_turn_limit'
  };
}

export function openAIProvider(): CodexAgentToolLoopProvider {
  return {
    provider: 'openai',
    auth: 'api_key',
    disabledReason: 'openai_agent_disabled',
    requestFailedReason: 'openai_request_failed',
    toolLoopTurnLimitReason: 'openai_tool_loop_turn_limit'
  };
}

export function instructionsFor(surface: CodexAgentSurface): string {
  return [
    'You are the intraQ backend agent for business analytics.',
    'Use the supplied data model metadata, deterministic result, and runtime context as the source of truth.',
    'Do not invent database columns, table names, tenant data, IDs, or metrics.',
    'If the data model context is insufficient, ask for metadata or clarification instead of guessing.',
    `Current product surface: ${surface}.`,
    'Return concise operator-facing guidance that can be attached to the API response.'
  ].join('\n');
}

export function resultFromResponse(provider: CodexAgentToolLoopProvider, model: string, response: CodexResponsesOutput): CodexAgentResult {
  return {
    provider: provider.provider,
    auth: provider.auth,
    model,
    used: true,
    responseText: response.outputText.trim(),
    usage: response.usage
  };
}

export function fallback(provider: CodexAgentToolLoopProvider, model: string, fallbackReason: string, error?: string): CodexAgentResult {
  return {
    provider: provider.provider,
    auth: provider.auth,
    model,
    used: false,
    responseText: null,
    fallbackReason,
    ...(error ? { error } : {})
  };
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof CodexResponseError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Agent request failed.';
}
