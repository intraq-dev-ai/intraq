import type { DataSourceRecord } from './foundation-store.js';
import type {
  LiveDiscoveredTable,
  LiveDiscoveryOptions,
  LiveSqlRunner,
  LiveSqlRunnerResult
} from './live-sql-query-types.js';
import { runLiveSqlQuery } from './live-sql-runner.js';
import {
  connectionOptionsFor,
  isLiveSqlDataSource,
  liveDialectFor
} from './live-sql-source-config.js';
import {
  asInteger,
  asString,
  liveSqlErrorMessage,
  normalizeDatabaseType,
  normalizeRow,
  queryTimeoutMsFor,
  sqlStringLiteral
} from './live-sql-query-utils.js';
import type { SqlQueryCell, SqlQueryEngineResult } from './sql-query-types.js';

export async function discoverLiveDataSourceTables(
  source: DataSourceRecord,
  optionsOrRunner?: LiveDiscoveryOptions | LiveSqlRunner
): Promise<SqlQueryEngineResult<{ tables: LiveDiscoveredTable[] }>> {
  const options = normalizeDiscoveryOptions(optionsOrRunner);
  const tableNames = options.includeAllTables ? [] : source.tables.map(table => table.name);
  const tableFilter = tableNames.length > 0
    ? ` and c.table_name in (${tableNames.map(sqlStringLiteral).join(', ')})`
    : '';
  const query = discoveryQueryFor(source, tableFilter);
  const result = await executeLiveMetadataQuery(source, query, options);
  if (!result.ok) return result;

  const grouped = discoveredTablesFromInformationSchemaRows(result.data.rows);
  if (grouped.size === 0 && liveDialectFor(source) === 'databricks') {
    return discoverDatabricksTablesWithShowTables(source, tableNames, options);
  }
  return { ok: true, data: { tables: Array.from(grouped.values()) } };
}

function discoveredTablesFromInformationSchemaRows(rows: Array<Record<string, unknown>>): Map<string, LiveDiscoveredTable> {
  const grouped = new Map<string, LiveDiscoveredTable>();
  for (const row of rows.map(normalizeRow)) {
    const tableName = typeof row.table_name === 'string' ? row.table_name : null;
    const columnName = typeof row.column_name === 'string' ? row.column_name : null;
    const dataType = typeof row.data_type === 'string' ? row.data_type : 'string';
    const columnComment = typeof row.column_comment === 'string' ? row.column_comment.trim() : '';
    if (!tableName || !columnName) continue;
    const table = grouped.get(tableName) ?? {
      name: tableName,
      rowCount: asInteger(row.table_rows),
      fields: []
    };
    table.fields.push({
      name: columnName,
      type: normalizeDatabaseType(dataType),
      description: columnComment,
      dictionaryDescription: columnComment
    });
    grouped.set(tableName, table);
  }
  return grouped;
}

async function discoverDatabricksTablesWithShowTables(
  source: DataSourceRecord,
  requestedTableNames: string[],
  options: LiveDiscoveryOptions
): Promise<SqlQueryEngineResult<{ tables: LiveDiscoveredTable[] }>> {
  const tableNameFilter = new Set(requestedTableNames);
  const showTablesResult = await executeLiveMetadataQuery(source, databricksShowTablesQuery(source), options);
  if (!showTablesResult.ok) return showTablesResult;

  const tableNames = showTablesResult.data.rows
    .map(databricksTableNameFromShowTablesRow)
    .filter((name): name is string => Boolean(name))
    .filter(name => tableNameFilter.size === 0 || tableNameFilter.has(name));

  const tables = await mapWithConcurrency(tableNames, 6, async tableName => {
    const describeResult = await executeLiveMetadataQuery(source, databricksDescribeTableQuery(source, tableName), options);
    if (!describeResult.ok) return { ok: true as const, data: null };
    const fields = describeResult.data.rows
      .map(row => databricksColumnFromDescribeRow(normalizeRow(row)))
      .filter((field): field is LiveDiscoveredTable['fields'][number] => Boolean(field));
    return { ok: true as const, data: fields.length > 0 ? { name: tableName, rowCount: null, fields } : null };
  });

  return {
    ok: true,
    data: {
      tables: tables.flatMap(result => result.ok && result.data ? [result.data] : [])
    }
  };
}

