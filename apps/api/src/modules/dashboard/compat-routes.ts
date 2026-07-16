import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail, uuidv7 } from '@intraq/contracts';
import { readJsonBody, sendBadRequest, sendCreated, sendJson, sendOk } from '../../http.js';
import { getRequestSecurityContext } from '../../security/request-context.js';
import type { Dashboard, DashboardAccessScope, DashboardRuntimeStore, DashboardVersion } from './foundation-store.js';
import { DashboardFoundationStore } from './foundation-store.js';

export class DashboardCompatRoutes {
  private readonly versions = new Map<string, DashboardVersion[]>();
  private readonly mappings = new Map<string, Record<string, unknown>>();
  private readonly sampleVisibility = new Map<string, boolean>();

  constructor(private readonly store: DashboardRuntimeStore = new DashboardFoundationStore()) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (await this.handleImport(req, res, url)) return true;
    if (await this.handleMapping(req, res, url)) return true;
    if (await this.handleVersionCollection(req, res, url)) return true;
    if (await this.handleVersionItem(req, res, url)) return true;

    const modeMatch = /^\/api\/dashboards\/([^/]+)\/mode\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && modeMatch?.[1] && modeMatch[2]) {
      const dashboard = await this.store.getDashboardMode(decodeURIComponent(modeMatch[1]), decodeURIComponent(modeMatch[2]), currentScope(req));
      dashboard
        ? sendOk(res, { dashboardId: dashboard.id, mode: decodeURIComponent(modeMatch[2]), dashboard })
        : sendNotFound(res, 'Dashboard not found');
      return true;
    }

    const publishStatusMatch = /^\/api\/dashboards\/([^/]+)\/publish-status$/.exec(url.pathname);
    if (req.method === 'GET' && publishStatusMatch?.[1]) {
      const dashboard = await this.store.getDashboard(decodeURIComponent(publishStatusMatch[1]), currentScope(req));
      dashboard
        ? sendOk(res, { dashboardId: dashboard.id, status: dashboard.status, published: dashboard.status === 'published' })
        : sendNotFound(res, 'Dashboard not found');
      return true;
    }

    const sampleMatch = /^\/api\/dashboards\/([^/]+)\/sample-visibility$/.exec(url.pathname);
    if (req.method === 'PUT' && sampleMatch?.[1]) {
      await this.updateSampleVisibility(req, res, decodeURIComponent(sampleMatch[1]), currentScope(req));
      return true;
    }

    const revertMatch = /^\/api\/dashboards\/([^/]+)\/revert\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'POST' && revertMatch?.[1] && revertMatch[2]) {
      await this.restoreVersion(res, decodeURIComponent(revertMatch[1]), decodeURIComponent(revertMatch[2]), currentScope(req));
      return true;
    }
    return false;
  }

  private async handleImport(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname === '/api/dashboards/import/parse' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!isRecord(body)) {
        sendBadRequest(res, 'Import payload must be a JSON object.');
        return true;
      }
      sendOk(res, {
        valid: true,
        dashboard: readDashboardImport(body),
        elements: readImportCollection(body, 'elements'),
        filters: readImportCollection(body, 'filters'),
        metadata: readImportMetadata(body),
        warnings: []
      });
      return true;
    }
    if ((url.pathname === '/api/dashboards/import/create' || url.pathname === '/api/dashboards/import/self') && req.method === 'POST') {
      const body = await readJsonBody(req);
      const dashboardInput = isRecord(body) ? readDashboardImport(body) : null;
      if (!dashboardInput?.name) {
        sendBadRequest(res, 'Imported dashboard name is required.');
        return true;
      }
      sendCreated(res, await this.store.createDashboard(dashboardInput, currentScope(req)));
      return true;
    }
    return false;
  }

  private async handleMapping(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const elementsMatch = /^\/api\/dashboards\/([^/]+)\/mapping\/elements$/.exec(url.pathname);
    if (req.method === 'GET' && elementsMatch?.[1]) {
      const dashboardId = decodeURIComponent(elementsMatch[1]);
      const elements = await this.store.listElements(dashboardId, currentScope(req));
      elements
        ? sendOk(res, { dashboardId, elements: elements.map(element => ({ elementId: element.id, dataSourceId: element.dataSourceId ?? null })) })
        : sendNotFound(res, 'Dashboard not found');
      return true;
    }

    const mappingMatch = /^\/api\/dashboards\/([^/]+)\/mapping$/.exec(url.pathname);
    if (req.method === 'POST' && mappingMatch?.[1]) {
      const dashboardId = decodeURIComponent(mappingMatch[1]);
      if (!await this.store.getDashboard(dashboardId, currentScope(req))) {
        sendNotFound(res, 'Dashboard not found');
        return true;
      }
      const body = await readJsonBody(req);
      if (!isRecord(body)) {
        sendBadRequest(res, 'Mapping body must be a JSON object.');
        return true;
      }
      this.mappings.set(dashboardId, body);
      sendOk(res, { dashboardId, mapping: body, mapped: true });
      return true;
    }
    return false;
  }

  private async handleVersionCollection(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const match = /^\/api\/dashboards\/([^/]+)\/versions(?:\/(auto-save))?$/.exec(url.pathname);
    if (!match?.[1]) return false;
    const dashboardId = decodeURIComponent(match[1]);
    const dashboard = await this.store.getDashboard(dashboardId, currentScope(req));
    if (!dashboard) {
      sendNotFound(res, 'Dashboard not found');
      return true;
    }
    if (req.method === 'GET' && !match[2]) {
      const versions = this.store.listVersions ? await this.store.listVersions(dashboardId, currentScope(req)) : this.listMemoryVersions(dashboard);
      versions ? sendOk(res, versions) : sendNotFound(res, 'Dashboard not found');
      return true;
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const name = match[2] === 'auto-save' ? 'Auto save' : isRecord(body) && isNonEmptyString(body.name) ? body.name.trim() : 'Manual version';
      const version = this.store.createVersion
        ? await this.store.createVersion(dashboardId, name, { isAutoSave: match[2] === 'auto-save' }, currentScope(req))
        : this.createMemoryVersion(dashboard, name);
      version ? sendCreated(res, version) : sendNotFound(res, 'Dashboard not found');
      return true;
    }
    return false;
  }

  private async handleVersionItem(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const restoreMatch = /^\/api\/dashboards\/([^/]+)\/versions\/([^/]+)\/restore$/.exec(url.pathname);
    if (req.method === 'POST' && restoreMatch?.[1] && restoreMatch[2]) {
      await this.restoreVersion(res, decodeURIComponent(restoreMatch[1]), decodeURIComponent(restoreMatch[2]), currentScope(req));
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/dashboard-versions/compare') {
      await this.compareVersions(req, res);
      return true;
    }

    const versionMatch = /^\/api\/dashboard-versions\/([^/]+)$/.exec(url.pathname);
    if (versionMatch?.[1]) {
      const versionId = decodeURIComponent(versionMatch[1]);
      const version = this.store.getVersion ? await this.store.getVersion(versionId, currentScope(req)) : this.findMemoryVersion(versionId);
      if (!version) {
        sendNotFound(res, 'Dashboard version not found');
        return true;
      }
      if (req.method === 'GET') sendOk(res, version);
      else if (req.method === 'DELETE') {
        const deleted = this.store.deleteVersion ? await this.store.deleteVersion(version.id, currentScope(req)) : this.deleteMemoryVersion(version);
        sendOk(res, { deleted, id: version.id });
      } else {
        sendJson(res, 405, fail('Method not allowed'));
      }
      return true;
    }

    return false;
  }

  private async updateSampleVisibility(req: IncomingMessage, res: ServerResponse, dashboardId: string, scope?: DashboardAccessScope): Promise<void> {
    if (!await this.store.getDashboard(dashboardId, scope)) {
      sendNotFound(res, 'Dashboard not found');
      return;
    }
    const body = await readJsonBody(req);
    if (!isRecord(body) || typeof body.visible !== 'boolean') {
      sendBadRequest(res, 'visible boolean is required.');
      return;
    }
    this.sampleVisibility.set(dashboardId, body.visible);
    sendOk(res, { dashboardId, visible: body.visible });
  }

  private async compareVersions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.leftVersionId) || !isNonEmptyString(body.rightVersionId)) {
      sendBadRequest(res, 'leftVersionId and rightVersionId are required.');
      return;
    }
    if (this.store.compareVersions) {
      const compared = await this.store.compareVersions(body.leftVersionId, body.rightVersionId, currentScope(req));
      if (!compared) {
        sendNotFound(res, 'Dashboard version not found');
        return;
      }
      sendOk(res, compared);
      return;
    }
    const left = this.findMemoryVersion(body.leftVersionId);
    const right = this.findMemoryVersion(body.rightVersionId);
    if (!left?.snapshot || !right?.snapshot) {
      sendNotFound(res, 'Dashboard version not found');
      return;
    }
    sendOk(res, {
      leftVersionId: left.id,
      rightVersionId: right.id,
      differences: [{ field: 'name', left: left.snapshot.name, right: right.snapshot.name }]
    });
  }

  private listMemoryVersions(dashboard: Dashboard): DashboardVersion[] {
    const existing = this.versions.get(dashboard.id);
    if (existing?.length) return existing.map(clone);
    const seeded = this.createMemoryVersion(dashboard, 'Initial version');
    return [seeded];
  }

  private createMemoryVersion(dashboard: Dashboard, name: string): DashboardVersion {
    const version: DashboardVersion = {
      id: uuidv7(),
      dashboardId: dashboard.id,
      name,
      status: dashboard.status,
      snapshot: clone(dashboard),
      createdAt: dashboard.updatedAt
    };
    this.versions.set(dashboard.id, [version, ...this.listRawMemoryVersions(dashboard.id)]);
    return clone(version);
  }

  private async restoreVersion(res: ServerResponse, dashboardId: string, versionId: string, scope?: DashboardAccessScope): Promise<void> {
    if (this.store.restoreVersion) {
      const restored = await this.store.restoreVersion(dashboardId, versionId, scope);
      restored ? sendOk(res, restored) : sendNotFound(res, 'Dashboard version not found');
      return;
    }
    const version = this.listRawMemoryVersions(dashboardId).find(item => item.id === versionId);
    if (!version?.snapshot) {
      sendNotFound(res, 'Dashboard version not found');
      return;
    }
    const dashboard = await this.store.updateDashboard(dashboardId, { ...version.snapshot }, scope);
    sendOk(res, { dashboard, restoredFromVersionId: versionId });
  }

  private findMemoryVersion(versionId: string): DashboardVersion | null {
    return Array.from(this.versions.values()).flat().find(version => version.id === versionId) ?? null;
  }

  private deleteMemoryVersion(version: DashboardVersion): boolean {
    this.versions.set(version.dashboardId, this.listRawMemoryVersions(version.dashboardId).filter(item => item.id !== version.id));
    return true;
  }

  private listRawMemoryVersions(dashboardId: string): DashboardVersion[] {
    return this.versions.get(dashboardId) ?? [];
  }
}

function readDashboardImport(body: Record<string, unknown>): { name: string; category?: string; elements?: unknown[] } {
  const source = isRecord(body.dashboard) ? body.dashboard : body;
  return {
    name: isNonEmptyString(source.name) ? source.name.trim() : '',
    ...(isNonEmptyString(source.category) ? { category: source.category.trim() } : {}),
    ...(Array.isArray(source.elements) ? { elements: source.elements } : {}),
    ...(Array.isArray(source.filters) ? { filters: source.filters } : {}),
    ...(Array.isArray(source.layout) ? { layout: source.layout } : {})
  };
}

function readImportCollection(body: Record<string, unknown>, key: 'elements' | 'filters'): unknown[] {
  if (Array.isArray(body[key])) return body[key];
  if (isRecord(body.dashboard) && Array.isArray(body.dashboard[key])) return body.dashboard[key];
  return [];
}

function readImportMetadata(body: Record<string, unknown>): Record<string, unknown> {
  return isRecord(body.metadata) ? body.metadata : {};
}

function sendNotFound(res: ServerResponse, message: string): void {
  sendJson(res, 404, fail(message));
}

function currentScope(req: IncomingMessage): DashboardAccessScope | undefined {
  return getRequestSecurityContext(req);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
