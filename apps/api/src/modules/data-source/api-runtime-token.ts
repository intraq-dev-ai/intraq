import type { DataSourceRecord } from './foundation-store.js';
import { fetchJson } from './api-runtime-http.js';
import {
  MANAGED_API_TOKEN_CONFIG_KEY,
  type ApiPageRequest,
  type ApiRequestConfig,
  type ApiRuntimeResult,
  type ManagedApiToken,
  type TokenAuthContext,
  type TokenRequestConfig
} from './api-runtime-types.js';
import {
  appendFormValue,
  appendQueryParam,
  applyAuthValueTemplate,
  applyRecordTemplate,
  applyTemplate,
  applyValueTemplate,
  firstPath,
  firstStringPath,
  hasHeader,
  readPath,
  readRecord,
  readString,
  serializeTokenBody,
  stringifyHeaders
} from './api-runtime-utils.js';

const tokenRequestCache = new Map<string, { expiresAt: number; token: string; tokenType?: string }>();

export function clearApiTokenRequestCacheForTest(): void {
  tokenRequestCache.clear();
}

export function authHeaderPatch(
  config: ApiRequestConfig,
  templateValues: Record<string, unknown>
): ApiRuntimeResult<{ headers: Record<string, string>; queryParams: Record<string, string> }> {
  const authType = config.authType.toLowerCase();
  const value = config.authValue ?? '';
  if (!value || authType === 'none') return { ok: true, data: { headers: {}, queryParams: {} } };
  if (['token_request', 'token', 'oauth2_client_credentials', 'client_credentials'].includes(authType)) {
    return { ok: true, data: { headers: {}, queryParams: {} } };
  }
  const templated = applyAuthValueTemplate(value, templateValues);
  if (!templated.ok) return templated;
  if (authType === 'bearer') return { ok: true, data: { headers: { Authorization: `Bearer ${templated.data}` }, queryParams: {} } };
  if (authType === 'basic') {
    return { ok: true, data: { headers: { Authorization: `Basic ${Buffer.from(templated.data).toString('base64')}` }, queryParams: {} } };
  }
  if (authType === 'api_key_query') {
    return { ok: true, data: { headers: {}, queryParams: { [config.authQueryParam ?? 'api_key']: templated.data } } };
  }
  if (authType === 'api_key' || authType === 'header') {
    return { ok: true, data: { headers: { [config.authHeaderName ?? 'x-api-key']: templated.data }, queryParams: {} } };
  }
  return { ok: true, data: { headers: {}, queryParams: {} } };
}

export async function tokenAuthPatch(
  config: ApiRequestConfig,
  templateValues: Record<string, unknown>,
  tokenContext?: TokenAuthContext
): Promise<ApiRuntimeResult<{ headers: Record<string, string>; queryParams: Record<string, string> }>> {
  if (!config.tokenRequest) return { ok: true, data: { headers: {}, queryParams: {} } };
  const token = await fetchToken(config.tokenRequest, templateValues, tokenContext);
  if (!token.ok) return token;
  const applyAs = config.tokenRequest.applyAs.toLowerCase().replace(/[\s_-]+/g, '');
  if (applyAs === 'none') return { ok: true, data: { headers: {}, queryParams: {} } };
  if (applyAs === 'query' || applyAs === 'queryparam') {
    return { ok: true, data: { headers: {}, queryParams: { [config.tokenRequest.queryParam]: token.data.token } } };
  }
  const headerName = config.tokenRequest.headerName || 'Authorization';
  if (applyAs === 'bearer' || applyAs === 'authorization') {
    const scheme = token.data.tokenType || config.tokenRequest.scheme || 'Bearer';
    return { ok: true, data: { headers: { [headerName]: scheme ? `${scheme} ${token.data.token}` : token.data.token }, queryParams: {} } };
  }
  const value = config.tokenRequest.valuePrefix
    ? `${config.tokenRequest.valuePrefix}${token.data.token}`
    : token.data.token;
  return { ok: true, data: { headers: { [headerName]: value }, queryParams: {} } };
}

