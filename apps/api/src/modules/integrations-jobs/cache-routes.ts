import type { IncomingMessage, ServerResponse } from 'node:http';
import { readCompatRecord, sendCompatBadRequest, sendCompatJson } from './compat-http.js';
import type { CacheSettings, IntegrationsJobsStore, TenantCacheSettings } from './store.js';
import { decodePart, isRecord } from './shared.js';

const globalCacheEnabled = true;
const globalCacheTTL = 300;
const redisAvailable = false;

export class CacheManagementCompatRoutes {
  constructor(private readonly store: IntegrationsJobsStore) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/cache/stats') return this.stats(res);
    if (req.method === 'POST' && url.pathname === '/api/cache/clear') return this.clearAll(res);
    if (req.method === 'POST' && url.pathname === '/api/cache/clear-pattern') return this.clearPattern(req, res);

    const clearDataSourceMatch = /^\/api\/cache\/clear-data-source\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'POST' && clearDataSourceMatch?.[1]) {
      return this.clearDataSource(res, decodePart(clearDataSourceMatch[1]));
    }

    const dataSourceSettingsMatch = /^\/api\/data-sources\/([^/]+)\/cache-settings$/.exec(url.pathname);
    if (dataSourceSettingsMatch?.[1]) {
      return this.handleDataSourceSettings(req, res, decodePart(dataSourceSettingsMatch[1]));
    }

    const tenantSettingsMatch = /^\/api\/tenants\/([^/]+)\/cache-settings$/.exec(url.pathname);
    if (tenantSettingsMatch?.[1]) {
      return this.handleTenantSettings(req, res, decodePart(tenantSettingsMatch[1]));
    }

    return false;
  }

  private stats(res: ServerResponse): true {
    sendCompatJson(res, 200, {
      success: true,
      stats: {
        enabled: true,
        redisAvailable,
        totalKeys: this.store.cacheEntries.size,
        memoryUsed: `${[...this.store.cacheEntries.values()].reduce((sum, entry) => sum + entry.sizeBytes, 0)} bytes`,
        keys: [...this.store.cacheEntries.keys()],
        config: { provider: 'memory', defaultTTL: globalCacheTTL }
      }
    });
    return true;
  }

  private clearAll(res: ServerResponse): true {
    this.store.cacheEntries.clear();
    sendCompatJson(res, 200, { success: true, message: 'Cache cleared successfully' });
    return true;
  }

  private async clearPattern(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const body = await readCompatRecord(req);
    if (!body || typeof body.pattern !== 'string' || body.pattern.trim().length === 0) {
      sendCompatJson(res, 400, { error: 'Pattern is required' });
      return true;
    }

    const deletedCount = deleteMatchingKeys(this.store.cacheEntries, body.pattern.trim());
    sendCompatJson(res, 200, {
      success: true,
      message: `Cleared ${deletedCount} cache entries`,
      deletedCount
    });
    return true;
  }

  private clearDataSource(res: ServerResponse, dataSourceId: string): true {
    const deletedCount = deleteMatchingKeys(this.store.cacheEntries, `${dataSourceId}:*`);
    sendCompatJson(res, 200, {
      success: true,
      message: `Cleared ${deletedCount} cache entries for data source`,
      deletedCount
    });
    return true;
  }

  private async handleDataSourceSettings(req: IncomingMessage, res: ServerResponse, id: string): Promise<true> {
    const settings = this.store.cacheSettings.get(id);
    if (!settings) {
      sendCompatJson(res, 404, { error: 'Data source not found' });
      return true;
    }
    if (req.method === 'GET') {
      sendCompatJson(res, 200, this.dataSourcePayload(settings));
      return true;
    }
    if (req.method === 'PATCH') {
      const body = await readCompatRecord(req);
      if (!body) {
        sendCompatBadRequest(res, 'Cache settings body must be a JSON object.');
        return true;
      }
      if (!this.validateCachePatch(res, body, true)) return true;
      applyDataSourcePatch(settings, body);
      sendCompatJson(res, 200, {
        message: 'Cache settings updated successfully',
        ...this.dataSourcePayload(settings)
      });
      return true;
    }
    sendCompatJson(res, 405, { success: false, error: 'Method not allowed' });
    return true;
  }

  private async handleTenantSettings(req: IncomingMessage, res: ServerResponse, id: string): Promise<true> {
    const settings = this.store.tenantCacheSettings.get(id);
    if (!settings) {
      sendCompatJson(res, 404, { error: 'Tenant not found' });
      return true;
    }
    if (req.method === 'GET') {
      sendCompatJson(res, 200, this.tenantPayload(settings));
      return true;
    }
    if (req.method === 'PATCH') {
      const body = await readCompatRecord(req);
      if (!body) {
        sendCompatBadRequest(res, 'Tenant cache settings body must be a JSON object.');
        return true;
      }
      if (!this.validateCachePatch(res, body, false)) return true;
      applyTenantPatch(settings, body);
      sendCompatJson(res, 200, {
        message: 'Tenant cache settings updated successfully',
        ...this.tenantPayload(settings)
      });
      return true;
    }
    sendCompatJson(res, 405, { success: false, error: 'Method not allowed' });
    return true;
  }

  private validateCachePatch(res: ServerResponse, body: Record<string, unknown>, allowSettings: boolean): boolean {
    if (body.cacheEnabled !== undefined && typeof body.cacheEnabled !== 'boolean' && body.cacheEnabled !== null) {
      sendCompatBadRequest(res, 'cacheEnabled must be a boolean or null');
      return false;
    }
    if (body.cacheTTL !== undefined && body.cacheTTL !== null) {
      const ttl = Number.parseInt(String(body.cacheTTL), 10);
      if (Number.isNaN(ttl) || ttl < 0) {
        sendCompatBadRequest(res, 'cacheTTL must be a positive number or null');
        return false;
      }
    }
    if (allowSettings && body.cacheSettings !== undefined && body.cacheSettings !== null && !isRecord(body.cacheSettings)) {
      sendCompatBadRequest(res, 'cacheSettings must be an object or null');
      return false;
    }
    return true;
  }

  private dataSourcePayload(settings: CacheSettings): Record<string, unknown> {
    return {
      dataSourceId: settings.dataSourceId,
      dataSourceName: settings.dataSourceName,
      cacheEnabled: settings.cacheEnabled,
      cacheTTL: settings.cacheTTL,
      cacheSettings: settings.cacheSettings,
      tenantCacheEnabled: settings.tenantCacheEnabled,
      tenantCacheTTL: settings.tenantCacheTTL,
      globalCacheEnabled,
      globalCacheTTL,
      redisAvailable,
      effectiveCacheEnabled: settings.cacheEnabled ?? settings.tenantCacheEnabled ?? globalCacheEnabled,
      effectiveCacheTTL: settings.cacheTTL ?? settings.tenantCacheTTL ?? globalCacheTTL
    };
  }

  private tenantPayload(settings: TenantCacheSettings): Record<string, unknown> {
    return {
      tenantId: settings.tenantId,
      tenantName: settings.tenantName,
      cacheEnabled: settings.cacheEnabled,
      cacheTTL: settings.cacheTTL,
      globalCacheEnabled,
      globalCacheTTL,
      redisAvailable,
      effectiveCacheEnabled: settings.cacheEnabled ?? globalCacheEnabled,
      effectiveCacheTTL: settings.cacheTTL ?? globalCacheTTL
    };
  }
}

function applyDataSourcePatch(settings: CacheSettings, body: Record<string, unknown>): void {
  if ('cacheEnabled' in body) settings.cacheEnabled = body.cacheEnabled as boolean | null;
  if ('cacheTTL' in body) settings.cacheTTL = body.cacheTTL === null ? null : Number.parseInt(String(body.cacheTTL), 10);
  if ('cacheSettings' in body) settings.cacheSettings = isRecord(body.cacheSettings) ? body.cacheSettings : null;
}

function applyTenantPatch(settings: TenantCacheSettings, body: Record<string, unknown>): void {
  if ('cacheEnabled' in body) settings.cacheEnabled = body.cacheEnabled as boolean | null;
  if ('cacheTTL' in body) settings.cacheTTL = body.cacheTTL === null ? null : Number.parseInt(String(body.cacheTTL), 10);
}

function deleteMatchingKeys(entries: Map<string, unknown>, pattern: string): number {
  const keys = [...entries.keys()].filter(key => matchesPattern(key, pattern));
  for (const key of keys) entries.delete(key);
  return keys.length;
}

function matchesPattern(key: string, pattern: string): boolean {
  if (!pattern.includes('*')) return key === pattern;
  const escaped = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${escaped}$`).test(key);
}
