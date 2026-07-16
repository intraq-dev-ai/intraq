import { aggregateChartRows, normalizeChartAggregation } from './chart-aggregation.js';
import { buildVisualizationSqlQuery, type VisualizationSqlConfig } from './chart-sql-builder.js';
import type { ComponentConfig } from './component-sql-builder/index.js';
import {
  type ChartConfig,
  type ChartFilterIntent,
  type Row
} from './foundation-route-types.js';
import { isRecord } from './foundation-route-utils.js';
import {
  applyGeneratedXAxisBucketRows,
  type GeneratedXAxisBucket
} from './x-axis-generated-bucket.js';

export function chartConfigForLoadedRows(
  config: ChartConfig,
  componentConfig: ComponentConfig | null,
  rows: Row[],
  rowsAggregatedAtSource: boolean
): ChartConfig {
  if (!rowsAggregatedAtSource || !componentConfig || config.chartType === 'table') return config;
  const outputFields = componentOutputMeasureFields(componentConfig);
  if (outputFields.length === 0) return config;
  const fieldsPresentInRows = outputFields.filter(field => rows.some(row => Object.prototype.hasOwnProperty.call(row, field)));
  if (fieldsPresentInRows.length === 0) return config;
  return {
    ...config,
    yFields: fieldsPresentInRows,
    aggregations: {
      ...config.aggregations,
      ...Object.fromEntries(fieldsPresentInRows.map(field => [field, config.aggregations[field] ?? 'sum']))
    }
  };
}

export function buildChartData(
  config: ChartConfig,
  editMode: boolean,
  rows: Row[],
  tableName: string,
  sourceType: string,
  options: {
    filtersAppliedAtSource?: boolean;
    generatedXAxisBucket?: GeneratedXAxisBucket | null;
    rowsAggregatedAtSource?: boolean;
    sqlQuery?: string;
  } = {}
): Record<string, unknown> {
  const filteredRows = options.filtersAppliedAtSource ? rows : applyChartFilters(rows, config.filters);
  if (config.chartType === 'table') {
    const rawData = filteredRows.slice(0, config.limit ?? filteredRows.length);
    return {
      labels: rawData.map((_, index) => String(index + 1)),
      datasets: [],
      rawData,
      sqlQuery: options.sqlQuery,
      executionTime: 1,
      filtersApplied: config.filters
    };
  }
  if (options.rowsAggregatedAtSource) {
    return buildChartDataFromSourceRows(config, editMode, filteredRows, tableName, sourceType, options.generatedXAxisBucket ?? null, options.sqlQuery);
  }
  if (config.chartType === 'card') {
    const field = config.yFields[0] ?? config.selectFields[0] ?? config.xField;
    return {
      labels: ['value'],
      datasets: [{
        label: field,
        data: [aggregate(filteredRows, field, config.aggregations[field] ?? 'sum')],
        aggregatedData: true
      }],
      rawData: editMode ? filteredRows : undefined,
      sqlQuery: options.sqlQuery ?? buildVisualizationSqlQuery(sourceType, tableName, visualizationSqlConfig(config)),
      executionTime: 1,
      filtersApplied: config.filters
    };
  }
  if (config.chartType !== 'matrix' && hasRawSeriesAggregation(config) && !config.seriesBy && !options.generatedXAxisBucket) {
    return buildRawSeriesChartData(config, editMode, filteredRows, tableName, sourceType, options.sqlQuery);
  }
  const bucketedRows = applyGeneratedXAxisBucketRows(filteredRows, options.generatedXAxisBucket ?? null);
  if (config.seriesBy) {
    return buildSplitSeriesChartData(config, editMode, bucketedRows, tableName, sourceType, false, options.generatedXAxisBucket ?? null, options.sqlQuery);
  }
  const groups = new Map<string, Row[]>();
  const dimensionFields = chartDimensionFields(config, options.generatedXAxisBucket ?? null);
  for (const row of bucketedRows) {
    const key = dimensionFields.map(field => String(row[field] ?? '')).join(' | ');
    const bucket = groups.get(key);
    if (bucket) { bucket.push(row); } else { groups.set(key, [row]); }
  }
  const labels = Array.from(groups.keys()).slice(0, config.limit ?? groups.size);
  const datasets = config.yFields.map(field => ({
    label: field,
    data: labels.map(label => aggregate(groups.get(label) ?? [], field, config.aggregations[field] ?? 'sum')),
    aggregatedData: true
  }));
  return {
    labels,
    datasets,
    rawData: editMode ? bucketedRows : undefined,
    sqlQuery: options.sqlQuery ?? buildVisualizationSqlQuery(sourceType, tableName, visualizationSqlConfig(config)),
    executionTime: 1,
    filtersApplied: config.filters
  };
}

