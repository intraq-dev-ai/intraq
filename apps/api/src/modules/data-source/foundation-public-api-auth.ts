import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { sendJson } from '../../http.js';
import { createAccessToken, readBearerToken, verifyAccessToken } from '../auth-setup/auth-tokens.js';
import type { ApiGroupRecord, PublicApiClientIdentity } from './api-group-types.js';
import type { DataSourceFoundationRouteContext } from './foundation-route-context.js';
import {
  isNonEmptyString,
  isRecord,
  readHeader,
  readString,
  sendSensitiveJson
} from './foundation-route-utils.js';
import type { DataSourceRecord } from './foundation-store.js';

export const PUBLIC_API_CLIENT_ROLE = 'PUBLIC_API_CLIENT';
export const PUBLIC_API_TOKEN_TTL_MS = 60 * 60 * 1000;
export const PUBLIC_API_WORKFLOW_SCOPE = 'api-workflows:read';

type PublicApiClientResult =
  | { ok: true; clientId: string }
  | { ok: false; statusCode: 401 | 403 | 503; error: string };

export async function issuePublicApiWorkflowToken(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const request = await readClientCredentialsTokenRequest(req);
  if (!request.ok) {
    sendJson(res, request.statusCode, fail(request.error));
    return;
  }
  const client = await readPublicApiClientCredentials(context, request.clientId, request.clientSecret);
  if (!client.ok) {
    sendJson(res, client.statusCode, fail(client.error));
    return;
  }
  const expiresIn = Math.floor(PUBLIC_API_TOKEN_TTL_MS / 1000);
  const scopes = readScopeList(request.scope || PUBLIC_API_WORKFLOW_SCOPE);
  const accessToken = createAccessToken({
    ...(client.contextUserId ? { contextUserId: client.contextUserId } : {}),
    role: PUBLIC_API_CLIENT_ROLE,
    scopes,
    ...(client.tenantId ? { tenantId: client.tenantId } : {}),
    ttlMs: PUBLIC_API_TOKEN_TTL_MS,
    userId: client.clientId
  });
  sendSensitiveJson(res, 200, {
    success: true,
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: scopes.join(' '),
    data: {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      scope: scopes.join(' ')
    }
  });
}

export async function readPublicApiBearerClient(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  source: DataSourceRecord
): Promise<PublicApiClientResult> {
  const payload = verifyAccessToken(readBearerToken(req.headers.authorization));
  if (!payload || payload.role !== PUBLIC_API_CLIENT_ROLE) {
    return { ok: false, statusCode: 401, error: 'Public API bearer token is required' };
  }
  return readPublicApiClient(context, payload.sub, source);
}

export async function readPublicApiBearerClientForGroup(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  group: ApiGroupRecord
): Promise<PublicApiClientResult> {
  const payload = verifyAccessToken(readBearerToken(req.headers.authorization));
  if (!payload || payload.role !== PUBLIC_API_CLIENT_ROLE) {
    return { ok: false, statusCode: 401, error: 'Public API bearer token is required' };
  }
  return readPublicApiClientForGroup(context, payload.sub, group);
}

async function readPublicApiClient(
  context: DataSourceFoundationRouteContext,
  clientId: string,
  source: DataSourceRecord
): Promise<PublicApiClientResult> {
  void context;
  void source;
  const configuredClientId = process.env.PUBLIC_API_CLIENT_ID;
  if (!isNonEmptyString(configuredClientId)) {
    return { ok: false, statusCode: 503, error: 'Public API client credentials are not configured' };
  }
  if (clientId !== configuredClientId.trim()) {
    return { ok: false, statusCode: 401, error: 'Invalid public API access token' };
  }
  return { ok: true, clientId };
}

async function readPublicApiClientForGroup(
  context: DataSourceFoundationRouteContext,
  clientId: string,
  group: ApiGroupRecord
): Promise<PublicApiClientResult> {
  void context;
  const inMemoryGrant = (group.clientGrants ?? []).find(grant => grant.clientId === clientId);
  if (inMemoryGrant) return { ok: true, clientId };

  const configuredClientId = process.env.PUBLIC_API_CLIENT_ID;
  if (!isNonEmptyString(configuredClientId)) {
    return { ok: false, statusCode: 503, error: 'Public API client credentials are not configured' };
  }
  if (clientId !== configuredClientId.trim()) {
    return { ok: false, statusCode: 401, error: 'Invalid public API access token' };
  }
  return { ok: true, clientId };
}

