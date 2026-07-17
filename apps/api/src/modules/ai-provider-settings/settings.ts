import type { IntraQPrismaClient } from '@intraq/db';
import {
  DEFAULT_GEMINI_AGENT_MODEL,
  DEFAULT_OPENAI_AGENT_MODEL,
  type RuntimeProvider,
  type RuntimeProviderConfig
} from '../codex-agent/codex-agent-runtime.js';
import { decodeSecret, encodeSecret } from './secret-codec.js';

export type SelfHostedAiProvider = 'codex' | 'gemini' | 'openai';

export interface StoredProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface PublicProviderConfig {
  apiKeyConfigured: boolean;
  baseUrl: string;
  model: string;
}

export interface PublicAiProviderSettings {
  provider: SelfHostedAiProvider;
  openai: PublicProviderConfig;
  gemini: PublicProviderConfig;
}

const PROVIDER_SETTING_KEY = 'ai.provider';
const OPENAI_SETTING_KEY = 'ai.provider.openai';
const GEMINI_SETTING_KEY = 'ai.provider.gemini';
const AI_CATEGORY = 'ai';

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export async function readPublicAiProviderSettings(
  client: IntraQPrismaClient | null,
  env: NodeJS.ProcessEnv = process.env
): Promise<PublicAiProviderSettings> {
  const provider = await resolveAiProviderSetting(client, env) ?? 'codex';
  const openai = await readProviderConfig(client, OPENAI_SETTING_KEY, defaultOpenAIConfig(env), env);
  const gemini = await readProviderConfig(client, GEMINI_SETTING_KEY, defaultGeminiConfig(env), env);
  return {
    provider,
    openai: toPublicConfig(openai),
    gemini: toPublicConfig(gemini)
  };
}

export async function saveAiProviderSetting(
  client: IntraQPrismaClient | null,
  provider: SelfHostedAiProvider
): Promise<SelfHostedAiProvider> {
  if (!client) return provider;
  await upsertSetting(client, PROVIDER_SETTING_KEY, provider, 'Selected local AI provider.');
  return provider;
}

export async function saveOpenAIProviderConfig(
  client: IntraQPrismaClient | null,
  input: Partial<StoredProviderConfig>,
  env: NodeJS.ProcessEnv = process.env
): Promise<PublicProviderConfig> {
  return toPublicConfig(await saveProviderConfig(client, OPENAI_SETTING_KEY, defaultOpenAIConfig(env), input, env));
}

export async function saveGeminiProviderConfig(
  client: IntraQPrismaClient | null,
  input: Partial<StoredProviderConfig>,
  env: NodeJS.ProcessEnv = process.env
): Promise<PublicProviderConfig> {
  return toPublicConfig(await saveProviderConfig(client, GEMINI_SETTING_KEY, defaultGeminiConfig(env), input, env));
}

export async function deleteProviderConfig(
  client: IntraQPrismaClient | null,
  provider: 'gemini' | 'openai'
): Promise<void> {
  if (!client) return;
  await client.systemSetting.deleteMany({
    where: { key: provider === 'openai' ? OPENAI_SETTING_KEY : GEMINI_SETTING_KEY }
  });
}

export async function resolveAiProviderSetting(
  client: IntraQPrismaClient | null,
  env: NodeJS.ProcessEnv = process.env
): Promise<RuntimeProvider | null> {
  const envProvider = normalizeProvider(
    env.AI_AGENT_PROVIDER
      ?? env.INTRAQ_AI_PROVIDER
      ?? env.AGENT_PROVIDER
      ?? ''
  );
  if (!client) return envProvider;
  const row = await client.systemSetting.findUnique({ where: { key: PROVIDER_SETTING_KEY } });
  return normalizeProvider(row?.value) ?? envProvider;
}

export async function resolveOpenAIProviderConfig(
  client: IntraQPrismaClient | null,
  env: NodeJS.ProcessEnv = process.env
): Promise<RuntimeProviderConfig | null> {
  if (!client) return null;
  const config = await readProviderConfig(client, OPENAI_SETTING_KEY, defaultOpenAIConfig(env), env);
  const apiKey = config.apiKey?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: normalizeOpenAIBaseUrl(config.baseUrl),
    model: config.model.trim() || DEFAULT_OPENAI_AGENT_MODEL
  };
}

export async function resolveGeminiProviderConfig(
  client: IntraQPrismaClient | null,
  env: NodeJS.ProcessEnv = process.env
): Promise<RuntimeProviderConfig | null> {
  if (!client) return null;
  const config = await readProviderConfig(client, GEMINI_SETTING_KEY, defaultGeminiConfig(env), env);
  const apiKey = config.apiKey?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: normalizeGeminiBaseUrl(config.baseUrl),
    model: config.model.trim() || DEFAULT_GEMINI_AGENT_MODEL
  };
}

