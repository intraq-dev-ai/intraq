import {
  currentDateExclusiveUpperBoundExpression,
  dateFilterClauseForPrompt,
  dialectForSourceType,
  quoteSqlIdentifierForType,
  relativeDateExpressionForDays
} from '../data-source/sql-dialect.js';
import { normalizeChartAggregation } from './chart-aggregation.js';

export interface ChartSqlConfig {
  xField: string;
  yFields: string[];
  seriesBy?: string;
  aggregations: Record<string, string>;
  chartType?: string;
  filters: ChartSqlFilter[];
  limit?: number;
  sort?: ChartSqlSort[];
}

export interface VisualizationSqlConfig {
  aggregations: Record<string, string>;
  dimensions?: string[];
  filters: ChartSqlFilter[];
  kind?: string;
  limit?: number;
  measures?: string[];
  seriesBy?: string;
  selectFields?: string[];
  sort?: ChartSqlSort[];
}

export interface ChartSqlFilter {
  field: string;
  operator: string;
  value?: unknown;
}

export interface ChartSqlSort {
  field: string;
  direction: string;
}

const ROW_COUNT_FIELD = '__row_count';

export function buildChartSqlQuery(sourceType: string | undefined, tableName: string, config: ChartSqlConfig): string {
  const visualizationConfig: VisualizationSqlConfig = {
    aggregations: config.aggregations,
    dimensions: [config.xField],
    filters: config.filters,
    kind: config.chartType ?? 'bar',
    measures: config.yFields,
    ...(config.seriesBy === undefined ? {} : { seriesBy: config.seriesBy }),
    ...(config.limit === undefined ? {} : { limit: config.limit }),
    ...(config.sort === undefined ? {} : { sort: config.sort })
  };
  return buildVisualizationSqlQuery(sourceType, tableName, visualizationConfig);
}

export function buildVisualizationSqlQuery(
  sourceType: string | undefined,
  tableName: string,
  config: VisualizationSqlConfig
): string {
  const kind = normalizeVisualizationKind(config.kind);
  const whereClause = buildWhereClause(sourceType, config.filters);
  const dimensions = uniqueStrings(config.dimensions ?? []);
  const measures = uniqueStrings(config.measures ?? []);
  const seriesBy = config.seriesBy?.trim();
  if (kind === 'table') {
    return measures.length > 0
      ? buildAggregateSql(sourceType, tableName, config, dimensions, whereClause)
      : buildTableSql(sourceType, tableName, config, whereClause);
  }
  if (kind === 'card') return buildAggregateSql(sourceType, tableName, config, [], whereClause);
  if (kind !== 'matrix' && hasRawSeriesAggregation(config.measures ?? [], config.aggregations) && !seriesBy) {
    return buildTableSql(sourceType, tableName, {
      ...config,
      selectFields: uniqueStrings([
        ...dimensions.slice(0, 1),
        ...measures
      ])
    }, whereClause);
  }
  return buildAggregateSql(
    sourceType,
    tableName,
    config,
    uniqueStrings([
      ...dimensions.slice(0, kind === 'matrix' ? dimensions.length : 1),
      ...(seriesBy && kind !== 'matrix' ? [seriesBy] : [])
    ]),
    whereClause
  );
}

function buildTableSql(
  sourceType: string | undefined,
  tableName: string,
  config: VisualizationSqlConfig,
  whereClause: string
): string {
  const selected = uniqueStrings(config.selectFields ?? [...(config.dimensions ?? []), ...(config.measures ?? [])]);
  const selectClause = selected.length > 0
    ? selected.map(field => quoteIdentifier(sourceType, field)).join(', ')
    : '*';
  const orderByClause = buildOrderByClause(sourceType, config.sort, []);
  const limitClause = buildLimitClause(sourceType, config.limit);
  return [
    `SELECT ${selectClause}`,
    `FROM ${quoteQualifiedIdentifier(sourceType, tableName)}`,
    whereClause,
    orderByClause || limitOrderFallback(sourceType, limitClause),
    limitClause
  ].filter(Boolean).join('\n');
}

