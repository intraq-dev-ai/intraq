import { Prisma } from '@intraq/db';
import type {
  Dashboard,
  DashboardCategory,
  DashboardDataCachePolicy,
  DashboardElement,
  DashboardFilter,
  DashboardVersion
} from './foundation-store.js';
import { clone, isRecord, optionalString } from './foundation-store-utils.js';
import { normalizeDashboardElementShape } from './dashboard-element-shape.js';

export const dashboardInclude = {
  category: true,
  elements: { orderBy: { order: 'asc' } },
  filters: { orderBy: { order: 'asc' } },
  tenant: { select: { name: true } }
} satisfies Prisma.DashboardInclude;

export type DashboardRecord = Prisma.DashboardGetPayload<{ include: typeof dashboardInclude }>;
export type DashboardElementRecord = DashboardRecord['elements'][number];
export type DashboardFilterRecord = DashboardRecord['filters'][number];
export type DashboardCategoryRecord = Prisma.DashboardCategoryGetPayload<Record<string, never>>;
export type DashboardVersionRecord = Prisma.DashboardVersionGetPayload<Record<string, never>>;

export function toDashboard(record: DashboardRecord): Dashboard {
  const category = record.category?.name ?? record.section ?? 'Uncategorized';
  const dashboard: Dashboard = {
    id: record.id,
    name: record.name,
    category,
    categoryId: record.categoryId ?? null,
    status: record.status === 'published' ? 'published' : 'draft',
    layout: readLayout(record),
    elements: record.elements.map(toElement),
    filters: record.filters.map(toFilter),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    isGlobal: record.isGlobal,
    isPublic: record.isPublic,
    isSample: record.isSample
  };
  if (record.description) dashboard.description = record.description;
  if (record.createdBy) dashboard.createdBy = record.createdBy;
  if (record.tenant) dashboard.tenant = { name: record.tenant.name };
  const mappedSettings = dashboardSettings(record.settings);
  if (Object.keys(mappedSettings).length > 0) dashboard.settings = mappedSettings;
  return dashboard;
}

