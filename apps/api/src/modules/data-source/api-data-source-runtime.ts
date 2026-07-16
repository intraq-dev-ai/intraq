import {
  buildDataSource,
  schemaForRows,
  type DataSourceRecord,
  type TableDefinition
} from './foundation-store.js';
import { executeDataSourceSqlQuery } from './sql-query-engine.js';
import { findReferencedTable } from './query-table-resolution.js';
import {
  applyExportRowTransforms,
  hasExportRowTransforms
} from './export-row-transforms.js';
import type {
  FilterExpression,
  SqlQueryEngineResult,
  SqlQueryExecuteOptions,
  SqlQueryResult
} from './sql-query-types.js';
import {
  DEFAULT_MAX_PAGES,
  DEFAULT_PAGE_SIZE,
  MAX_MAX_PAGES,
  MAX_ROWS,
  type ApiDirectExportOptions,
  type ApiDirectExportResponse,
  type ApiExportRowsOptions,
  type ApiPageRequest,
  type ApiRequestConfig,
  type ApiRowsOptions,
  type ApiRuntimeResult,
  type ApiRuntimeStateOptions,
  type PageState,
  type TokenAuthContext
} from './api-runtime-types.js';
import {
  appendQueryParam,
  applyRecordTemplate,
  applyTemplate,
  applyValueTemplate,
  boundedNumber,
  normalizedLimit,
  readPath,
  readRecord,
  readString,
  stringifyHeaders
} from './api-runtime-utils.js';
import {
  apiTableFromRows,
  columnsForRows,
  columnTypesFor,
  defaultApiTable,
  inferFields,
  normalizeRow,
  rowsFromPayload
} from './api-runtime-response.js';
import {
  readApiExportConfig,
  readApiExportRowsConfig,
  readApiRequestConfig
} from './api-runtime-config.js';
import {
  authHeaderPatch,
  clearApiTokenRequestCacheForTest,
  shouldRetryWithFreshToken,
  tokenAuthPatch
} from './api-runtime-token.js';
import { fetchJson, fetchRaw } from './api-runtime-http.js';
import { apiRequestTemplateValuesResult } from './api-runtime-template.js';
import { readCompositeApiConfig } from './api-runtime-composite-config.js';
import {
  readCompositeApiRows,
  setCompositeApiLiveSqlRunnerForTest
} from './api-runtime-composite-execution.js';
import {
  clearApiWorkflowRunLogsForTest,
  createApiWorkflowLogger,
  listApiWorkflowRunLogs
} from './api-runtime-logs.js';

export type {
  ApiDirectExportResponse,
  ApiRuntimeStateOptions
} from './api-runtime-types.js';

export {
  clearApiTokenRequestCacheForTest,
  clearApiWorkflowRunLogsForTest,
  listApiWorkflowRunLogs,
  setCompositeApiLiveSqlRunnerForTest
};

export function isApiDataSource(source: DataSourceRecord | undefined): source is DataSourceRecord & { type: 'api' } {
  return source?.type === 'api';
}

export async function testApiDataSourceConnection(
  source: DataSourceRecord,
  options: ApiRuntimeStateOptions = {}
): Promise<ApiRuntimeResult<{ executionTime: number; tables: string[] }>> {
  const started = Date.now();
  const table = source.tables[0] ?? defaultApiTable(source);
  const result = await readApiRows(source, table, { ...options, defaultLimit: 1, maxLimit: 1 });
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      executionTime: Math.max(1, Date.now() - started),
      tables: [table.name]
    }
  };
}

export async function discoverApiDataSourceTables(
  source: DataSourceRecord,
  options: { sampleLimit?: number } & ApiRuntimeStateOptions = {}
): Promise<ApiRuntimeResult<{ tables: TableDefinition[] }>> {
  const configuredTables = source.tables.length > 0 ? source.tables : [defaultApiTable(source)];
  const tables: TableDefinition[] = [];
  for (const table of configuredTables) {
    const rows = await readApiRows(source, table, {
      defaultLimit: options.sampleLimit ?? 20,
      maxLimit: options.sampleLimit ?? 20,
      ...(options.persistSourceConfig ? { persistSourceConfig: options.persistSourceConfig } : {})
    });
    if (!rows.ok) return rows;
    tables.push(apiTableFromRows(source, table, rows.data.rows));
  }
  return { ok: true, data: { tables } };
}

