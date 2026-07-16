import {
  createPool,
  type ConnectionOptions,
  type FieldPacket,
  type Pool as MysqlPool,
  type QueryOptions,
  type RowDataPacket
} from 'mysql2/promise';
import sql from 'mssql';
import { Pool as PostgresPool, type ClientConfig, type FieldDef } from 'pg';
import type {
  ClickHouseConnectionOptions,
  DatabricksConnectionOptions,
  DatabricksSqlClient,
  DatabricksSqlClientFactory,
  DatabricksSqlOperation,
  DatabricksSqlParameterValue,
  DatabricksSqlSession,
  LiveSqlConnectionOptions,
  LiveSqlDialect,
  LiveSqlField,
  LiveSqlRunnerResult
} from './live-sql-query-types.js';
import { MAX_LIMIT } from './live-sql-query-types.js';
import {
  resetClickHouseClientFactoryForTest,
  runClickHouseQuery
} from './live-sql-clickhouse.js';
import {
  asString,
  isRecord,
  poolCacheKey,
  poolMaxForConnection,
  postgresTypeName
} from './live-sql-query-utils.js';

const postgresPools = new Map<string, PostgresPool>();
const mysqlPools = new Map<string, MysqlPool>();

let databricksSqlClientFactoryForTest: DatabricksSqlClientFactory | null = null;

export function setDatabricksSqlClientFactoryForTest(factory: DatabricksSqlClientFactory | null): void {
  databricksSqlClientFactoryForTest = factory;
}
export { setClickHouseClientFactoryForTest } from './live-sql-clickhouse.js';

export async function runLiveSqlQuery(request: {
  connection: LiveSqlConnectionOptions;
  dialect: LiveSqlDialect;
  sql: string;
  timeoutMs: number;
  values?: unknown[];
}): Promise<LiveSqlRunnerResult> {
  if (request.dialect === 'databricks') {
    return runDatabricksQuery(request as { connection: DatabricksConnectionOptions; sql: string; timeoutMs: number; values?: unknown[] });
  }
  if (request.dialect === 'clickhouse') {
    return runClickHouseQuery(request as { connection: ClickHouseConnectionOptions; sql: string; timeoutMs: number; values?: unknown[] });
  }
  if (request.dialect === 'sqlserver') {
    return runMssqlQuery(request as { connection: sql.config; sql: string; timeoutMs: number; values?: unknown[] });
  }
  return request.dialect === 'postgres'
    ? runPostgresQuery(request as { connection: ClientConfig; sql: string; timeoutMs: number; values?: unknown[] })
    : runMysqlQuery(request as { connection: ConnectionOptions; sql: string; timeoutMs: number; values?: unknown[] });
}

export async function resetLiveSqlRunnerForTest(): Promise<void> {
  const postgres = Array.from(postgresPools.values());
  const mysql = Array.from(mysqlPools.values());
  postgresPools.clear();
  mysqlPools.clear();
  databricksSqlClientFactoryForTest = null;
  resetClickHouseClientFactoryForTest();
  await Promise.all([
    ...postgres.map(pool => pool.end().catch(() => undefined)),
    ...mysql.map(pool => pool.end().catch(() => undefined))
  ]);
}

async function runMssqlQuery(request: {
  connection: sql.config;
  sql: string;
  timeoutMs: number;
  values?: unknown[];
}): Promise<LiveSqlRunnerResult> {
  const pool = await new sql.ConnectionPool({ ...request.connection, pool: { max: 1, min: 0 } }).connect();
  try {
    const sqlReq = pool.request();
    request.values?.forEach((value, index) => {
      sqlReq.input(`p${index + 1}`, value);
    });
    const result = await sqlReq.query(request.sql);
    const columns = result.recordset.columns ?? {};
    return {
      rows: result.recordset.map(row => ({ ...row })),
      fields: Object.entries(columns).map(([name, col]) => ({
        name,
        typeName: (col as { type: { name: string } }).type.name.toLowerCase()
      }))
    };
  } finally {
    pool.close().catch(() => undefined);
  }
}

async function runMysqlQuery(request: {
  connection: ConnectionOptions;
  sql: string;
  timeoutMs: number;
  values?: unknown[];
}): Promise<LiveSqlRunnerResult> {
  const pool = getOrCreateMysqlPool(request.connection, request.timeoutMs);
  const queryOptions: QueryOptions = {
    sql: request.sql,
    timeout: request.timeoutMs,
    ...(request.values ? { values: request.values as QueryOptions['values'] } : {})
  };
  const [rows, fields] = await pool.query<RowDataPacket[]>(queryOptions);
  return {
    rows: rows.map(row => ({ ...row })),
    fields: fields.map(fieldFromPacket)
  };
}

async function runPostgresQuery(request: {
  connection: ClientConfig;
  sql: string;
  timeoutMs: number;
  values?: unknown[];
}): Promise<LiveSqlRunnerResult> {
  const pool = getOrCreatePostgresPool(request.connection, request.timeoutMs);
  const result = await pool.query<Record<string, unknown>>(request.sql, request.values ?? []);
  return {
    rows: result.rows,
    fields: result.fields.map(fieldFromPostgresPacket)
  };
}

