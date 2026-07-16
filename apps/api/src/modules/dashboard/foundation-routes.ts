import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail, ok } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendCreated, sendJson, sendOk } from '../../http.js';
import { getRequestSecurityContext } from '../../security/request-context.js';
import {
  createCodexAgentRuntime,
  type CodexAgentRuntime
} from '../codex-agent/codex-agent-runtime.js';
import { DashboardCompatRoutes } from './compat-routes.js';
import { DashboardInsightRoutes } from './dashboard-insight-routes.js';
import { DashboardInsightSummaryService } from './dashboard-insight-summary.js';
import { DashboardFoundationStore, type Dashboard, type DashboardAccessScope, type DashboardRuntimeStore } from './foundation-store.js';

export class DashboardFoundationRoutes {
  private readonly compatRoutes: DashboardCompatRoutes;
  private readonly insightRoutes: DashboardInsightRoutes;

  constructor(
    private readonly store: DashboardRuntimeStore = new DashboardFoundationStore(),
    _prismaClient: IntraQPrismaClient | null = null,
    codexAgent: CodexAgentRuntime = createCodexAgentRuntime()
  ) {
    this.compatRoutes = new DashboardCompatRoutes(store);
    this.insightRoutes = new DashboardInsightRoutes(store, new DashboardInsightSummaryService(codexAgent));
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'POST' && url.pathname === '/api/dashboard-render-events') {
      await this.recordDashboardRenderEvent(req, res);
      return true;
    }

    if (await this.insightRoutes.handle(req, res, url, currentScope(req))) return true;

    if (req.method === 'GET' && url.pathname === '/api/dashboards/menu') {
      const limit = readOptionalLimit(url);
      if (limit === 'invalid') {
        sendBadRequest(res, 'limit must be a positive integer.');
        return true;
      }
      sendOk(res, await this.store.listMenu(currentScope(req), limit ? { limit } : {}));
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/dashboards') {
      const limit = readOptionalLimit(url);
      if (limit === 'invalid') {
        sendBadRequest(res, 'limit must be a positive integer.');
        return true;
      }
      sendOk(res, await this.store.listDashboards(currentScope(req), limit ? { limit } : {}));
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/dashboards') {
      await this.createDashboard(req, res);
      return true;
    }

