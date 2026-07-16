import type { SqlQueryEngineResult, SqlQueryResult } from './sql-query-types.js';
import {
  getCachedLiveSqlResult,
  resetLiveSqlResultCacheForTest,
  setCachedLiveSqlResult
} from './live-sql-result-cache.js';
import { sanitizeReadOnlySelect, validateReadOnlySelect } from './sql-query-parser.js';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type LiveSqlExecuteOptions
} from './live-sql-query-types.js';
import {
  buildLimitedSelect,
  columnTypeFor,
  liveSqlErrorMessage,
  liveSqlResultCacheKey,
  normalizeLimit,
  normalizeRow,
  queryTimeoutMsFor,
  visibleRowLimitForLimitedSelect
} from './live-sql-query-utils.js';
import {
  connectionOptionsFor,
  isLiveSqlDataSource
} from './live-sql-source-config.js';
import {
  resetLiveSqlRunnerForTest,
  runLiveSqlQuery,
  setClickHouseClientFactoryForTest,
  setDatabricksSqlClientFactoryForTest
} from './live-sql-runner.js';

export { discoverLiveDataSourceTables } from './live-sql-discovery.js';
export { isLiveSqlDataSource, setClickHouseClientFactoryForTest, setDatabricksSqlClientFactoryForTest };
export type { LiveSqlRunner } from './live-sql-query-types.js';

const pendingLiveSqlQueries = new Map<string, Promise<SqlQueryResult>>();

export async function executeLiveDataSourceSqlQuery(
  options: LiveSqlExecuteOptions
): Promise<SqlQueryEngineResult<SqlQueryResult>> {
  const query = options.query.trim();
  const safeError = validateReadOnlySelect(query);
  if (safeError) return { ok: false, statusCode: 403, error: safeError };
  const sanitizedQuery = sanitizeReadOnlySelect(query);

  if (!isLiveSqlDataSource(options.source)) {
    return { ok: false, statusCode: 400, error: 'Data source is not configured for live SQL execution' };
  }

  const timeoutMs = queryTimeoutMsFor(options.source, options.queryTimeoutMs);
  const connection = connectionOptionsFor(options.source, timeoutMs);
  if (!connection.ok) return connection;

  const maxLimit = normalizeLimit(options.maxLimit, MAX_LIMIT, MAX_LIMIT);
  const limit = normalizeLimit(options.defaultLimit, DEFAULT_LIMIT, maxLimit);
  const limitedSql = options.preLimited ? sanitizedQuery : buildLimitedSelect(sanitizedQuery, limit, connection.data.dialect, maxLimit);
  const visibleLimit = options.preLimited
    ? limit
    : visibleRowLimitForLimitedSelect(sanitizedQuery, limit, connection.data.dialect, maxLimit);
  const cacheKey = liveSqlResultCacheKey(options.source, limitedSql, options.values);
  if (!options.bypassCache) {
    const cachedResult = getCachedLiveSqlResult(cacheKey);
    if (cachedResult) return { ok: true, data: cachedResult };
    const pendingResult = pendingLiveSqlQueries.get(cacheKey);
    if (pendingResult) return { ok: true, data: await pendingResult };
  }
  const startedAt = performance.now();

  const pendingExecution = (async (): Promise<SqlQueryResult> => {
    const result = await (options.runner ?? runLiveSqlQuery)({
      connection: connection.data.connection,
      dialect: connection.data.dialect,
      sql: limitedSql,
      timeoutMs,
      ...(options.values ? { values: options.values } : {})
    });
    const rows = result.rows.slice(0, visibleLimit).map(row => normalizeRow(row));
    const columns = result.fields.map(field => field.name);
    const data = {
      columns,
      rows,
      rowCount: rows.length,
      executionTime: Math.max(1, Math.round(performance.now() - startedAt)),
      dataSource: { id: options.source.id, name: options.source.name, type: options.source.type },
      columnTypes: result.fields.map(field => ({ name: field.name, type: columnTypeFor(field) })),
      query: sanitizedQuery
    } satisfies SqlQueryResult;
    if (!options.bypassCache) setCachedLiveSqlResult(cacheKey, data);
    return data;
  })();
  pendingLiveSqlQueries.set(cacheKey, pendingExecution);

  try {
    const data = await pendingExecution;
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      error: `Unable to execute live database query: ${liveSqlErrorMessage(error, options.source.config, timeoutMs)}`
    };
  } finally {
    pendingLiveSqlQueries.delete(cacheKey);
  }
}

export async function testLiveDataSourceConnection(
  source: LiveSqlExecuteOptions['source']
): Promise<SqlQueryEngineResult<{ executionTime: number }>> {
  const result = await executeLiveDataSourceSqlQuery({
    source,
    query: 'select 1 as connection_ok',
    defaultLimit: 1,
    maxLimit: 1
  });
  if (!result.ok) return result;
  return { ok: true, data: { executionTime: result.data.executionTime } };
}

export async function resetLiveSqlConnectionPoolsForTest(): Promise<void> {
  pendingLiveSqlQueries.clear();
  resetLiveSqlResultCacheForTest();
  await resetLiveSqlRunnerForTest();
}