async function runDatabricksQuery(request: {
  connection: DatabricksConnectionOptions;
  sql: string;
  timeoutMs: number;
  values?: unknown[];
}): Promise<LiveSqlRunnerResult> {
  const client = await createDatabricksSqlClient();
  let connectedClient: DatabricksSqlClient | null = null;
  let session: DatabricksSqlSession | null = null;
  let operation: DatabricksSqlOperation | null = null;
  try {
    connectedClient = await client.connect({
      host: normalizeDatabricksHostname(request.connection.serverHostname),
      path: request.connection.httpPath,
      port: request.connection.port,
      socketTimeout: request.timeoutMs,
      telemetryEnabled: false,
      token: request.connection.accessToken
    });
    session = await connectedClient.openSession({
      ...(request.connection.catalog ? { initialCatalog: request.connection.catalog } : {}),
      ...(request.connection.schema ? { initialSchema: request.connection.schema } : {})
    });
    operation = await session.executeStatement(request.sql, {
      maxRows: MAX_LIMIT,
      queryTimeout: Math.ceil(request.timeoutMs / 1000),
      ...(request.values?.length ? { ordinalParameters: request.values.map(toDatabricksSqlParameterValue) } : {})
    });
    const schema = await operation.getSchema().catch(() => null);
    const rows = normalizeDatabricksSqlRows(await operation.fetchAll({ maxRows: MAX_LIMIT }));
    return {
      fields: fieldsFromDatabricksSqlSchema(schema, rows),
      rows
    };
  } finally {
    await Promise.resolve(operation?.close()).catch(() => undefined);
    await Promise.resolve(session?.close()).catch(() => undefined);
    await Promise.resolve(connectedClient?.close()).catch(() => undefined);
    if (connectedClient !== client) await Promise.resolve(client.close()).catch(() => undefined);
  }
}

function getOrCreatePostgresPool(connection: ClientConfig, timeoutMs: number): PostgresPool {
  const key = poolCacheKey('postgres', connection, timeoutMs);
  const existing = postgresPools.get(key);
  if (existing) return existing;
  const pool = new PostgresPool({
    ...connection,
    max: poolMaxForConnection(connection)
  });
  postgresPools.set(key, pool);
  return pool;
}

function getOrCreateMysqlPool(connection: ConnectionOptions, timeoutMs: number): MysqlPool {
  const key = poolCacheKey('mysql', connection, timeoutMs);
  const existing = mysqlPools.get(key);
  if (existing) return existing;
  const pool = createPool({
    ...connection,
    connectionLimit: poolMaxForConnection(connection)
  });
  mysqlPools.set(key, pool);
  return pool;
}

function fieldFromPacket(field: FieldPacket): LiveSqlField {
  return {
    name: field.name,
    ...(typeof field.type === 'number' ? { type: field.type } : {}),
    ...(typeof field.columnType === 'number' ? { columnType: field.columnType } : {}),
    ...(typeof field.typeName === 'string' ? { typeName: field.typeName } : {})
  };
}

function fieldFromPostgresPacket(field: FieldDef): LiveSqlField {
  return {
    name: field.name,
    type: field.dataTypeID,
    typeName: postgresTypeName(field.dataTypeID)
  };
}

function normalizeDatabricksHostname(value: string): string {
  return value
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/g, '')
    .trim();
}

async function createDatabricksSqlClient(): Promise<DatabricksSqlClient> {
  if (databricksSqlClientFactoryForTest) return databricksSqlClientFactoryForTest();
  try {
    const databricks = await import('@databricks/sql') as { DBSQLClient: new () => DatabricksSqlClient };
    return new databricks.DBSQLClient();
  } catch (error) {
    if (isMissingDatabricksSqlRuntime(error)) {
      throw new Error('Databricks SQL Node driver is not installed. Install @databricks/sql and restart the API.');
    }
    throw error;
  }
}

function normalizeDatabricksSqlRows(result: unknown): Array<Record<string, unknown>> {
  const rows = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result.rows)
      ? result.rows
      : [];
  return rows.flatMap(row => isRecord(row) ? [{ ...row }] : []);
}

function fieldsFromDatabricksSqlSchema(schema: unknown, rows: Array<Record<string, unknown>>): LiveSqlField[] {
  const firstRow = rows[0];
  if (isRecord(schema) && Array.isArray(schema.columns) && schema.columns.length > 0) {
    return schema.columns.flatMap((column, index) => {
      if (!isRecord(column)) return [];
      const name = asString(column.columnName) ?? asString(column.name) ?? `column_${index + 1}`;
      return [{
        name,
        ...(firstRow && name in firstRow ? { typeName: typeNameFromValue(firstRow[name]) } : {})
      }];
    });
  }
  if (!firstRow) return [];
  return Object.entries(firstRow).map(([name, value]) => ({
    name,
    typeName: typeNameFromValue(value)
  }));
}

function typeNameFromValue(value: unknown): string {
  if (value instanceof Date) return 'timestamp';
  if (typeof value === 'number' || typeof value === 'bigint') return 'numeric';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function toDatabricksSqlParameterValue(value: unknown): DatabricksSqlParameterValue {
  if (value === undefined || value === null) return value;
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return JSON.stringify(value);
}

function isMissingDatabricksSqlRuntime(error: unknown): boolean {
  return error instanceof Error
    && /(Cannot find package '@databricks\/sql'|Cannot find module '@databricks\/sql'|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND)/i.test(error.message);
}
