import { createHash } from 'node:crypto';
import {
  findDataSource
} from '../data-source/foundation-store.js';
import { readDataSourceTableRows } from '../data-source/source-table-rows.js';
import { isCustomQueryDataSource } from '../data-source/custom-query-live-engine.js';
import { isLiveSqlDataSource } from '../data-source/live-sql-query-engine.js';
import {
  applySqlModelParameters,
  type SqlModelParameterDefinition
} from '../data-source/sql-model-parameters.js';
import { buildChartDataRowQuery } from './chart-data-row-query.js';
import { rowsMissingBucketDimension } from './chart-config.js';
import {
  visualizationSqlConfig
} from './chart-data-builder.js';
import { buildVisualizationSqlQuery } from './chart-sql-builder.js';
import {
  buildComponentSql,
  type ComponentConfig,
  type FilterCondition as ComponentFilterCondition
} from './component-sql-builder/index.js';
import {
  API_CHART_ROUTE_TIMEOUT_BUFFER_MS,
  DEFAULT_API_CHART_ROUTE_TIMEOUT_MS,
  MAX_API_CHART_ROUTE_TIMEOUT_MS,
  MAX_EXPORT_LIMIT,
  type ChartConfig,
  type LoadChartRowsInput,
  type LoadChartRowsResult
} from './foundation-route-types.js';
import {
  asString,
  isRecord,
  positiveNumber,
  readRecord
} from './foundation-route-utils.js';
import { executeSqlEditorQuery } from './sql-editor-service.js';
import type {
  SqlEditorDataSource,
  SqlEditorTable
} from './sql-editor-data.js';
import { buildSqlModelDerivedChartQuery } from './sql-model-derived-query.js';

