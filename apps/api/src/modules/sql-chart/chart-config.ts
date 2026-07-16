import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import type { ComponentConfig } from './component-sql-builder/index.js';
import {
  ANALYZER_CHART_DATA_SAFE_LIMIT,
  type ChartConfig,
  type ChartFilterIntent,
  type ChartSortIntent,
  type Row
} from './foundation-route-types.js';
import {
  asString,
  isNonEmptyString,
  isRecord,
  stringArray,
  stringMap
} from './foundation-route-utils.js';
import { hasChartField, hasField, lookupSource } from './chart-source-lookup.js';
import type { SqlEditorTable } from './sql-editor-data.js';
import type { GeneratedXAxisBucket } from './x-axis-generated-bucket.js';

export function validateChartBody(
  body: unknown,
  config: ChartConfig | null,
  table: SqlEditorTable | null = null,
  access?: DataSourceAccessPolicy,
  options: { strictFields?: boolean } = {}
): string[] {
  const errors: string[] = [];
  const hasReadableSource = table
    ? true
    : isRecord(body) && isNonEmptyString(body.dataSourceId) && Boolean(lookupSource(body.dataSourceId, access));
  if (!isRecord(body) || !isNonEmptyString(body.dataSourceId) || !hasReadableSource) {
    errors.push('Valid dataSourceId is required');
  }
  if (!isRecord(body) || !isNonEmptyString(body.tableName) || !table) errors.push('Valid tableName is required');
  if (!config) errors.push('chartConfig or visualization field configuration is required');
  if (options.strictFields !== false) {
    if (config && table && !hasChartField(table, config.xField)) errors.push(`Unknown xField: ${config.xField}`);
    for (const field of config?.yFields ?? []) {
      if (table && !hasChartField(table, field)) errors.push(`Unknown yField: ${field}`);
    }
    const legacyFields = new Set(config ? [config.xField, ...config.yFields] : []);
    for (const field of config ? chartConfigFields(config).filter(item => !legacyFields.has(item)) : []) {
      if (table && !hasChartField(table, field)) errors.push(`Unknown field: ${field}`);
    }
    for (const filter of config?.filters ?? []) {
      if (table && !hasField(table, filter.field)) errors.push(`Unknown filter field: ${filter.field}`);
    }
  }
  return errors;
}

export function normalizeChartConfig(value: unknown): ChartConfig | null {
  if (!isRecord(value)) return null;
  const visualizationConfig = normalizeVisualizationConfig(value);
  if (visualizationConfig) return visualizationConfig;
  if (!isNonEmptyString(value.xField)) return null;
  const yFields = Array.isArray(value.yFields)
    ? value.yFields.filter(isNonEmptyString).map(item => item.trim())
    : isNonEmptyString(value.yField) ? [value.yField.trim()] : [];
  if (yFields.length === 0) return null;
  const seriesBy = readSeriesBy(value.seriesBy);
  const limit = typeof value.limit === 'number' && value.limit > 0 ? Math.floor(value.limit) : undefined;
  return {
    dimensions: [value.xField.trim()],
    xField: value.xField.trim(),
    yFields,
    ...(seriesBy === undefined ? {} : { seriesBy }),
    chartType: asString(value.chartType) ?? 'bar',
    aggregations: isRecord(value.aggregations) ? stringMap(value.aggregations) : {},
    filters: normalizeChartFilters(value.filters),
    selectFields: Array.from(new Set([value.xField.trim(), ...yFields, ...(seriesBy ? [seriesBy] : [])])),
    sort: normalizeChartSort(value.sort),
    ...(limit === undefined ? {} : { limit })
  };
}

