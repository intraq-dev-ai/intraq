import type { DashboardDataCachePolicy } from '../dashboard-data-cache-policy';
import {
  dashboardDataCacheTtlMs,
  defaultDashboardDataCachePolicy
} from '../dashboard-data-cache-policy';
import type {
  DashboardElement,
  DashboardFilter,
  VisualizationData,
  VisualizationSpec
} from '../types';
import { applyCalculatedFieldsToVisualizationData } from './calculated-fields';
import { buildVisualizationDataRequest as buildDataRequest, toChartDataApiRequest } from './data-request';
import type {
  LoadVisualizationDataOptions,
  SharedVisualizationDataGroupItem,
  VisualizationDataRequest,
  VisualizationDataRequestContext
} from './data-request-types';
import {
  parameterValuesPatch,
  runtimeParameterValuesPatch,
  stableStringify,
  withVisualizationRuntimeContext
} from './data-utils';
import {
  sharedDataGroupId,
  sharedLimitPatch,
  sharedRequestSignature,
  sharedSortForSource,
  sharedSourceFields,
  visualizationDataFromSharedRows
} from './data-shared';
import { fallbackVisualizationData } from './fallback-data';
import { indexedDBVisualizationDataCache } from './indexed-db-cache';
import { labelForField } from './request-field-names';
import { visualizationSpecFromElement } from './spec';

export { buildVisualizationDataRequest, toChartDataApiRequest } from './data-request';
export type {
  VisualizationDataRequest,
  VisualizationDataRequestContext
} from './data-request-types';

const visualizationDataCache = new Map<string, { expiresAt: number; promise: Promise<VisualizationData> }>();
const MAX_CACHE_ENTRIES = 30;
const SHARED_LIVE_REQUEST_COALESCE_MS = 1_000;
const VISUALIZATION_DATA_REQUEST_TIMEOUT_MS = 125_000;

export async function loadVisualizationData(
  element: DashboardElement,
  spec: VisualizationSpec,
  dashboardFilters: DashboardFilter[] = [],
  options: LoadVisualizationDataOptions = {}
): Promise<VisualizationData> {
  const request = buildDataRequest(element, spec, dashboardFilters, { rowLimit: options.rowLimit });
  if (!request) return applyCalculatedFieldsToVisualizationData(element, spec, fallbackVisualizationData(spec));
  const cachePolicy = options.cachePolicy ?? defaultDashboardDataCachePolicy;
  const sharedData = await loadSharedVisualizationData(element, spec, dashboardFilters, request, {
    ...options,
    cachePolicy
  });
  const data = sharedData ?? await loadVisualizationDataRequest(request, cachePolicy, options);
  return applyCalculatedFieldsToVisualizationData(element, spec, withVisualizationRuntimeContext(data, request, options.requestContext));
}

export function clearVisualizationDataCache(): void {
  visualizationDataCache.clear();
  void indexedDBVisualizationDataCache.clearAll().catch(() => {
    // IndexedDB is an optional acceleration layer. Rendering should continue if browser storage rejects a value.
  });
}

async function loadCachedOrFreshVisualizationData(
  request: VisualizationDataRequest,
  cacheKey: string,
  cacheTtlMs: number,
  requestContext?: VisualizationDataRequestContext | undefined
): Promise<VisualizationData> {
  const persisted = await indexedDBVisualizationDataCache.get(cacheKey, { maxAgeMs: cacheTtlMs });
  if (persisted) return persisted;
  return requestAndPersistVisualizationData(request, cacheKey, { cacheTtlMs, persist: true, requestContext });
}

async function loadVisualizationDataRequest(
  request: VisualizationDataRequest,
  cachePolicy: DashboardDataCachePolicy,
  options: LoadVisualizationDataOptions,
  cacheKey = visualizationDataCacheKey(request, cachePolicy, options.requestContext)
): Promise<VisualizationData> {
  const cacheTtlMs = dashboardDataCacheTtlMs(cachePolicy);
  const shouldUseCache = cacheTtlMs > 0 && !options.refresh && !options.signal;
  if (!shouldUseCache) {
    return requestAndPersistVisualizationData(request, cacheKey, {
      cacheTtlMs: 0,
      persist: false,
      requestContext: options.requestContext,
      signal: options.signal
    });
  }

  const cached = visualizationDataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  if (cached) visualizationDataCache.delete(cacheKey);

  const pending = loadCachedOrFreshVisualizationData(request, cacheKey, cacheTtlMs, options.requestContext).catch(error => {
    visualizationDataCache.delete(cacheKey);
    throw error;
  });
  visualizationDataCache.set(cacheKey, {
    expiresAt: Date.now() + cacheTtlMs,
    promise: pending
  });
  pruneVisualizationDataCache();
  return pending;
}

