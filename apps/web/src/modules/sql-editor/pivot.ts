import type {
  SqlEditorPivotAggregation,
  SqlEditorPivotConfig,
  SqlEditorPivotSort,
  SqlEditorPivotValueSpec,
  SqlEditorQueryResult
} from './types';

export interface SqlEditorPivotSelection {
  dimension: string;
  metric: string;
}

export interface SqlEditorPivotRows {
  columns: string[];
  measureColumns: string[];
  rows: Array<Record<string, unknown>>;
  columnTotals: Record<string, number>;
  grandRowTotal: number;
  showRowTotal: boolean;
}

export function resolvePivotSelection(
  result: SqlEditorQueryResult | null,
  current: SqlEditorPivotSelection
): SqlEditorPivotSelection {
  if (!result) return { dimension: '', metric: '' };
  const columns = new Set(result.columns);
  const defaultSelection = defaultPivotSelection(result);
  return {
    dimension: columns.has(current.dimension) ? current.dimension : defaultSelection.dimension,
    metric: columns.has(current.metric) && isNumericColumn(result, current.metric)
      ? current.metric
      : defaultSelection.metric
  };
}

export function buildDefaultPivotConfig(viewMode: 'pivot' | 'results' = 'results'): SqlEditorPivotConfig {
  return {
    viewMode,
    rows: [],
    columns: [],
    filters: [],
    filterValues: {},
    values: [],
    sort: null
  };
}

export function defaultPivotConfig(
  result: SqlEditorQueryResult | null,
  current: SqlEditorPivotSelection = { dimension: '', metric: '' },
  viewMode: 'pivot' | 'results' = 'pivot'
): SqlEditorPivotConfig {
  const selection = resolvePivotSelection(result, current);
  return {
    ...buildDefaultPivotConfig(viewMode),
    rows: selection.dimension ? [selection.dimension] : [],
    values: selection.metric ? [{ field: selection.metric, aggregation: 'sum', alias: '' }] : []
  };
}

export function normalizePivotConfig(
  result: SqlEditorQueryResult | null,
  incomingConfig: SqlEditorPivotConfig | null | undefined,
  current: SqlEditorPivotSelection = { dimension: '', metric: '' },
  viewMode = incomingConfig?.viewMode ?? 'results'
): SqlEditorPivotConfig {
  const base = defaultPivotConfig(result, current, viewMode);
  if (!result) return incomingConfig ? { ...base, viewMode } : base;

  const validColumns = new Set(result.columns);
  const sourceConfig = incomingConfig && typeof incomingConfig === 'object'
    ? { ...base, ...incomingConfig }
    : base;
  const rows = validFieldList(sourceConfig.rows, validColumns);
  const columns = validFieldList(sourceConfig.columns, validColumns);
  const filters = validFieldList(sourceConfig.filters, validColumns);
  const filterValues = normalizeFilterValues(filters, sourceConfig.filterValues);
  const values = normalizePivotValues(result, sourceConfig.values);
  const sort = normalizeSort(sourceConfig.sort, [...rows, ...columns, ...values.map(value => valueColumnName(value)), '__row_total__']);

  return {
    viewMode: sourceConfig.viewMode === 'pivot' ? 'pivot' : 'results',
    rows: rows.length || columns.length ? rows : base.rows,
    columns,
    filters,
    filterValues,
    values: values.length > 0 ? values : base.values,
    sort
  };
}