    if (await this.compatRoutes.handle(req, res, url)) return true;
    if (await this.handleDashboardLifecycle(req, res, url)) return true;
    if (await this.handleDashboardById(req, res, url)) return true;
    if (await this.handleElements(req, res, url)) return true;
    if (await this.handleFilters(req, res, url)) return true;
    if (await this.handleCategories(req, res, url)) return true;
    return false;
  }

  private async createDashboard(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.name)) {
      sendBadRequest(res, 'name is required for dashboard creation.');
      return;
    }
    sendCreated(res, await this.store.createDashboard({ ...body, name: body.name }, currentScope(req)));
  }

  private async recordDashboardRenderEvent(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendBadRequest(res, 'Render event payload is required');
      return;
    }
    const context = getRequestSecurityContext(req);
    console.warn('Dashboard render fallback', sanitizeDashboardRenderEvent(body, {
      runtime: 'view',
      tenantId: context?.tenantId,
      userId: context?.userId
    }));
    sendOk(res, { success: true });
  }

  private async handleDashboardLifecycle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const match = /^\/api\/dashboards\/([^/]+)\/(draft|publish|versions)$/.exec(url.pathname);
    if (!match?.[1] || !match[2]) return false;
    const dashboardId = decodePathPart(match[1]);
    if (!dashboardId) return false;

    if (req.method === 'PUT' && match[2] === 'draft') {
      const dashboard = await this.store.draftDashboard(dashboardId, currentScope(req));
      dashboard ? sendOk(res, dashboard) : sendNotFound(res, 'Dashboard not found');
      return true;
    }
    if (req.method === 'POST' && match[2] === 'publish') {
      const dashboard = await this.store.publishDashboard(dashboardId, currentScope(req));
      dashboard ? sendOk(res, { dashboard, publishedAt: new Date().toISOString() }) : sendNotFound(res, 'Dashboard not found');
      return true;
    }
    if (req.method === 'GET' && match[2] === 'versions') {
      const dashboard = await this.store.getDashboard(dashboardId, currentScope(req));
      dashboard
        ? sendOk(res, [{ id: `${dashboardId}-version-1`, dashboardId, status: dashboard.status, createdAt: dashboard.updatedAt }])
        : sendNotFound(res, 'Dashboard not found');
      return true;
    }
    return false;
  }

  private async handleDashboardById(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const match = /^\/api\/dashboards\/([^/]+)(?:\/duplicate)?$/.exec(url.pathname);
    if (!match?.[1] || url.pathname.includes('/elements') || url.pathname.includes('/filters')) return false;
    const id = decodePathPart(match[1]);
    if (!id) return false;

    if (req.method === 'GET' && !url.pathname.endsWith('/duplicate')) {
      const dashboard = await this.store.getDashboard(id, currentScope(req));
      dashboard ? sendOk(res, dashboard) : sendNotFound(res, 'Dashboard not found');
      return true;
    }

    if (req.method === 'PUT' && !url.pathname.endsWith('/duplicate')) {
      await this.updateDashboard(req, res, id);
      return true;
    }

    if (req.method === 'DELETE' && !url.pathname.endsWith('/duplicate')) {
      (await this.store.deleteDashboard(id, currentScope(req))) ? sendOk(res, { message: 'Dashboard deleted' }) : sendNotFound(res, 'Dashboard not found');
      return true;
    }

    if (req.method === 'POST' && url.pathname.endsWith('/duplicate')) {
      await this.duplicateDashboard(req, res, id);
      return true;
    }

    return false;
  }

  private async updateDashboard(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || ('name' in body && !isNonEmptyString(body.name))) {
      sendBadRequest(res, 'Request body must be a JSON object with a valid name when provided.');
      return;
    }
    const dashboard = await this.store.updateDashboard(id, body, currentScope(req));
    dashboard ? sendOk(res, dashboard) : sendNotFound(res, 'Dashboard not found');
  }

  private async duplicateDashboard(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const body = await readJsonBody(req);
    if (body !== null && !isRecord(body)) {
      sendBadRequest(res, 'Request body must be a JSON object.');
      return;
    }
    const name = isRecord(body) && isNonEmptyString(body.name) ? body.name.trim() : undefined;
    const createdBy = isRecord(body) && isNonEmptyString(body.createdBy) ? body.createdBy.trim() : undefined;
    const dashboard = await this.store.duplicateDashboard(id, name, createdBy, currentScope(req));
    dashboard ? sendCreated(res, dashboard) : sendNotFound(res, 'Dashboard not found');
  }

  private async handleElements(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const listMatch = /^\/api\/dashboards\/([^/]+)\/elements$/.exec(url.pathname);
    if (listMatch?.[1]) {
      const dashboardId = decodePathPart(listMatch[1]);
      if (!dashboardId) return false;
      if (req.method === 'GET') {
        const elements = await this.store.listElements(dashboardId, currentScope(req));
        elements ? sendOk(res, elements) : sendNotFound(res, 'Dashboard not found');
        return true;
      }
      if (req.method === 'POST') {
        await this.createElement(req, res, dashboardId);
        return true;
      }
    }

    const itemMatch = /^\/api\/dashboards\/elements\/([^/]+)$/.exec(url.pathname);
    if (!itemMatch?.[1]) return false;
    const elementId = decodePathPart(itemMatch[1]);
    if (!elementId) return false;
    if (req.method === 'PUT') {
      await this.updateElement(req, res, elementId);
      return true;
    }
    if (req.method === 'DELETE') {
      (await this.store.deleteElement(elementId, currentScope(req))) ? sendOk(res, { message: 'Dashboard element deleted' }) : sendNotFound(res, 'Dashboard element not found');
      return true;
    }
    return false;
  }

  private async createElement(req: IncomingMessage, res: ServerResponse, dashboardId: string): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.name)) {
      sendBadRequest(res, 'name is required for dashboard element creation.');
      return;
    }
    const element = await this.store.createElement(dashboardId, body, currentScope(req));
    element ? sendCreated(res, element) : sendNotFound(res, 'Dashboard not found');
  }

  private async updateElement(req: IncomingMessage, res: ServerResponse, elementId: string): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || ('name' in body && !isNonEmptyString(body.name))) {
      sendBadRequest(res, 'Request body must be a JSON object with a valid name when provided.');
      return;
    }
    const element = await this.store.updateElement(elementId, body, currentScope(req));
    element ? sendOk(res, element) : sendNotFound(res, 'Dashboard element not found');
  }

  private async handleFilters(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const itemMatch = /^\/api\/dashboards\/([^/]+)\/filters\/([^/]+)$/.exec(url.pathname);
    if (itemMatch?.[1] && itemMatch[2]) {
      const dashboardId = decodePathPart(itemMatch[1]);
      const filterId = decodePathPart(itemMatch[2]);
      if (!dashboardId || !filterId) return false;
      if (req.method === 'PUT') {
        await this.updateFilter(req, res, dashboardId, filterId);
        return true;
      }
      if (req.method === 'DELETE') {
        (await this.store.deleteFilter(dashboardId, filterId, currentScope(req))) ? sendCompatOk(res, { message: 'Dashboard filter deleted' }) : sendNotFound(res, 'Dashboard filter not found');
        return true;
      }
    }

    const collectionMatch = /^\/api\/dashboards\/([^/]+)\/filters$/.exec(url.pathname);
    if (!collectionMatch?.[1]) return false;
    const dashboardId = decodePathPart(collectionMatch[1]);
    if (!dashboardId) return false;
    if (req.method === 'GET') return this.listFilters(req, res, dashboardId, url.searchParams.get('type') ?? undefined);
    if (req.method === 'POST') {
      await this.createFilter(req, res, dashboardId);
      return true;
    }
    if (req.method === 'PUT') {
      await this.replaceFilters(req, res, dashboardId);
      return true;
    }
    if (req.method === 'DELETE') {
      (await this.store.deleteFilters(dashboardId, currentScope(req))) ? sendCompatOk(res, { message: 'Dashboard filters deleted' }) : sendNotFound(res, 'Dashboard not found');
      return true;
    }
    return false;
  }

  private async listFilters(req: IncomingMessage, res: ServerResponse, dashboardId: string, type?: string): Promise<true> {
    const filters = await this.store.listFilters(dashboardId, type, currentScope(req));
    filters ? sendCompatOk(res, filters, { filters }) : sendNotFound(res, 'Dashboard not found');
    return true;
  }

  private async createFilter(req: IncomingMessage, res: ServerResponse, dashboardId: string): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.name) || !isNonEmptyString(body.field)) {
      sendBadRequest(res, 'name and field are required for dashboard filter creation.');
      return;
    }
    const filter = await this.store.createFilter(dashboardId, body, currentScope(req));
    filter ? sendCompatCreated(res, filter, { filter }) : sendNotFound(res, 'Dashboard not found');
  }

  private async updateFilter(req: IncomingMessage, res: ServerResponse, dashboardId: string, filterId: string): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || ('name' in body && !isNonEmptyString(body.name)) || ('field' in body && !isNonEmptyString(body.field))) {
      sendBadRequest(res, 'Request body must be a JSON object with valid filter fields.');
      return;
    }
    const filter = await this.store.updateFilter(dashboardId, filterId, body, currentScope(req));
    filter ? sendCompatOk(res, filter, { filter }) : sendNotFound(res, 'Dashboard filter not found');
  }

  private async replaceFilters(req: IncomingMessage, res: ServerResponse, dashboardId: string): Promise<void> {
    const body = await readJsonBody(req);
    const inputs = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.filters) ? body.filters : null;
    if (!inputs || !inputs.every(isRecord)) {
      sendBadRequest(res, 'filters must be an array.');
      return;
    }
    const filters = await this.store.replaceFilters(dashboardId, inputs, currentScope(req));
    filters ? sendCompatOk(res, filters, { filters }) : sendNotFound(res, 'Dashboard not found');
  }

  private async handleCategories(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/dashboard-categories') {
      sendRawJson(res, 200, await this.store.listCategories(currentScope(req)));
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/dashboard-categories') {
      await this.createCategory(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/dashboard-categories/reorder') {
      await this.reorderCategories(req, res);
      return true;
    }
    const match = /^\/api\/dashboard-categories\/([^/]+)$/.exec(url.pathname);
    if (!match?.[1]) return false;
    const id = decodePathPart(match[1]);
    if (!id) return false;
    if (req.method === 'GET') {
      const category = await this.store.getCategory(id, currentScope(req));
      category ? sendRawJson(res, 200, category) : sendNotFound(res, 'Dashboard category not found');
      return true;
    }
    if (req.method === 'PUT') {
      await this.updateCategory(req, res, id);
      return true;
    }
    if (req.method === 'DELETE') {
      (await this.store.deleteCategory(id, currentScope(req))) ? sendRawJson(res, 200, { message: 'Dashboard category deleted' }) : sendNotFound(res, 'Dashboard category not found');
      return true;
    }
    return false;
  }

  private async createCategory(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.name)) {
      sendBadRequest(res, 'name is required for dashboard category creation.');
      return;
    }
    sendRawJson(res, 201, await this.store.createCategory({ ...body, name: body.name }, currentScope(req)));
  }

  private async updateCategory(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || ('name' in body && !isNonEmptyString(body.name))) {
      sendBadRequest(res, 'Request body must be a JSON object with a valid name when provided.');
      return;
    }
    const category = await this.store.updateCategory(id, body, currentScope(req));
    category ? sendRawJson(res, 200, category) : sendNotFound(res, 'Dashboard category not found');
  }

  private async reorderCategories(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !Array.isArray(body.categoryIds) || !body.categoryIds.every(isNonEmptyString)) {
      sendBadRequest(res, 'categoryIds must be an array of category IDs.');
      return;
    }
    const categories = await this.store.reorderCategories(body.categoryIds, currentScope(req));
    categories ? sendRawJson(res, 200, { message: 'Dashboard categories reordered', categories }) : sendNotFound(res, 'Dashboard category not found');
  }
}

