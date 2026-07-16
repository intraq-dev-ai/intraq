import { numericMetricValue } from './formatting';
import { applySortingAndTopN, type NormalizedChartData } from './chart/data';
import { readBaseOptions } from './chart/options';
import { dimensionEncoding, measureEncodings } from './spec';
import { readTableConditionalRules } from './table-conditional-formatting';
import { tablePageSizeOptions } from './table-filter-runtime';
import type { ConditionalRule } from './table-view-model-types';
import { aggregateRows, isRecord, readAggregationType, readBoolean, readString } from './view-model-config';
import { compareValues, matchesFilter, readSortDirection, type RuntimeFilter } from './view-model-runtime';
import type { DashboardTableColumn, DashboardTableModel, DashboardTableRow } from './view-model-types';
import type { DashboardElement, VisualizationData, VisualizationSpec } from '../types';

type VisualizationSortIntent = NonNullable<VisualizationSpec['sort']>[number];

export function datasetValue(data: VisualizationData, field: string, index: number): number {
  const dataset = data.datasets.find(item => item.label === field) ?? data.datasets[0];
  return numericMetricValue(dataset?.data[index]);
}

export function tableRowLimit(element: DashboardElement | undefined, fallback: number): number {
  const configured = element?.config?.rowsPerPage ?? element?.config?.limit;
  return typeof configured === 'number' && Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : fallback;
}

export function readTablePagination(config: Record<string, unknown>, fallback: number): DashboardTableModel['pagination'] {
  const pagination = isRecord(config.pagination) ? config.pagination : {};
  if (readBoolean(config.enablePagination ?? pagination.enabled) !== true) return undefined;
  const pageSize = readPositiveInteger(config.rowsPerPage ?? config.pageSize ?? pagination.rowsPerPage ?? pagination.pageSize) ?? fallback;
  return { enabled: true, pageSize, pageSizeOptions: tablePageSizeOptions(pageSize, config.pageSizeOptions ?? pagination.pageSizeOptions) };
}

export function groupValuesPatch(row: Record<string, unknown>, fields: string[] | undefined): Pick<DashboardTableRow, 'groupValues'> {
  const groupValues = fields?.map(field => String(row[field] ?? ''));
  return groupValues && groupValues.length > 0 ? { groupValues } : {};
}

export function readTableSorts(
  config: Record<string, unknown>,
  spec: VisualizationSpec
): NonNullable<DashboardTableModel['sorts']> {
  const configured = Array.isArray(config.multiSort)
    ? config.multiSort.flatMap(item => {
      const sort = readConfiguredTableSort(item);
      return sort ? [sort] : [];
    })
    : [];
  if (configured.length > 0) return configured;
  const fallback = readConfiguredTableSort(config) ?? readSpecTableSort(spec.sort?.[0]);
  return fallback ? [fallback] : [];
}

export function sortRecords(
  rows: Array<Record<string, unknown>>,
  sorts: DashboardTableModel['sort'] | DashboardTableModel['sorts']
): Array<Record<string, unknown>> {
  const activeSorts = Array.isArray(sorts) ? sorts : sorts ? [sorts] : [];
  if (activeSorts.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const sort of activeSorts) {
      const comparison = compareValues(left[sort.key], right[sort.key], sort.direction);
      if (comparison !== 0) return comparison;
    }
    return 0;
  });
}

export function sortTableRows(
  rows: DashboardTableRow[],
  columns: DashboardTableColumn[],
  sorts: DashboardTableModel['sort'] | DashboardTableModel['sorts']
): DashboardTableRow[] {
  const activeSorts = Array.isArray(sorts) ? sorts : sorts ? [sorts] : [];
  if (activeSorts.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const sort of activeSorts) {
      const index = columns.findIndex(column => column.key === sort.key || column.label === sort.key);
      const comparison = index < 0
        ? compareValues(left.raw?.[sort.key], right.raw?.[sort.key], sort.direction)
        : compareValues(left.cells[index]?.raw, right.cells[index]?.raw, sort.direction);
      if (comparison !== 0) return comparison;
    }
    return 0;
  });
}

