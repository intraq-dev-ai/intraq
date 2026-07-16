import { uuidv7 } from '@intraq/contracts';
import type { DashboardUpdateBody } from '../api';
import type {
  Dashboard,
  DashboardElement,
  DashboardFilter,
  DashboardFilterCreatePatch,
  DashboardFilterPatch
} from '../types';
import { visualizationSpecFromElement } from '../visualization/spec';
import { normalizeDashboardElementShape } from '../dashboard-element-normalization';

export interface DashboardElementDraftInput {
  chartType?: string;
  config?: Record<string, unknown>;
  dataSourceId?: string;
  id?: string;
  isVisible?: boolean;
  layout?: Record<string, unknown>;
  name: string;
  order?: number;
  type: string;
}

export interface DashboardElementDraftPatch {
  chartType?: string;
  config?: Record<string, unknown>;
  dataSourceId?: string;
  isVisible?: boolean;
  layout?: Record<string, unknown>;
  name?: string;
  type?: string;
}

type DashboardFilterDraftInput = DashboardFilterCreatePatch & Partial<DashboardFilter>;

const visualizationElementTypes = new Set(['card', 'chart', 'filter', 'matrix', 'table']);

export function createLocalDashboardElement(
  dashboard: Dashboard,
  input: DashboardElementDraftInput
): DashboardElement {
  const shape = normalizeDashboardElementShape({
    type: input.type,
    chartType: input.chartType,
    config: stripVisualization(input.config ?? { title: input.name })
  });
  const dataSourceId = input.dataSourceId ?? readString(shape.config.dataSourceId);
  return elementWithVisualization({
    id: input.id ?? uuidv7(),
    dashboardId: dashboard.id,
    name: input.name.trim() || 'Dashboard Element',
    type: shape.type,
    ...(shape.chartType ? { chartType: shape.chartType } : {}),
    ...(dataSourceId ? { dataSourceId } : {}),
    config: shape.config,
    layout: input.layout ?? { x: 0, y: dashboard.elements.length * 5, w: 6, h: 5 },
    order: input.order ?? dashboard.elements.length,
    isVisible: input.isVisible ?? true
  });
}

export function updateDashboardElementDraft(
  dashboard: Dashboard,
  id: string,
  patch: DashboardElementDraftPatch
): Dashboard {
  return {
    ...dashboard,
    elements: dashboard.elements.map(element =>
      element.id === id ? patchDashboardElement(element, patch) : element
    )
  };
}

export function createLocalDashboardFilter(
  dashboard: Dashboard,
  input: DashboardFilterDraftInput
): DashboardFilter {
  const config = filterConfigWithMetadata(input);
  const placement = readFilterPlacement(input.placement ?? config.placement);
  return {
    id: input.id ?? uuidv7(),
    dashboardId: dashboard.id,
    name: input.name?.trim() || 'Dashboard Filter',
    field: input.field ?? '',
    operator: input.operator ?? 'equals',
    ...(input.value !== undefined ? { value: input.value } : {}),
    ...(placement ? { placement } : {}),
    type: input.type ?? 'interactive',
    ...(Object.keys(config).length > 0 ? { config } : {}),
    isActive: input.isActive !== false,
    order: input.order ?? dashboard.filters.length
  };
}

export function updateDashboardFilterDraft(
  dashboard: Dashboard,
  id: string,
  patch: DashboardFilterPatch
): Dashboard {
  return {
    ...dashboard,
    filters: dashboard.filters.map(filter =>
      filter.id === id ? patchDashboardFilter(filter, patch) : filter
    )
  };
}

export function normalizeDashboardDraft(dashboard: Dashboard): Dashboard {
  return {
    ...dashboard,
    elements: dashboard.elements.map((element, index) => elementWithVisualization({
      ...element,
      order: Number.isFinite(element.order) ? element.order : index
    })),
    filters: dashboard.filters.map((filter, index) => normalizeDashboardFilter({
      ...filter,
      order: typeof filter.order === 'number' && Number.isFinite(filter.order) ? filter.order : index
    }))
  };
}

export function applyLayoutDraftsToDashboard(
  dashboard: Dashboard,
  drafts: Record<string, Record<string, number>>
): Dashboard {
  if (Object.keys(drafts).length === 0) return dashboard;
  return {
    ...dashboard,
    elements: dashboard.elements.map(element => {
      const draft = drafts[element.id];
      return draft ? { ...element, layout: { ...(element.layout ?? {}), ...draft } } : element;
    })
  };
}

export function dashboardDraftUpdateBody(dashboard: Dashboard): DashboardUpdateBody {
  const normalized = normalizeDashboardDraft(dashboard);
  return {
    name: normalized.name,
    category: normalized.category,
    ...(normalized.categoryId !== undefined ? { categoryId: normalized.categoryId } : {}),
    status: 'draft',
    ...(normalized.settings ? { settings: normalized.settings } : {}),
    elements: normalized.elements.map(serializeElement),
    filters: normalized.filters.map(serializeFilter)
  };
}