async function fetchToken(
  config: TokenRequestConfig,
  templateValues: Record<string, unknown>,
  tokenContext?: TokenAuthContext
): Promise<ApiRuntimeResult<{ token: string; tokenType?: string }>> {
  const request = buildTokenRequest(config, templateValues);
  if (!request.ok) return request;
  const cacheKey = tokenCacheKey(config.cacheKey, request.data);
  const cached = tokenContext?.forceRefresh ? undefined : tokenRequestCache.get(cacheKey);
  if (cached && tokenStillValid(cached.expiresAt)) {
    return {
      ok: true,
      data: {
        token: cached.token,
        ...(cached.tokenType ? { tokenType: cached.tokenType } : {})
      }
    };
  }
  const persisted = tokenContext?.forceRefresh ? null : readManagedApiToken(tokenContext?.source, cacheKey);
  if (persisted) {
    tokenRequestCache.set(cacheKey, {
      expiresAt: persisted.expiresAt,
      token: persisted.token,
      ...(persisted.tokenType ? { tokenType: persisted.tokenType } : {})
    });
    return {
      ok: true,
      data: {
        token: persisted.token,
        ...(persisted.tokenType ? { tokenType: persisted.tokenType } : {})
      }
    };
  }
  const response = await fetchJson(request.data, config.timeoutMs);
  if (!response.ok) return response;
  const token = readTokenValue(response.data, config);
  if (!token) return { ok: false, statusCode: 502, error: 'API token response did not include a token' };
  const tokenType = readTokenType(response.data, config);
  const expiresAt = tokenExpiresAt(response.data, config);
  if (config.cacheTtlSeconds > 0) {
    tokenRequestCache.set(cacheKey, {
      expiresAt,
      token,
      ...(tokenType ? { tokenType } : {})
    });
    const stored = await storeManagedApiToken(tokenContext, {
      cacheKey,
      expiresAt,
      fetchedAt: new Date().toISOString(),
      token,
      ...(tokenType ? { tokenType } : {})
    });
    if (!stored.ok) return stored;
  }
  return {
    ok: true,
    data: {
      token,
      ...(tokenType ? { tokenType } : {})
    }
  };
}

