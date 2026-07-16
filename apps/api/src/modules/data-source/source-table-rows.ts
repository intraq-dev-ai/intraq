import {
  findTableInDataSource,
  findDataSource,
  rowsForTable,
  schemaForRows,
  type DataSourceRecord,
  type FieldDefinition
} from './foundation-store.js';
import {
  executeCustomQueryDataSourceSqlQuery,
  executeSqlModelTableQuery,
  isCustomQueryDataSource,
  isSqlModelTable
} from './custom-query-live-engine.js';
import {
  executeLiveDataSourceSqlQuery,
  isLiveSqlDataSource
} from './live-sql-query-engine.js';
import { quoteSqlIdentifierForType } from './sql-dialect.js';
import type { SqlQueryCell, SqlQueryEngineResult, SqlQueryResult } from './sql-query-types.js';
import type { DataSourceAccessPolicy } from './source-access.js';
import {
  type ApiRuntimeStateOptions,
  isApiDataSource,
  readApiDataSourceTableRows
} from './api-data-source-runtime.js';

interface SourceTableRowsOptions extends ApiRuntimeStateOptions {
  access?: DataSourceAccessPolicy;
  defaultLimit?: number;
  includePaginationProbe?: boolean;
  maxLimit?: number;
  offset?: number;
  page?: number;
  pageSize?: number;
  parameterValues?: Record<string, unknown>;
  selectFields?: string[];
}

interface NormalizedTablePagination {
  includeProbe: boolean;
  offset: number;
  page: number;
  pageSize: number;
  readLimit: number;
}

export async function readDataSourceTableRows(
  dataSourceId: string,
  tableIdOrName: string,
  options: SourceTableRowsOptions = {}
): Promise<SqlQueryEngineResult<SqlQueryResult>> {
  const source = findDataSource(dataSourceId);
  const table = findTableInDataSource(dataSourceId, tableIdOrName)?.table;
  if (!source || !table) return { ok: false, statusCode: 404, error: 'Table not found in data source' };

  const pagination = normalizeTablePagination(options, 1000);
  const readMaxLimit = Math.max(options.maxLimit ?? pagination.readLimit, pagination.readLimit);
  const selectedFields = selectedTableFields(table, options.selectFields);
  const query = `select ${selectClauseForFields(selectedFields, source.type)} from ${quoteSqlIdentifierForType(table.name, source.type)}`;
  void options.access;
  if (isSqlModelTable(table) && isLiveSqlDataSource(source)) {
    const result = await executeSqlModelTableQuery({
      source,
      table,
      query,
      defaultLimit: pagination.readLimit,
      maxLimit: readMaxLimit,
      ...(options.persistSourceConfig ? { persistSourceConfig: options.persistSourceConfig } : {}),
      ...(options.parameterValues ? { parameterValues: options.parameterValues } : {})
    });
    return paginateResult(result, pagination);
  }
  if (isCustomQueryDataSource(source)) {
    const result = await executeCustomQueryDataSourceSqlQuery({
      source,
      query,
      defaultLimit: pagination.readLimit,
      maxLimit: readMaxLimit,
      ...(options.parameterValues ? { parameterValues: options.parameterValues } : {})
    });
    return paginateResult(result, pagination);
  }
  if (isLiveSqlDataSource(source)) {
    const result = await executeLiveDataSourceSqlQuery({
      source,
      query,
      defaultLimit: pagination.readLimit,
      maxLimit: readMaxLimit
    });
    return paginateResult(result, pagination);
  }
  if (isApiDataSource(source)) {
    const result = await readApiDataSourceTableRows(source, table, {
      defaultLimit: pagination.readLimit,
      maxLimit: readMaxLimit,
      ...(options.persistSourceConfig ? { persistSourceConfig: options.persistSourceConfig } : {}),
      ...(options.parameterValues ? { parameterValues: options.parameterValues } : {})
    });
    if (!result.ok) return result;
    const rows = result.data.rows.map(row => normalizeRow(projectRow(row, selectedFields)));
    const columns = selectedFields.length > 0
      ? [...selectedFields]
      : result.data.columns;
    return paginateResult({
      ok: true,
      data: {
        ...result.data,
        columns,
        rows,
        rowCount: rows.length,
        columnTypes: result.data.columnTypes.filter(column => selectedFields.length === 0 || selectedFields.includes(column.name))
      }
    }, pagination);
  }
  const result = memoryTableRows(source, table.name, pagination.readLimit, selectedFields);
  return paginateResult(result, pagination, result.ok ? result.data.pagination?.totalRows : undefined);
}