async function requestAndPersistVisualizationData(
  request: VisualizationDataRequest,
  cacheKey: string,
  options: {
    cacheTtlMs: number;
    persist: boolean;
    requestContext?: VisualizationDataRequestContext | undefined;
    signal?: AbortSignal | undefined;
  }
): Promise<VisualizationData> {
  const data = await requestVisualizationData(request, options.signal, options.cacheTtlMs <= 0, options.requestContext);
  if (options.persist) {
    void indexedDBVisualizationDataCache.set(cacheKey, data, {
      dataSourceId: request.dataSourceId,
      request,
      rowCount: data.rawData?.length ?? data.labels.length,
      tableName: request.tableName
    }).catch(() => {
      // IndexedDB is an optional acceleration layer. Rendering should continue if browser storage rejects a value.
    });
  }
  return data;
}

function visualizationDataCacheKey(
  request: VisualizationDataRequest,
  cachePolicy: DashboardDataCachePolicy,
  requestContext?: VisualizationDataRequestContext | undefined
): string {
  const runtimeParameters = runtimeParameterValuesPatch(requestContext?.runtimeParameterValues).parameterValues ?? {};
  const runtimeKey = Object.keys(runtimeParameters).length > 0 ? `:${stableStringify(runtimeParameters)}` : '';
  return `dashboard-viz:${requestContext?.cacheKeyPrefix ?? 'app'}${runtimeKey}:${cachePolicy}:${JSON.stringify(request)}`;
}

async function requestVisualizationData(
  request: VisualizationDataRequest,
  signal?: AbortSignal,
  noStore = false,
  requestContext?: VisualizationDataRequestContext | undefined
): Promise<VisualizationData> {
  const timeout = requestSignalWithTimeout(signal, VISUALIZATION_DATA_REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(noStore ? { 'cache-control': 'no-store' } : {})
  };
  if (requestContext?.token) headers.authorization = `Bearer ${requestContext.token}`;
  if (requestContext?.embedOrigin) headers['x-embed-origin'] = requestContext.embedOrigin;
  const init: RequestInit = {
    cache: noStore ? 'no-store' : 'default',
    method: 'POST',
    headers,
    body: JSON.stringify(toChartDataApiRequest(request, requestContext?.token ? undefined : requestContext?.runtimeParameterValues))
  };
  if (timeout.signal) init.signal = timeout.signal;
  try {
    const response = await fetch(requestContext?.endpoint ?? '/api/chart-data', init);
    const payload = await parseVisualizationPayload(response);
    if (!response.ok || payload.success !== true || !payload.data) {
      throw new Error(payload.error ?? 'Visualization data request failed.');
    }
    return payload.data;
  } catch (error) {
    if (timeout.didTimeout()) throw new Error('Visualization data request timed out.');
    throw error;
  } finally {
    timeout.cleanup();
  }
}

