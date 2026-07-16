import type { IncomingMessage } from 'node:http';
import type { Dashboard, DashboardRuntimeStore } from '../dashboard/foundation-store.js';
import { dashboardDataSourceIds } from './embed-dashboard-scope.js';
import type { EmbedToken, EmbedTokenStore } from './embed-token-store.js';
import { cspFrameAncestorSources, requireEmbedRequestOrigin } from './embed-domain-security.js';
import { uniqueStrings } from './embed-common.js';

export type ScopedEmbedTokenResult =
  | { ok: true; dashboard: Dashboard; dataSourceIds: Set<string>; token: EmbedToken }
  | { ok: false; statusCode: number; error: string };

export class EmbedTokenService {
  constructor(
    private readonly dashboardStore: DashboardRuntimeStore,
    private readonly tokenStore: EmbedTokenStore
  ) {}

  frameAncestorsForEmbedRoute(url: URL): string | null {
    if (!url.pathname.startsWith('/embed/dashboard/')) return null;
    const token = url.searchParams.get('token');
    if (!token) return null;
    const result = this.requireToken(token);
    if (!result.ok || result.token.allowedDomains.length === 0) return null;
    const sources = uniqueStrings(result.token.allowedDomains.flatMap(cspFrameAncestorSources));
    if (sources.length === 0) return null;
    return `frame-ancestors ${sources.join(' ')};`;
  }

  requireToken(token: string | null): { ok: true; token: EmbedToken } | { ok: false; statusCode: number; error: string } {
    if (!token) return { ok: false, statusCode: 400, error: 'Token is required' };
    const found = this.tokenStore.get(token);
    if (!found || found.revoked) return { ok: false, statusCode: 401, error: 'Invalid token' };
    if (found.expiresAt <= Date.now()) return { ok: false, statusCode: 401, error: 'Token expired' };
    return { ok: true, token: found };
  }

  async requireScopedToken(
    req: IncomingMessage,
    token: string | null,
    dashboardId?: string
  ): Promise<ScopedEmbedTokenResult> {
    const result = this.requireToken(token);
    if (result.ok === false) return result;
    const originCheck = requireEmbedRequestOrigin(result.token, req);
    if (originCheck.ok === false) return originCheck;
    if (dashboardId && result.token.dashboardId !== dashboardId) {
      return { ok: false, statusCode: 401, error: 'Invalid token for this dashboard' };
    }
    const dashboard = await this.publishedDashboard(result.token.dashboardId);
    if (!dashboard) return { ok: false, statusCode: 404, error: 'Published dashboard not found' };
    return {
      ok: true,
      dashboard,
      dataSourceIds: dashboardDataSourceIds(dashboard),
      token: result.token
    };
  }

  async publishedDashboard(dashboardId: string): Promise<Dashboard | null> {
    return await this.dashboardStore.getDashboardMode(dashboardId, 'published');
  }
}
