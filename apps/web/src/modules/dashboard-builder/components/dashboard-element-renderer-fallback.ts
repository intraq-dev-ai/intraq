import type { DashboardElement, DashboardFilter, VisualizationData, VisualizationSpec } from '../types';
import { buildVisualizationDataRequest, type VisualizationDataRequestContext } from '../visualization/data';
import { dimensionEncoding, measureEncodings } from '../visualization/spec';
import type { DashboardElementRenderKind } from '../visualization/view-model-types';
import { chartDataCanRender } from './dashboard-element-renderer-model';

const TOKEN_EXPIRED_RELOAD_STORAGE_KEY = 'intraq:dashboard-component-token-expired-reload';
const RENDER_FALLBACK_STORAGE_KEY = 'intraq:dashboard-render-fallbacks';
const recordedRenderFallbackKeys = new Set<string>();

export function shouldUseViewerFallbackForEmptyData(
  data: VisualizationData,
  options: {
    canEditDashboard: boolean;
    renderKind: DashboardElementRenderKind;
    spec: VisualizationSpec;
  }
): boolean {
  if (options.canEditDashboard) return false;
  const hasRawRows = (data.rawData?.length ?? 0) > 0;
  if (hasRawRows) return false;
  if (options.renderKind === 'chart' && chartDataCanRender(data, options.spec)) return false;
  return data.labels.length === 0 || data.datasets.every(dataset => dataset.data.length === 0);
}

export function shouldUseViewerFallbackForRenderError(
  message: string,
  options: {
    canEditDashboard: boolean;
    requestContext: VisualizationDataRequestContext | undefined;
  }
): boolean {
  if (options.canEditDashboard || isTokenExpiredErrorMessage(message)) return false;
  if (isEmbedVisualizationRequest(options.requestContext)) return true;
  return isRecoverableDataRequestError(message);
}

export function viewerFallbackVisualizationData(
  element: DashboardElement,
  visualizationSpec: VisualizationSpec,
  filters: DashboardFilter[],
  requestContext: VisualizationDataRequestContext | undefined,
  rowLimit: number | undefined,
  renderKind: DashboardElementRenderKind
): VisualizationData {
  const request = buildVisualizationDataRequest(element, visualizationSpec, filters, { rowLimit });
  const parameterValues = {
    ...(request?.parameterValues ?? {}),
    ...(requestContext?.runtimeParameterValues ?? {})
  };
  const runtimeContext = Object.keys(parameterValues).length > 0
    ? { runtimeContext: { parameterValues } }
    : {};
  const measures = measureEncodings(visualizationSpec);
  if (renderKind === 'card') {
    const firstMeasure = measures[0];
    return {
      labels: ['value'],
      datasets: [{
        label: firstMeasure?.label ?? firstMeasure?.field ?? 'Value',
        data: [0],
        aggregatedData: true
      }],
      ...runtimeContext
    };
  }
  if (renderKind === 'table') {
    const rawRow = fallbackRawRow(element, visualizationSpec);
    return {
      labels: [''],
      datasets: fallbackDatasets(visualizationSpec),
      rawData: [rawRow],
      ...runtimeContext
    };
  }
  if (renderKind === 'matrix') {
    return {
      labels: [''],
      datasets: fallbackDatasets(visualizationSpec),
      rawData: [fallbackRawRow(element, visualizationSpec)],
      ...runtimeContext
    };
  }
  return {
    labels: [''],
    datasets: fallbackDatasets(visualizationSpec),
    ...runtimeContext
  };
}

export function isTokenExpiredErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase().replace(/[\s_-]+/g, ' ');
  return /\btoken\b/.test(normalized) && /\b(expired|invalid|unauthorized)\b/.test(normalized);
}

export function notifyParentOfEmbedTokenExpiry(
  message: string,
  element: DashboardElement,
  requestContext: VisualizationDataRequestContext | undefined
): void {
  if (typeof window === 'undefined' || window.parent === window || !isEmbedVisualizationRequest(requestContext)) return;
  window.parent.postMessage({
    type: 'ui-report:embed-token-expired',
    dashboardId: element.dashboardId,
    elementId: element.id,
    message
  }, '*');
}

export function reloadPageOnceForTokenExpiry(dashboardId: string, canEditDashboard: boolean): boolean {
  if (typeof window === 'undefined' || canEditDashboard) return false;
  const key = tokenExpiredReloadKey(dashboardId);
  if (window.sessionStorage.getItem(key) === '1') return false;
  window.sessionStorage.setItem(key, '1');
  window.setTimeout(() => window.location.reload(), 50);
  return true;
}

export function clearTokenExpiredReloadMarker(dashboardId: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(tokenExpiredReloadKey(dashboardId));
}

