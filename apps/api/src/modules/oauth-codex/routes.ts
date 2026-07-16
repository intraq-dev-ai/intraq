import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendOk } from '../../http.js';
import { readCodexOAuthStatus } from '../codex-agent/codex-oauth.js';
import {
  persistCodexOAuthPayload,
  restoreCodexOAuthPayloadFromDb,
  resolveCodexModelSetting,
  saveCodexModelSetting
} from './codex-oauth-persistence.js';
import {
  buildCodexAuthPayloadFromTokens,
  CodexOAuthFlowError,
  codexAuthPathFromEnv,
  codexOAuthConfigFromEnv,
  CodexOAuthStateStore,
  exchangeCodexOAuthToken,
  isUsableCodexAuthPayload,
  looksLikeUrl,
  parseCodexAuthJsonInput,
  writeCodexAuthPayload,
  type CodexOAuthTokenExchange
} from './codex-oauth-flow.js';

const CODEX_PURPOSES = ['analysis', 'builder', 'sql_ai'] as const;
const DEFAULT_MODEL = 'gpt-5.5';
const FIXED_NOW = '2026-05-02T00:00:00.000Z';

type CodexKeyType = 'oauth';

interface CodexConnection {
  connected: boolean;
  keyType: CodexKeyType;
  model: string;
  updatedAt: string;
}

interface OAuthCodexCompatibilityRoutesOptions {
  authPath?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  prismaClient?: IntraQPrismaClient | null;
  stateStore?: CodexOAuthStateStore;
  tokenExchange?: CodexOAuthTokenExchange;
}

export class OAuthCodexCompatibilityRoutes {
  private readonly connections = new Map<string, CodexConnection>();