export function normalizeVisualizationConfig(value: Record<string, unknown>): ChartConfig | null {
  if (!Array.isArray(value.encodings)) return null;
  const encodings = value.encodings.filter(isRecord);
  const fields = encodings.flatMap(item => isNonEmptyString(item.field) ? [item.field.trim()] : []);
  const dimensions = encodings.flatMap(item =>
    isNonEmptyString(item.field) && item.role !== 'measure' ? [item.field.trim()] : []
  );
  const measures = encodings.flatMap(item =>
    isNonEmptyString(item.field) && item.role === 'measure' ? [item.field.trim()] : []
  );
  const kind = asString(value.kind) ?? 'bar';
  if (kind === 'filter') return null;
  if (fields.length === 0) return null;
  if (kind !== 'table' && kind !== 'card' && dimensions.length === 0) return null;
  if (kind !== 'table' && measures.length === 0) return null;
  const seriesBy = readSeriesBy(value.seriesBy);
  const limit = typeof value.limit === 'number' && value.limit > 0 ? Math.floor(value.limit) : undefined;
  const xField = dimensions[0] ?? fields[0] ?? measures[0];
  if (!xField) return null;
  const yFields = kind === 'table'
    ? measures
    : measures.length > 0 ? measures : fields.filter(field => field !== xField);
  return {
    dimensions,
    xField,
    yFields,
    ...(seriesBy === undefined ? {} : { seriesBy }),
    chartType: kind,
    aggregations: aggregationsFromEncodings(encodings, isRecord(value.aggregations) ? stringMap(value.aggregations) : {}),
    filters: normalizeChartFilters(value.filters),
    selectFields: Array.from(new Set([...fields, ...(seriesBy ? [seriesBy] : [])])),
    sort: normalizeChartSort(value.sort),
    ...(limit === undefined ? {} : { limit })
  };
}

export function mergeChartConfigWithComponentConfig(
  config: ChartConfig | null,
  componentConfig: ComponentConfig | null
): ChartConfig | null {
  if (!config) return null;
  const seriesBy = readSeriesBy(componentConfig?.seriesBy) ?? config.seriesBy;
  if (!seriesBy) return config;
  return {
    ...config,
    seriesBy,
    selectFields: Array.from(new Set([...config.selectFields, seriesBy]))
  };
}

export function readSeriesBy(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value.trim() : undefined;
}

export function chartConfigFields(config: ChartConfig): string[] {
  return Array.from(new Set([
    config.xField,
    config.seriesBy,
    ...config.dimensions,
    ...config.yFields,
    ...config.selectFields,
    ...config.sort.map(sort => sort.field)
  ].filter((field): field is string => Boolean(field))));
}

export function normalizeChartSort(value: unknown): ChartSortIntent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item) || !isNonEmptyString(item.field)) return [];
    const direction = asString(item.direction)?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    return [{ field: item.field.trim(), direction }];
  });
}

export function normalizeChartFilters(value: unknown): ChartFilterIntent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item) || !isNonEmptyString(item.field)) return [];
    return [{
      field: item.field.trim(),
      operator: asString(item.operator) ?? 'equals',
      value: item.value ?? item.values
    }];
  });
}

export function applyAnalyzerChartDataLimit(body: unknown, config: ChartConfig | null): ChartConfig | null {
  if (!config || !isAnalyzerChartDataRequest(body)) return config;
  return {
    ...config,
    limit: clampAnalyzerChartDataLimit(config.limit)
  };
}

export function applyAnalyzerComponentDataLimit(
  body: unknown,
  componentConfig: ComponentConfig | null,
  chartConfig: ChartConfig | null
): ComponentConfig | null {
  if (!componentConfig || !isAnalyzerChartDataRequest(body)) return componentConfig;
  return {
    ...componentConfig,
    limit: clampAnalyzerChartDataLimit(Math.min(componentConfig.limit ?? Number.POSITIVE_INFINITY, chartConfig?.limit ?? Number.POSITIVE_INFINITY))
  };
}

export function isAnalyzerChartDataRequest(body: unknown): boolean {
  return isRecord(body) && body.requester === 'ai-data-analyzer';
}

export function clampAnalyzerChartDataLimit(limit: number | undefined): number {
  if (limit === undefined || limit <= 0) return ANALYZER_CHART_DATA_SAFE_LIMIT;
  return Math.min(Math.floor(limit), ANALYZER_CHART_DATA_SAFE_LIMIT);
}

