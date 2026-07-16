export type McpScope =
  | 'status:read'
  | 'dashboards:read'
  | 'dashboards:write'
  | 'data-sources:read'
  | 'sql-models:write'
  | 'analyzer:run'
  | 'data-results:read'
  | 'product-api:read'
  | 'product-api:write';

export interface McpAccessTokenRecord {
  createdAt: string;
  expiresAt: string;
  id: string;
  lastUsedAt: string;
  name: string;
  revokedAt: string;
  scopes: McpScope[];
  status: 'active' | 'expired' | 'revoked';
  tokenPrefix: string;
}

export interface McpAccessState {
  allowedScopes: McpScope[];
  endpoint: string;
  tokens: McpAccessTokenRecord[];
}

export interface McpCreateTokenPayload {
  expiresAt?: string | null;
  name: string;
  scopes: McpScope[];
}

export interface McpCreatedToken {
  allowedScopes: McpScope[];
  endpoint: string;
  token: string;
  tokenRecord: McpAccessTokenRecord;
}