export function pivotTableRows(
  result: SqlEditorQueryResult | null,
  config: SqlEditorPivotConfig | null
): SqlEditorPivotRows {
  if (!result) {
    return { columns: [], measureColumns: [], rows: [], columnTotals: {}, grandRowTotal: 0, showRowTotal: false };
  }
  const normalized = normalizePivotConfig(result, config);
  const rows = filteredRows(result.rows, normalized);
  const dimensions = [...normalized.rows, ...normalized.columns];
  const values = normalized.values.filter(value => value.field);
  const measureColumns = values.map(valueColumnName);
  if (rows.length === 0 || values.length === 0) {
    return {
      columns: [...dimensions, ...measureColumns],
      measureColumns,
      rows: [],
      columnTotals: Object.fromEntries(measureColumns.map(column => [column, 0])),
      grandRowTotal: 0,
      showRowTotal: measureColumns.length > 0
    };
  }

  const buckets = new Map<string, {
    dimensions: Record<string, unknown>;
    metrics: Record<number, { count: number; distinct: Set<string>; max: number | null; min: number | null; sum: number }>;
  }>();

  for (const row of rows) {
    const keyParts = dimensions.map(dimension => row[dimension] ?? null);
    const key = JSON.stringify(keyParts);
    const bucket = buckets.get(key) ?? {
      dimensions: Object.fromEntries(dimensions.map(dimension => [dimension, row[dimension] ?? null])),
      metrics: Object.fromEntries(values.map((_value, index) => [
        index,
        { count: 0, distinct: new Set<string>(), max: null, min: null, sum: 0 }
      ]))
    };

    values.forEach((value, index) => {
      const metric = bucket.metrics[index];
      if (!metric) return;
      const rawValue = row[value.field];
      const numericValue = numericCellValue(rawValue);
      accumulateMetric(metric, rawValue, numericValue, value.aggregation);
    });
    buckets.set(key, bucket);
  }

  const pivotRows = Array.from(buckets.values()).map(bucket => {
    const output: Record<string, unknown> = { ...bucket.dimensions };
    values.forEach((value, index) => {
      output[valueColumnName(value)] = metricValue(bucket.metrics[index], value.aggregation);
    });
    return output;
  });
  const sortedRows = sortRows(pivotRows, normalized.sort);
  const columnTotals = measureColumnTotals(sortedRows, measureColumns);
  const grandRowTotal = Object.values(columnTotals).reduce((total, value) => total + value, 0);
  return {
    columns: [...dimensions, ...measureColumns],
    measureColumns,
    rows: sortedRows,
    columnTotals,
    grandRowTotal,
    showRowTotal: measureColumns.length > 0
  };
}

export function defaultPivotSelection(result: SqlEditorQueryResult | null): SqlEditorPivotSelection {
  if (!result) return { dimension: '', metric: '' };
  const dimension = result.columns.find(column => !isNumericColumn(result, column)) ?? result.columns[0] ?? '';
  const metric = result.columns.find(column => column !== dimension && isNumericColumn(result, column))
    ?? result.columns.find(column => isNumericColumn(result, column))
    ?? '';
  return { dimension, metric };
}

export function isNumericColumn(result: SqlEditorQueryResult, column: string): boolean {
  const declaredType = result.columnTypes.find(item => item.name === column)?.type.toLowerCase() ?? '';
  if (declaredType === 'number' || declaredType === 'integer' || declaredType === 'float' || declaredType === 'decimal') {
    return true;
  }
  return result.rows.some(row => {
    const value = row[column];
    return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
  });
}

export function valueColumnName(valueSpec: SqlEditorPivotValueSpec): string {
  const alias = valueSpec.alias?.trim();
  return alias || `${valueSpec.aggregation}_${valueSpec.field}`;
}

function validFieldList(fields: unknown, validColumns: Set<string>): string[] {
  return Array.isArray(fields)
    ? fields.filter((field): field is string => typeof field === 'string' && validColumns.has(field))
    : [];
}

function normalizeFilterValues(filters: string[], sourceValues: unknown): Record<string, string> {
  const values = sourceValues && typeof sourceValues === 'object' && !Array.isArray(sourceValues)
    ? sourceValues as Record<string, unknown>
    : {};
  return Object.fromEntries(filters.map(field => [field, String(values[field] ?? '__ALL__')]));
}

function normalizePivotValues(
  result: SqlEditorQueryResult,
  values: unknown
): SqlEditorPivotValueSpec[] {
  const validColumns = new Set(result.columns);
  const normalized = Array.isArray(values)
    ? values.flatMap(value => normalizePivotValue(value, validColumns, result))
    : [];
  if (normalized.length > 0) return normalized;
  const selection = defaultPivotSelection(result);
  return selection.metric ? [{ field: selection.metric, aggregation: 'sum', alias: '' }] : [];
}

