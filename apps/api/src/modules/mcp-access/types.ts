import type { RequestSecurityContext } from '../../security/request-context.js';

export const MCP_ACCESS_TOKEN_PREFIX = 'ai_mcp_';

export const MCP_SCOPES = [
  'status:read',
  'dashboards:read',
  'dashboards:write',
  'data-sources:read',
  'sql-models:write',
  'analyzer:run',
  'data-results:read',
  'product-api:read',
  'product-api:write'
] as const;

export type McpScope = typeof MCP_SCOPES[number];

export interface McpTokenRecord {
  createdAt: string;
  expiresAt: string | null;
  id: string;
  lastUsedAt: string | null;
  name: string;
  revokedAt: string | null;
  scopes: McpScope[];
  tokenPrefix: string;
  updatedAt: string;
  userId: string;
}

export interface McpTokenCreateInput {
  expiresAt?: Date | null;
  name: string;
  scopes: McpScope[];
  userId: string;
}

export interface McpTokenCreateResult {
  record: McpTokenRecord;
  token: string;
}

export interface McpAuthenticatedPrincipal extends RequestSecurityContext {
  scopes: McpScope[];
  tokenId: string;
  tokenName: string;
  tokenPrefix: string;
}

export interface McpTokenRepository {
  create(input: McpTokenRepositoryCreateInput): Promise<McpTokenRecord>;
  findActiveByHash(tokenHash: string, at: Date): Promise<McpTokenRecord | null>;
  listByUser(userId: string): Promise<McpTokenRecord[]>;
  markUsed(id: string, at: Date): Promise<void>;
  revoke(userId: string, id: string, at: Date): Promise<McpTokenRecord | null>;
}

export interface McpTokenRepositoryCreateInput extends McpTokenCreateInput {
  id: string;
  tokenHash: string;
  tokenPrefix: string;
}

export function isMcpScope(value: unknown): value is McpScope {
  return typeof value === 'string' && (MCP_SCOPES as readonly string[]).includes(value);
}

export function normalizeMcpScopes(value: unknown): McpScope[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isMcpScope))];
}
