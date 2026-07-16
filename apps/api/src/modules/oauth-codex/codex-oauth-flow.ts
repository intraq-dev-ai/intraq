import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import https from 'node:https';
import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULT_AUTH_URL = 'https://auth.openai.com/oauth/authorize';
const DEFAULT_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const DEFAULT_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const DEFAULT_SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke';
const STATE_TTL_MS = 10 * 60 * 1000;
const CHATGPT_ACCOUNT_ID_CLAIM = 'https://api.openai.com/auth.chatgpt_account_id';

export class CodexOAuthFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodexOAuthFlowError';
  }
}

export interface CodexOAuthConfig {
  authUrl: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  tokenUrl: string;
}

export interface CodexOAuthStartResult {
  authorizationUrl: string;
  expiresInSeconds: number;
  redirectUri: string;
  state: string;
}

export interface CodexOAuthCallback {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  state: string;
  tenantId: string;
}

export interface CodexOAuthTokenRequest {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  tokenUrl: string;
}

export interface CodexOAuthTokenResponse {
  access_token?: unknown;
  account_id?: unknown;
  error?: unknown;
  error_description?: unknown;
  id_token?: unknown;
  refresh_token?: unknown;
}

export interface CodexOAuthAuthPayload {
  OPENAI_API_KEY: null;
  auth_mode: 'chatgpt';
  last_refresh: string;
  tokens: {
    access_token: string;
    account_id: string | null;
    id_token: string | null;
    refresh_token: string | null;
  };
}

export type CodexOAuthTokenExchange = (request: CodexOAuthTokenRequest) => Promise<CodexOAuthTokenResponse>;

interface OAuthStateRecord {
  codeVerifier: string;
  expiresAtMs: number;
  redirectUri: string;
  tenantId: string;
}

export class CodexOAuthStateStore {
  private readonly states = new Map<string, OAuthStateRecord>();

  start(config: CodexOAuthConfig, tenantId: string, now = new Date()): CodexOAuthStartResult {
    ensureOAuthConfig(config);
    const resolvedTenantId = tenantId.trim();
    if (!resolvedTenantId) throw new CodexOAuthFlowError('tenantId is required');
    this.prune(now);

    const state = randomBase64Url(24);
    const codeVerifier = randomBase64Url(32);
    const expiresAtMs = now.getTime() + STATE_TTL_MS;
    this.states.set(state, {
      codeVerifier,
      expiresAtMs,
      redirectUri: config.redirectUri,
      tenantId: resolvedTenantId
    });

    return {
      authorizationUrl: buildAuthorizationUrl(config, state, codeVerifier),
      expiresInSeconds: Math.floor(STATE_TTL_MS / 1000),
      redirectUri: config.redirectUri,
      state
    };
  }

  consumeCallback(callbackUrl: string, now = new Date()): CodexOAuthCallback {
    this.prune(now);
    const parsed = parseCallbackUrl(callbackUrl);
    const oauthError = nonEmptySearchParam(parsed, 'error');
    if (oauthError) {
      throw new CodexOAuthFlowError(nonEmptySearchParam(parsed, 'error_description') || oauthError);
    }

    const code = nonEmptySearchParam(parsed, 'code');
    const state = nonEmptySearchParam(parsed, 'state');
    if (!code || !state) throw new CodexOAuthFlowError('Codex callback URL must include code and state.');

    const record = this.states.get(state);
    if (!record) {
      throw new CodexOAuthFlowError('Codex OAuth state expired or was not started from this server.');
    }
    this.states.delete(state);
    return {
      code,
      codeVerifier: record.codeVerifier,
      redirectUri: record.redirectUri,
      state,
      tenantId: record.tenantId
    };
  }

  prune(now = new Date()): void {
    for (const [state, record] of this.states.entries()) {
      if (record.expiresAtMs <= now.getTime()) this.states.delete(state);
    }
  }
}

export function codexOAuthConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CodexOAuthConfig {
  return {
    authUrl: firstNonEmpty(env.OPENAI_OAUTH_AUTH_URL) ?? DEFAULT_AUTH_URL,
    clientId: firstNonEmpty(env.OPENAI_OAUTH_CLIENT_ID) ?? firstNonEmpty(env.CODEX_OAUTH_CLIENT_ID) ?? '',
    redirectUri: firstNonEmpty(env.OPENAI_OAUTH_REDIRECT_URI) ?? DEFAULT_REDIRECT_URI,
    scope: firstNonEmpty(env.OPENAI_OAUTH_SCOPE) ?? DEFAULT_SCOPE,
    tokenUrl: firstNonEmpty(env.OPENAI_OAUTH_TOKEN_URL) ?? DEFAULT_TOKEN_URL
  };
}

export function codexAuthPathFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const explicitPath = firstNonEmpty(env.CODEX_AUTH_PATH);
  if (explicitPath) return explicitPath;
  const codexHome = firstNonEmpty(env.CODEX_HOME);
  if (codexHome) return path.join(codexHome, 'auth.json');
  return path.join(homedir(), '.codex', 'auth.json');
}