async function loadSharedVisualizationData(
  element: DashboardElement,
  spec: VisualizationSpec,
  dashboardFilters: DashboardFilter[],
  request: VisualizationDataRequest,
  options: LoadVisualizationDataOptions & { cachePolicy: DashboardDataCachePolicy }
): Promise<VisualizationData | null> {
  const groupId = sharedDataGroupId(element.config);
  if (!groupId || !options.peerElements?.length) return null;
  const currentSignature = sharedRequestSignature(request);
  const currentElementId = element.id;
  const peers = options.peerElements.flatMap(peer => {
    if (!peer.isVisible || sharedDataGroupId(peer.config) !== groupId) return [];
    const peerSpec = peer.id === currentElementId ? spec : visualizationSpecFromElement(peer);
    const peerRequest = peer.id === currentElementId
      ? request
      : buildDataRequest(peer, peerSpec, dashboardFilters, { rowLimit: options.rowLimit });
    if (!peerRequest || sharedRequestSignature(peerRequest) !== currentSignature) return [];
    return [{ element: peer, request: peerRequest, spec: peerSpec }];
  });
  const group: SharedVisualizationDataGroupItem[] = peers.some(peer => peer.element.id === currentElementId)
    ? peers
    : [{ element, request, spec }, ...peers];
  if (group.length < 2) return null;

  const fields = sharedSourceFields(group);
  if (fields.length === 0) return null;
  const sharedRequest: VisualizationDataRequest = {
    dataSourceId: request.dataSourceId,
    tableName: request.tableName,
    editMode: true,
    ...parameterValuesPatch(request.parameterValues),
    visualization: {
      kind: 'table',
      encodings: fields.map(field => ({
        field,
        label: labelForField(field),
        role: 'dimension' as const
      })),
      filters: request.visualization.filters,
      sort: sharedSortForSource(request.visualization.sort),
      ...sharedLimitPatch(group)
    }
  };
  const sharedCacheKey = visualizationDataCacheKey(sharedRequest, options.cachePolicy, options.requestContext);
  const sharedData = await loadSharedSourceVisualizationData(sharedRequest, options, sharedCacheKey);
  if (!sharedData.rawData?.length) return null;
  return visualizationDataFromSharedRows(request, spec, element, sharedData.rawData);
}

async function loadSharedSourceVisualizationData(
  request: VisualizationDataRequest,
  options: LoadVisualizationDataOptions & { cachePolicy: DashboardDataCachePolicy },
  cacheKey: string
): Promise<VisualizationData> {
  if (dashboardDataCacheTtlMs(options.cachePolicy) > 0) {
    return loadVisualizationDataRequest(request, options.cachePolicy, options, cacheKey);
  }
  const liveCacheKey = `shared-live:${cacheKey}`;
  const cached = visualizationDataCache.get(liveCacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  if (cached) visualizationDataCache.delete(liveCacheKey);
  const pending = requestAndPersistVisualizationData(request, liveCacheKey, {
    cacheTtlMs: 0,
    persist: false,
    requestContext: options.requestContext,
    signal: options.signal
  }).catch(error => {
    visualizationDataCache.delete(liveCacheKey);
    throw error;
  });
  visualizationDataCache.set(liveCacheKey, {
    expiresAt: Date.now() + SHARED_LIVE_REQUEST_COALESCE_MS,
    promise: pending
  });
  pruneVisualizationDataCache();
  return pending;
}

async function parseVisualizationPayload(
  response: Response
): Promise<{ success?: boolean; data?: VisualizationData; error?: string }> {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) return { success: false, error: `Visualization data request failed with status ${response.status}.` };
    throw new Error('Visualization data response was empty.');
  }
  try {
    return JSON.parse(text) as { success?: boolean; data?: VisualizationData; error?: string };
  } catch {
    if (!response.ok) {
      const detail = text.replace(/\s+/g, ' ').trim().slice(0, 180);
      throw new Error(detail
        ? `Visualization data request failed with status ${response.status}: ${detail}`
        : `Visualization data request failed with status ${response.status}.`);
    }
    throw new Error('Visualization data response was not valid JSON.');
  }
}

function pruneVisualizationDataCache(cache: Map<string, { expiresAt: number; promise: Promise<VisualizationData> }> = visualizationDataCache): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (!firstKey) return;
    cache.delete(firstKey);
  }
}

function requestSignalWithTimeout(signal: AbortSignal | undefined, timeoutMs: number): {
  cleanup: () => void;
  didTimeout: () => boolean;
  signal?: AbortSignal;
} {
  if (typeof AbortController === 'undefined') {
    return { cleanup: () => undefined, didTimeout: () => false, ...(signal ? { signal } : {}) };
  }
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const abortFromParent = (): void => controller.abort();
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener('abort', abortFromParent, { once: true });
  }
  return {
    cleanup: () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromParent);
    },
    didTimeout: () => didTimeout,
    signal: controller.signal
  };
}
