import { buildComponentSql, type ComponentConfig } from './component-sql-builder/index.js';

export interface SqlModelChartConfig {
  aggregations: Record<string, string>;
  chartType: string;
  dimensions: string[];
  filters: Array<{ field: string; operator: string; value?: unknown }>;
  limit?: number;
  selectFields: string[];
  seriesBy?: string;
  sort: Array<{ field: string; direction: string }>;
  xField: string;
  yFields: string[];
}

export interface SqlModelDerivedChartQuery {
  filtersAppliedAtSource: boolean;
  query: string;
  rowsAggregatedAtSource: boolean;
  sourceSqlQuery: string;
}

interface SqlModelTableReference {
  tableName: string;
  withClause: string;
}

export function buildSqlModelDerivedChartQuery(input: {
  chartConfig: SqlModelChartConfig;
  componentConfig: ComponentConfig | null;
  limit: number;
  modelSql: string;
  sourceType: string | undefined;
}): SqlModelDerivedChartQuery {
  const modelTable = buildSqlModelTableReference(input.modelSql, input.sourceType);
  const componentConfig = componentConfigWithChartAggregations(
    input.componentConfig ?? componentConfigFromChartConfig(input.chartConfig),
    input.chartConfig
  );
  const filters = input.chartConfig.filters.map(filter => ({
    column: filter.field,
    operator: filter.operator,
    value: filter.value
  }));
  const { sql, requiresGroupBy } = buildComponentSql(
    input.sourceType ?? 'mysql',
    modelTable.tableName,
    { ...componentConfig, limit: componentConfig.limit ?? input.limit },
    filters,
    undefined,
    input.limit
  );
  const query = modelTable.withClause ? `${modelTable.withClause}\n${sql}` : sql;
  return {
    filtersAppliedAtSource: filters.length > 0,
    query,
    rowsAggregatedAtSource: requiresGroupBy,
    sourceSqlQuery: query
  };
}

