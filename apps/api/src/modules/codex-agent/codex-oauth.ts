import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export interface CodexOAuthCredentials {
  accessToken: string;
  authMode: string | null;
  authPath: string;
  accountId?: string;
}

export interface CodexOAuthStatus {
  configured: boolean;
  authMode: string | null;
  authPath: string;
  hasAccessToken: boolean;
  hasAccountId: boolean;
  apiKeyPresent: boolean;
  reason: CodexOAuthStatusReason;
}

export type CodexOAuthStatusReason =
  | 'codex_oauth_ready'
  | 'api_key_not_allowed'
  | 'invalid_auth_json'
  | 'missing_auth_file'
  | 'oauth_token_missing';

interface CodexAuthJson {
  auth_mode?: unknown;
  OPENAI_API_KEY?: unknown;
  tokens?: {
    access_token?: unknown;
    account_id?: unknown;
  } | null;
}

const DEFAULT_CODEX_AUTH_PATH = path.join(homedir(), '.codex', 'auth.json');

export async function resolveCodexOAuth(): Promise<CodexOAuthCredentials | null> {
  const status = await readCodexOAuthStatus();
  if (!status.configured) return null;
  const auth = await readAuthJson(status.authPath);
  if (!auth.ok || !auth.value) return null;
  const accessToken = asString(auth.value.tokens?.access_token);
  if (!accessToken) return null;
  const accountId = asString(auth.value.tokens?.account_id);
  return {
    accessToken,
    authMode: status.authMode,
    authPath: status.authPath,
    ...(accountId ? { accountId } : {})
  };
}

export async function readCodexOAuthStatus(authPath = resolveAuthPath()): Promise<CodexOAuthStatus> {
  const auth = await readAuthJson(authPath);
  if (!auth.ok) {
    return baseStatus(authPath, 'invalid_auth_json');
  }
  if (!auth.value) {
    return baseStatus(authPath, 'missing_auth_file');
  }

  const authMode = asString(auth.value.auth_mode);
  const hasAccessToken = Boolean(asString(auth.value.tokens?.access_token));
  const hasAccountId = Boolean(asString(auth.value.tokens?.account_id));
  const apiKeyPresent = Boolean(asString(auth.value.OPENAI_API_KEY));
  if (hasAccessToken && authMode !== 'apiKey') {
    return {
      configured: true,
      authMode,
      authPath,
      hasAccessToken,
      hasAccountId,
      apiKeyPresent,
      reason: 'codex_oauth_ready'
    };
  }
  return {
    configured: false,
    authMode,
    authPath,
    hasAccessToken,
    hasAccountId,
    apiKeyPresent,
    reason: apiKeyPresent ? 'api_key_not_allowed' : 'oauth_token_missing'
  };
}

function resolveAuthPath(): string {
  const override = process.env.CODEX_AUTH_PATH?.trim();
  if (override) return override;
  const codexHome = process.env.CODEX_HOME?.trim();
  if (codexHome) return path.join(codexHome, 'auth.json');
  return DEFAULT_CODEX_AUTH_PATH;
}

function baseStatus(authPath: string, reason: CodexOAuthStatusReason): CodexOAuthStatus {
  return {
    configured: false,
    authMode: null,
    authPath,
    hasAccessToken: false,
    hasAccountId: false,
    apiKeyPresent: false,
    reason
  };
}

export async function resolveOpenAIApiKey(): Promise<string | null> {
  const authPath = resolveAuthPath();
  const auth = await readAuthJson(authPath);
  if (!auth.ok || !auth.value) return null;
  const key = typeof auth.value.OPENAI_API_KEY === 'string' ? auth.value.OPENAI_API_KEY.trim() : null;
  return key || null;
}

async function readAuthJson(authPath: string): Promise<{ ok: true; value: CodexAuthJson | null } | { ok: false }> {
  try {
    const raw = await readFile(authPath, 'utf8');
    return { ok: true, value: JSON.parse(raw) as CodexAuthJson };
  } catch (error) {
    if (isMissingFileError(error)) return { ok: true, value: null };
    return { ok: false };
  }
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