export function visualizationSqlConfig(config: ChartConfig): VisualizationSqlConfig {
  return {
    aggregations: config.aggregations,
    dimensions: config.dimensions.length > 0 ? config.dimensions : [config.xField],
    filters: config.filters,
    kind: config.chartType,
    measures: config.yFields,
    ...(config.seriesBy === undefined ? {} : { seriesBy: config.seriesBy }),
    selectFields: config.selectFields,
    sort: config.sort,
    ...(config.limit === undefined ? {} : { limit: config.limit })
  };
}

export function applyChartFilters(rows: Row[], filters: ChartFilterIntent[]): Row[] {
  if (filters.length === 0) return rows;
  const dateCeilings = new Map(filters.map(filter => [filter.field, maxTimestamp(rows, filter.field)]));
  return rows.filter(row => filters.every(filter => rowMatchesFilter(row, filter, dateCeilings)));
}

export function numericStats(values: number[]): Record<string, number> {
  const total = values.reduce((sum, value) => sum + value, 0);
  return { min: Math.min(...values), max: Math.max(...values), avg: total / Math.max(values.length, 1), total };
}

function componentOutputMeasureFields(componentConfig: ComponentConfig): string[] {
  const outputFields = new Set<string>();
  const add = (field: string | undefined): void => {
    if (field?.trim()) outputFields.add(field.trim());
  };
  for (const entry of componentConfig.ySeries ?? []) {
    if (typeof entry === 'string') add(entry);
    else add(entry.alias ?? entry.field);
  }
  for (const entry of componentConfig.series ?? []) {
    add(entry.alias ?? entry.field);
  }
  return [...outputFields];
}

function buildChartDataFromSourceRows(
  config: ChartConfig,
  editMode: boolean,
  rows: Row[],
  tableName: string,
  sourceType: string,
  generatedXAxisBucket: GeneratedXAxisBucket | null,
  sqlQuery?: string
): Record<string, unknown> {
  if (config.chartType === 'card') {
    const field = config.yFields[0] ?? config.selectFields[0] ?? config.xField;
    return {
      labels: ['value'],
      datasets: [{
        label: field,
        data: [numberValue(rows[0]?.[field])],
        aggregatedData: true
      }],
      rawData: rows,
      sqlQuery: sqlQuery ?? buildVisualizationSqlQuery(sourceType, tableName, visualizationSqlConfig(config)),
      executionTime: 1,
      filtersApplied: config.filters
    };
  }
  if (config.chartType !== 'matrix' && hasRawSeriesAggregation(config) && !config.seriesBy && !generatedXAxisBucket) {
    return buildRawSeriesChartData(config, editMode, rows, tableName, sourceType, sqlQuery);
  }
  if (config.seriesBy) {
    return buildSplitSeriesChartData(config, editMode, rows, tableName, sourceType, true, generatedXAxisBucket, sqlQuery);
  }
  const dimensionFields = chartDimensionFields(config, generatedXAxisBucket);
  const sourceRows = applyGeneratedXAxisBucketRows(rows, generatedXAxisBucket).slice(0, config.limit ?? rows.length);
  const labels = sourceRows.map(row => dimensionFields.map(field => String(row[field] ?? '')).join(' | '));
  const hasRepeatedLabels = new Set(labels).size !== labels.length;
  const datasets = hasRepeatedLabels
    ? config.yFields.map(field => {
      const groupedRows = new Map<string, Row[]>();
      for (const row of sourceRows) {
        const key = dimensionFields.map(dimensionField => String(row[dimensionField] ?? '')).join(' | ');
        const bucket = groupedRows.get(key);
        if (bucket) bucket.push(row);
        else groupedRows.set(key, [row]);
      }
      const groupedLabels = Array.from(groupedRows.keys());
      return {
        label: field,
        data: groupedLabels.map(label => aggregate(groupedRows.get(label) ?? [], field, config.aggregations[field] ?? 'sum')),
        aggregatedData: true
      };
    })
    : config.yFields.map(field => ({
      label: field,
      data: sourceRows.map(row => numberValue(row[field])),
      aggregatedData: true
    }));
  const resolvedLabels = hasRepeatedLabels
    ? Array.from(new Set(labels))
    : labels;
  return {
    labels: resolvedLabels,
    datasets,
    rawData: editMode ? rows : undefined,
    sqlQuery: sqlQuery ?? buildVisualizationSqlQuery(sourceType, tableName, visualizationSqlConfig(config)),
    executionTime: 1,
    filtersApplied: config.filters
  };
}