function buildTokenRequest(
  config: TokenRequestConfig,
  templateValues: Record<string, unknown>
): ApiRuntimeResult<ApiPageRequest> {
  let url: URL;
  try {
    const base = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`;
    url = new URL(applyTemplate(config.endpoint, templateValues), base);
  } catch {
    return { ok: false, statusCode: 400, error: 'API token request URL is invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, statusCode: 400, error: 'API token request URL must use http or https' };
  }
  const headers = applyRecordTemplate(config.headers, templateValues);
  if (!headers.ok) return headers;
  const queryParams = applyRecordTemplate(config.queryParams, templateValues);
  if (!queryParams.ok) return queryParams;
  for (const [key, value] of Object.entries(queryParams.data)) appendQueryParam(url, key, value);

  const request: ApiPageRequest = {
    allowBodyOnGet: config.allowBodyOnGet,
    headers: stringifyHeaders(headers.data),
    method: config.method,
    url
  };
  if ((config.method !== 'GET' || config.allowBodyOnGet) && config.body !== undefined && config.body !== null && config.body !== '') {
    const body = applyValueTemplate(config.body, templateValues);
    if (!body.ok) return body;
    const serialized = serializeTokenBody(body.data, config.bodyFormat, request.headers);
    request.body = serialized.body;
    if (serialized.contentType && !hasHeader(request.headers, 'content-type')) {
      request.headers['content-type'] = serialized.contentType;
    }
  }
  return { ok: true, data: request };
}

export function shouldRetryWithFreshToken(
  response: Exclude<ApiRuntimeResult<unknown>, { ok: true }>,
  config: ApiRequestConfig
): boolean {
  return Boolean(config.tokenRequest && (
    response.statusCode === 401
    || response.statusCode === 403
    || isTokenExpiredError(response.error)
  ));
}

function isTokenExpiredError(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, ' ');
  return /\btoken\b/.test(normalized) && /\b(expired|invalid|unauthorized)\b/.test(normalized);
}

function tokenStillValid(expiresAt: number): boolean {
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function readManagedApiToken(source: DataSourceRecord | undefined, cacheKey: string): ManagedApiToken | null {
  if (!source) return null;
  const raw = readRecord(source.config[MANAGED_API_TOKEN_CONFIG_KEY]);
  const token = readString(raw.token);
  const rawCacheKey = readString(raw.cacheKey);
  const expiresAt = parseExpiryTimestamp(raw.expiresAt);
  if (!token || !rawCacheKey || rawCacheKey !== cacheKey || !expiresAt || !tokenStillValid(expiresAt)) return null;
  return {
    cacheKey: rawCacheKey,
    expiresAt,
    fetchedAt: readString(raw.fetchedAt) ?? '',
    token,
    ...(readString(raw.tokenType) ? { tokenType: readString(raw.tokenType) as string } : {})
  };
}

async function storeManagedApiToken(
  tokenContext: TokenAuthContext | undefined,
  token: ManagedApiToken
): Promise<ApiRuntimeResult<void>> {
  if (!tokenContext) return { ok: true, data: undefined };
  tokenContext.source.config = {
    ...tokenContext.source.config,
    [MANAGED_API_TOKEN_CONFIG_KEY]: token
  };
  if (!tokenContext.persistSourceConfig) return { ok: true, data: undefined };
  try {
    await tokenContext.persistSourceConfig(tokenContext.source);
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, statusCode: 502, error: 'API access token could not be stored on the data source' };
  }
}

function tokenCacheKey(prefix: string, request: ApiPageRequest): string {
  return JSON.stringify({
    prefix,
    body: request.body ?? '',
    headers: request.headers,
    method: request.method,
    url: request.url.toString()
  });
}

function readTokenValue(payload: unknown, config: TokenRequestConfig): string | undefined {
  return firstStringPath(payload, [
    config.tokenPath,
    'access_token',
    'accessToken',
    'token',
    'Token',
    'Data.AccessToken',
    'data.accessToken',
    'Data.access_token',
    'data.access_token',
    'Data.Token',
    'data.token',
    'result.accessToken',
    'result.token'
  ]);
}

function readTokenType(payload: unknown, config: TokenRequestConfig): string | undefined {
  const tokenType = firstStringPath(payload, [
    config.tokenTypePath,
    'token_type',
    'tokenType',
    'TokenType',
    'Data.TokenType',
    'data.tokenType',
    'Data.token_type',
    'data.token_type'
  ]);
  if (!tokenType) return undefined;
  return tokenType.toLowerCase() === 'bearer' ? 'Bearer' : tokenType;
}

function tokenExpiresAt(payload: unknown, config: TokenRequestConfig): number {
  const now = Date.now();
  const expiresAtRaw = firstPath(payload, [
    config.expiresAtPath,
    'expires_at',
    'expiresAt',
    'ExpiresAt',
    'Data.ExpiresAt',
    'data.expiresAt'
  ]);
  const expiresAt = parseExpiryTimestamp(expiresAtRaw);
  if (expiresAt) return Math.max(now, expiresAt - config.cacheSkewSeconds * 1000);
  const expiresInRaw = firstPath(payload, [
    config.expiresInPath,
    'expires_in',
    'expiresIn',
    'expires',
    'expiresInSeconds',
    'ExpiresIn',
    'Data.ExpiresIn',
    'data.expiresIn',
    'Data.expires_in',
    'data.expires_in'
  ]);
  const expiresIn = typeof expiresInRaw === 'number'
    ? expiresInRaw
    : typeof expiresInRaw === 'string'
      ? Number(expiresInRaw)
      : NaN;
  const ttlSeconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : config.cacheTtlSeconds;
  return now + Math.max(0, ttlSeconds - config.cacheSkewSeconds) * 1000;
}

function parseExpiryTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 9_999_999_999 ? value : value * 1000;
  }
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber > 9_999_999_999 ? asNumber : asNumber * 1000;
  const asDate = Date.parse(value);
  return Number.isFinite(asDate) ? asDate : undefined;
}