export function toElement(record: DashboardElementRecord): DashboardElement {
  const config = jsonRecord(record.config);
  const shape = normalizeDashboardElementShape({
    type: record.type,
    chartType: record.chartType,
    config
  });
  const element: DashboardElement = {
    id: record.id,
    dashboardId: record.dashboardId,
    name: record.name,
    type: shape.type,
    layout: jsonRecord(record.layout),
    config: shape.config,
    order: record.order,
    isVisible: record.isVisible,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
  const dataSourceId = optionalString(record.dataSourceId) ?? optionalString(shape.config.dataSourceId);
  if (shape.chartType) element.chartType = shape.chartType;
  if (dataSourceId) element.dataSourceId = dataSourceId;
  return element;
}

export function toFilter(record: DashboardFilterRecord): DashboardFilter {
  const filter: DashboardFilter = {
    id: record.id,
    dashboardId: record.dashboardId,
    name: record.name,
    field: record.field,
    operator: record.operator,
    value: record.value,
    type: record.type,
    isActive: record.isActive,
    order: record.order,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
  const config = jsonRecord(record.config);
  if (Object.keys(config).length > 0) filter.config = config;
  return filter;
}

export function toCategory(record: DashboardCategoryRecord): DashboardCategory {
  return {
    id: record.id,
    name: record.name,
    color: record.color,
    icon: record.icon ?? 'LayoutDashboard',
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function toVersion(record: DashboardVersionRecord): DashboardVersion {
  const snapshot = readDashboardSnapshot(record.dashboardSnapshot);
  return {
    id: record.id,
    dashboardId: record.dashboardId,
    changes: readVersionChanges(record.changes),
    comment: record.comment,
    isAutoSave: record.isAutoSave,
    isPublished: record.isPublished,
    name: record.comment ?? (record.isAutoSave ? 'Auto save' : `Version ${record.versionNumber}`),
    publishedAt: record.publishedAt?.toISOString() ?? null,
    status: snapshot?.status ?? (record.isPublished ? 'published' : 'draft'),
    ...(snapshot ? { snapshot } : {}),
    userName: record.userName,
    versionNumber: record.versionNumber,
    createdAt: record.createdAt.toISOString()
  };
}

function readVersionChanges(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.reduce<Array<Record<string, unknown>>>((items, item) => {
    if (isRecord(item)) items.push(clone(item));
    return items;
  }, []);
}

export function jsonRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? clone(value) : {};
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

export function toNullableInputJson(value: unknown): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return toInputJson(value);
}

export function readDashboardSnapshot(value: unknown): Dashboard | null {
  if (!isRecord(value)) return null;
  const id = optionalString(value.id);
  const name = optionalString(value.name);
  if (!id || !name) return null;
  const category = optionalString(value.category) ?? 'Operations';
  const status = value.status === 'published' ? 'published' : 'draft';
  const elements = Array.isArray(value.elements) ? value.elements.filter(isRecord).map(readSnapshotElement) : [];
  const filters = Array.isArray(value.filters) ? value.filters.filter(isRecord).map(readSnapshotFilter) : [];
  const dashboard: Dashboard = {
    id,
    name,
    category,
    status,
    layout: Array.isArray(value.layout) ? clone(value.layout) : [],
    elements,
    filters,
    createdAt: optionalString(value.createdAt) ?? new Date(0).toISOString(),
    updatedAt: optionalString(value.updatedAt) ?? new Date(0).toISOString()
  };
  const description = optionalString(value.description);
  const createdBy = optionalString(value.createdBy);
  if (description) dashboard.description = description;
  if (createdBy) dashboard.createdBy = createdBy;
  const settings = dashboardSettings(value.settings);
  if (Object.keys(settings).length > 0) dashboard.settings = settings;
  return dashboard;
}

function dashboardSettings(value: unknown): NonNullable<Dashboard['settings']> {
  const settings = jsonRecord(value);
  const dashboard = jsonRecord(settings.dashboard);
  const menu = jsonRecord(settings.menu);
  const navigation = jsonRecord(settings.navigation);
  return {
    ...(typeof settings.currencySymbol === 'string' ? { currencySymbol: settings.currencySymbol } : {}),
    ...(isDashboardDataCachePolicy(settings.dataCachePolicy) ? { dataCachePolicy: settings.dataCachePolicy } : {}),
    ...(Object.keys(dashboard).length > 0 ? { dashboard } : {}),
    ...(typeof settings.closeDropdownOnSelect === 'boolean' ? { closeDropdownOnSelect: settings.closeDropdownOnSelect } : {}),
    ...(typeof settings.hideMultiSelectSummary === 'boolean' ? { hideMultiSelectSummary: settings.hideMultiSelectSummary } : {}),
    ...(typeof settings.isFavorite === 'boolean' ? { isFavorite: settings.isFavorite } : {}),
    ...(Object.keys(menu).length > 0 ? { menu } : {}),
    ...(Object.keys(navigation).length > 0 ? { navigation } : {}),
    ...(typeof settings.menuVisible === 'boolean' ? { menuVisible: settings.menuVisible } : {})
  };
}

function isDashboardDataCachePolicy(value: unknown): value is DashboardDataCachePolicy {
  return value === 'live' || value === '15m' || value === '1h' || value === '1d';
}

function readLayout(record: DashboardRecord): unknown[] {
  if (Array.isArray(record.draftLayout)) return clone(record.draftLayout);
  return record.elements.map(element => ({ id: element.id, ...jsonRecord(element.layout) }));
}

function readSnapshotElement(value: Record<string, unknown>): DashboardElement {
  const config = jsonRecord(value.config);
  const shape = normalizeDashboardElementShape({
    type: optionalString(value.type),
    chartType: optionalString(value.chartType),
    config
  });
  return {
    id: optionalString(value.id) ?? '',
    dashboardId: optionalString(value.dashboardId) ?? '',
    name: optionalString(value.name) ?? 'Dashboard Element',
    type: shape.type,
    ...(shape.chartType ? { chartType: shape.chartType } : {}),
    layout: jsonRecord(value.layout),
    config: shape.config,
    dataSourceId: optionalString(value.dataSourceId) ?? optionalString(shape.config.dataSourceId) ?? null,
    order: typeof value.order === 'number' ? value.order : 0,
    isVisible: typeof value.isVisible === 'boolean' ? value.isVisible : true,
    createdAt: optionalString(value.createdAt) ?? new Date(0).toISOString(),
    updatedAt: optionalString(value.updatedAt) ?? new Date(0).toISOString()
  };
}

function readSnapshotFilter(value: Record<string, unknown>): DashboardFilter {
  return {
    id: optionalString(value.id) ?? '',
    dashboardId: optionalString(value.dashboardId) ?? '',
    name: optionalString(value.name) ?? 'Dashboard Filter',
    field: optionalString(value.field) ?? '',
    operator: optionalString(value.operator) ?? 'equals',
    value: value.value,
    type: optionalString(value.type) ?? 'interactive',
    config: jsonRecord(value.config),
    isActive: typeof value.isActive === 'boolean' ? value.isActive : true,
    order: typeof value.order === 'number' ? value.order : 0,
    createdAt: optionalString(value.createdAt) ?? new Date(0).toISOString(),
    updatedAt: optionalString(value.updatedAt) ?? new Date(0).toISOString()
  };
}

function sanitizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (!isRecord(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)]));
}
