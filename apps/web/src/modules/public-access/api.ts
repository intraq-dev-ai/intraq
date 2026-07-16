import type {
  EmbedAppearance,
  EmbedDashboard,
  EmbedDashboardElement,
  EmbedDashboardFilter,
  EmbeddedDashboardPayload,
  EmbedDataSource,
  EmbedDataSourcePreview,
  EmbedDataTable,
  EmbedField,
  PublicAccessTenant,
  PublicAccessUser
} from './types';
import { publicAccessApiPath } from './runtime-api-base';

interface JsonRequestOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  embedOrigin?: string;
  token?: string;
}

export async function validateEmbedToken(token: string, domain: string): Promise<void> {
  const path = `/api/embed/validate-token?token=${encodeURIComponent(token)}&domain=${encodeURIComponent(domain)}`;
  const payload = await requestJson(path);
  if (!isRecord(payload) || payload.success !== true || payload.valid !== true) {
    throw new Error(readErrorMessage(payload) ?? 'Embed token validation failed.');
  }
}

export async function fetchEmbeddedDashboard(
  dashboardId: string,
  token: string,
  embedOrigin?: string
): Promise<EmbeddedDashboardPayload> {
  const payload = await requestJson(`/api/embed/dashboard/${encodeURIComponent(dashboardId)}`, embedTokenOptions(token, embedOrigin));
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.dashboard)) {
    throw new Error(readErrorMessage(payload) ?? 'Embedded dashboard response was not valid.');
  }

  return {
    accessContext: normalizeRecord(payload.accessContext ?? payload.context),
    dashboard: normalizeDashboard(payload.dashboard, dashboardId),
    appearance: normalizeAppearance(payload.appearance),
    tenant: normalizeTenant(payload.tenant),
    user: normalizeUser(payload.user)
  };
}

export async function fetchEmbedDataSources(token: string, embedOrigin?: string): Promise<EmbedDataSource[]> {
  const payload = await requestJson('/api/embed/data-sources', embedTokenOptions(token, embedOrigin));
  const data = Array.isArray(payload) ? payload : unwrapDataArray(payload);
  return data.map(normalizeDataSource).filter(isPresent);
}

export async function fetchEmbedDataSourcePreview(
  sourceId: string,
  token: string,
  limit = 25,
  embedOrigin?: string
): Promise<EmbedDataSourcePreview> {
  const path = `/api/embed/data-sources/${encodeURIComponent(sourceId)}/fields-and-data?limit=${limit}`;
  const payload = await requestJson(path, embedTokenOptions(token, embedOrigin));
  if (!isRecord(payload)) throw new Error('Data source preview response was not valid.');

  return {
    sourceId,
    tableName: readString(payload.tableName) ?? sourceId,
    fields: normalizeFields(payload.fields),
    rows: Array.isArray(payload.rows) ? payload.rows.filter(isRecord) : [],
    total: readNumber(payload.total) ?? 0,
    hasData: payload.hasData === true
  };
}

function embedTokenOptions(token: string, embedOrigin?: string): JsonRequestOptions {
  return {
    token,
    ...(embedOrigin ? { embedOrigin } : {})
  };
}

async function requestJson(path: string, options: JsonRequestOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  const requestPath = publicAccessApiPath(path);

  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.embedOrigin) headers['x-embed-origin'] = options.embedOrigin;
  if (options.body) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(requestPath, init);
  const payload = await readResponseJson(requestPath, response);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload) ?? `Request to ${requestPath} failed with status ${response.status}.`);
  }
  if (isRecord(payload) && payload.success === false) {
    throw new Error(readErrorMessage(payload) ?? `Request to ${requestPath} failed.`);
  }
  return payload;
}

async function readResponseJson(path: string, response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error(`Response from ${path} was not valid JSON.`);
  }
}

function normalizeDashboard(value: Record<string, unknown>, fallbackId: string): EmbedDashboard {
  const dashboard: EmbedDashboard = {
    id: readString(value.id) ?? fallbackId,
    name: readString(value.name) ?? 'Embedded Dashboard',
    config: isRecord(value.config) ? value.config : {},
    elements: Array.isArray(value.elements)
      ? value.elements.map(normalizeElement).filter(isPresent)
      : [],
    filters: Array.isArray(value.filters)
      ? value.filters.map(normalizeFilter).filter(isPresent)
      : [],
    isEmbedded: value.isEmbedded === true
  };
  const category = readString(value.category);
  if (category) dashboard.category = category;
  if (isRecord(value.settings)) dashboard.settings = value.settings;
  return dashboard;
}

function normalizeElement(value: unknown, index: number): EmbedDashboardElement | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id) ?? readString(isRecord(value.layout) ? value.layout.i : undefined) ?? `element-${index + 1}`;
  const config = isRecord(value.config) ? value.config : {};
  const title = readString(value.title)
    ?? readString(value.name)
    ?? readString(config.title)
    ?? readString(config.wrapperTitle)
    ?? `Dashboard Element ${index + 1}`;
  const element: EmbedDashboardElement = {
    id,
    title,
    type: readString(value.type) ?? 'chart',
    config,
    layout: isRecord(value.layout) ? normalizeLayout(value.layout) : {}
  };
  const chartType = readString(value.chartType);
  if (chartType) element.chartType = chartType;
  const dataSourceId = readString(value.dataSourceId);
  if (dataSourceId) element.dataSourceId = dataSourceId;
  const order = readNumber(value.order);
  if (order !== null) element.order = order;
  if (typeof value.isVisible === 'boolean') element.isVisible = value.isVisible;
  return element;
}