function buildRawSeriesChartData(
  config: ChartConfig,
  editMode: boolean,
  rows: Row[],
  tableName: string,
  sourceType: string,
  sqlQuery?: string
): Record<string, unknown> {
  const sourceRows = rows.slice(0, config.limit ?? rows.length);
  return {
    labels: sourceRows.map(row => String(row[config.xField] ?? '')),
    datasets: config.yFields.map(field => ({
      label: field,
      data: sourceRows.map(row => numberValue(row[field])),
      aggregatedData: false
    })),
    rawData: editMode ? rows : undefined,
    sqlQuery: sqlQuery ?? buildVisualizationSqlQuery(sourceType, tableName, visualizationSqlConfig(config)),
    executionTime: 1,
    filtersApplied: config.filters
  };
}

function chartDimensionFields(
  config: ChartConfig,
  generatedXAxisBucket: GeneratedXAxisBucket | null
): string[] {
  if (config.chartType === 'matrix' && config.dimensions.length > 0) return config.dimensions;
  return [generatedXAxisBucket?.field.name ?? config.xField];
}

function hasRawSeriesAggregation(config: ChartConfig): boolean {
  return config.yFields.some(field => normalizeChartAggregation(config.aggregations[field]) === 'none');
}

function buildSplitSeriesChartData(
  config: ChartConfig,
  editMode: boolean,
  rows: Row[],
  tableName: string,
  sourceType: string,
  rowsAggregatedAtSource: boolean,
  generatedXAxisBucket: GeneratedXAxisBucket | null,
  sqlQuery?: string
): Record<string, unknown> {
  const dimensionFields = chartDimensionFields(config, generatedXAxisBucket);
  const grouped = groupRowsBySplitSeries(rows, dimensionFields, config.seriesBy as string);
  const labels = grouped.labels.slice(0, config.limit ?? grouped.labels.length);
  const datasets = config.yFields.flatMap(field =>
    grouped.seriesValues.map(seriesValue => ({
      label: splitSeriesDatasetLabel(field, seriesValue, config.yFields.length),
      data: labels.map(label => {
        const bucket = grouped.rowsByLabel.get(label)?.get(seriesValue) ?? [];
        return rowsAggregatedAtSource
          ? numberValue(bucket[0]?.[field])
          : aggregate(bucket, field, config.aggregations[field] ?? 'sum');
      }),
      aggregatedData: true
    }))
  );
  return {
    labels,
    datasets,
    rawData: editMode ? rows : undefined,
    sqlQuery: sqlQuery ?? buildVisualizationSqlQuery(sourceType, tableName, visualizationSqlConfig(config)),
    executionTime: 1,
    filtersApplied: config.filters
  };
}

function groupRowsBySplitSeries(
  rows: Row[],
  dimensionFields: string[],
  seriesField: string
): {
  labels: string[];
  seriesValues: string[];
  rowsByLabel: Map<string, Map<string, Row[]>>;
} {
  const labels: string[] = [];
  const seriesValues: string[] = [];
  const seenLabels = new Set<string>();
  const seenSeries = new Set<string>();
  const rowsByLabel = new Map<string, Map<string, Row[]>>();

  for (const row of rows) {
    const label = dimensionFields.map(field => String(row[field] ?? '')).join(' | ');
    const seriesValue = String(row[seriesField] ?? '');
    if (!seenLabels.has(label)) {
      seenLabels.add(label);
      labels.push(label);
    }
    if (!seenSeries.has(seriesValue)) {
      seenSeries.add(seriesValue);
      seriesValues.push(seriesValue);
    }
    const labelBucket = rowsByLabel.get(label) ?? new Map<string, Row[]>();
    const seriesBucket = labelBucket.get(seriesValue) ?? [];
    seriesBucket.push(row);
    labelBucket.set(seriesValue, seriesBucket);
    rowsByLabel.set(label, labelBucket);
  }

  return { labels, seriesValues, rowsByLabel };
}

