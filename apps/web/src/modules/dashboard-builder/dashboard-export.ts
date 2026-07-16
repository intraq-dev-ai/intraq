import type { Dashboard, DashboardElement, DashboardFilter } from './types';
import {
  buildVisualizationDataRequest,
  toChartDataApiRequest
} from './visualization/data';
import { visualizationSpecFromElement } from './visualization/spec';

export type DashboardDataExportFormat = 'csv' | 'excel' | 'json';

export interface DashboardDataExportItem {
  chartDataRequest: Record<string, unknown>;
  componentId: string;
  componentTitle: string;
  componentType: string;
  workflowId?: string;
  workflowOutput?: Record<string, unknown>;
}

export interface DashboardDataExportPayload {
  dashboardId: string;
  dashboardName: string;
  format: DashboardDataExportFormat;
  items: DashboardDataExportItem[];
  limit: number;
}

const DEFAULT_EXPORT_ROW_LIMIT = 100_000;

export function buildDashboardDataExportPayload(
  dashboard: Dashboard,
  format: DashboardDataExportFormat,
  options: {
    elements?: DashboardElement[];
    filtersByElementId?: Record<string, DashboardFilter[]>;
    limit?: number;
    runtimeParameterValues?: Record<string, unknown>;
  } = {}
): DashboardDataExportPayload | null {
  const limit = positiveInteger(options.limit) ?? DEFAULT_EXPORT_ROW_LIMIT;
  const items = exportableElements(options.elements ?? dashboard.elements).flatMap(element => {
    const item = buildDashboardDataExportItem(
      element,
      options.filtersByElementId?.[element.id] ?? dashboardFiltersForExport(dashboard),
      limit,
      options.runtimeParameterValues
    );
    return item ? [item] : [];
  });
  if (items.length === 0) return null;
  return {
    dashboardId: dashboard.id,
    dashboardName: dashboard.name,
    format,
    items,
    limit
  };
}

export function buildDashboardDataExportItem(
  element: DashboardElement,
  filters: DashboardFilter[],
  limit = DEFAULT_EXPORT_ROW_LIMIT,
  runtimeParameterValues?: Record<string, unknown>
): DashboardDataExportItem | null {
  const spec = visualizationSpecFromElement(element);
  const request = buildVisualizationDataRequest(element, spec, filters, { rowLimit: limit });
  if (!request) return null;
  const exportRequest = {
    ...request,
    editMode: true,
    visualization: {
      ...request.visualization,
      limit: request.visualization.limit ?? limit
    }
  };
  return {
    chartDataRequest: toChartDataApiRequest(exportRequest, runtimeParameterValues),
    componentId: element.id,
    componentTitle: element.name,
    componentType: element.type,
    ...workflowExportPatch(element.config)
  };
}

function exportableElements(elements: DashboardElement[]): DashboardElement[] {
  return elements.filter(element => element.isVisible !== false && !['container', 'export', 'filter', 'filter-container'].includes(element.type));
}

function dashboardFiltersForExport(dashboard: Dashboard): DashboardFilter[] {
  const canvasFilters = dashboard.elements.flatMap(element => {
    if (element.type !== 'filter') return [];
    const config = element.config ?? {};
    const field = readString(config.field) ?? readString(config.filterField) ?? readString(config.xField) ?? '';
    return [{
      id: element.id,
      dashboardId: dashboard.id,
      name: element.name,
      field,
      operator: readString(config.operator) ?? 'in',
      value: config.value ?? config.defaultValue,
      type: 'interactive',
      placement: 'canvas' as const,
      config
    } satisfies DashboardFilter];
  });
  return [...dashboard.filters, ...canvasFilters];
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function workflowExportPatch(config: unknown): Pick<DashboardDataExportItem, 'workflowId' | 'workflowOutput'> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const record = config as Record<string, unknown>;
  const workflowId = readString(record.workflowId ?? record.pipelineId);
  const workflowOutput = readWorkflowOutput(record.workflowOutput ?? record.workflowTarget ?? record.pipelineOutput);
  return {
    ...(workflowId ? { workflowId } : {}),
    ...(workflowOutput ? { workflowOutput } : {})
  };
}

function readWorkflowOutput(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length > 0 ? record : undefined;
}
