import { createHash, randomBytes } from 'node:crypto';
import { uuidv7 } from '@intraq/contracts';
import type { AuthStore } from '../auth-setup/auth-store.js';
import {
  MCP_ACCESS_TOKEN_PREFIX,
  MCP_SCOPES,
  type McpAuthenticatedPrincipal,
  type McpScope,
  type McpTokenCreateInput,
  type McpTokenCreateResult,
  type McpTokenRecord,
  type McpTokenRepository
} from './types.js';

const ADMIN_ROLE_MARKERS = ['ADMIN', 'OWNER', 'SUPER'];
const DEVELOPER_ROLE_MARKER = 'DEVELOPER';

export class McpTokenService {
  constructor(
    private readonly repository: McpTokenRepository,
    private readonly authStore: AuthStore
  ) {}

  allowedScopesForRole(role: string): McpScope[] {
    const normalizedRole = role.toUpperCase();
    if (ADMIN_ROLE_MARKERS.some(marker => normalizedRole.includes(marker))) {
      return [...MCP_SCOPES];
    }
    if (normalizedRole.includes(DEVELOPER_ROLE_MARKER)) {
      return [...MCP_SCOPES];
    }
    return ['status:read'];
  }

  async listTokens(userId: string): Promise<McpTokenRecord[]> {
    return this.repository.listByUser(userId);
  }

  async createToken(input: McpTokenCreateInput): Promise<McpTokenCreateResult> {
    const token = `${MCP_ACCESS_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const record = await this.repository.create({
      ...input,
      id: uuidv7(),
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, 18)
    });
    return { record, token };
  }

  async revokeToken(userId: string, id: string): Promise<McpTokenRecord | null> {
    return this.repository.revoke(userId, id, new Date());
  }

  async authenticate(rawToken: string | undefined): Promise<McpAuthenticatedPrincipal | null> {
    if (!rawToken?.startsWith(MCP_ACCESS_TOKEN_PREFIX)) return null;
    const record = await this.repository.findActiveByHash(hashToken(rawToken), new Date());
    if (!record) return null;

    const user = await this.authStore.findUserById(record.userId);
    if (!user?.isActive) return null;
    if (user.tenant?.status && user.tenant.status !== 'active') return null;

    await this.repository.markUsed(record.id, new Date());
    const principal: McpAuthenticatedPrincipal = {
      role: user.role,
      scopes: record.scopes,
      tokenId: record.id,
      tokenName: record.name,
      tokenPrefix: record.tokenPrefix,
      userId: user.id
    };
    if (user.tenantId) principal.tenantId = user.tenantId;
    if (user.tenant?.tenantType) principal.tenantType = user.tenant.tenantType;
    return principal;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