export function filterRecords(
  rows: Array<Record<string, unknown>>,
  config: Record<string, unknown>
): Array<Record<string, unknown>> {
  const filters = readRuntimeFilters(config);
  if (filters.length === 0) return rows;
  return rows.filter(row => filters.every(filter => matchesFilter(row[filter.field], filter)));
}

export function tableSeriesRowsEnabled(config: Record<string, unknown>): boolean {
  if (config.tableDataMode === 'series' || config.tableDataMode === 'chart' || config.dataMode === 'series') return true;
  return readBoolean(config.useSeriesRows ?? config.tableUseSeriesRows ?? config.useChartSeriesRows ?? config.useBucketedRows) ?? false;
}

export function tableSeriesRows(
  data: VisualizationData,
  spec: VisualizationSpec,
  rows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const dimension = dimensionEncoding(spec);
  const measures = measureEncodings(spec);
  if (dimension && measures.length > 0) {
    const grouped = groupRowsByField(rows, dimension.field);
    const labels = rows.length > 0 ? Array.from(grouped.keys()) : [];
    const normalized = applySortingAndTopN({
      labels,
      datasets: measures.map(measure => ({
        label: measure.field,
        data: labels.map(label => aggregateRows(grouped.get(label) ?? [], measure.field, readAggregationType(measure.aggregation) ?? 'sum'))
      })),
      runtimeContext: data.runtimeContext
    }, readBaseOptions(spec));
    return normalizedRows(normalized, dimension.field);
  }
  const normalized = applySortingAndTopN(normalizedTableData(data), readBaseOptions(spec));
  const labelKey = dimension?.field ?? 'label';
  return normalizedRows(normalized, labelKey);
}

export function readConditionalRules(config: Record<string, unknown>): ConditionalRule[] {
  return readTableConditionalRules(config);
}

export function sliceLimit<T>(values: T[], limit: number | undefined): T[] {
  return limit === undefined ? values : values.slice(0, limit);
}

function groupRowsByField(rows: Array<Record<string, unknown>>, field: string): Map<string, Array<Record<string, unknown>>> {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const label = String(row[field] ?? '');
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return groups;
}

function normalizedTableData(data: VisualizationData): NormalizedChartData {
  return {
    labels: data.labels.map(label => String(label)),
    datasets: data.datasets.map(dataset => ({
      label: dataset.label,
      data: dataset.data.map(value => Number.isFinite(Number(value)) ? Number(value) : 0),
      ...(dataset.placeholder === undefined ? {} : { placeholder: dataset.placeholder })
    })),
    runtimeContext: data.runtimeContext
  };
}

function normalizedRows(data: NormalizedChartData, labelKey: string): Array<Record<string, unknown>> {
  return data.labels.map((label, index) => ({
    _index: index,
    index,
    label,
    [labelKey]: label,
    ...Object.fromEntries(data.datasets.map(dataset => [dataset.label, dataset.data[index] ?? 0]))
  }));
}

function readRuntimeFilters(config: Record<string, unknown>): RuntimeFilter[] {
  const value = config.tableFilters ?? config.filterConfig ?? config.filters;
  if (Array.isArray(value)) return value.flatMap(readRuntimeFilter);
  if (isRecord(value) && (readString(value.field) ?? readString(value.column))) return readRuntimeFilter(value);
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([field, filterValue]) => ({ field, operator: 'equals', value: filterValue }));
}

function readRuntimeFilter(value: unknown): RuntimeFilter[] {
  if (!isRecord(value)) return [];
  const field = readString(value.field) ?? readString(value.column) ?? readString(value.key);
  if (!field) return [];
  return [{ field, operator: readString(value.operator) ?? 'equals', value: value.value, valueTo: value.valueTo ?? value.max }];
}

function readConfiguredTableSort(value: unknown): DashboardTableModel['sort'] | undefined {
  if (!isRecord(value)) return undefined;
  const key = readString(value.sortBy ?? value.field ?? value.key ?? value.sortOn);
  if (!key) return undefined;
  return {
    key,
    direction: readSortDirection(value.direction ?? value.sortDirection) ?? 'asc'
  };
}

function readSpecTableSort(value: VisualizationSortIntent | undefined): DashboardTableModel['sort'] | undefined {
  if (!value?.field) return undefined;
  return {
    key: value.field,
    direction: value.direction ?? 'asc'
  };
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}