function splitSeriesDatasetLabel(field: string, seriesValue: string, measureCount: number): string {
  if (measureCount <= 1) return seriesValue;
  return `${seriesValue} - ${field}`;
}

function rowMatchesFilter(row: Row, filter: ChartFilterIntent, dateCeilings: Map<string, number>): boolean {
  const value = row[filter.field];
  const expected = filter.value;
  if (filter.operator === 'isNull') return value === undefined || value === null || value === '';
  if (filter.operator === 'isNotNull') return value !== undefined && value !== null && value !== '';
  if (expected === undefined || expected === null || expected === '') return true;
  if (filter.operator === 'notEquals') return normalizeComparable(value) !== normalizeComparable(expected);
  if (filter.operator === 'contains') return String(value ?? '').toLowerCase().includes(String(expected).toLowerCase());
  if (filter.operator === 'notContains') return !String(value ?? '').toLowerCase().includes(String(expected).toLowerCase());
  if (filter.operator === 'startsWith') return String(value ?? '').toLowerCase().startsWith(String(expected).toLowerCase());
  if (filter.operator === 'endsWith') return String(value ?? '').toLowerCase().endsWith(String(expected).toLowerCase());
  if (filter.operator === 'in') {
    const expectedValues = Array.isArray(expected) ? expected : [expected];
    return expectedValues.map(normalizeComparable).includes(normalizeComparable(value));
  }
  if (filter.operator === 'notIn') {
    const expectedValues = Array.isArray(expected) ? expected : [expected];
    return !expectedValues.map(normalizeComparable).includes(normalizeComparable(value));
  }
  if (filter.operator === 'greaterThan') return Number(value) > Number(expected);
  if (filter.operator === 'greaterThanOrEqual') return Number(value) >= Number(expected);
  if (filter.operator === 'lessThan') return Number(value) < Number(expected);
  if (filter.operator === 'lessThanOrEqual') return Number(value) <= Number(expected);
  if (filter.operator === 'between') return valueIsBetween(value, expected);
  if (filter.operator === 'last') return valueIsWithinLastWindow(value, expected, dateCeilings.get(filter.field) ?? Date.now());
  return normalizeComparable(value) === normalizeComparable(expected);
}

function normalizeComparable(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function valueIsBetween(value: unknown, expected: unknown): boolean {
  const range = Array.isArray(expected) ? expected : isRecord(expected) ? [expected.start, expected.end] : [];
  if (range.length < 2) return true;
  const numericValue = Number(value);
  const start = Number(range[0]);
  const end = Number(range[1]);
  if (Number.isFinite(numericValue) && Number.isFinite(start) && Number.isFinite(end)) {
    return numericValue >= start && numericValue <= end;
  }
  const timestamp = Date.parse(String(value));
  const startTime = Date.parse(String(range[0]));
  const endTime = Date.parse(String(range[1]));
  return Number.isFinite(timestamp) && Number.isFinite(startTime) && Number.isFinite(endTime) && timestamp >= startTime && timestamp <= endTime;
}

function valueIsWithinLastWindow(value: unknown, expected: unknown, ceiling: number): boolean {
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp) || !Number.isFinite(ceiling)) return true;
  const amount = Number(String(expected).match(/\d+/)?.[0] ?? '30');
  const lowerBound = ceiling - Math.max(amount, 1) * 24 * 60 * 60 * 1000;
  return timestamp >= lowerBound && timestamp <= ceiling;
}

function maxTimestamp(rows: Row[], field: string): number {
  const timestamps = rows.map(row => Date.parse(String(row[field]))).filter(Number.isFinite);
  return timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
}

function aggregate(items: Row[], field: string, aggregation: string): number {
  return aggregateChartRows(items, field, aggregation);
}

function numberValue(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}