export async function readApiDataSourceTableRows(
  source: DataSourceRecord,
  table: TableDefinition,
  options: ApiRowsOptions = {}
): Promise<SqlQueryEngineResult<SqlQueryResult>> {
  const result = await readApiRows(source, table, options);
  if (!result.ok) return result;
  const selectedRows = result.data.rows.slice(0, normalizedLimit(options.defaultLimit, options.maxLimit));
  const fields = table.fields.length > 0 ? table.fields : inferFields(selectedRows);
  const columns = fields.length > 0 ? fields.map(field => field.name) : schemaForRows(selectedRows).map(field => field.name);
  return sqlResult(source, table, selectedRows, columns, fields, result.data.executionTime, `api ${source.id}.${table.name}`);
}

export async function readApiDataSourceDirectExport(
  source: DataSourceRecord,
  table: TableDefinition,
  options: ApiDirectExportOptions = {}
): Promise<ApiRuntimeResult<ApiDirectExportResponse> | null> {
  const exportConfig = readApiExportConfig(source, table, options.format);
  if (!exportConfig) return null;
  const configuredFilename = readString(exportConfig.filename ?? exportConfig.fileName ?? exportConfig.downloadFileName);
  const exportTable: TableDefinition = {
    ...table,
    settings: {
      ...table.settings,
      api: exportConfig
    }
  };
  const config = readApiRequestConfig(source, exportTable);
  if (!config.ok) return config;
  const templateValuesResult = await apiRequestTemplateValuesResult(source, table, options.parameterValues);
  if (!templateValuesResult.ok) return templateValuesResult;
  const tokenContext: TokenAuthContext = {
    source,
    ...(options.persistSourceConfig ? { persistSourceConfig: options.persistSourceConfig } : {})
  };
  const request = await buildPageRequest(config.data, config.data.pagination, { offset: 0, page: 1 }, templateValuesResult.data, tokenContext);
  if (!request.ok) return request;
  let response = await fetchRaw(request.data, config.data.timeoutMs, configuredFilename);
  if (!response.ok && shouldRetryWithFreshToken(response, config.data)) {
    const refreshedRequest = await buildPageRequest(config.data, config.data.pagination, { offset: 0, page: 1 }, templateValuesResult.data, {
      ...tokenContext,
      forceRefresh: true
    });
    if (!refreshedRequest.ok) return refreshedRequest;
    response = await fetchRaw(refreshedRequest.data, config.data.timeoutMs, configuredFilename);
  }
  return response;
}

export async function readApiDataSourceExportRows(
  source: DataSourceRecord,
  table: TableDefinition,
  options: ApiExportRowsOptions = {}
): Promise<SqlQueryEngineResult<SqlQueryResult> | null> {
  const exportConfig = readApiExportRowsConfig(source, table, options.format);
  if (!exportConfig) return null;
  const exportTable: TableDefinition = {
    ...table,
    settings: {
      ...table.settings,
      api: exportConfig
    }
  };
  const result = await readApiRows(source, exportTable, options);
  if (!result.ok) return result;
  const selectedRows = result.data.rows.slice(0, normalizedLimit(options.defaultLimit, options.maxLimit));
  const fields = table.fields.length > 0 ? table.fields : inferFields(selectedRows);
  const fallbackColumns = columnsForRows(selectedRows, fields);
  const transformed = hasExportRowTransforms(exportConfig)
    ? applyExportRowTransforms(selectedRows, exportConfig, fallbackColumns)
    : {
      columns: fallbackColumns,
      rows: selectedRows.map(row => normalizeRow(row, fallbackColumns))
    };
  return {
    ok: true,
    data: {
      columns: transformed.columns,
      rows: transformed.rows,
      rowCount: transformed.rows.length,
      executionTime: result.data.executionTime,
      dataSource: { id: source.id, name: source.name, type: source.type },
      columnTypes: columnTypesFor(transformed.columns.map(name => ({ name, type: 'string' }))),
      query: `api export ${source.id}.${table.name}`
    }
  };
}

