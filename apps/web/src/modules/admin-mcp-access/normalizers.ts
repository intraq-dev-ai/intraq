import type { McpAccessState, McpAccessTokenRecord, McpCreatedToken, McpScope } from './types';

export const MCP_SCOPE_OPTIONS: Array<{ label: string; value: McpScope; detail: string }> = [
  { label: 'System Status', value: 'status:read', detail: 'Let MCP clients verify the connection.' },
  { label: 'Dashboards', value: 'dashboards:read', detail: 'Read dashboard names, filters, and components.' },
  { label: 'Create Dashboards', value: 'dashboards:write', detail: 'Create, update, and publish dashboards.' },
  { label: 'Data Sources', value: 'data-sources:read', detail: 'Read visible data source names and table counts.' },
  { label: 'AI Model Metadata', value: 'sql-models:write', detail: 'Register SQL models and import metadata used by Analyzer and Dashboard Builder.' },
  { label: 'Analyzer', value: 'analyzer:run', detail: 'Run Analyzer planning and answers against data models.' },
  { label: 'Data Results', value: 'data-results:read', detail: 'Fetch protected model result rows for Analyzer checks.' },
  { label: 'Product API Read', value: 'product-api:read', detail: 'Call allowlisted read and validation workflows through product APIs.' },
  { label: 'Product API Write', value: 'product-api:write', detail: 'Call allowlisted mutation workflows through product APIs.' }
];

export function normalizeMcpAccessState(payload: unknown): McpAccessState {
  const source = unwrap(payload);
  if (!isRecord(source)) return emptyState();
  return {
    allowedScopes: normalizeScopes(source.allowedScopes),
    endpoint: readString(source.endpoint) || '/mcp',
    tokens: normalizeTokenList(source.tokens)
  };
}

export function normalizeCreatedToken(payload: unknown): McpCreatedToken {
  const source = unwrap(payload);
  if (!isRecord(source)) throw new Error('MCP token response was not valid.');
  const token = readString(source.token);
  const record = normalizeTokenRecord(source.tokenRecord);
  if (!token || !record) throw new Error('MCP token was not returned by the server.');
  return {
    allowedScopes: normalizeScopes(source.allowedScopes),
    endpoint: readString(source.endpoint) || '/mcp',
    token,
    tokenRecord: record
  };
}

export function normalizeTokenList(value: unknown): McpAccessTokenRecord[] {
  return Array.isArray(value) ? value.map(normalizeTokenRecord).filter(isPresent) : [];
}

export function normalizeTokenRecord(value: unknown): McpAccessTokenRecord | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  if (!id) return null;
  const revokedAt = readString(value.revokedAt);
  const expiresAt = readString(value.expiresAt);
  return {
    createdAt: readString(value.createdAt),
    expiresAt,
    id,
    lastUsedAt: readString(value.lastUsedAt),
    name: readString(value.name) || 'MCP token',
    revokedAt,
    scopes: normalizeScopes(value.scopes),
    status: tokenStatus(revokedAt, expiresAt),
    tokenPrefix: readString(value.tokenPrefix)
  };
}

export function scopeLabel(scope: McpScope): string {
  return MCP_SCOPE_OPTIONS.find(option => option.value === scope)?.label ?? scope;
}

export function endpointUrl(endpoint: string, origin = locationOrigin()): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${origin}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

function emptyState(): McpAccessState {
  return { allowedScopes: [], endpoint: '/mcp', tokens: [] };
}

function normalizeScopes(value: unknown): McpScope[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isMcpScope))];
}

function tokenStatus(revokedAt: string, expiresAt: string): McpAccessTokenRecord['status'] {
  if (revokedAt) return 'revoked';
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

function unwrap(value: unknown): unknown {
  return isRecord(value) && 'data' in value ? value.data : value;
}

function isMcpScope(value: unknown): value is McpScope {
  return value === 'status:read'
    || value === 'dashboards:read'
    || value === 'dashboards:write'
    || value === 'data-sources:read'
    || value === 'sql-models:write'
    || value === 'analyzer:run'
    || value === 'data-results:read'
    || value === 'product-api:read'
    || value === 'product-api:write';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function locationOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}