  constructor(private readonly options: OAuthCodexCompatibilityRoutesOptions = {}) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/oauth/codex/status') {
      await this.status(res, url);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/oauth/codex/start') {
      this.start(res, url);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/oauth/codex/callback') {
      await this.callback(res, url);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/oauth/codex/api-key') {
      await this.saveApiKey(req, res);
      return true;
    }
    if (req.method === 'PATCH' && url.pathname === '/api/oauth/codex/model') {
      await this.updateModel(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/oauth/codex/process-url') {
      await this.processUrl(req, res);
      return true;
    }
    if (req.method === 'DELETE' && url.pathname === '/api/oauth/codex/disconnect') {
      await this.disconnect(req, res);
      return true;
    }
    return false;
  }

  private async status(res: ServerResponse, url: URL): Promise<void> {
    const tenantId = tenantIdFromQuery(url);
    if (!tenantId) {
      sendBadRequest(res, 'tenantId is required');
      return;
    }

    const savedModel = await resolveCodexModelSetting(
      this.options.prismaClient ?? null,
      this.options.env ? { env: this.options.env } : {}
    );
    await restoreCodexOAuthPayloadFromDb(this.options.prismaClient ?? null, {
      authPath: this.authPath,
      tenantId,
      ...(this.options.env ? { env: this.options.env } : {})
    });
    sendOk(res, statusFor(
      this.connections.get(tenantId),
      await readCodexOAuthStatus(this.authPath),
      Boolean(this.oauthConfig().clientId.trim()),
      savedModel
    ));
  }

  private start(res: ServerResponse, url: URL): void {
    const tenantId = tenantIdFromQuery(url);
    if (!tenantId) {
      sendBadRequest(res, 'tenantId is required');
      return;
    }

    try {
      sendOk(res, this.stateStore.start(this.oauthConfig(), tenantId, this.now()));
    } catch (error) {
      sendBadRequest(res, safeOAuthErrorMessage(error));
    }
  }

  private async callback(res: ServerResponse, url: URL): Promise<void> {
    await this.completeOAuth(res, url.toString());
  }

  private async saveApiKey(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBodyObject(req, res);
    if (!body) return;

    if (!isNonEmptyString(body.tenantId)) {
      sendBadRequest(res, 'tenantId is required');
      return;
    }

    sendBadRequest(res, 'Codex API keys are disabled. Run `codex login` and use Codex OAuth credentials.');
  }

  private async updateModel(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBodyObject(req, res);
    if (!body) return;

    if (!isNonEmptyString(body.tenantId) || !isNonEmptyString(body.model)) {
      sendBadRequest(res, 'tenantId and model are required');
      return;
    }

    const tenantId = body.tenantId.trim();
    const model = body.model.trim();
    const connection = this.connections.get(tenantId);
    this.connections.set(tenantId, {
      connected: connection?.connected ?? true,
      keyType: 'oauth',
      model,
      updatedAt: FIXED_NOW
    });
    await saveCodexModelSetting(this.options.prismaClient ?? null, model);
    sendOk(res, { tenantId, model, updated: true });
  }

  private async processUrl(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBodyObject(req, res);
    if (!body) return;

    if (!isNonEmptyString(body.callbackUrl)) {
      sendBadRequest(res, 'callbackUrl is required');
      return;
    }

    const input = body.callbackUrl.trim();
    if (!looksLikeUrl(input)) {
      await this.importCodexAuthJson(res, input, isNonEmptyString(body.tenantId) ? body.tenantId.trim() : '');
      return;
    }

    await this.completeOAuth(res, input);
  }

  private async disconnect(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBodyObject(req, res);
    if (!body) return;

    if (!isNonEmptyString(body.tenantId)) {
      sendBadRequest(res, 'tenantId is required');
      return;
    }

    const tenantId = body.tenantId.trim();
    const connection = this.connections.get(tenantId);
    if (connection) {
      this.connections.set(tenantId, { ...connection, connected: false, updatedAt: FIXED_NOW });
    }
    sendOk(res, { tenantId, disconnected: true });
  }

  private async completeOAuth(res: ServerResponse, callbackUrl: string): Promise<void> {
    try {
      const callback = this.stateStore.consumeCallback(callbackUrl, this.now());
      const tokens = await (this.options.tokenExchange ?? exchangeCodexOAuthToken)({
        tokenUrl: this.oauthConfig().tokenUrl,
        clientId: this.oauthConfig().clientId,
        redirectUri: callback.redirectUri,
        code: callback.code,
        codeVerifier: callback.codeVerifier
      });
      const payload = buildCodexAuthPayloadFromTokens(tokens, this.now());
      await this.writeAndPersistCodexAuth(callback.tenantId, payload);
      const connection = this.connectTenant(callback.tenantId);
      sendOk(res, {
        tenantId: callback.tenantId,
        connected: true,
        keyType: connection.keyType,
        model: connection.model
      });
    } catch (error) {
      sendBadRequest(res, safeOAuthErrorMessage(error));
    }
  }

  private async importCodexAuthJson(res: ServerResponse, input: string, tenantId: string): Promise<void> {
    try {
      const payload = parseCodexAuthJsonInput(input);
      if (!isUsableCodexAuthPayload(payload)) {
        sendBadRequest(res, 'Codex auth payload must include OPENAI_API_KEY or tokens.access_token.');
        return;
      }
      await this.writeAndPersistCodexAuth(tenantId || null, payload);
      const connection = tenantId ? this.connectTenant(tenantId) : null;
      sendOk(res, {
        tenantId,
        connected: true,
        keyType: 'oauth',
        model: connection?.model ?? DEFAULT_MODEL
      });
    } catch (error) {
      sendBadRequest(res, safeOAuthErrorMessage(error));
    }
  }

  private connectTenant(tenantId: string): CodexConnection {
    const existing = this.connections.get(tenantId);
    const connection: CodexConnection = {
      connected: true,
      keyType: 'oauth',
      model: existing?.model ?? DEFAULT_MODEL,
      updatedAt: FIXED_NOW
    };
    this.connections.set(tenantId, connection);
    return connection;
  }

  private async writeAndPersistCodexAuth(tenantId: string | null, payload: unknown): Promise<void> {
    await writeCodexAuthPayload(this.authPath, payload);
    await persistCodexOAuthPayload(this.options.prismaClient ?? null, payload, {
      model: this.connections.get(tenantId ?? '')?.model ?? DEFAULT_MODEL,
      tenantId,
      ...(this.options.env ? { env: this.options.env } : {})
    });
  }

  private get authPath(): string {
    return this.options.authPath ?? codexAuthPathFromEnv(this.options.env);
  }

  private get stateStore(): CodexOAuthStateStore {
    return this.options.stateStore ?? sharedStateStore;
  }

  private oauthConfig(): ReturnType<typeof codexOAuthConfigFromEnv> {
    return codexOAuthConfigFromEnv(this.options.env);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

export function createOAuthCodexCompatibilityRoutes(
  prismaClient?: IntraQPrismaClient | null
): OAuthCodexCompatibilityRoutes {
  return new OAuthCodexCompatibilityRoutes(prismaClient === undefined ? {} : { prismaClient });
}

const sharedStateStore = new CodexOAuthStateStore();

async function readBodyObject(req: IncomingMessage, res: ServerResponse): Promise<Record<string, unknown> | null> {
  const body = await readJsonBody(req);
  if (!isRecord(body)) {
    sendBadRequest(res, 'Request body must be a JSON object.');
    return null;
  }
  return body;
}

function statusFor(
  connection: CodexConnection | undefined,
  oauthStatus: Awaited<ReturnType<typeof readCodexOAuthStatus>>,
  clientIdConfigured: boolean,
  savedModel?: string | null
): Record<string, unknown> {
  const model = connection?.model ?? savedModel ?? DEFAULT_MODEL;
  if (!oauthStatus.configured) {
    return {
      connected: false,
      keyType: null,
      updatedAt: null,
      model,
      purposes: [],
      clientIdConfigured,
      authMode: oauthStatus.authMode,
      hasAccountId: oauthStatus.hasAccountId,
      oauthConfigured: false,
      reason: oauthStatus.reason
    };
  }

  return {
    connected: true,
    keyType: 'oauth',
    updatedAt: connection?.updatedAt ?? FIXED_NOW,
    model,
    purposes: [...CODEX_PURPOSES],
    clientIdConfigured,
    authMode: oauthStatus.authMode,
    hasAccountId: oauthStatus.hasAccountId,
    oauthConfigured: true,
    reason: oauthStatus.reason
  };
}

function tenantIdFromQuery(url: URL): string {
  return url.searchParams.get('tenantId')?.trim() ?? '';
}

function safeOAuthErrorMessage(error: unknown): string {
  if (error instanceof CodexOAuthFlowError || error instanceof Error) return error.message;
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