export function synthesizeComponentConfigFromChartConfig(
  chartConfig: ChartConfig,
  rawChartConfig: Record<string, unknown>
): ComponentConfig {
  const componentConfig: ComponentConfig = {
    component: 'BaseChart',
    xField: chartConfig.xField,
    ySeries: chartConfig.yFields.map(field => ({
      field,
      summarize: chartConfig.aggregations[field] ?? 'sum'
    }))
  };
  if (chartConfig.limit !== undefined) componentConfig.limit = chartConfig.limit;
  if (chartConfig.seriesBy !== undefined) componentConfig.seriesBy = chartConfig.seriesBy;
  const xAxisGrouping = readXAxisGrouping(rawChartConfig.xAxisGrouping);
  if (xAxisGrouping) componentConfig.xAxisGrouping = xAxisGrouping;
  const xAxisSortOrder = readSortOrder(rawChartConfig.xAxisSortOrder);
  if (xAxisSortOrder) componentConfig.xAxisSortOrder = xAxisSortOrder;
  const weekNumbering = readWeekNumbering(rawChartConfig.weekNumbering);
  if (weekNumbering) componentConfig.weekNumbering = weekNumbering;
  const weekStartDay = readWeekStartDay(rawChartConfig.weekStartDay);
  if (weekStartDay) componentConfig.weekStartDay = weekStartDay;
  const fiscalStartMonth = readNumber(rawChartConfig.fiscalStartMonth) ?? readNumber(rawChartConfig.xAxisFiscalStart);
  if (fiscalStartMonth !== undefined) componentConfig.fiscalStartMonth = fiscalStartMonth;
  const yearType = readYearType(rawChartConfig.yearType) ?? readYearType(rawChartConfig.xAxisYearType);
  if (yearType) componentConfig.yearType = yearType;
  return componentConfig;
}

export function rowsMissingBucketDimension(rows: Row[], bucket: GeneratedXAxisBucket): boolean {
  return rows.length > 0
    && !rows.some(row => hasPresentChartValue(row[bucket.field.name]) || hasPresentChartValue(row[bucket.sourceField]));
}

export function chartFields(chartData: unknown[], chartConfig: Record<string, unknown>): string[] {
  const configured = [
    asString(chartConfig.xField),
    ...stringArray(chartConfig.yFields)
  ].filter((field): field is string => Boolean(field));
  if (configured.length > 0) return Array.from(new Set(configured)).slice(0, 4);
  const firstRow = chartData.find(isRecord);
  return firstRow ? Object.keys(firstRow).slice(0, 4) : [];
}

function aggregationsFromEncodings(encodings: Record<string, unknown>[], fallback: Record<string, string>): Record<string, string> {
  return {
    ...fallback,
    ...Object.fromEntries(encodings.flatMap(item =>
      isNonEmptyString(item.field) && isNonEmptyString(item.aggregation)
        ? [[item.field.trim(), item.aggregation.trim()]]
        : []
    ))
  };
}

function readXAxisGrouping(value: unknown): ComponentConfig['xAxisGrouping'] | undefined {
  return value === 'day'
    || value === 'week'
    || value === 'month'
    || value === 'quarter'
    || value === 'year'
    || value === 'hour'
    || value === 'minute'
    ? value
    : undefined;
}

function readSortOrder(value: unknown): ComponentConfig['xAxisSortOrder'] | undefined {
  return value === 'asc' || value === 'desc' ? value : undefined;
}

function readWeekNumbering(value: unknown): ComponentConfig['weekNumbering'] | undefined {
  return value === 'iso' || value === 'simple' ? value : undefined;
}

function readWeekStartDay(value: unknown): ComponentConfig['weekStartDay'] | undefined {
  return value === 'monday' || value === 'saturday' || value === 'sunday' ? value : undefined;
}

function readYearType(value: unknown): ComponentConfig['yearType'] | undefined {
  return value === 'calendar' || value === 'fiscal' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function hasPresentChartValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}
