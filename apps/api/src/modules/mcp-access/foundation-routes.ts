import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { readJsonBody, sendBadRequest, sendCreated, sendForbidden, sendJson, sendOk, sendUnauthorized } from '../../http.js';
import { getRequestSecurityContext, type RequestSecurityContext } from '../../security/request-context.js';
import { isMcpScope, type McpScope } from './types.js';
import { McpTokenService } from './token-service.js';

const MAX_TOKEN_NAME_LENGTH = 80;
const MAX_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 365;
const MCP_MANAGER_ROLE_MARKERS = ['ADMIN', 'OWNER', 'SUPER'];

export class McpAccessFoundationRoutes {
  constructor(private readonly tokenService: McpTokenService | null) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/mcp-access/tokens') {
      await this.listTokens(req, res);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/mcp-access/tokens') {
      await this.createToken(req, res);
      return true;
    }

    const tokenMatch = /^\/api\/mcp-access\/tokens\/([^/]+)$/.exec(url.pathname);
    if (tokenMatch?.[1]) {
      if (req.method !== 'DELETE') {
        sendJson(res, 405, fail('Method not allowed'));
        return true;
      }
      await this.revokeToken(req, res, decodeURIComponent(tokenMatch[1]));
      return true;
    }

    return false;
  }

  private async listTokens(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const scope = this.authenticatedScope(req, res);
    const service = this.availableService(res);
    if (!scope || !service) return;
    sendOk(res, {
      allowedScopes: service.allowedScopesForRole(scope.role),
      endpoint: '/mcp',
      tokens: await service.listTokens(scope.userId)
    });
  }

  private async createToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const scope = this.authenticatedScope(req, res);
    const service = this.availableService(res);
    if (!scope || !service) return;

    const existingTokens = await service.listTokens(scope.userId);
    if (existingTokens.some(isActiveToken)) {
      sendJson(res, 409, fail('Only one active MCP token is allowed. Revoke the current token before creating a new one.'));
      return;
    }

    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendBadRequest(res, 'MCP token payload must be a JSON object.');
      return;
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > MAX_TOKEN_NAME_LENGTH) {
      sendBadRequest(res, `Token name is required and must be ${MAX_TOKEN_NAME_LENGTH} characters or less.`);
      return;
    }

    const allowedScopes = service.allowedScopesForRole(scope.role);
    const scopes = selectedScopes(body.scopes, allowedScopes);
    if (scopes instanceof Error) {
      sendBadRequest(res, scopes.message);
      return;
    }
    if (scopes.length === 0) {
      sendBadRequest(res, 'Select at least one MCP scope.');
      return;
    }
    if (scopes.some(item => !allowedScopes.includes(item))) {
      sendForbidden(res, 'One or more requested MCP scopes are not allowed for this user.');
      return;
    }

    const expiresAt = parseExpiresAt(body.expiresAt);
    if (expiresAt instanceof Error) {
      sendBadRequest(res, expiresAt.message);
      return;
    }

    const created = await service.createToken({
      expiresAt,
      name,
      scopes,
      userId: scope.userId
    });
    sendCreated(res, {
      allowedScopes,
      endpoint: '/mcp',
      token: created.token,
      tokenRecord: created.record
    });
  }

  private async revokeToken(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const scope = this.authenticatedScope(req, res);
    const service = this.availableService(res);
    if (!scope || !service) return;
    const revoked = await service.revokeToken(scope.userId, id);
    revoked ? sendOk(res, { token: revoked }) : sendJson(res, 404, fail('MCP token not found'));
  }

  private authenticatedScope(req: IncomingMessage, res: ServerResponse): RequestSecurityContext | null {
    const scope = getRequestSecurityContext(req);
    if (!scope) {
      sendUnauthorized(res);
      return null;
    }
    if (!canManageMcpAccess(scope.role)) {
      sendForbidden(res, 'MCP access token management requires an admin user.');
      return null;
    }
    return scope;
  }

  private availableService(res: ServerResponse): McpTokenService | null {
    if (this.tokenService) return this.tokenService;
    sendJson(res, 503, fail('MCP token database is unavailable'));
    return null;
  }
}

export function createMcpAccessFoundationRoutes(tokenService: McpTokenService | null): McpAccessFoundationRoutes {
  return new McpAccessFoundationRoutes(tokenService);
}

function selectedScopes(value: unknown, allowedScopes: McpScope[]): McpScope[] | Error {
  if (value === undefined) return allowedScopes;
  if (!Array.isArray(value)) return new Error('MCP scopes must be an array.');
  const scopes = [...new Set(value)];
  if (scopes.some(item => !isMcpScope(item))) return new Error('MCP scopes contain an unknown value.');
  return scopes.filter(isMcpScope);
}

function canManageMcpAccess(role: string): boolean {
  const normalizedRole = role.toUpperCase();
  return MCP_MANAGER_ROLE_MARKERS.some(marker => normalizedRole.includes(marker));
}

function isActiveToken(token: { expiresAt: string | null; revokedAt: string | null }): boolean {
  if (token.revokedAt) return false;
  if (!token.expiresAt) return true;
  return new Date(token.expiresAt).getTime() > Date.now();
}

function parseExpiresAt(value: unknown): Date | null | Error {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return new Error('Token expiry must be a date string when provided.');
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return new Error('Token expiry must be a valid date.');
  const now = Date.now();
  if (expiresAt.getTime() <= now) return new Error('Token expiry must be in the future.');
  if (expiresAt.getTime() - now > MAX_TOKEN_TTL_MS) return new Error('Token expiry cannot be more than one year away.');
  return expiresAt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