function normalizeLayout(value: Record<string, unknown>): EmbedDashboardElement['layout'] {
  const layout: EmbedDashboardElement['layout'] = {};
  const i = readString(value.i);
  if (i) layout.i = i;
  for (const key of ['x', 'y', 'w', 'h'] as const) {
    const numberValue = readNumber(value[key]);
    if (numberValue !== null) layout[key] = numberValue;
  }
  return layout;
}

function normalizeFilter(value: unknown): EmbedDashboardFilter | null {
  if (!isRecord(value)) return null;
  const config = isRecord(value.config) ? value.config : {};
  const field = readString(value.field) ?? readString(config.field);
  if (!field) return null;
  const filter: EmbedDashboardFilter = {
    id: readString(value.id) ?? field,
    config,
    field,
    label: readString(value.label) ?? readString(value.name) ?? readString(config.label) ?? field
  };
  const name = readString(value.name);
  const operator = readString(value.operator) ?? readString(config.operator);
  const type = readString(value.type) ?? readString(config.type);
  const startDate = readString(value.startDate) ?? readString(config.startDate);
  const endDate = readString(value.endDate) ?? readString(config.endDate);
  const valueSource = value.value ?? config.value;
  if (name) filter.name = name;
  if (operator) filter.operator = operator;
  if (type) filter.type = type;
  if (valueSource !== undefined) filter.value = valueSource;
  if (typeof value.isActive === 'boolean') filter.isActive = value.isActive;
  if (startDate) filter.startDate = startDate;
  if (endDate) filter.endDate = endDate;
  return filter;
}

function normalizeDataSource(value: unknown): EmbedDataSource | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id) ?? readString(value.dataSourceId);
  const name = readString(value.name);
  if (!id || !name) return null;

  const tables = Array.isArray(value.tables) ? value.tables.map(normalizeTable).filter(isPresent) : [];
  const source: EmbedDataSource = {
    id,
    dataSourceId: readString(value.dataSourceId) ?? id,
    name,
    tables
  };
  const type = readString(value.type);
  if (type) source.type = type;
  const tableName = readString(value.tableName);
  if (tableName) source.tableName = tableName;
  return source;
}

function normalizeTable(value: unknown): EmbedDataTable | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name);
  if (!name) return null;
  return {
    id: readString(value.id) ?? name,
    name,
    fields: normalizeFields(value.fields),
    isSelected: value.isSelected === true
  };
}

function normalizeFields(value: unknown): EmbedField[] {
  if (!Array.isArray(value)) return [];
  return value.map(field => {
    if (typeof field === 'string') return { name: field, type: 'unknown', description: '' };
    if (!isRecord(field)) return null;
    const name = readString(field.name);
    if (!name) return null;
    return {
      name,
      type: readString(field.type) ?? 'unknown',
      description: readString(field.description) ?? ''
    };
  }).filter(isPresent);
}

function normalizeTenant(value: unknown): PublicAccessTenant | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  return id && name ? { id, name } : null;
}

function normalizeUser(value: unknown): PublicAccessUser | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const tenantId = readString(value.tenantId);
  return id && tenantId ? { id, tenantId } : null;
}

function normalizeAppearance(value: unknown): EmbedAppearance | null {
  if (!isRecord(value)) return null;
  const appearance: EmbedAppearance = {};
  const behavior = normalizeAppearanceBehavior(value.behavior);
  if (behavior) appearance.behavior = behavior;
  if (typeof value.showExpand === 'boolean') appearance.showExpand = value.showExpand;
  if (typeof value.showExport === 'boolean') appearance.showExport = value.showExport;
  if (typeof value.showFilters === 'boolean') appearance.showFilters = value.showFilters;
  if (typeof value.showHeader === 'boolean') appearance.showHeader = value.showHeader;
  return Object.keys(appearance).length > 0 ? appearance : null;
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? { ...value } : null;
}

function normalizeAppearanceBehavior(value: unknown): EmbedAppearance['behavior'] | null {
  if (!isRecord(value)) return null;
  const behavior: NonNullable<EmbedAppearance['behavior']> = {};
  if (typeof value.handshakeTimeoutMs === 'number' && Number.isFinite(value.handshakeTimeoutMs)) behavior.handshakeTimeoutMs = value.handshakeTimeoutMs;
  if (typeof value.hideMultiSelectSummary === 'boolean') behavior.hideMultiSelectSummary = value.hideMultiSelectSummary;
  if (typeof value.multiSelectCloseOnSelect === 'boolean') behavior.multiSelectCloseOnSelect = value.multiSelectCloseOnSelect;
  if (typeof value.singleSelectClearable === 'boolean') behavior.singleSelectClearable = value.singleSelectClearable;
  if (typeof value.singleSelectSearchable === 'boolean') behavior.singleSelectSearchable = value.singleSelectSearchable;
  return Object.keys(behavior).length > 0 ? behavior : null;
}

function unwrapDataArray(payload: unknown): unknown[] {
  if (!isRecord(payload)) return [];
  return Array.isArray(payload.data) ? payload.data : [];
}

function unwrapDataObject(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null;
  return payload.data;
}

function readErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return readString(value.error) ?? readString(value.message);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}