export function recordSuppressedRenderError(
  message: string,
  element: DashboardElement,
  visualizationSpec: VisualizationSpec,
  requestContext: VisualizationDataRequestContext | undefined,
  renderKind: DashboardElementRenderKind
): void {
  if (typeof window === 'undefined') return;
  const event = {
    at: new Date().toISOString(),
    componentType: element.type,
    dashboardId: element.dashboardId,
    dataSourceId: visualizationSpec.dataRef?.sourceId ?? '',
    elementId: element.id,
    elementName: element.name,
    errorType: recoverableDataRequestErrorType(message),
    message: sanitizeClientLogMessage(message),
    renderKind,
    runtime: isEmbedVisualizationRequest(requestContext) ? 'embed' : 'view',
    statusCode: statusCodeFromErrorMessage(message),
    tableName: visualizationSpec.dataRef?.tableName ?? ''
  };
  const eventKey = [
    event.runtime,
    event.dashboardId,
    event.elementId,
    event.errorType,
    event.statusCode,
    event.message
  ].join(':');
  if (recordedRenderFallbackKeys.has(eventKey)) return;
  recordedRenderFallbackKeys.add(eventKey);
  writeRenderFallbackToSessionStorage(event);
  console.warn('Dashboard component render fallback', event);
  void sendRenderFallbackEvent(event, requestContext);
}

function fallbackDatasets(visualizationSpec: VisualizationSpec): VisualizationData['datasets'] {
  const measures = measureEncodings(visualizationSpec);
  if (measures.length === 0) return [{ label: 'Value', data: [0], aggregatedData: true }];
  return measures.map(measure => ({
    label: measure.label ?? measure.field,
    data: [0],
    aggregatedData: true
  }));
}

function fallbackRawRow(element: DashboardElement, visualizationSpec: VisualizationSpec): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const dimension = dimensionEncoding(visualizationSpec);
  if (dimension?.field) row[dimension.field] = '';
  for (const key of configuredColumnKeys(element)) {
    if (!(key in row)) row[key] = '';
  }
  for (const measure of measureEncodings(visualizationSpec)) {
    row[measure.field] = 0;
  }
  if (Object.keys(row).length === 0) row.Value = 0;
  return row;
}

function configuredColumnKeys(element: DashboardElement): string[] {
  const columns = element.config?.columns;
  if (!Array.isArray(columns)) return [];
  return columns.flatMap(column => {
    if (typeof column === 'string' && column.trim()) return [column.trim()];
    if (!isPlainRecord(column)) return [];
    const key = readNonEmptyString(column.field) ?? readNonEmptyString(column.key) ?? readNonEmptyString(column.name);
    return key ? [key] : [];
  });
}

function isRecoverableDataRequestError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('api data source request failed')
    || normalized.includes('api data source request timed out')
    || normalized.includes('api token response did not include a token')
    || normalized.includes('visualization data request failed')
    || normalized.includes('visualization data request timed out')
    || normalized.includes('data source request failed')
    || normalized.includes('request failed with status');
}

function isEmbedVisualizationRequest(requestContext: VisualizationDataRequestContext | undefined): boolean {
  const endpoint = requestContext?.endpoint ?? '';
  return Boolean(requestContext?.token && endpoint.includes('/api/embed/'));
}

function tokenExpiredReloadKey(dashboardId: string): string {
  return `${TOKEN_EXPIRED_RELOAD_STORAGE_KEY}:${window.location.origin}:${window.location.pathname}:${dashboardId}`;
}

function writeRenderFallbackToSessionStorage(event: Record<string, unknown>): void {
  try {
    const existing = JSON.parse(window.sessionStorage.getItem(RENDER_FALLBACK_STORAGE_KEY) ?? '[]') as unknown;
    const events = Array.isArray(existing) ? existing : [];
    events.unshift(event);
    window.sessionStorage.setItem(RENDER_FALLBACK_STORAGE_KEY, JSON.stringify(events.slice(0, 50)));
  } catch {
    // Session storage is diagnostic-only. Rendering should continue if it is unavailable.
  }
}

async function sendRenderFallbackEvent(
  event: Record<string, unknown>,
  requestContext: VisualizationDataRequestContext | undefined
): Promise<void> {
  const isEmbed = isEmbedVisualizationRequest(requestContext);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (isEmbed && requestContext?.token) headers.authorization = `Bearer ${requestContext.token}`;
  if (isEmbed && requestContext?.embedOrigin) headers['x-embed-origin'] = requestContext.embedOrigin;
  const endpoint = isEmbed ? '/api/embed/render-events' : '/api/dashboard-render-events';
  try {
    await fetch(endpoint, {
      body: JSON.stringify(event),
      cache: 'no-store',
      headers,
      keepalive: true,
      method: 'POST'
    });
  } catch {
    // Server-side diagnostics are best-effort; the visible fallback must not depend on telemetry.
  }
}

function recoverableDataRequestErrorType(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('api token response did not include a token')) return 'api_token_missing';
  if (normalized.includes('timed out')) return 'timeout';
  if (normalized.includes('api data source request failed')) return 'api_data_source_request_failed';
  if (normalized.includes('visualization data request failed')) return 'visualization_data_request_failed';
  if (normalized.includes('request failed with status')) return 'request_failed';
  return 'data_request_failed';
}

function statusCodeFromErrorMessage(message: string): number | undefined {
  const match = /\bstatus\s+(\d{3})\b/i.exec(message);
  if (!match?.[1]) return undefined;
  const statusCode = Number(match[1]);
  return Number.isInteger(statusCode) ? statusCode : undefined;
}

function sanitizeClientLogMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/token=([^&\s]+)/gi, 'token=[redacted]')
    .slice(0, 500);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
