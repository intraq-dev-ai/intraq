import { requestAdmin } from '../admin/api';
import { normalizeCreatedToken, normalizeMcpAccessState, normalizeTokenRecord } from './normalizers';
import type { McpAccessState, McpAccessTokenRecord, McpCreateTokenPayload, McpCreatedToken } from './types';

const MCP_TOKENS_PATH = '/api/mcp-access/tokens';

export async function listMcpAccessTokens(): Promise<McpAccessState> {
  return normalizeMcpAccessState(await requestAdmin<unknown>(MCP_TOKENS_PATH));
}

export async function createMcpAccessToken(payload: McpCreateTokenPayload): Promise<McpCreatedToken> {
  return normalizeCreatedToken(await requestAdmin<unknown>(MCP_TOKENS_PATH, {
    method: 'POST',
    body: {
      expiresAt: payload.expiresAt || null,
      name: payload.name,
      scopes: payload.scopes
    }
  }));
}

export async function revokeMcpAccessToken(id: string): Promise<McpAccessTokenRecord> {
  const payload = await requestAdmin<unknown>(`${MCP_TOKENS_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const source = isRecord(payload) && 'token' in payload ? payload.token : payload;
  const record = normalizeTokenRecord(source);
  if (!record) throw new Error('MCP token revoke response was not valid.');
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