function patchDashboardElement(
  element: DashboardElement,
  patch: DashboardElementDraftPatch
): DashboardElement {
  const shape = normalizeDashboardElementShape({
    type: patch.type ?? element.type,
    chartType: patch.chartType ?? element.chartType,
    config: stripVisualization(patch.config ?? element.config ?? {})
  });
  const dataSourceId = patch.dataSourceId ?? element.dataSourceId ?? readString(shape.config.dataSourceId);
  const { chartType: _chartType, dataSourceId: _dataSourceId, ...base } = element;
  return elementWithVisualization({
    ...base,
    name: patch.name?.trim() || element.name,
    type: shape.type,
    ...(shape.chartType ? { chartType: shape.chartType } : {}),
    ...(dataSourceId ? { dataSourceId } : {}),
    config: shape.config,
    layout: patch.layout ? { ...(element.layout ?? {}), ...patch.layout } : element.layout ?? {},
    isVisible: patch.isVisible ?? element.isVisible
  });
}

function patchDashboardFilter(filter: DashboardFilter, patch: DashboardFilterPatch): DashboardFilter {
  const config = filterConfigWithMetadata({
    ...filter,
    ...patch,
    config: {
      ...(filter.config ?? {}),
      ...(patch.config ?? {})
    }
  });
  const placement = readFilterPlacement(patch.placement ?? filter.placement ?? config.placement);
  return normalizeDashboardFilter({
    ...filter,
    ...patch,
    ...(placement ? { placement } : {}),
    ...(Object.keys(config).length > 0 ? { config } : {})
  });
}

function normalizeDashboardFilter(filter: DashboardFilter): DashboardFilter {
  const config = filterConfigWithMetadata(filter);
  const placement = readFilterPlacement(filter.placement ?? config.placement);
  return {
    ...filter,
    ...(placement ? { placement } : {}),
    ...(Object.keys(config).length > 0 ? { config } : {})
  };
}

function elementWithVisualization(element: DashboardElement): DashboardElement {
  const shape = normalizeDashboardElementShape(element);
  const normalizedElement = {
    ...element,
    type: shape.type,
    ...(shape.chartType ? { chartType: shape.chartType } : {}),
    config: shape.config
  };
  if (!visualizationElementTypes.has(normalizedElement.type)) return normalizedElement;
  const config = stripVisualization(normalizedElement.config ?? {});
  return {
    ...normalizedElement,
    config: {
      ...config,
      visualization: visualizationSpecFromElement({ ...normalizedElement, config })
    }
  };
}

function serializeElement(element: DashboardElement): DashboardElement {
  const shape = normalizeDashboardElementShape(element);
  return {
    id: element.id,
    dashboardId: element.dashboardId,
    name: element.name,
    type: shape.type,
    ...(shape.chartType ? { chartType: shape.chartType } : {}),
    config: shape.config,
    layout: element.layout ?? {},
    ...(element.dataSourceId ? { dataSourceId: element.dataSourceId } : {}),
    order: element.order,
    isVisible: element.isVisible
  };
}

function serializeFilter(filter: DashboardFilter): DashboardFilter {
  const config = filterConfigWithMetadata(filter);
  return {
    ...filter,
    ...(Object.keys(config).length > 0 ? { config } : {})
  };
}

function filterConfigWithMetadata(filter: Partial<DashboardFilter>): Record<string, unknown> {
  const config = { ...(filter.config ?? {}) };
  copyFilterMetadata(config, filter, 'placement');
  copyFilterMetadata(config, filter, 'applyTo');
  copyFilterMetadata(config, filter, 'target');
  copyFilterMetadata(config, filter, 'targetComponents');
  copyFilterMetadata(config, filter, 'targetDataSources');
  copyFilterMetadata(config, filter, 'targetElementIds');
  copyFilterMetadata(config, filter, 'targetDataSourceId');
  copyFilterMetadata(config, filter, 'targetType');
  copyFilterMetadata(config, filter, 'priority');
  copyFilterMetadata(config, filter, 'priorityEnabled');
  copyFilterMetadata(config, filter, 'priorityMode');
  copyFilterMetadata(config, filter, 'disabled');
  copyFilterMetadata(config, filter, 'enabled');
  copyFilterMetadata(config, filter, 'isDisabled');
  return config;
}

function copyFilterMetadata(
  config: Record<string, unknown>,
  filter: Partial<DashboardFilter>,
  key: keyof DashboardFilter
): void {
  const value = filter[key];
  if (value !== undefined) config[key] = value;
}

function stripVisualization(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  delete next.visualization;
  return next;
}

function readFilterPlacement(value: unknown): 'bar' | 'canvas' | undefined {
  return value === 'canvas' ? 'canvas' : value === 'bar' ? 'bar' : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
