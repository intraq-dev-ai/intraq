import type { IntraQPrismaClient } from '@intraq/db';
import { normalizeMcpScopes, type McpTokenRecord, type McpTokenRepository, type McpTokenRepositoryCreateInput } from './types.js';

interface McpTokenRow {
  createdAt: Date | string;
  expiresAt: Date | string | null;
  id: string;
  lastUsedAt: Date | string | null;
  name: string;
  revokedAt: Date | string | null;
  scopes: unknown;
  tokenPrefix: string;
  updatedAt: Date | string;
  userId: string;
}

export class PrismaMcpTokenRepository implements McpTokenRepository {
  constructor(private readonly client: IntraQPrismaClient) {}

  async listByUser(userId: string): Promise<McpTokenRecord[]> {
    const rows = await this.client.mcpAccessToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    return rows.map(toRecord);
  }

  async create(input: McpTokenRepositoryCreateInput): Promise<McpTokenRecord> {
    const row = await this.client.mcpAccessToken.create({
      data: {
        expiresAt: input.expiresAt ?? null,
        id: input.id,
        name: input.name,
        scopes: input.scopes,
        tokenHash: input.tokenHash,
        tokenPrefix: input.tokenPrefix,
        userId: input.userId
      }
    });
    return toRecord(row);
  }

  async findActiveByHash(tokenHash: string, at: Date): Promise<McpTokenRecord | null> {
    const row = await this.client.mcpAccessToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: at } }
        ]
      }
    });
    return row ? toRecord(row) : null;
  }

  async markUsed(id: string, at: Date): Promise<void> {
    await this.client.mcpAccessToken.updateMany({
      where: { id },
      data: { lastUsedAt: at, updatedAt: at }
    });
  }

  async revoke(userId: string, id: string, at: Date): Promise<McpTokenRecord | null> {
    const existing = await this.client.mcpAccessToken.findFirst({
      where: { id, revokedAt: null, userId }
    });
    if (!existing) return null;
    const row = await this.client.mcpAccessToken.update({
      where: { id },
      data: { revokedAt: at, updatedAt: at }
    });
    return toRecord(row);
  }
}

function toRecord(row: McpTokenRow | undefined): McpTokenRecord {
  if (!row) throw new Error('MCP token row is missing.');
  return {
    createdAt: toIso(row.createdAt),
    expiresAt: toNullableIso(row.expiresAt),
    id: row.id,
    lastUsedAt: toNullableIso(row.lastUsedAt),
    name: row.name,
    revokedAt: toNullableIso(row.revokedAt),
    scopes: normalizeMcpScopes(row.scopes),
    tokenPrefix: row.tokenPrefix,
    updatedAt: toIso(row.updatedAt),
    userId: row.userId
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIso(value: Date | string | null): string | null {
  return value ? toIso(value) : null;
}