export async function executeApiDataSourceSqlQuery(
  source: DataSourceRecord,
  options: Omit<SqlQueryExecuteOptions, 'dataSourceId' | 'tempDataSource'> & ApiRuntimeStateOptions & { rowFilters?: readonly FilterExpression[] }
): Promise<SqlQueryEngineResult<SqlQueryResult>> {
  const referencedTable = findReferencedTable(source, options.query) ?? source.tables[0] ?? defaultApiTable(source);
  const rows = await readApiRows(source, referencedTable, {
    defaultLimit: options.maxLimit ?? MAX_ROWS,
    maxLimit: options.maxLimit ?? MAX_ROWS,
    ...(options.persistSourceConfig ? { persistSourceConfig: options.persistSourceConfig } : {}),
    ...(options.parameterValues ? { parameterValues: options.parameterValues } : {})
  });
  if (!rows.ok) return rows;
  const hydrated = buildDataSource({
    ...source,
    tables: source.tables.length > 0
      ? source.tables.map(table => table.name === referencedTable.name || table.id === referencedTable.id
        ? { ...table, fields: table.fields.length > 0 ? table.fields : inferFields(rows.data.rows), sampleRows: rows.data.rows }
        : table)
      : [{ ...referencedTable, fields: inferFields(rows.data.rows), sampleRows: rows.data.rows }]
  });
  return executeDataSourceSqlQuery({
    query: options.query,
    tempDataSource: hydrated,
    ...(options.defaultLimit ? { defaultLimit: options.defaultLimit } : {}),
    ...(options.maxLimit ? { maxLimit: options.maxLimit } : {}),
    ...(options.rowFilters ? { rowFilters: options.rowFilters } : {})
  });
}

async function readApiRows(
  source: DataSourceRecord,
  table: TableDefinition,
  options: ApiRowsOptions
): Promise<ApiRuntimeResult<{ executionTime: number; rows: Array<Record<string, unknown>> }>> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const finish = createApiWorkflowLogger(source, table, started, startedAt);
  const compositeConfig = readCompositeApiConfig(source, table);
  if (!compositeConfig.ok) {
    finish({ error: compositeConfig.error, ok: false, statusCode: compositeConfig.statusCode });
    return compositeConfig;
  }
  const templateValuesResult = await apiRequestTemplateValuesResult(source, table, options.parameterValues);
  if (!templateValuesResult.ok) {
    finish({ error: templateValuesResult.error, ok: false, statusCode: templateValuesResult.statusCode });
    return templateValuesResult;
  }
  if (compositeConfig.data) {
    const compositeResult = await readCompositeApiRows(source, table, compositeConfig.data, options, started, templateValuesResult.data, readApiRows);
    finish({
      endpoint: 'composite',
      ...(compositeResult.ok ? {} : { error: compositeResult.error, statusCode: compositeResult.statusCode }),
      method: 'COMPOSITE',
      ok: compositeResult.ok,
      pageCount: compositeConfig.data.segments.length,
      rowCount: compositeResult.ok ? compositeResult.data.rows.length : 0
    });
    return compositeResult;
  }

  const config = readApiRequestConfig(source, table);
  if (!config.ok) {
    finish({ error: config.error, ok: false, statusCode: config.statusCode });
    return config;
  }
  const result = await readPagedApiRows(source, config.data, options, templateValuesResult.data);
  finish({
    endpoint: config.data.endpoint,
    ...(result.ok ? {} : { error: result.error, statusCode: result.statusCode }),
    method: config.data.method,
    ok: result.ok,
    pageCount: result.ok ? result.data.pageCount : 0,
    rowCount: result.ok ? result.data.rows.length : 0
  });
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      executionTime: Math.max(1, Date.now() - started),
      rows: result.data.rows
    }
  };
}