function componentConfigWithChartAggregations(
  componentConfig: ComponentConfig,
  chartConfig: SqlModelChartConfig
): ComponentConfig {
  const primarySort = Array.isArray(chartConfig.sort) ? chartConfig.sort[0] : undefined;
  const fallbackSortBy = typeof primarySort?.field === 'string' && primarySort.field.trim().length > 0
    ? primarySort.field.trim()
    : undefined;
  const fallbackSortDirection = normalizeSortDirection(primarySort?.direction);
  const {
    sortBy: currentSortBy,
    sortDirection: currentSortDirection,
    sortOrder: currentSortOrder,
    ...configWithoutSort
  } = componentConfig;
  const sortBy = currentSortBy ?? fallbackSortBy;
  const sortDirection = currentSortDirection ?? currentSortOrder ?? fallbackSortDirection;
  const sortOrder = currentSortOrder ?? currentSortDirection ?? fallbackSortDirection;
  return {
    ...configWithoutSort,
    ...(sortBy !== undefined ? { sortBy } : {}),
    ...(sortDirection !== undefined ? { sortDirection } : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    aggregations: {
      ...chartConfig.aggregations,
      ...(componentConfig.aggregations ?? {})
    },
    ySeriesSummarize: {
      ...chartConfig.aggregations,
      ...(componentConfig.ySeriesSummarize ?? {})
    }
  };
}

function normalizeSortDirection(value: unknown): 'asc' | 'desc' | undefined {
  if (value === 'asc' || value === 'desc') return value;
  return undefined;
}

export function buildSqlModelTableReference(
  modelSql: string,
  sourceType?: string
): SqlModelTableReference {
  const sql = stripTerminatingSemicolon(modelSql);
  const cteParts = splitLeadingCteQuery(sql);
  if (cteParts) {
    const mainQuery = normalizeDerivedTableQueryForSource(cteParts.mainQuery, sourceType);
    return {
      tableName: `(${mainQuery}) AS sql_table`,
      withClause: cteParts.withClause
    };
  }
  const mainQuery = normalizeDerivedTableQueryForSource(sql, sourceType);
  return {
    tableName: `(${mainQuery}) AS sql_table`,
    withClause: ''
  };
}

function componentConfigFromChartConfig(config: SqlModelChartConfig): ComponentConfig {
  if (config.chartType === 'table') {
    const fields = config.selectFields.length > 0
      ? config.selectFields
      : Array.from(new Set([config.xField, ...config.yFields]));
    return {
      component: 'TableComponent',
      columns: fields.map(field => ({
        field,
        summarize: config.aggregations[field] ?? (config.yFields.includes(field) ? 'sum' : 'none')
      }))
    };
  }
  if (config.chartType === 'card') {
    const field = config.yFields[0] ?? config.selectFields[0] ?? config.xField;
    return {
      aggregationType: config.aggregations[field] ?? 'sum',
      component: 'CardComponent',
      field
    };
  }
  if (config.chartType === 'matrix') {
    return {
      columnFields: [],
      component: 'MatrixComponent',
      rowFields: config.dimensions.map(field => ({ field })),
      valueFields: config.yFields.map(field => ({
        field,
        summarize: config.aggregations[field] ?? 'sum'
      }))
    };
  }
  return {
    component: 'BaseChart',
    xField: config.xField,
    ...(config.seriesBy === undefined ? {} : { seriesBy: config.seriesBy }),
    ySeries: config.yFields.map(field => ({
      field,
      summarize: config.aggregations[field] ?? 'sum'
    }))
  };
}

function splitLeadingCteQuery(sql: string): { mainQuery: string; withClause: string } | null {
  if (!/^\s*with\b/i.test(sql)) return null;

  const lower = sql.toLowerCase();
  let depth = 0;
  let quote: string | null = null;
  let bracketedIdentifier = false;

  for (let index = 0; index < lower.length - 5; index += 1) {
    const char = lower[index];

    if (quote) {
      if (char === quote && lower[index - 1] !== '\\') quote = null;
      continue;
    }
    if (bracketedIdentifier) {
      if (char === ']') bracketedIdentifier = false;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '[') {
      bracketedIdentifier = true;
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && isWordAt(lower, index, 'select')) {
      return {
        mainQuery: sql.slice(index).trim(),
        withClause: sql.slice(0, index).trim()
      };
    }
  }

  return null;
}

function isWordAt(value: string, index: number, word: string): boolean {
  const before = index === 0 ? ' ' : value[index - 1] ?? ' ';
  const after = value[index + word.length] ?? ' ';
  return value.slice(index, index + word.length) === word
    && !/[a-z0-9_]/i.test(before)
    && !/[a-z0-9_]/i.test(after);
}

function stripTerminatingSemicolon(query: string): string {
  return query.trim().replace(/;+\s*$/, '');
}

function normalizeDerivedTableQueryForSource(query: string, sourceType: string | undefined): string {
  return isSqlServerSource(sourceType) && shouldStripSqlServerDerivedOrderBy(query)
    ? stripTopLevelOrderBy(query)
    : query;
}

function isSqlServerSource(sourceType: string | undefined): boolean {
  const normalized = sourceType?.trim().toLowerCase();
  return normalized === 'sqlserver' || normalized === 'mssql';
}

function shouldStripSqlServerDerivedOrderBy(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  const topLevelOrderBy = topLevelOrderByIndex(normalized);
  if (topLevelOrderBy < 0) return false;
  const beforeOrderBy = normalized.slice(0, topLevelOrderBy);
  if (/^\s*select\s+top\s+\(?\s*\d+/i.test(beforeOrderBy)) return false;
  if (/\boffset\s+\d+\s+rows\b/i.test(normalized)) return false;
  if (/\bfetch\s+next\s+\d+\s+rows\s+only\b/i.test(normalized)) return false;
  return true;
}

function stripTopLevelOrderBy(query: string): string {
  const index = topLevelOrderByIndex(query);
  return index >= 0 ? query.slice(0, index).trimEnd() : query;
}

function topLevelOrderByIndex(query: string): number {
  let depth = 0;
  let quote: string | null = null;
  let bracketedIdentifier = false;
  let lastOrderByPos = -1;
  for (let index = 0; index < query.length - 7; index += 1) {
    const char = query[index];
    if (quote) {
      if (char === quote && query[index - 1] !== '\\') quote = null;
      continue;
    }
    if (bracketedIdentifier) {
      if (char === ']') bracketedIdentifier = false;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '[') {
      bracketedIdentifier = true;
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && /^order\s+by\b/i.test(query.slice(index))) lastOrderByPos = index;
  }
  return lastOrderByPos;
}