export async function exchangeCodexOAuthToken(request: CodexOAuthTokenRequest): Promise<CodexOAuthTokenResponse> {
  const tokenUrl = new URL(request.tokenUrl);
  if (tokenUrl.protocol !== 'https:') throw new CodexOAuthFlowError('Codex OAuth token URL must use HTTPS.');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: request.code,
    redirect_uri: request.redirectUri,
    client_id: request.clientId,
    code_verifier: request.codeVerifier
  }).toString();
  const raw = await postForm(tokenUrl, body);
  const parsed = parseTokenResponse(raw);
  if (parsed.error) {
    throw new CodexOAuthFlowError(
      stringValue(parsed.error_description) || stringValue(parsed.error) || 'Codex OAuth token exchange failed.'
    );
  }
  return parsed;
}

export function buildCodexAuthPayloadFromTokens(
  tokens: CodexOAuthTokenResponse,
  now = new Date()
): CodexOAuthAuthPayload {
  const accessToken = stringValue(tokens.access_token);
  if (!accessToken) throw new CodexOAuthFlowError('Codex OAuth token response did not include access_token.');
  const accountId = stringValue(tokens.account_id) || extractChatGptAccountId(accessToken);
  return {
    OPENAI_API_KEY: null,
    auth_mode: 'chatgpt',
    last_refresh: now.toISOString(),
    tokens: {
      access_token: accessToken,
      account_id: accountId || null,
      id_token: stringValue(tokens.id_token) || null,
      refresh_token: stringValue(tokens.refresh_token) || null
    }
  };
}

export async function writeCodexAuthPayload(authPath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(authPath), { recursive: true });
  await fs.writeFile(authPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function parseCodexAuthJsonInput(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new CodexOAuthFlowError('Codex auth input must be valid JSON from ~/.codex/auth.json.');
  }
}

export function isUsableCodexAuthPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const apiKey = typeof payload.OPENAI_API_KEY === 'string' ? payload.OPENAI_API_KEY.trim() : '';
  const tokens = isRecord(payload.tokens) ? payload.tokens : null;
  const accessToken = typeof tokens?.access_token === 'string' ? tokens.access_token.trim() : '';
  return Boolean(apiKey || accessToken);
}

export function looksLikeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractChatGptAccountId(accessToken: string): string | null {
  const [, payload] = accessToken.split('.');
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(normalizeBase64Url(payload), 'base64').toString('utf8')) as Record<string, unknown>;
    return stringValue(parsed[CHATGPT_ACCOUNT_ID_CLAIM]) || null;
  } catch {
    return null;
  }
}

function buildAuthorizationUrl(config: CodexOAuthConfig, state: string, codeVerifier: string): string {
  const url = new URL(config.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', pkceChallenge(codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('id_token_add_organizations', 'true');
  url.searchParams.set('codex_cli_simplified_flow', 'true');
  url.searchParams.set('originator', 'codex-tui');
  return url.toString();
}

function ensureOAuthConfig(config: CodexOAuthConfig): void {
  if (!config.clientId.trim()) throw new CodexOAuthFlowError('OPENAI_OAUTH_CLIENT_ID is required to start Codex OAuth login.');
  new URL(config.authUrl);
  new URL(config.tokenUrl);
  new URL(config.redirectUri);
}

function pkceChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

function randomBase64Url(byteLength: number): string {
  return randomBytes(byteLength).toString('base64url');
}

function parseCallbackUrl(callbackUrl: string): URL {
  try {
    return new URL(callbackUrl.trim());
  } catch {
    throw new CodexOAuthFlowError('Codex callback URL is not a valid URL.');
  }
}

function nonEmptySearchParam(url: URL, key: string): string {
  return url.searchParams.get(key)?.trim() ?? '';
}

function firstNonEmpty(value: string | undefined): string | null {
  const text = value?.trim() ?? '';
  return text || null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBase64Url(value: string): string {
  return value.replace(/-/g, '+').replace(/_/g, '/');
}

function parseTokenResponse(raw: string): CodexOAuthTokenResponse {
  try {
    return JSON.parse(raw) as CodexOAuthTokenResponse;
  } catch {
    throw new CodexOAuthFlowError('Codex OAuth token endpoint returned invalid JSON.');
  }
}

function postForm(tokenUrl: URL, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: tokenUrl.hostname,
      method: 'POST',
      path: `${tokenUrl.pathname}${tokenUrl.search}`,
      port: tokenUrl.port || undefined,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
          return;
        }
        reject(new CodexOAuthFlowError(`Codex OAuth token exchange failed with HTTP ${res.statusCode ?? 'unknown'}.`));
      });
    });
    req.on('error', reject);
    req.setTimeout(15_000, () => {
      req.destroy(new CodexOAuthFlowError('Codex OAuth token exchange timed out.'));
    });
    req.write(body);
    req.end();
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
