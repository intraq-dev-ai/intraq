import { findDataSource } from '../data-source/foundation-store.js';
import {
  executeCustomQueryDataSourceSqlQuery,
  executeSqlModelTableQuery,
  isCustomQueryDataSource,
  isSqlModelTable
} from '../data-source/custom-query-live-engine.js';
import {
  executeLiveDataSourceSqlQuery,
  isLiveSqlDataSource
} from '../data-source/live-sql-query-engine.js';
import { executeDataSourceSqlQuery } from '../data-source/sql-query-engine.js';
import {
  findSqlEditorDataSource,
  sqlEditorDataSources,
  type SqlEditorDataSource,
  type SqlEditorRow,
  type SqlEditorSourceSummary
} from './sql-editor-data.js';
import {
  canReadDataSourceTable,
  scopedDataSourceForRead,
  type DataSourceAccessPolicy
} from '../data-source/source-access.js';
import { findReferencedTable } from '../data-source/query-table-resolution.js';
import {
  type ApiRuntimeStateOptions,
  executeApiDataSourceSqlQuery,
  isApiDataSource
} from '../data-source/api-data-source-runtime.js';

export interface SqlEditorQueryResult {
  columns: string[];
  rows: SqlEditorRow[];
  rowCount: number;
  executionTime: number;
  dataSource: { id: string; name: string; type: string };
  columnTypes: Array<{ name: string; type: string }>;
  query: string;
}

export type SqlEditorResult<T> =
  | { ok: true; data: T }
  | { ok: false; statusCode: 400 | 401 | 403 | 404 | 502 | 504; error: string };

export function listSqlEditorSources(policy?: DataSourceAccessPolicy): SqlEditorSourceSummary[] {
  return sqlEditorDataSources(policy).map(source => ({
    id: source.id,
    name: source.name,
    type: source.type,
    status: source.status,
    tableCount: source.tables.length
  }));
}

export function getSqlEditorSchema(dataSourceId: string, policy?: DataSourceAccessPolicy): SqlEditorResult<SqlEditorDataSource> {
  const source = findSqlEditorDataSource(dataSourceId, policy);
  if (!source) return { ok: false, statusCode: 404, error: 'Data source not found' };
  return { ok: true, data: source };
}

export async function executeSqlEditorQuery(
  dataSourceId: string,
  query: string,
  options: ApiRuntimeStateOptions & { bypassCache?: boolean; defaultLimit?: number; maxLimit?: number; preLimited?: boolean; parameterValues?: Record<string, unknown>; policy?: DataSourceAccessPolicy } = {}
): Promise<SqlEditorResult<SqlEditorQueryResult>> {
  const source = findDataSource(dataSourceId);
  const scopedSource = source && options.policy ? scopedDataSourceForRead(source, options.policy) : source;
  if (source && !scopedSource) return { ok: false, statusCode: 404, error: 'Data source not found' };
  const referencedTable = scopedSource ? findReferencedTable(scopedSource, query) : undefined;
  if (source && options.policy && referencedTable && !canReadDataSourceTable(source, referencedTable, options.policy)) {
    return { ok: false, statusCode: 403, error: 'Data source table access is denied' };
  }
  if (source && scopedSource && scopedSource.tables.length < source.tables.length && !referencedTable) {
    return { ok: false, statusCode: 403, error: 'Data source table access is denied' };
  }
  if (source && isLiveSqlDataSource(source) && isSqlModelTable(referencedTable)) {
    return executeSqlModelTableQuery({ source, table: referencedTable, query, ...options });
  }
  if (source && isCustomQueryDataSource(source)) {
    return executeCustomQueryDataSourceSqlQuery({ source, query, ...options });
  }
  if (source && isLiveSqlDataSource(source)) {
    return executeLiveDataSourceSqlQuery({ source, query, ...options });
  }
  if (source && isApiDataSource(source)) {
    return executeApiDataSourceSqlQuery(source, {
      query,
      ...(options.defaultLimit ? { defaultLimit: options.defaultLimit } : {}),
      ...(options.maxLimit ? { maxLimit: options.maxLimit } : {}),
      ...(options.persistSourceConfig ? { persistSourceConfig: options.persistSourceConfig } : {}),
      ...(options.parameterValues ? { parameterValues: options.parameterValues } : {})
    });
  }
  return executeDataSourceSqlQuery({ dataSourceId, query, ...options });
}