export async function loadChartRows(parsed: LoadChartRowsInput): Promise<LoadChartRowsResult> {
  const limit = parsed.chartConfig.limit ?? 1000;
  const maxLimit = Math.max(1000, Math.min(limit, MAX_EXPORT_LIMIT));
  const defaultSqlQuery = buildVisualizationSqlQuery(parsed.source.type, parsed.tableName, visualizationSqlConfig(parsed.chartConfig));
  let sqlModelSourceQuery: string | null = null;

  // Match legacy saved-model execution: expose the model SQL as a derived
  // table, then let the component SQL builder project/group/filter it.
  if (parsed.table.hasSqlQuery && parsed.table.sqlQuery) {
    const appliedSql = applyModelParamLiterals(parsed.dataSourceId, parsed.table, parsed.table.sqlQuery, parsed.parameterValues);
    if (appliedSql.unresolvedParameters.length > 0) {
      return {
        error: `Missing SQL data model parameter values: ${appliedSql.unresolvedParameters.join(', ')}`,
        statusCode: 400
      };
    }
    const rawSql = appliedSql.sql;
    const modelQuery = buildSqlModelDerivedChartQuery({
      chartConfig: parsed.chartConfig,
      componentConfig: parsed.componentConfig,
      limit,
      modelSql: rawSql,
      sourceType: parsed.source.type
    });
    sqlModelSourceQuery = modelQuery.sourceSqlQuery;
    const rawResult = await executeSqlEditorQuery(parsed.dataSourceId, modelQuery.query, {
      ...parsed.apiRuntimeState,
      bypassCache: true,
      defaultLimit: limit,
      maxLimit,
      preLimited: true,
      policy: parsed.access
    });
    if (rawResult.ok) {
      return {
        rows: rawResult.data.rows,
        filtersAppliedAtSource: modelQuery.filtersAppliedAtSource,
        rowsAggregatedAtSource: modelQuery.rowsAggregatedAtSource,
        sqlQuery: modelQuery.sourceSqlQuery
      };
    }
    if (shouldReturnChartQueryError(parsed.dataSourceId, true, rawResult)) {
      return { error: rawResult.error, statusCode: rawResult.statusCode };
    }
  }

  // For non-model tables (direct live SQL or componentConfig): push GROUP BY to the DB.
  let queryStr: string;
  let filtersAppliedAtSource = false;

  if (shouldQueryRawMatrixRows(parsed.chartConfig, parsed.componentConfig)) {
    const rowQuery = buildChartDataRowQuery(parsed.source.type, parsed.tableName, {
      ...parsed.chartConfig,
      chartType: 'table',
      yFields: [],
      selectFields: Array.from(new Set([
        ...parsed.chartConfig.dimensions,
        ...parsed.chartConfig.yFields,
        ...parsed.chartConfig.selectFields
      ])),
      limit
    });
    queryStr = rowQuery.query;
    filtersAppliedAtSource = rowQuery.filtersAppliedAtSource;
  } else if (parsed.componentConfig) {
    const componentFilters: ComponentFilterCondition[] = (parsed.chartConfig.filters ?? []).map(f => ({
      column: f.field,
      operator: f.operator,
      value: f.value
    }));
    const result = buildComponentSql(
      parsed.source.type,
      parsed.tableName,
      componentConfigWithChartAggregations(
        { ...parsed.componentConfig, limit: parsed.componentConfig.limit ?? limit },
        parsed.chartConfig
      ),
      componentFilters
    );
    queryStr = result.sql;
    filtersAppliedAtSource = componentFilters.length > 0;
  } else {
    const rowQuery = buildChartDataRowQuery(parsed.source.type, parsed.tableName, {
      ...parsed.chartConfig,
      limit
    });
    queryStr = rowQuery.query;
    filtersAppliedAtSource = rowQuery.filtersAppliedAtSource;
  }

  const queryResult = await executeSqlEditorQuery(parsed.dataSourceId, queryStr, {
    ...parsed.apiRuntimeState,
    bypassCache: true,
    defaultLimit: limit,
    maxLimit,
    preLimited: true,
    parameterValues: parsed.parameterValues,
    policy: parsed.access
  });
  const sourceSqlQuery = sqlModelSourceQuery ?? (parsed.componentConfig ? queryStr : defaultSqlQuery);
  if (queryResult.ok) {
    if (parsed.generatedXAxisBucket && rowsMissingBucketDimension(queryResult.data.rows, parsed.generatedXAxisBucket)) {
      return {
        rows: parsed.rows,
        filtersAppliedAtSource: false,
        rowsAggregatedAtSource: false,
        sqlQuery: sourceSqlQuery
      };
    }
    return {
      rows: queryResult.data.rows,
      filtersAppliedAtSource,
      rowsAggregatedAtSource: true,
      sqlQuery: sourceSqlQuery
    };
  }
  if (isRecoverableChartQueryError(queryResult.error)) {
    const fallback = await readDataSourceTableRows(parsed.dataSourceId, parsed.tableName, {
      access: parsed.access,
      defaultLimit: limit,
      maxLimit,
      parameterValues: parsed.parameterValues,
      selectFields: parsed.chartConfig.selectFields
    });
    if (fallback.ok) return { rows: fallback.data.rows, filtersAppliedAtSource: false, rowsAggregatedAtSource: false, sqlQuery: sourceSqlQuery };
  }
  if (shouldReturnChartQueryError(parsed.dataSourceId, parsed.table.hasSqlQuery, queryResult)) {
    return { error: queryResult.error, statusCode: queryResult.statusCode };
  }
  const result = await readDataSourceTableRows(parsed.dataSourceId, parsed.tableName, {
    access: parsed.access,
    defaultLimit: limit,
    maxLimit,
    parameterValues: parsed.parameterValues,
    selectFields: parsed.chartConfig.selectFields
  });
  if (!result.ok) return { error: result.error, statusCode: result.statusCode };
  if (result.data.rowCount === 0 && parsed.rows.length > 0) {
    return { rows: parsed.rows, filtersAppliedAtSource: false, rowsAggregatedAtSource: false, sqlQuery: defaultSqlQuery };
  }
  return { rows: result.data.rows, filtersAppliedAtSource: false, rowsAggregatedAtSource: false, sqlQuery: defaultSqlQuery };
}

export function chartDataOperationTimeoutMs(parsed: {
  dataSourceId: string;
  source: SqlEditorDataSource;
  table: SqlEditorTable;
}): number | undefined {
  const source = findDataSource(parsed.dataSourceId);
  if (!source) return undefined;
  const tableSettings = readRecord(parsed.table.settings);
  const tableApi = readRecord(tableSettings.api ?? tableSettings.request);
  const sourceSettings = readRecord(source.settings);
  const config = source.type === 'api' ? { ...source.config, ...tableApi } : source.config;
  const configuredTimeout = positiveNumber(
    sourceSettings.queryTimeoutMs
      ?? config.timeoutMs
      ?? config.requestTimeoutMs
      ?? config.queryTimeoutMs
      ?? config.sqlQueryTimeoutMs
      ?? config.statementTimeoutMs
  );
  const requestTimeout = configuredTimeout ?? (source.type === 'api' ? DEFAULT_API_CHART_ROUTE_TIMEOUT_MS : undefined);
  if (!requestTimeout) return undefined;
  const routeTimeout = source.type === 'api'
    ? requestTimeout * 2 + API_CHART_ROUTE_TIMEOUT_BUFFER_MS
    : requestTimeout + API_CHART_ROUTE_TIMEOUT_BUFFER_MS;
  return Math.min(MAX_API_CHART_ROUTE_TIMEOUT_MS, Math.max(1_000, routeTimeout));
}

