import { buildVisualizationSqlQuery } from './chart-sql-builder.js';

export interface ChartDataRowQueryConfig {
  aggregations: Record<string, string>;
  chartType: string;
  dimensions: string[];
  filters: ChartDataRowQueryFilter[];
  limit?: number;
  seriesBy?: string;
  selectFields: string[];
  sort: ChartDataRowQuerySort[];
  xField: string;
  yFields: string[];
}

interface ChartDataRowQueryFilter {
  field: string;
  operator: string;
  value?: unknown;
}

interface ChartDataRowQuerySort {
  field: string;
  direction: string;
}

export interface ChartDataRowQuery {
  filtersAppliedAtSource: boolean;
  query: string;
}

export function buildChartDataRowQuery(
  sourceType: string | undefined,
  tableName: string,
  config: ChartDataRowQueryConfig
): ChartDataRowQuery {
  return {
    filtersAppliedAtSource: hasActiveFilters(config.filters),
    query: buildVisualizationSqlQuery(sourceType, tableName, {
      aggregations: config.aggregations,
      dimensions: config.dimensions.length > 0 ? config.dimensions : [config.xField],
      filters: config.filters,
      kind: config.chartType,
      measures: config.yFields,
      ...(config.seriesBy === undefined ? {} : { seriesBy: config.seriesBy }),
      selectFields: config.selectFields,
      sort: config.sort,
      ...(config.limit === undefined ? {} : { limit: config.limit })
    })
  };
}

function hasActiveFilters(filters: ChartDataRowQueryFilter[]): boolean {
  return filters.some(filter => !isEmptyFilterValue(filter.value));
}

function isEmptyFilterValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyFilterValue);
  return typeof value === 'string' && ['', 'all', '*'].includes(value.trim().toLowerCase());
}