function buildAggregateSql(
  sourceType: string | undefined,
  tableName: string,
  config: VisualizationSqlConfig,
  dimensions: string[],
  whereClause: string
): string {
  const dimensionExpressions = dimensions.map(field => quoteIdentifier(sourceType, field));
  const metrics = aggregateExpressions(sourceType, config.measures ?? [], config.aggregations);
  const groupByClause = dimensionExpressions.length > 0 ? `GROUP BY ${dimensionExpressions.join(', ')}` : '';
  const orderByClause = buildOrderByClause(sourceType, config.sort, dimensions);
  const limitClause = buildLimitClause(sourceType, config.limit);
  return [
    `SELECT ${[...dimensionExpressions, ...metrics].join(', ')}`,
    `FROM ${quoteQualifiedIdentifier(sourceType, tableName)}`,
    whereClause,
    groupByClause,
    orderByClause || limitOrderFallback(sourceType, limitClause),
    limitClause
  ].filter(Boolean).join('\n');
}

function aggregateExpressions(sourceType: string | undefined, fields: string[], aggregations: Record<string, string>): string[] {
  const metrics = uniqueStrings(fields).map(field => aggregateExpression(sourceType, field, aggregations[field]));
  return metrics.length > 0 ? metrics : [`${countAggregate(sourceType, '*')} AS ${quoteIdentifier(sourceType, 'row_count')}`];
}

function aggregateExpression(sourceType: string | undefined, field: string, aggregation: string | undefined): string {
  if (field === ROW_COUNT_FIELD) return `${countAggregate(sourceType, '*')} AS ${quoteIdentifier(sourceType, ROW_COUNT_FIELD)}`;
  const quotedField = quoteIdentifier(sourceType, field);
  const normalized = normalizeChartAggregation(aggregation);
  if (normalized === 'none') return `${quotedField} AS ${quotedField}`;
  if (normalized === 'count') return `${countAggregate(sourceType, quotedField)} AS ${quotedField}`;
  if (normalized === 'countDistinct') return `${countDistinctAggregate(sourceType, quotedField)} AS ${quotedField}`;
  return `${normalized.toUpperCase()}(${quotedField}) AS ${quotedField}`;
}

function countAggregate(sourceType: string | undefined, expression: string): string {
  return isSqlServerSource(sourceType) ? `COUNT_BIG(${expression})` : `COUNT(${expression})`;
}

function countDistinctAggregate(sourceType: string | undefined, expression: string): string {
  return isSqlServerSource(sourceType) ? `COUNT_BIG(DISTINCT ${expression})` : `COUNT(DISTINCT ${expression})`;
}

function isSqlServerSource(sourceType: string | undefined): boolean {
  const normalized = sourceType?.toLowerCase();
  return normalized === 'sqlserver' || normalized === 'mssql';
}

function hasRawSeriesAggregation(fields: string[], aggregations: Record<string, string>): boolean {
  return uniqueStrings(fields).some(field => normalizeChartAggregation(aggregations[field]) === 'none');
}

function buildWhereClause(sourceType: string | undefined, filters: ChartSqlFilter[]): string {
  const clauses = filters.flatMap(filter => {
    const clause = filterClause(sourceType, filter);
    return clause ? [clause] : [];
  });
  return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
}

function filterClause(sourceType: string | undefined, filter: ChartSqlFilter): string | null {
  const field = quoteIdentifier(sourceType, filter.field);
  if (filter.operator === 'isNull') return `${field} IS NULL`;
  if (filter.operator === 'isNotNull') return `${field} IS NOT NULL`;
  if (isEmptyFilterValue(filter.value)) return null;
  if (filter.operator === 'notEquals') return `${field} != ${sqlLiteral(filter.value)}`;
  if (filter.operator === 'contains') return `${field} LIKE ${sqlLiteral(`%${String(filter.value)}%`)}`;
  if (filter.operator === 'notContains') return `${field} NOT LIKE ${sqlLiteral(`%${String(filter.value)}%`)}`;
  if (filter.operator === 'startsWith') return `${field} LIKE ${sqlLiteral(`${String(filter.value)}%`)}`;
  if (filter.operator === 'endsWith') return `${field} LIKE ${sqlLiteral(`%${String(filter.value)}`)}`;
  if (filter.operator === 'in') return inClause(field, filter.value);
  if (filter.operator === 'notIn') return notInClause(field, filter.value);
  if (filter.operator === 'greaterThan') return `${field} > ${sqlLiteral(filter.value)}`;
  if (filter.operator === 'greaterThanOrEqual') return `${field} >= ${sqlLiteral(filter.value)}`;
  if (filter.operator === 'lessThan') return `${field} < ${sqlLiteral(filter.value)}`;
  if (filter.operator === 'lessThanOrEqual') return `${field} <= ${sqlLiteral(filter.value)}`;
  if (filter.operator === 'between') return betweenClause(field, filter.value);
  if (filter.operator === 'last') return lastWindowClause(sourceType, field, filter.value);
  return `${field} = ${sqlLiteral(filter.value)}`;
}