async function readPublicApiClientCredentials(
  context: DataSourceFoundationRouteContext,
  clientId: string,
  clientSecret: string
): Promise<{ ok: true } & PublicApiClientIdentity | { ok: false; statusCode: 401 | 403 | 503; error: string }> {
  void context;

  const configuredClientId = process.env.PUBLIC_API_CLIENT_ID;
  const configuredClientSecret = process.env.PUBLIC_API_CLIENT_SECRET;
  if (!isNonEmptyString(configuredClientId) || !isNonEmptyString(configuredClientSecret)) {
    return { ok: false, statusCode: 503, error: 'Public API client credentials are not configured' };
  }
  if (clientId !== configuredClientId.trim() || clientSecret !== configuredClientSecret.trim()) {
    return { ok: false, statusCode: 401, error: 'Invalid public API client credentials' };
  }
  return {
    ok: true,
    clientId,
    ...configuredPublicApiClientIdentity()
  };
}

async function readClientCredentialsTokenRequest(
  req: IncomingMessage
): Promise<{ ok: true; clientId: string; clientSecret: string; scope: string } | { ok: false; statusCode: 400 | 401; error: string }> {
  const contentType = readHeader(req, 'content-type')?.toLowerCase() ?? '';
  const rawBody = await readRequestBodyText(req);
  const body = contentType.includes('application/x-www-form-urlencoded')
    ? Object.fromEntries(new URLSearchParams(rawBody).entries())
    : parseJsonObject(rawBody);
  const basicCredentials = readBasicCredentials(req.headers.authorization);
  const grantType = readString(body.grant_type ?? body.grantType);
  if (grantType !== 'client_credentials') {
    return { ok: false, statusCode: 400, error: 'grant_type must be client_credentials' };
  }

  const clientId = basicCredentials?.clientId
    ?? readString(body.client_id ?? body.clientId)
    ?? readHeader(req, 'x-intraq-client-id')
    ?? readHeader(req, 'x-api-client-id')
    ?? readHeader(req, 'x-embed-client-id');
  const clientSecret = basicCredentials?.clientSecret
    ?? readString(body.client_secret ?? body.clientSecret)
    ?? readHeader(req, 'x-intraq-client-secret')
    ?? readHeader(req, 'x-api-client-secret')
    ?? readHeader(req, 'x-embed-client-secret');

  if (!clientId || !clientSecret) {
    return { ok: false, statusCode: 401, error: 'Client credentials are required' };
  }
  return {
    ok: true,
    clientId,
    clientSecret,
    scope: readString(body.scope) ?? PUBLIC_API_WORKFLOW_SCOPE
  };
}

function configuredPublicApiClientIdentity(): Pick<PublicApiClientIdentity, 'contextUserId' | 'tenantId'> {
  const tenantId = firstNonEmpty(
    process.env.PUBLIC_API_CLIENT_TENANT_ID,
    process.env.INTRAQ_TENANT_ID,
    process.env.TENANT_ID
  );
  const contextUserId = firstNonEmpty(process.env.PUBLIC_API_CLIENT_USER_ID);
  return {
    ...(contextUserId ? { contextUserId } : {}),
    ...(tenantId ? { tenantId } : {})
  };
}

function readScopeList(scope: string): string[] {
  const scopes = scope.split(/[\s,]+/).map(item => item.trim()).filter(Boolean);
  return scopes.length > 0 ? [...new Set(scopes)] : [PUBLIC_API_WORKFLOW_SCOPE];
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function readBasicCredentials(header: string | string[] | undefined): { clientId: string; clientSecret: string } | null {
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Basic\s+(.+)$/i.exec(value?.trim() ?? '');
  if (!match?.[1]) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex <= 0) return null;
    const clientId = decoded.slice(0, separatorIndex).trim();
    const clientSecret = decoded.slice(separatorIndex + 1).trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  } catch {
    return null;
  }
}

async function readRequestBodyText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function parseJsonObject(rawBody: string): Record<string, unknown> {
  if (!rawBody.trim()) return {};
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
