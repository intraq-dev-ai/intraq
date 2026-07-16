import type {
  BuilderDataSource,
  BuilderDataTable,
  DashboardElement,
  DashboardFilter
} from '../../types';
import { visualizationSpecFromElement } from '../../visualization/spec';

export type DashboardComponentDownloadFormat = 'csv' | 'excel';

export interface DashboardComponentDownloadTarget {
  downloadSourceId: string;
  sourceId: string;
  sourceName: string;
  tableId: string;
  tableName: string;
}

export interface DashboardComponentDownloadPayload {
  componentConfig: Record<string, unknown>;
  componentId: string;
  componentTitle: string;
  componentType: string;
  dashboardFilters: DashboardFilter[];
  dataSource: string;
  format: DashboardComponentDownloadFormat;
  limit: number;
  offset: number;
  parameterValues?: Record<string, unknown>;
}

export function isDashboardComponentDownloadable(
  dataSources: BuilderDataSource[],
  element: DashboardElement
): boolean {
  return resolveDashboardComponentDownloadTarget(dataSources, element) !== null;
}

export function resolveDashboardComponentDownloadTarget(
  dataSources: BuilderDataSource[],
  element: DashboardElement
): DashboardComponentDownloadTarget | null {
  if (['container', 'filter', 'filter-container'].includes(element.type)) return null;
  const source = resolveElementSource(dataSources, element);
  const table = resolveElementTable(source, element);
  if (!source || !table) return null;
  return {
    downloadSourceId: table.id || source.id,
    sourceId: source.id,
    sourceName: source.name,
    tableId: table.id,
    tableName: table.name
  };
}

export function buildDashboardComponentDownloadPayload(
  element: DashboardElement,
  dashboardFilters: DashboardFilter[],
  format: DashboardComponentDownloadFormat,
  target: DashboardComponentDownloadTarget,
  parameterValues?: Record<string, unknown>
): DashboardComponentDownloadPayload {
  return {
    componentConfig: element.config ?? {},
    componentId: element.id,
    componentTitle: element.name,
    componentType: element.type,
    dashboardFilters,
    dataSource: target.downloadSourceId,
    format,
    limit: 1_000_000,
    offset: 0,
    ...(parameterValues && Object.keys(parameterValues).length > 0 ? { parameterValues } : {})
  };
}

function resolveElementSource(
  dataSources: BuilderDataSource[],
  element: DashboardElement
): BuilderDataSource | undefined {
  const spec = visualizationSpecFromElement(element);
  const sourceKeys = new Set([
    readString(element.dataSourceId),
    readString(element.config?.dataSourceId),
    readString(element.config?.dataSource),
    readString(spec.dataRef?.sourceId)
  ].filter(Boolean));
  return dataSources.find(source =>
    sourceKeys.has(source.id)
    || sourceKeys.has(source.name)
    || source.tables.some(table => sourceKeys.has(table.id) || sourceKeys.has(table.name))
  );
}

function resolveElementTable(
  source: BuilderDataSource | undefined,
  element: DashboardElement
): BuilderDataTable | undefined {
  if (!source) return undefined;
  const spec = visualizationSpecFromElement(element);
  const tableKeys = new Set([
    readString(element.config?.dataSourceTableId),
    readString(element.config?.tableId),
    readString(element.config?.tableName),
    readString(element.config?.dataSource),
    readString(spec.dataRef?.tableId),
    readString(spec.dataRef?.tableName)
  ].filter(Boolean));
  return source.tables.find(table => tableKeys.has(table.id) || tableKeys.has(table.name))
    ?? source.tables.find(table => table.isSelected)
    ?? source.tables[0];
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