function componentConfigWithChartAggregations(componentConfig: ComponentConfig, chartConfig: ChartConfig): ComponentConfig {
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

function shouldReturnChartQueryError(
  dataSourceId: string,
  hasSqlQuery: boolean,
  queryResult?: { error: string; statusCode: number }
): boolean {
  const source = findDataSource(dataSourceId);
  const executesAgainstSqlRuntime = Boolean(source && (isLiveSqlDataSource(source) || isCustomQueryDataSource(source)));
  if (executesAgainstSqlRuntime) return true;
  if (!hasSqlQuery) return false;
  return queryResult?.statusCode === 403;
}

function shouldQueryRawMatrixRows(
  chartConfig: ChartConfig,
  componentConfig: ComponentConfig | null
): boolean {
  if (!componentConfig || chartConfig.chartType !== 'matrix' || !Array.isArray(componentConfig.valueFields)) return false;
  const fields = componentConfig.valueFields
    .flatMap(item => typeof item?.field === 'string' && item.field.trim().length > 0 ? [item.field.trim()] : []);
  return new Set(fields).size !== fields.length;
}

function isRecoverableChartQueryError(error: string): boolean {
  return /unknown column|no such column|invalid identifier/i.test(error);
}

const appliedSqlCache = new Map<string, { sql: string; expiresAt: number }>();

function applyModelParamLiterals(
  dataSourceId: string,
  table: SqlEditorTable,
  sql: string,
  values: Record<string, unknown>
): { sql: string; unresolvedParameters: string[] } {
  const definitions = sqlModelParameterDefinitions(dataSourceId, table);
  const key = sqlModelParameterCacheKey(dataSourceId, table, sql, values, definitions);
  const cached = appliedSqlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { sql: cached.sql, unresolvedParameters: [] };

  const result = applySqlModelParameters(sql, definitions, values);
  if (appliedSqlCache.size > 200) appliedSqlCache.clear();
  if (result.unresolvedParameters.length === 0) {
    appliedSqlCache.set(key, { sql: result.sql, expiresAt: Date.now() + 30_000 });
  }
  return result;
}

function sqlModelParameterCacheKey(
  dataSourceId: string,
  table: SqlEditorTable,
  sql: string,
  values: Record<string, unknown>,
  definitions: SqlModelParameterDefinition[]
): string {
  const hash = createHash('sha256')
    .update(sql)
    .update('\0')
    .update(JSON.stringify(values))
    .update('\0')
    .update(JSON.stringify(definitions))
    .digest('hex');
  return `${dataSourceId}:${table.id ?? table.name}:${hash}`;
}

function sqlModelParameterDefinitions(dataSourceId: string, table: SqlEditorTable): SqlModelParameterDefinition[] {
  const source = findDataSource(dataSourceId);
  const sourceTable = source?.tables.find(item => item.id === table.id || item.name === table.name);
  if (!sourceTable) return [];
  return dedupeParameterDefinitions([
    ...readSqlModelParameterDefinitions(source?.dictionary.parameters),
    ...readSqlModelParameterDefinitions(source?.settings.parameters),
    ...readSqlModelParameterDefinitions(sourceTable.dictionary.parameters),
    ...readSqlModelParameterDefinitions(sourceTable.settings?.parameters)
  ]);
}

function readSqlModelParameterDefinitions(value: unknown): SqlModelParameterDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const name = asString(item.name);
    if (!name) return [];
    const dataType = asString(item.dataType) ?? asString(item.type);
    const dateRole = asString(item.dateRole);
    return [{
      name,
      defaultValue: item.defaultValue,
      required: item.required !== false,
      ...(dataType ? { dataType } : {}),
      ...(dateRole ? { dateRole } : {})
    }];
  });
}

function dedupeParameterDefinitions(definitions: SqlModelParameterDefinition[]): SqlModelParameterDefinition[] {
  return Array.from(new Map(definitions.map(definition => [definition.name, definition])).values());
}