function inClause(field: string, value: unknown): string | null {
  const values = (Array.isArray(value) ? value : [value]).filter(item => !isEmptyFilterValue(item));
  return values.length > 0 ? `${field} IN (${values.map(sqlLiteral).join(', ')})` : null;
}

function notInClause(field: string, value: unknown): string | null {
  const values = (Array.isArray(value) ? value : [value]).filter(item => !isEmptyFilterValue(item));
  return values.length > 0 ? `${field} NOT IN (${values.map(sqlLiteral).join(', ')})` : null;
}

function betweenClause(field: string, value: unknown): string | null {
  const range = Array.isArray(value) ? value : isRecord(value) ? [value.start ?? value.from, value.end ?? value.to] : [];
  if (range.length < 2 || isEmptyFilterValue(range[0]) || isEmptyFilterValue(range[1])) return null;
  return `${field} BETWEEN ${sqlLiteral(range[0])} AND ${sqlLiteral(range[1])}`;
}

function lastWindowClause(sourceType: string | undefined, field: string, value: unknown): string | null {
  const prompt = typeof value === 'string' && value.toLowerCase().includes('last') ? value : `last ${String(value)}`;
  const sharedClause = dateFilterClauseForPrompt(sourceType, prompt, field);
  if (sharedClause) return sharedClause.replace(/^WHERE\s+/i, '');
  const days = Number(String(value).match(/\d+/)?.[0]);
  return Number.isFinite(days) && days > 0
    ? `${field} >= ${relativeDateExpressionForDays(sourceType, days)} AND ${field} < ${currentDateExclusiveUpperBoundExpression(sourceType)}`
    : null;
}

function buildOrderByClause(sourceType: string | undefined, sortItems: ChartSqlSort[] | undefined, defaultFields: string[]): string {
  const sort = sortItems?.find(item => item.field && (item.direction === 'asc' || item.direction === 'desc'));
  if (sort) return `ORDER BY ${quoteIdentifier(sourceType, sort.field)} ${sort.direction.toUpperCase()}`;
  const defaultField = defaultFields[0];
  return defaultField ? `ORDER BY ${quoteIdentifier(sourceType, defaultField)} ASC` : '';
}

function buildLimitClause(sourceType: string | undefined, limit: number | undefined): string {
  if (!limit || limit <= 0) return '';
  const safeLimit = Math.floor(Math.min(limit, 1000));
  return dialectForSourceType(sourceType) === 'sqlserver'
    ? `OFFSET 0 ROWS FETCH NEXT ${safeLimit} ROWS ONLY`
    : `LIMIT ${safeLimit}`;
}

function normalizeVisualizationKind(value: string | undefined): 'bar' | 'card' | 'line' | 'matrix' | 'pie' | 'table' {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'table' || normalized === 'card' || normalized === 'matrix' || normalized === 'pie' || normalized === 'line') {
    return normalized;
  }
  return 'bar';
}

function limitOrderFallback(sourceType: string | undefined, limitClause: string): string {
  return limitClause && dialectForSourceType(sourceType) === 'sqlserver' ? 'ORDER BY (SELECT NULL)' : '';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())));
}

function quoteQualifiedIdentifier(sourceType: string | undefined, value: string): string {
  return value.split('.').map(part => quoteIdentifier(sourceType, part)).join('.');
}

function quoteIdentifier(sourceType: string | undefined, value: string): string {
  return quoteSqlIdentifierForType(value, sourceType);
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function isEmptyFilterValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyFilterValue);
  return typeof value === 'string' && ['', 'all', '*'].includes(value.trim().toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
