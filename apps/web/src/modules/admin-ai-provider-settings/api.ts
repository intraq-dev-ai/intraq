import { requestAdmin } from '../admin/api';

export type AiProvider = 'codex' | 'gemini' | 'openai';

export interface ProviderConfig {
  apiKeyConfigured: boolean;
  baseUrl: string;
  model: string;
}

export interface AiProviderSettings {
  provider: AiProvider;
  openai: ProviderConfig;
  gemini: ProviderConfig;
}

export interface CodexConnectionStatus {
  connected: boolean;
  keyType: 'oauth' | null;
  updatedAt: string | null;
  model: string;
  purposes: string[];
  clientIdConfigured: boolean;
}

export interface CodexOAuthStart {
  authorizationUrl: string;
  state: string;
  redirectUri: string;
  expiresInSeconds: number;
}

export const DEFAULT_SETTINGS: AiProviderSettings = {
  provider: 'codex',
  openai: {
    apiKeyConfigured: false,
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini'
  },
  gemini: {
    apiKeyConfigured: false,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash-lite'
  }
};

export const CODEX_MODEL_OPTIONS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.2'
];

export async function fetchAiProviderSettings(): Promise<AiProviderSettings> {
  return normalizeSettings(await requestAdmin<unknown>('/api/ai-provider-settings'));
}

export async function saveAiProvider(provider: AiProvider): Promise<{ provider: AiProvider }> {
  return requestAdmin<{ provider: AiProvider }>('/api/ai-provider-settings/provider', {
    method: 'PUT',
    body: { provider }
  });
}

export async function saveProviderConfig(provider: 'gemini' | 'openai', body: {
  apiKey?: string;
  baseUrl: string;
  model: string;
}): Promise<ProviderConfig> {
  return normalizeProviderConfig(await requestAdmin<unknown>(`/api/ai-provider-settings/${provider}`, {
    method: 'PUT',
    body
  }), DEFAULT_SETTINGS[provider]);
}

export async function deleteProviderConfig(provider: 'gemini' | 'openai'): Promise<unknown> {
  return requestAdmin<unknown>(`/api/ai-provider-settings/${provider}`, { method: 'DELETE' });
}

export async function testProviderConfig(provider: 'gemini' | 'openai'): Promise<unknown> {
  return requestAdmin<unknown>(`/api/ai-provider-settings/${provider}/test`, {
    method: 'POST',
    body: {}
  });
}

export async function fetchCodexStatus(tenantId: string): Promise<CodexConnectionStatus> {
  return normalizeCodexStatus(await requestAdmin<unknown>(`/api/oauth/codex/status?tenantId=${encodeURIComponent(tenantId)}`));
}

export async function startCodexOAuth(tenantId: string): Promise<CodexOAuthStart> {
  return normalizeCodexOAuthStart(await requestAdmin<unknown>(`/api/oauth/codex/start?tenantId=${encodeURIComponent(tenantId)}`));
}

export async function processCodexRedirectUrl(callbackUrl: string): Promise<unknown> {
  return requestAdmin<unknown>('/api/oauth/codex/process-url', {
    method: 'POST',
    body: { callbackUrl }
  });
}

export async function saveCodexModel(tenantId: string, model: string): Promise<unknown> {
  return requestAdmin<unknown>('/api/oauth/codex/model', {
    method: 'PATCH',
    body: { tenantId, model }
  });
}

export async function disconnectCodex(tenantId: string): Promise<unknown> {
  return requestAdmin<unknown>('/api/oauth/codex/disconnect', {
    method: 'DELETE',
    body: { tenantId }
  });
}

export function providerLabel(provider: AiProvider): string {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'gemini') return 'Gemini';
  return 'Codex OAuth';
}

export function resolveTenantId(): string {
  if (typeof window === 'undefined') return 'tenant-foundation';
  return window.localStorage.getItem('tenantId')
    || window.localStorage.getItem('tenant_id')
    || 'tenant-foundation';
}

function normalizeSettings(payload: unknown): AiProviderSettings {
  const record = unwrapRecord(payload);
  return {
    provider: normalizeProvider(record.provider),
    openai: normalizeProviderConfig(record.openai, DEFAULT_SETTINGS.openai),
    gemini: normalizeProviderConfig(record.gemini, DEFAULT_SETTINGS.gemini)
  };
}

function normalizeProviderConfig(payload: unknown, fallback: ProviderConfig): ProviderConfig {
  const record = unwrapRecord(payload);
  return {
    apiKeyConfigured: record.apiKeyConfigured === true,
    baseUrl: readString(record.baseUrl) || fallback.baseUrl,
    model: readString(record.model) || fallback.model
  };
}

function normalizeCodexStatus(payload: unknown): CodexConnectionStatus {
  const record = unwrapRecord(payload);
  return {
    connected: record.connected === true,
    keyType: record.keyType === 'oauth' ? 'oauth' : null,
    updatedAt: readString(record.updatedAt) || null,
    model: readString(record.model) || CODEX_MODEL_OPTIONS[0],
    purposes: Array.isArray(record.purposes) ? record.purposes.filter((item): item is string => typeof item === 'string') : [],
    clientIdConfigured: record.clientIdConfigured !== false
  };
}

function normalizeCodexOAuthStart(payload: unknown): CodexOAuthStart {
  const record = unwrapRecord(payload);
  return {
    authorizationUrl: readString(record.authorizationUrl),
    state: readString(record.state),
    redirectUri: readString(record.redirectUri),
    expiresInSeconds: typeof record.expiresInSeconds === 'number' ? record.expiresInSeconds : Number(record.expiresInSeconds) || 0
  };
}

function normalizeProvider(value: unknown): AiProvider {
  return value === 'openai' || value === 'gemini' || value === 'codex' ? value : 'codex';
}

function unwrapRecord(payload: unknown): Record<string, unknown> {
  const value = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  return isRecord(value) ? value : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
