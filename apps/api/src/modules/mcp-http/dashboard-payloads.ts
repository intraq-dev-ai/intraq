import type { Dashboard, DashboardElement, DashboardFilter } from '../dashboard/foundation-store.js';
import { isRecord } from './route-utils.js';

export function dashboardShellPayload(args: Record<string, unknown>): Record<string, unknown> & { name: string } {
  const name = readRequiredString(args.name, 'name');
  const payload: Record<string, unknown> & { name: string } = {
    category: readOptionalString(args.category) ?? 'Operations',
    description: readOptionalString(args.description) ?? 'Created through MCP',
    name
  };
  if (isRecord(args.settings)) payload.settings = args.settings;
  return payload;
}

export function dashboardDefinitionPayload(
  args: Record<string, unknown>,
  options: { requireName?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const name = options.requireName ? readRequiredString(args.name, 'name') : readOptionalString(args.name);
  const category = readOptionalString(args.category);
  if (name) payload.name = name;
  if (category) payload.category = category;
  if (typeof args.description === 'string') payload.description = args.description.trim();
  if (args.status === 'draft' || args.status === 'published') payload.status = args.status;
  if (Array.isArray(args.layout)) payload.layout = args.layout;
  if (Array.isArray(args.elements)) payload.elements = args.elements.filter(isRecord).map(elementDefinitionPayload);
  if (Array.isArray(args.filters)) payload.filters = args.filters.filter(isRecord).map(filterDefinitionPayload);
  if (isRecord(args.settings)) payload.settings = args.settings;
  return payload;
}

export function elementCreatePayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    config: isRecord(args.config) ? args.config : { title: readOptionalString(args.name) ?? 'Dashboard Element' },
    layout: isRecord(args.layout) ? args.layout : { x: 0, y: 0, w: 6, h: 5 },
    name: readOptionalString(args.name) ?? 'Dashboard Element',
    type: readOptionalString(args.type) ?? 'chart'
  };
  const chartType = readOptionalString(args.chartType);
  const dataSourceId = readOptionalString(args.dataSourceId);
  if (chartType) payload.chartType = chartType;
  if (dataSourceId) payload.dataSourceId = dataSourceId;
  if (typeof args.order === 'number' && Number.isFinite(args.order)) payload.order = Math.floor(args.order);
  return payload;
}

function elementDefinitionPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = elementCreatePayload(args);
  const id = readOptionalString(args.id) ?? readOptionalString(args.dbId);
  if (id) payload.id = id;
  if (typeof args.isVisible === 'boolean') payload.isVisible = args.isVisible;
  return payload;
}

export function elementUpdatePayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const name = readOptionalString(args.name);
  const type = readOptionalString(args.type);
  const chartType = readOptionalString(args.chartType);
  if (name) payload.name = name;
  if (type) payload.type = type;
  if (chartType) payload.chartType = chartType;
  if ('dataSourceId' in args) payload.dataSourceId = readOptionalString(args.dataSourceId) ?? null;
  if (isRecord(args.layout)) payload.layout = args.layout;
  if (isRecord(args.config)) payload.config = args.config;
  if (typeof args.order === 'number' && Number.isFinite(args.order)) payload.order = Math.floor(args.order);
  if (typeof args.isVisible === 'boolean') payload.isVisible = args.isVisible;
  return payload;
}

export function filterCreatePayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    field: readRequiredString(args.field, 'field'),
    name: readRequiredString(args.name, 'name'),
    operator: readOptionalString(args.operator) ?? 'equals',
    type: readOptionalString(args.type) ?? 'interactive'
  };
  if ('value' in args) payload.value = args.value;
  if (isRecord(args.config)) payload.config = args.config;
  if (typeof args.order === 'number' && Number.isFinite(args.order)) payload.order = Math.floor(args.order);
  return payload;
}

function filterDefinitionPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = filterCreatePayload(args);
  const id = readOptionalString(args.id);
  if (id) payload.id = id;
  if (typeof args.isActive === 'boolean') payload.isActive = args.isActive;
  return payload;
}

export function filterUpdatePayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const name = readOptionalString(args.name);
  const field = readOptionalString(args.field);
  const operator = readOptionalString(args.operator);
  const type = readOptionalString(args.type);
  if (name) payload.name = name;
  if (field) payload.field = field;
  if (operator) payload.operator = operator;
  if (type) payload.type = type;
  if ('value' in args) payload.value = args.value;
  if (isRecord(args.config)) payload.config = args.config;
  if (typeof args.order === 'number' && Number.isFinite(args.order)) payload.order = Math.floor(args.order);
  if (typeof args.isActive === 'boolean') payload.isActive = args.isActive;
  return payload;
}

export function dashboardSummary(dashboard: Dashboard): Record<string, unknown> {
  return {
    category: dashboard.category,
    categoryId: dashboard.categoryId ?? null,
    elementCount: dashboard.elements.length,
    filterCount: dashboard.filters.length,
    id: dashboard.id,
    name: dashboard.name,
    status: dashboard.status,
    updatedAt: dashboard.updatedAt
  };
}

export function dashboardDetail(dashboard: Dashboard): Record<string, unknown> {
  return {
    ...dashboardSummary(dashboard),
    description: dashboard.description ?? '',
    elements: dashboard.elements.map(elementDetail),
    filters: dashboard.filters.map(filterDetail),
    settings: dashboard.settings ?? {}
  };
}

export function elementDetail(element: DashboardElement): Record<string, unknown> {
  return {
    chartType: element.chartType ?? null,
    config: element.config,
    dashboardId: element.dashboardId,
    dataSourceId: element.dataSourceId ?? null,
    id: element.id,
    layout: element.layout,
    name: element.name,
    order: element.order,
    type: element.type
  };
}

export function filterDetail(filter: DashboardFilter): Record<string, unknown> {
  return {
    config: filter.config ?? {},
    dashboardId: filter.dashboardId,
    field: filter.field,
    id: filter.id,
    name: filter.name,
    operator: filter.operator,
    order: filter.order ?? 0,
    type: filter.type,
    value: filter.value ?? null
  };
}

export function readRecordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function readRequiredString(value: unknown, name: string): string {
  const result = readOptionalString(value);
  if (!result) throw new Error(`${name} is required.`);
  return result;
}

export function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function readLimit(value: unknown): number {
  const limit = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 25;
  return Math.max(1, Math.min(100, limit));
}