function memoryTableRows(
  source: DataSourceRecord,
  tableName: string,
  limit: number,
  selectFields: readonly string[]
): SqlQueryEngineResult<SqlQueryResult> {
  const allRows = rowsForTable(source.id, tableName);
  const rows = allRows
    .slice(0, limit)
    .map(row => normalizeRow(projectRow(row, selectFields)));
  const table = source.tables.find(item => item.name === tableName);
  const columns = selectFields.length > 0
    ? [...selectFields]
    : table?.fields.length ? table.fields.map(field => field.name) : schemaForRows(rows).map(field => field.name);
  return {
    ok: true,
    data: {
      columns,
      rows,
      rowCount: rows.length,
      executionTime: 1,
      dataSource: { id: source.id, name: source.name, type: source.type },
      columnTypes: columnTypesFor((table?.fields ?? schemaForRows(rows)).filter(field =>
        selectFields.length === 0 || selectFields.includes(field.name)
      )),
      pagination: {
        hasMore: allRows.length > rows.length,
        limit,
        offset: 0,
        page: 1,
        pageSize: limit,
        totalRows: allRows.length
      },
      query: `select ${selectClauseForFields(selectFields, source.type)} from ${quoteSqlIdentifierForType(tableName, source.type)}`
    }
  };
}

function normalizeTablePagination(options: SourceTableRowsOptions, fallbackLimit: number): NormalizedTablePagination {
  const requestedPageSize = positiveInteger(options.pageSize) ?? positiveInteger(options.defaultLimit) ?? fallbackLimit;
  const pageSize = Math.max(1, Math.floor(requestedPageSize));
  const requestedOffset = nonNegativeInteger(options.offset);
  const requestedPage = positiveInteger(options.page);
  const offset = requestedOffset ?? (requestedPage ? (requestedPage - 1) * pageSize : 0);
  const page = requestedPage ?? Math.floor(offset / pageSize) + 1;
  const includeProbe = options.includePaginationProbe === true;
  return {
    includeProbe,
    offset,
    page,
    pageSize,
    readLimit: offset + pageSize + (includeProbe ? 1 : 0)
  };
}

function paginateResult<T extends SqlQueryResult>(
  result: SqlQueryEngineResult<T>,
  pagination: NormalizedTablePagination,
  totalRows?: number
): SqlQueryEngineResult<T> {
  if (!result.ok) return result;
  const end = pagination.offset + pagination.pageSize;
  const rows = result.data.rows.slice(pagination.offset, end);
  const hasMore = result.data.rows.length > end;
  const knownTotalRows = totalRows ?? result.data.pagination?.totalRows;
  return {
    ok: true,
    data: {
      ...result.data,
      rows,
      rowCount: rows.length,
      pagination: {
        hasMore,
        limit: pagination.pageSize,
        offset: pagination.offset,
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...(knownTotalRows !== undefined ? { totalRows: knownTotalRows } : {})
      }
    }
  };
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function selectedTableFields(table: { fields: Array<{ name: string }> }, fields: string[] | undefined): string[] {
  const requested = Array.isArray(fields) ? fields.map(field => field.trim()).filter(Boolean) : [];
  if (requested.length === 0) return [];
  const known = new Set(table.fields.map(field => field.name));
  const requireKnownFields = known.size > 0;
  return Array.from(new Set(requested.filter(field => !requireKnownFields || known.has(field))));
}

function selectClauseForFields(fields: readonly string[], sourceType: string): string {
  return fields.length > 0
    ? fields.map(field => quoteSqlIdentifierForType(field, sourceType)).join(', ')
    : '*';
}

function projectRow(row: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  if (fields.length === 0) return row;
  return Object.fromEntries(fields.map(field => [field, row[field]]));
}

function columnTypesFor(fields: Array<FieldDefinition | { name: string; type: string }>): Array<{ name: string; type: string }> {
  return fields.map(field => ({ name: field.name, type: field.type }));
}

function normalizeRow(row: Record<string, unknown>): Record<string, SqlQueryCell> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toCell(value)]));
}

function toCell(value: unknown): SqlQueryCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  return JSON.stringify(value);
}