function databricksTableNameFromShowTablesRow(row: Record<string, unknown>): string | null {
  const normalized = normalizeRow(row);
  for (const key of ['tableName', 'table_name', 'tablename', 'name']) {
    const value = normalized[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function databricksColumnFromDescribeRow(row: Record<string, SqlQueryCell>): LiveDiscoveredTable['fields'][number] | null {
  const columnName = typeof row.col_name === 'string' ? row.col_name.trim() : '';
  if (!columnName || columnName.startsWith('#')) return null;
  const dataType = typeof row.data_type === 'string' && row.data_type.trim() ? row.data_type.trim() : 'string';
  const comment = typeof row.comment === 'string' ? row.comment.trim() : '';
  return {
    name: columnName,
    type: normalizeDatabaseType(dataType),
    description: comment,
    dictionaryDescription: comment
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function executeLiveMetadataQuery(
  source: DataSourceRecord,
  sql: string,
  options: LiveDiscoveryOptions
): Promise<SqlQueryEngineResult<LiveSqlRunnerResult>> {
  if (!isLiveSqlDataSource(source)) {
    return { ok: false, statusCode: 400, error: 'Data source is not configured for live SQL execution' };
  }
  const timeoutMs = queryTimeoutMsFor(source, options.queryTimeoutMs);
  const connection = connectionOptionsFor(source, timeoutMs);
  if (!connection.ok) return connection;
  try {
    return {
      ok: true,
      data: await (options.runner ?? runLiveSqlQuery)({
        connection: connection.data.connection,
        dialect: connection.data.dialect,
        sql,
        timeoutMs
      })
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      error: `Unable to discover live database schema: ${liveSqlErrorMessage(error, source.config, timeoutMs)}`
    };
  }
}

function normalizeDiscoveryOptions(optionsOrRunner?: LiveDiscoveryOptions | LiveSqlRunner): LiveDiscoveryOptions {
  return typeof optionsOrRunner === 'function' ? { runner: optionsOrRunner } : optionsOrRunner ?? {};
}

function discoveryQueryFor(source: DataSourceRecord, tableFilter: string): string {
  const dialect = liveDialectFor(source);
  if (dialect === 'databricks') {
    const catalog = asString(source.config.catalog);
    const schema = asString(source.config.schema) ?? asString(source.config.database);
    const schemaPredicate = schema ? `c.table_schema = ${sqlStringLiteral(schema)}` : 'c.table_schema = current_schema()';
    const catalogPredicate = catalog ? `and c.table_catalog = ${sqlStringLiteral(catalog)}` : '';
    return [
      'select c.table_name, c.column_name, c.data_type, c.comment as column_comment, null as table_rows',
      'from system.information_schema.columns c',
      'join system.information_schema.tables t',
      'on t.table_catalog = c.table_catalog and t.table_schema = c.table_schema and t.table_name = c.table_name',
      `where ${schemaPredicate}${tableFilter}`,
      catalogPredicate,
      "and t.table_type in ('BASE TABLE', 'VIEW')",
      'order by c.table_name, c.ordinal_position'
    ].filter(Boolean).join(' ');
  }
  if (dialect === 'postgres') {
    const schema = asString(source.config.schema);
    const schemaPredicate = schema ? `c.table_schema = ${sqlStringLiteral(schema)}` : 'c.table_schema = current_schema()';
    return [
      'select c.table_name, c.column_name, c.data_type, pgd.description as column_comment, null as table_rows',
      'from information_schema.columns c',
      'join information_schema.tables t',
      'on t.table_schema = c.table_schema and t.table_name = c.table_name',
      'left join pg_catalog.pg_statio_all_tables st',
      'on st.schemaname = c.table_schema and st.relname = c.table_name',
      'left join pg_catalog.pg_description pgd',
      'on pgd.objoid = st.relid and pgd.objsubid = c.ordinal_position',
      `where ${schemaPredicate}${tableFilter}`,
      "and t.table_type in ('BASE TABLE', 'VIEW')",
      'order by c.table_name, c.ordinal_position'
    ].join(' ');
  }
  if (dialect === 'clickhouse') {
    const schema = asString(source.config.schema) ?? asString(source.config.database);
    const schemaPredicate = schema ? `c.table_schema = ${sqlStringLiteral(schema)}` : 'c.table_schema = currentDatabase()';
    return [
      'select c.table_name, c.column_name, c.data_type, null as column_comment, t.total_rows as table_rows',
      'from information_schema.columns c',
      'left join system.tables t',
      'on t.database = c.table_schema and t.name = c.table_name',
      `where ${schemaPredicate}${tableFilter}`,
      'order by c.table_name, c.ordinal_position'
    ].join(' ');
  }
  if (dialect === 'sqlserver') {
    const schema = asString(source.config.schema) ?? 'dbo';
    return [
      'select c.table_name, c.column_name, c.data_type, null as column_comment, null as table_rows',
      'from information_schema.columns c',
      'join information_schema.tables t',
      'on t.table_schema = c.table_schema and t.table_name = c.table_name',
      `where c.table_schema = ${sqlStringLiteral(schema)}${tableFilter}`,
      "and t.table_type in ('BASE TABLE', 'VIEW')",
      'order by c.table_name, c.ordinal_position'
    ].join(' ');
  }
  return [
    'select c.table_name, c.column_name, c.data_type, c.column_comment, t.table_rows',
    'from information_schema.columns c',
    'join information_schema.tables t',
    'on t.table_schema = c.table_schema and t.table_name = c.table_name',
    `where c.table_schema = database()${tableFilter}`,
    "and t.table_type in ('BASE TABLE', 'VIEW')",
    'order by c.table_name, c.ordinal_position'
  ].join(' ');
}

function databricksShowTablesQuery(source: DataSourceRecord): string {
  const namespace = databricksNamespace(source);
  return namespace ? `show tables in ${namespace}` : 'show tables';
}

function databricksDescribeTableQuery(source: DataSourceRecord, tableName: string): string {
  const namespace = databricksNamespace(source);
  return `describe table ${namespace ? `${namespace}.` : ''}${quoteDatabricksIdentifier(tableName)}`;
}

function databricksNamespace(source: DataSourceRecord): string {
  const catalog = asString(source.config.catalog);
  const schema = asString(source.config.schema) ?? asString(source.config.database);
  return [catalog, schema].filter((value): value is string => Boolean(value)).map(quoteDatabricksIdentifier).join('.');
}

function quoteDatabricksIdentifier(value: string): string {
  return `\`${value.replace(/`/g, '``')}\``;
}
