export interface ComponentConfig {
  component?: string;
  xField?: string;
  ySeries?: Array<string | { field: string; summarize?: string; alias?: string; expression?: string }>;
  ySeriesSummarize?: Record<string, string>;
  aggregations?: Record<string, string>;
  series?: Array<{ field: string; summarize?: string; alias?: string; type?: string; expression?: string }>;
  seriesBy?: string;
  columns?: Array<{ field?: string; key?: string; name?: string; summarize?: string; type?: string; cellType?: string; deltaCompareField?: string; alias?: string; sourceField?: string }>;
  rowFields?: Array<{ field: string; summarize?: string }>;
  columnFields?: Array<{ field: string; summarize?: string }>;
  valueFields?: Array<{ field: string; summarize?: string }>;
  field?: string;
  fields?: string[];
  aggregationType?: string;
  layout?: 'single' | 'multi';
  sparklineField?: string;
  sparklineXField?: string;
  sparklineAggregation?: string;
  trendField?: string;
  trendAggregation?: string;
  comparisonField?: string;
  comparisonAggregation?: string;
  supportingField?: string;
  supportingAggregation?: string;
  groupByFields?: string[];
  calculatedFields?: CalculatedField[];
  limit?: number;
  topN?: number;
  dataSource?: string;
  disableServerAggregation?: boolean;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  sortOrder?: 'asc' | 'desc';
  ranking?: {
    type?: string;
    rankType?: 'top' | 'bottom';
    rankLimit?: number;
    rankPosition?: number | string;
    rankMetricField?: string;
    rankWithinDimensions?: string[];
    withinDimensions?: string[];
    byDimension?: string;
  };
  xAxisGrouping?: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'hour' | 'minute';
  xAxisSortOrder?: 'asc' | 'desc';
  weekNumbering?: 'iso' | 'simple';
  weekStartDay?: 'monday' | 'saturday' | 'sunday';
  fiscalStartMonth?: number;
  yearType?: 'calendar' | 'fiscal';
  rowGrouping?: { fields?: Array<string | { field?: string; name?: string }>; groupBy?: Array<string | { field?: string; name?: string }> };
  rowSorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' };
  columnSorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' };
}

export interface CalculatedField {
  name: string;
  backgroundName?: string;
  type: 'time_filter' | 'conditional' | 'expression' | 'percentage' | 'text' | 'dateGrouping' | 'dateBucket' | 'date_bucket' | 'dateTimeFormat' | 'date_time_format' | 'filter' | 'analytics' | 'case_when';
  yearOffset?: number;
  yearType?: 'calendar' | 'fiscal';
  fiscalStartMonth?: number;
  weekNumbering?: 'iso' | 'simple';
  weekStartDay?: 'monday' | 'saturday' | 'sunday';
  dateField?: string;
  valueField?: string;
  expression?: string;
  conditions?: Array<{ field: string; operator: string; value?: unknown; minValue?: unknown; maxValue?: unknown; result?: unknown }>;
  fields?: string[];
  timezone?: string;
  template?: string;
  defaultValue?: string;
  sourceField?: string;
  analyticsFunction?: string;
  rankAscending?: boolean;
  grouping?: string;
  buckets?: Array<{ condition: string; label: string }>;
  format?: string;
  filterRules?: unknown;
  caseExpression?: string;
  hidden?: boolean;
  systemGenerated?: boolean;
}

export interface FilterCondition {
  column: string;
  operator: string;
  value?: unknown;
}

export interface ComponentSqlResult {
  sql: string;
  requiresGroupBy: boolean;
}

export type SupportedDialect = 'sqlserver' | 'mysql' | 'postgres' | 'postgresql' | 'clickhouse' | 'databricks' | 'athena';