function normalizePivotValue(
  value: unknown,
  validColumns: Set<string>,
  result: SqlEditorQueryResult
): SqlEditorPivotValueSpec[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const field = typeof record.field === 'string' && validColumns.has(record.field) ? record.field : '';
  if (!field) return [];
  const aggregation = normalizeAggregation(record.aggregation, isNumericColumn(result, field));
  return [{
    field,
    aggregation,
    alias: typeof record.alias === 'string' ? record.alias : ''
  }];
}

function normalizeAggregation(value: unknown, numeric: boolean): SqlEditorPivotAggregation {
  if (value === 'avg' || value === 'count' || value === 'count_distinct' || value === 'max' || value === 'min' || value === 'sum') {
    return value;
  }
  return numeric ? 'sum' : 'count';
}

function normalizeSort(sort: unknown, allowedColumns: string[]): SqlEditorPivotSort | null {
  if (!sort || typeof sort !== 'object' || Array.isArray(sort)) return null;
  const record = sort as Record<string, unknown>;
  const field = typeof record.field === 'string' && allowedColumns.includes(record.field) ? record.field : '';
  const direction = record.direction === 'asc' || record.direction === 'desc' ? record.direction : '';
  return field && direction ? { field, direction } : null;
}

function filteredRows(rows: Array<Record<string, unknown>>, config: SqlEditorPivotConfig): Array<Record<string, unknown>> {
  if (config.filters.length === 0) return rows;
  return rows.filter(row => config.filters.every(field => {
    const selected = config.filterValues[field] || '__ALL__';
    return selected === '__ALL__' || String(row[field]) === selected;
  }));
}

function numericCellValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function accumulateMetric(
  metric: { count: number; distinct: Set<string>; max: number | null; min: number | null; sum: number },
  rawValue: unknown,
  numericValue: number | null,
  aggregation: SqlEditorPivotAggregation
): void {
  if (aggregation === 'count') {
    if (rawValue !== null && rawValue !== undefined) metric.count += 1;
    return;
  }
  if (aggregation === 'count_distinct') {
    if (rawValue !== null && rawValue !== undefined) metric.distinct.add(String(rawValue));
    return;
  }
  if (numericValue === null) return;
  if (aggregation === 'sum' || aggregation === 'avg') metric.sum += numericValue;
  if (aggregation === 'avg') metric.count += 1;
  if (aggregation === 'min') metric.min = metric.min === null ? numericValue : Math.min(metric.min, numericValue);
  if (aggregation === 'max') metric.max = metric.max === null ? numericValue : Math.max(metric.max, numericValue);
}

function metricValue(
  metric: { count: number; distinct: Set<string>; max: number | null; min: number | null; sum: number } | undefined,
  aggregation: SqlEditorPivotAggregation
): number | null {
  if (!metric) return null;
  if (aggregation === 'avg') return metric.count > 0 ? metric.sum / metric.count : null;
  if (aggregation === 'count') return metric.count;
  if (aggregation === 'count_distinct') return metric.distinct.size;
  if (aggregation === 'max') return metric.max;
  if (aggregation === 'min') return metric.min;
  return metric.sum;
}

function sortRows(rows: Array<Record<string, unknown>>, sort: SqlEditorPivotSort | null): Array<Record<string, unknown>> {
  if (!sort) return rows;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) =>
    compareValues(sortValue(left, sort.field), sortValue(right, sort.field)) * factor
  );
}

function sortValue(row: Record<string, unknown>, field: string): unknown {
  return field === '__row_total__'
    ? Object.entries(row).reduce((total, [_key, value]) => total + (numericCellValue(value) ?? 0), 0)
    : row[field];
}

function compareValues(left: unknown, right: unknown): number {
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
}

function measureColumnTotals(rows: Array<Record<string, unknown>>, measureColumns: string[]): Record<string, number> {
  const totals = Object.fromEntries(measureColumns.map(column => [column, 0]));
  for (const row of rows) {
    for (const column of measureColumns) {
      totals[column] = (totals[column] ?? 0) + (numericCellValue(row[column]) ?? 0);
    }
  }
  return totals;
}