export function createDashboardFoundationRoutes(
  store?: DashboardRuntimeStore,
  prismaClient?: IntraQPrismaClient | null,
  codexAgent?: CodexAgentRuntime
): DashboardFoundationRoutes {
  return new DashboardFoundationRoutes(store, prismaClient ?? null, codexAgent);
}

function sendNotFound(res: ServerResponse, message: string): void {
  sendJson(res, 404, fail(message));
}

function sendCompatOk<T>(res: ServerResponse, data: T, extra: Record<string, unknown> = {}): void {
  sendJson(res, 200, { ...ok(data), ...extra });
}

function sendCompatCreated<T>(res: ServerResponse, data: T, extra: Record<string, unknown> = {}): void {
  sendJson(res, 201, { ...ok(data), ...extra });
}

function sendRawJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function currentScope(req: IncomingMessage): DashboardAccessScope | undefined {
  return getRequestSecurityContext(req);
}

function sanitizeDashboardRenderEvent(
  value: Record<string, unknown>,
  context: { runtime: string; tenantId: string | undefined; userId: string | undefined }
): Record<string, unknown> {
  return {
    at: readOptionalString(value.at) ?? new Date().toISOString(),
    componentType: sanitizeLogText(value.componentType, 80),
    dashboardId: sanitizeLogText(value.dashboardId, 120),
    dataSourceId: sanitizeLogText(value.dataSourceId, 120),
    elementId: sanitizeLogText(value.elementId, 120),
    elementName: sanitizeLogText(value.elementName, 160),
    errorType: sanitizeLogText(value.errorType, 80),
    message: sanitizeLogMessage(value.message, 500),
    renderKind: sanitizeLogText(value.renderKind, 40),
    runtime: context.runtime,
    statusCode: readStatusCode(value.statusCode),
    tableName: sanitizeLogText(value.tableName, 160),
    tenantId: context.tenantId ?? '',
    userId: context.userId ?? ''
  };
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sanitizeLogText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function sanitizeLogMessage(value: unknown, maxLength: number): string {
  return sanitizeLogText(value, maxLength)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/token=([^&\s]+)/gi, 'token=[redacted]');
}

function readStatusCode(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue >= 100 && numberValue <= 599 ? numberValue : undefined;
}

function decodePathPart(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 10_000;
}

function readOptionalLimit(url: URL): number | null | 'invalid' {
  const raw = url.searchParams.get('limit');
  if (raw === null || raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 100) return 'invalid';
  return parsed;
}
