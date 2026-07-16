import type { ConnectionOptions } from 'mysql2/promise';
import type sql from 'mssql';
import type { ClientConfig } from 'pg';
import type { DataSourceRecord } from './foundation-store.js';

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;
export const DEFAULT_QUERY_TIMEOUT_MS = 15_000;
export const MAX_QUERY_TIMEOUT_MS = 300_000;
export const MIN_QUERY_TIMEOUT_MS = 1_000;
export const DEFAULT_LIVE_SQL_POOL_MAX = 1;
export const MAX_LIVE_SQL_POOL_MAX = 50;

export type LiveSqlDialect = 'mysql' | 'postgres' | 'sqlserver' | 'databricks' | 'clickhouse';
export type LiveSqlConnectionOptions =
  | ClientConfig
  | ConnectionOptions
  | sql.config
  | DatabricksConnectionOptions
  | ClickHouseConnectionOptions;

export interface DatabricksConnectionOptions {
  accessToken: string;
  catalog?: string;
  httpPath: string;
  port: number;
  schema?: string;
  serverHostname: string;
}

export interface ClickHouseConnectionOptions {
  accessToken?: string;
  database: string;
  maxOpenConnections: number;
  password: string;
  requestTimeoutMs: number;
  url: string;
  username: string;
}

export interface LiveSqlField {
  columnType?: number;
  name: string;
  type?: number;
  typeName?: string;
}

export interface LiveSqlRunnerResult {
  fields: LiveSqlField[];
  rows: Array<Record<string, unknown>>;
}

export interface DatabricksSqlClient {
  close: () => Promise<void> | void;
  connect: (options: DatabricksSqlConnectOptions) => Promise<DatabricksSqlClient>;
  openSession: (options?: DatabricksSqlSessionOptions) => Promise<DatabricksSqlSession>;
}

export interface DatabricksSqlConnectOptions {
  host: string;
  path: string;
  port?: number;
  socketTimeout?: number;
  telemetryEnabled?: boolean;
  token: string;
}

export interface DatabricksSqlSession {
  close: () => Promise<unknown> | unknown;
  executeStatement: (sql: string, options?: DatabricksSqlStatementOptions) => Promise<DatabricksSqlOperation>;
}

export interface DatabricksSqlSessionOptions {
  initialCatalog?: string;
  initialSchema?: string;
}

export interface DatabricksSqlStatementOptions {
  maxRows?: number;
  ordinalParameters?: DatabricksSqlParameterValue[];
  queryTimeout?: number;
}

export interface DatabricksSqlOperation {
  close: () => Promise<unknown> | unknown;
  fetchAll: (options?: { maxRows?: number }) => Promise<object[]>;
  getSchema: () => Promise<unknown>;
}

export type DatabricksSqlParameterValue = undefined | null | boolean | number | bigint | Date | string;
export type DatabricksSqlClientFactory = () => DatabricksSqlClient;

export interface ClickHouseClient {
  close: () => Promise<void> | void;
  query: (params: ClickHouseQueryParams) => Promise<ClickHouseQueryResult>;
}

export interface ClickHouseQueryParams {
  format: 'JSON';
  query: string;
  query_params?: Record<string, unknown>;
}

export interface ClickHouseQueryResult {
  json: <T>() => Promise<T>;
}

export type ClickHouseClientFactory = (connection: ClickHouseConnectionOptions) => ClickHouseClient;

export type LiveSqlRunner = (request: {
  connection: LiveSqlConnectionOptions;
  dialect: LiveSqlDialect;
  sql: string;
  timeoutMs: number;
  values?: unknown[];
}) => Promise<LiveSqlRunnerResult>;

export interface LiveSqlExecuteOptions {
  bypassCache?: boolean;
  defaultLimit?: number;
  maxLimit?: number;
  preLimited?: boolean;
  query: string;
  queryTimeoutMs?: number;
  runner?: LiveSqlRunner;
  source: DataSourceRecord;
  values?: unknown[];
}

export interface LiveDiscoveredTable {
  fields: Array<{ description: string; dictionaryDescription: string; name: string; type: string }>;
  name: string;
  rowCount: number | null;
}

export interface LiveDiscoveryOptions {
  includeAllTables?: boolean;
  queryTimeoutMs?: number;
  runner?: LiveSqlRunner;
}