export function normalizeProvider(value: unknown): RuntimeProvider | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'codex') return 'codex';
  if (normalized === 'openai' || normalized === 'custom_openai' || normalized === 'custom-openai') return 'openai';
  if (normalized === 'gemini' || normalized === 'google_gemini' || normalized === 'google-gemini' || normalized === 'gemma') return 'gemini';
  return null;
}

async function saveProviderConfig(
  client: IntraQPrismaClient | null,
  key: string,
  defaults: StoredProviderConfig,
  input: Partial<StoredProviderConfig>,
  env: NodeJS.ProcessEnv
): Promise<StoredProviderConfig> {
  const current = client ? await readProviderConfig(client, key, defaults, env) : defaults;
  const next: StoredProviderConfig = {
    apiKey: typeof input.apiKey === 'string' && input.apiKey.trim() ? input.apiKey.trim() : current.apiKey,
    baseUrl: typeof input.baseUrl === 'string' && input.baseUrl.trim() ? input.baseUrl.trim() : current.baseUrl,
    model: typeof input.model === 'string' && input.model.trim() ? input.model.trim() : current.model
  };
  if (!client) return next;
  await upsertSetting(client, key, JSON.stringify({
    ...next,
    apiKey: next.apiKey ? encodeSecret(next.apiKey, env) : ''
  }), key === OPENAI_SETTING_KEY ? 'OpenAI provider settings.' : 'Gemini provider settings.');
  return next;
}

async function readProviderConfig(
  client: IntraQPrismaClient | null,
  key: string,
  defaults: StoredProviderConfig,
  env: NodeJS.ProcessEnv
): Promise<StoredProviderConfig> {
  if (!client) return defaults;
  const row = await client.systemSetting.findUnique({ where: { key } });
  if (!row) return defaults;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (!isRecord(parsed)) return defaults;
    const rawKey = stringValue(parsed.apiKey);
    return {
      apiKey: rawKey ? decodeSecret(rawKey, env) : defaults.apiKey,
      baseUrl: stringValue(parsed.baseUrl) || defaults.baseUrl,
      model: stringValue(parsed.model) || defaults.model
    };
  } catch {
    return defaults;
  }
}

async function upsertSetting(
  client: IntraQPrismaClient,
  key: string,
  value: string,
  description: string
): Promise<void> {
  await client.systemSetting.upsert({
    where: { key },
    update: { value, category: AI_CATEGORY, description },
    create: { key, value, category: AI_CATEGORY, description }
  });
}

function defaultOpenAIConfig(env: NodeJS.ProcessEnv): StoredProviderConfig {
  return {
    apiKey: env.OPENAI_API_KEY?.trim() || '',
    baseUrl: normalizeOpenAIBaseUrl(env.OPENAI_API_ENDPOINT?.trim() || DEFAULT_OPENAI_BASE_URL),
    model: env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_AGENT_MODEL
  };
}

function defaultGeminiConfig(env: NodeJS.ProcessEnv): StoredProviderConfig {
  return {
    apiKey: env.GEMINI_API_KEY?.trim() || env.GOOGLE_GEMINI_API_KEY?.trim() || '',
    baseUrl: normalizeGeminiBaseUrl(env.GEMINI_API_ENDPOINT?.trim() || DEFAULT_GEMINI_BASE_URL),
    model: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_AGENT_MODEL
  };
}

function normalizeOpenAIBaseUrl(endpoint: string): string {
  return endpoint
    .trim()
    .replace(/\/chat\/completions\/?$/, '')
    .replace(/\/responses\/?$/, '')
    .replace(/\/models\/?$/, '')
    .replace(/\/$/, '') || DEFAULT_OPENAI_BASE_URL;
}

function normalizeGeminiBaseUrl(endpoint: string): string {
  const normalized = endpoint
    .trim()
    .replace(/\/models\/[^/]+:generateContent\/?$/, '')
    .replace(/\/models\/?$/, '')
    .replace(/\/$/, '');
  if (!normalized) return DEFAULT_GEMINI_BASE_URL;
  return normalized.includes('://') ? normalized : `https://${normalized}`;
}

function toPublicConfig(config: StoredProviderConfig): PublicProviderConfig {
  return {
    apiKeyConfigured: Boolean(config.apiKey?.trim()),
    baseUrl: config.baseUrl,
    model: config.model
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