async function readPagedApiRows(
  source: DataSourceRecord,
  config: ApiRequestConfig,
  options: ApiRowsOptions,
  templateValues: Record<string, unknown>
): Promise<ApiRuntimeResult<{ pageCount: number; rows: Array<Record<string, unknown>> }>> {
  const limit = normalizedLimit(options.defaultLimit, options.maxLimit);
  const pagination = config.pagination;
  const mode = readString(pagination.mode ?? pagination.type) ?? 'none';
  const maxPages = mode === 'none' ? 1 : boundedNumber(pagination.maxPages, DEFAULT_MAX_PAGES, MAX_MAX_PAGES);
  const rows: Array<Record<string, unknown>> = [];
  let pageCount = 0;
  const state: PageState = {
    offset: boundedNumber(pagination.offsetStart, 0, Number.MAX_SAFE_INTEGER),
    page: boundedNumber(pagination.pageStart, 1, Number.MAX_SAFE_INTEGER)
  };
  const tokenContext: TokenAuthContext = {
    source,
    ...(options.persistSourceConfig ? { persistSourceConfig: options.persistSourceConfig } : {})
  };

  for (let pageIndex = 0; pageIndex < maxPages && rows.length < limit; pageIndex += 1) {
    const request = await buildPageRequest(config, pagination, state, templateValues, tokenContext);
    if (!request.ok) return request;
    let response = await fetchJson(request.data, config.timeoutMs);
    if (!response.ok && shouldRetryWithFreshToken(response, config)) {
      const refreshedRequest = await buildPageRequest(config, pagination, state, templateValues, {
        ...tokenContext,
        forceRefresh: true
      });
      if (!refreshedRequest.ok) return refreshedRequest;
      response = await fetchJson(refreshedRequest.data, config.timeoutMs);
    }
    if (!response.ok) return response;
    pageCount += 1;
    const pageRows = rowsFromPayload(response.data, config.dataPath, config.responseMapping, config.rowContextColumns, config.responseShape);
    rows.push(...pageRows);
    if (mode === 'none' || pageRows.length === 0) break;
    const next = nextPageState(mode, pagination, state, response.data, pageRows.length);
    if (!next.ok) break;
    Object.assign(state, next.data);
  }
  return { ok: true, data: { pageCount, rows: rows.slice(0, limit) } };
}

