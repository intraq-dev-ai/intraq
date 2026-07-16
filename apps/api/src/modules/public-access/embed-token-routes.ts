import type { IncomingMessage, ServerResponse } from 'node:http';
import { uuidv7 } from '@intraq/contracts';
import { readJsonBody } from '../../http.js';
import { getRequestSecurityContext } from '../../security/request-context.js';
import { isManagementRole } from '../../security/roles.js';
import { readBearerToken as readAuthBearerToken } from '../auth-setup/auth-tokens.js';
import { normalizeEmbedDataScope } from './embed-data-scope.js';
import type { EmbedTokenStore } from './embed-token-store.js';
import { normalizeEmbedAppearance } from './embed-appearance.js';
import {
  currentTenant,
  currentUser,
  embedExpiresAtResponse,
  embedExpiryError,
  expiresAtForEmbedExpiry,
  isNonEmptyString,
  isRecord,
  readManagementContext,
  readPublicBaseUrl,
  sendJson,
  slugify
} from './embed-common.js';
import { isDomainAllowed } from './embed-domain-security.js';
import { publicEmbedAccessContextPatch } from './embed-data-helpers.js';
import type { EmbedTokenService } from './embed-token-service.js';

export class EmbedTokenRoutes {
  constructor(
    private readonly tokenStore: EmbedTokenStore,
    private readonly tokenService: EmbedTokenService
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'POST' && url.pathname === '/api/embed/generate-token') {
      await this.generateEmbedToken(req, res);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/embed/validate-token') {
      await this.validateEmbedToken(res, url);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/embed/revoke-token') {
      await this.revokeEmbedToken(req, res);
      return true;
    }
    const dashboardMatch = /^\/api\/embed\/dashboard\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && dashboardMatch?.[1]) {
      await this.sendDashboard(req, res, decodeURIComponent(dashboardMatch[1]));
      return true;
    }
    return false;
  }

  private async generateEmbedToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.dashboardId)) {
      sendJson(res, 400, { error: 'Dashboard ID is required' });
      return;
    }
    const dashboardId = body.dashboardId.trim();
    const publishedDashboard = await this.tokenService.publishedDashboard(dashboardId);
    if (!publishedDashboard) {
      sendJson(res, 404, { error: 'Published dashboard not found or access denied' });
      return;
    }

    const allowedDomains = Array.isArray(body.allowedDomains)
      ? body.allowedDomains.filter(isNonEmptyString).map(domain => domain.trim())
      : [];
    const expiresIn = isNonEmptyString(body.expiresIn) ? body.expiresIn.trim() : '24h';
    const now = Date.now();
    const expiresAt = expiresAtForEmbedExpiry(expiresIn, now);
    if (expiresAt === null) {
      sendJson(res, 400, { error: embedExpiryError });
      return;
    }
    const token = `embed-token-${slugify(dashboardId)}-${uuidv7()}`;
    const dataScope = normalizeEmbedDataScope(body.dataScope ?? {
      dataSourceIds: body.dataSourceIds,
      filters: body.filters
    });
    const requestedAppearance = normalizeEmbedAppearance(body.appearance ?? {
      showExpand: body.showExpand,
      showExport: body.showExport,
      showFilters: body.showFilters,
      showHeader: body.showHeader
    });
    const managementContext = getRequestSecurityContext(req) ?? readManagementContext(req);
    const appearance = requestedAppearance;
    const embedUrl = [
      `${readPublicBaseUrl(req)}/embed/dashboard/${encodeURIComponent(dashboardId)}`,
      `?token=${encodeURIComponent(token)}`
    ].join('');
    this.tokenStore.set(token, {
      dashboardId,
      allowedDomains,
      ...(appearance ? { appearance } : {}),
      createdAt: now,
      ...(dataScope ? { dataScope } : {}),
      expiresAt,
      mode: 'dashboard-token',
      revoked: false,
      ...(managementContext?.tenantId ? { tenantId: managementContext.tenantId } : {})
    });
    sendJson(res, 200, {
      success: true,
      token,
      embedUrl,
      expiresIn,
      ...embedExpiresAtResponse(expiresAt),
      allowedDomains,
      ...(appearance ? { appearance } : {})
    });
  }

  private async validateEmbedToken(res: ServerResponse, url: URL): Promise<void> {
    const token = url.searchParams.get('token');
    const result = this.tokenService.requireToken(token);
    if (result.ok === false) {
      sendJson(res, result.statusCode, { error: result.error });
      return;
    }
    const requestedDashboardId = url.searchParams.get('dashboardId');
    if (isNonEmptyString(requestedDashboardId) && result.token.dashboardId !== requestedDashboardId.trim()) {
      sendJson(res, 401, { error: 'Invalid token for this dashboard' });
      return;
    }
    const origin = url.searchParams.get('domain') ?? url.searchParams.get('origin');
    if (!isDomainAllowed(result.token, origin)) {
      sendJson(res, 403, { error: 'Domain not allowed' });
      return;
    }
    const dashboard = await this.tokenService.publishedDashboard(result.token.dashboardId);
    if (!dashboard) {
      sendJson(res, 404, { error: 'Published dashboard not found or no longer accessible' });
      return;
    }
    sendJson(res, 200, {
      success: true,
      valid: true,
      dashboard: {
        id: dashboard.id,
        name: dashboard.name,
        config: { layout: dashboard.layout, status: dashboard.status }
      },
      tenant: currentTenant(),
      user: currentUser()
    });
  }

  private async revokeEmbedToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.token)) {
      sendJson(res, 400, { error: 'Token is required' });
      return;
    }
    const managementContext = readManagementContext(req);
    if (!managementContext) {
      sendJson(res, 401, { error: 'Authenticated management context is required' });
      return;
    }
    if (!isManagementRole(managementContext.role)) {
      sendJson(res, 403, { error: 'Management role is required' });
      return;
    }
    this.tokenStore.revoke(body.token.trim(), managementContext.userId);
    sendJson(res, 200, { success: true, message: 'Token revoked successfully' });
  }

  private async sendDashboard(req: IncomingMessage, res: ServerResponse, dashboardId: string): Promise<void> {
    const scoped = await this.tokenService.requireScopedToken(req, readAuthBearerToken(req.headers.authorization) ?? null, dashboardId);
    if (scoped.ok === false) {
      sendJson(res, scoped.statusCode, { error: scoped.error });
      return;
    }
    if (scoped.token.dashboardId !== dashboardId) {
      sendJson(res, 401, { error: 'Invalid token for this dashboard' });
      return;
    }
    sendJson(res, 200, {
      success: true,
      dashboard: { ...scoped.dashboard, isEmbedded: true },
      ...publicEmbedAccessContextPatch(scoped.token.accessContext),
      appearance: scoped.token.appearance ?? null,
      tenant: currentTenant(),
      user: currentUser()
    });
  }
}