async function buildPageRequest(
  config: ApiRequestConfig,
  pagination: Record<string, unknown>,
  state: PageState,
  templateValues: Record<string, unknown>,
  tokenContext?: TokenAuthContext
): Promise<ApiRuntimeResult<ApiPageRequest>> {
  let url: URL;
  try {
    const base = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`;
    url = new URL(applyTemplate(config.endpoint, templateValues), base);
  } catch {
    return { ok: false, statusCode: 400, error: 'API data source URL is invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, statusCode: 400, error: 'API data source URL must use http or https' };
  }

  const headers = applyRecordTemplate(config.headers, templateValues);
  if (!headers.ok) return headers;
  const queryParams = applyRecordTemplate(config.queryParams, templateValues);
  if (!queryParams.ok) return queryParams;
  for (const [key, value] of Object.entries(queryParams.data)) appendQueryParam(url, key, value);

  let bodyValue = config.body;
  const mode = readString(pagination.mode ?? pagination.type) ?? 'none';
  const paginationLocation = readString(pagination.location) ?? 'query';
  const pageSize = boundedNumber(pagination.pageSize ?? pagination.limit, DEFAULT_PAGE_SIZE, MAX_ROWS);
  if (mode !== 'none') {
    const pageParams = paginationParams(mode, pagination, state, pageSize);
    if (paginationLocation === 'body') bodyValue = { ...readRecord(bodyValue), ...pageParams };
    else for (const [key, value] of Object.entries(pageParams)) appendQueryParam(url, key, value);
  }

  const authHeaders = authHeaderPatch(config, templateValues);
  if (!authHeaders.ok) return authHeaders;
  for (const [key, value] of Object.entries(authHeaders.data.headers)) headers.data[key] = value;
  for (const [key, value] of Object.entries(authHeaders.data.queryParams)) appendQueryParam(url, key, value);
  const tokenAuth = await tokenAuthPatch(config, templateValues, tokenContext);
  if (!tokenAuth.ok) return tokenAuth;
  for (const [key, value] of Object.entries(tokenAuth.data.headers)) headers.data[key] = value;
  for (const [key, value] of Object.entries(tokenAuth.data.queryParams)) appendQueryParam(url, key, value);

  const request: ApiPageRequest = {
    allowBodyOnGet: config.allowBodyOnGet,
    headers: stringifyHeaders(headers.data),
    method: config.method,
    url
  };
  if ((config.method !== 'GET' || config.allowBodyOnGet) && bodyValue !== undefined && bodyValue !== null && bodyValue !== '') {
    const templatedBody = applyValueTemplate(bodyValue, templateValues);
    if (!templatedBody.ok) return templatedBody;
    request.body = typeof templatedBody.data === 'string' ? templatedBody.data : JSON.stringify(templatedBody.data);
    if (!Object.keys(request.headers).some(key => key.toLowerCase() === 'content-type')) {
      request.headers['content-type'] = 'application/json';
    }
  }
  return { ok: true, data: request };
}

function paginationParams(
  mode: string,
  pagination: Record<string, unknown>,
  state: PageState,
  pageSize: number
): Record<string, unknown> {
  if (mode === 'offset') {
    return {
      [readString(pagination.offsetParam) ?? 'offset']: state.offset,
      [readString(pagination.limitParam ?? pagination.pageSizeParam) ?? 'limit']: pageSize
    };
  }
  if (mode === 'cursor') {
    return {
      ...(state.cursor !== undefined ? { [readString(pagination.cursorParam) ?? 'cursor']: state.cursor } : {}),
      [readString(pagination.limitParam ?? pagination.pageSizeParam) ?? 'limit']: pageSize
    };
  }
  return {
    [readString(pagination.pageParam) ?? 'page']: state.page,
    [readString(pagination.pageSizeParam ?? pagination.limitParam) ?? 'pageSize']: pageSize
  };
}

function nextPageState(
  mode: string,
  pagination: Record<string, unknown>,
  state: PageState,
  payload: unknown,
  rowCount: number
): { ok: true; data: PageState } | { ok: false } {
  if (mode === 'offset') return { ok: true, data: { ...state, offset: state.offset + rowCount } };
  if (mode === 'cursor') {
    const cursorPath = readString(pagination.nextCursorPath) ?? 'nextCursor';
    const cursor = readPath(payload, cursorPath);
    return cursor === null || cursor === undefined || cursor === ''
      ? { ok: false }
      : { ok: true, data: { ...state, cursor } };
  }
  const hasMorePath = readString(pagination.hasMorePath);
  if (hasMorePath && readPath(payload, hasMorePath) === false) return { ok: false };
  return { ok: true, data: { ...state, page: state.page + 1 } };
}

function sqlResult(
  source: DataSourceRecord,
  table: TableDefinition,
  rows: Array<Record<string, unknown>>,
  columns: string[],
  fields: ReturnType<typeof inferFields>,
  executionTime: number,
  query: string
): SqlQueryEngineResult<SqlQueryResult> {
  return {
    ok: true,
    data: {
      columns,
      rows: rows.map(row => normalizeRow(row, columns)),
      rowCount: rows.length,
      executionTime,
      dataSource: { id: source.id, name: source.name, type: source.type },
      columnTypes: columnTypesFor(fields.length > 0 ? fields : schemaForRows(rows)),
      query
    }
  };
}
