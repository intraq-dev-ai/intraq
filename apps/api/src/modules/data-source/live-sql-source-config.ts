import type { ConnectionOptions } from 'mysql2/promise';
import type sql from 'mssql';
import type { ClientConfig } from 'pg';
import type { DataSourceRecord } from './foundation-store.js';
import type {
  ClickHouseConnectionOptions,
  DatabricksConnectionOptions,
  LiveSqlConnectionOptions,
  LiveSqlDialect
} from './live-sql-query-types.js';
import {
  asPort,
  asString,
  databricksAccessToken,
  databricksHttpPath,
  databricksServerHostname,
  isDatabricksConnector,
  poolMaxForConnection
} from './live-sql-query-utils.js';
import type { SqlQueryEngineResult } from './sql-query-types.js';

export function isLiveSqlDataSource(source: DataSourceRecord): boolean {
  const connectorType = connectorTypeFor(source);
  if (isDatabricksConnector(connectorType)) {
    return !source.isSample
      && source.sourceType !== 'custom_query'
      && Boolean(databricksServerHostname(source.config))
      && Boolean(databricksHttpPath(source.config))
      && Boolean(databricksAccessToken(source.config));
  }
  if (isClickHouseConnector(connectorType)) {
    return !source.isSample
      && source.sourceType !== 'custom_query'
      && Boolean(asString(source.config.url) ?? asString(source.config.host));
  }
  return !source.isSample
    && source.sourceType !== 'custom_query'
    && ['mysql', 'mariadb', 'postgres', 'postgresql', 'sqlserver', 'mssql', 'sql_server'].includes(connectorType)
    && Boolean(asString(source.config.host))
    && Boolean(asString(source.config.database))
    && Boolean(asString(source.config.username) ?? asString(source.config.user));
}

export function connectionOptionsFor(
  source: DataSourceRecord,
  timeoutMs: number
): SqlQueryEngineResult<{ connection: LiveSqlConnectionOptions; dialect: LiveSqlDialect }> {
  const config = source.config;
  const dialect = liveDialectFor(source);
  if (dialect === 'databricks') {
    const serverHostname = databricksServerHostname(config);
    const httpPath = databricksHttpPath(config);
    const accessToken = databricksAccessToken(config);
    if (!serverHostname || !httpPath || !accessToken) {
      return { ok: false, statusCode: 400, error: 'Databricks data source is missing server hostname, HTTP path, or access token' };
    }
    const catalog = asString(config.catalog);
    const schema = asString(config.schema) ?? asString(config.database);
    const port = asPort(config.port) ?? 443;
    return {
      ok: true,
      data: {
        dialect,
        connection: {
          serverHostname,
          httpPath,
          accessToken,
          port,
          ...(catalog ? { catalog } : {}),
          ...(schema ? { schema } : {})
        } satisfies DatabricksConnectionOptions
      }
    };
  }
  if (dialect === 'clickhouse') return clickHouseConnectionOptions(config, timeoutMs);

  const host = asString(config.host);
  const database = asString(config.database);
  const user = asString(config.username) ?? asString(config.user);
  const password = asString(config.password) ?? '';
  const defaultPort = dialect === 'postgres' ? 5432 : dialect === 'sqlserver' ? 1433 : 3306;
  const port = asPort(config.port) ?? defaultPort;

  if (!host || !database || !user) {
    return { ok: false, statusCode: 400, error: 'Live SQL data source is missing host, database, or username' };
  }

  if (dialect === 'sqlserver') {
    const options: sql.config = {
      server: host,
      port,
      database,
      user,
      password,
      connectionTimeout: Math.min(10_000, timeoutMs),
      requestTimeout: timeoutMs,
      options: {
        encrypt: config.ssl === true,
        trustServerCertificate: config.ssl !== true,
      }
    };
    return { ok: true, data: { connection: options, dialect } };
  }

  const options: ClientConfig | ConnectionOptions = dialect === 'postgres'
    ? {
      host,
      port,
      database,
      user,
      password,
      connectionTimeoutMillis: Math.min(10_000, timeoutMs),
      lock_timeout: Math.min(5_000, timeoutMs),
      query_timeout: timeoutMs,
      statement_timeout: timeoutMs
    }
    : {
      host,
      port,
      database,
      user,
      password,
      dateStrings: true,
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      multipleStatements: false,
      connectTimeout: Math.min(10_000, timeoutMs)
    };
  if (config.ssl === true) {
    options.ssl = config.sslRejectUnauthorized === false ? { rejectUnauthorized: false } : {};
  }
  return { ok: true, data: { connection: options, dialect } };
}

export function liveDialectFor(source: DataSourceRecord): LiveSqlDialect {
  const type = connectorTypeFor(source);
  if (isDatabricksConnector(type)) return 'databricks';
  if (isClickHouseConnector(type)) return 'clickhouse';
  if (['postgres', 'postgresql'].includes(type)) return 'postgres';
  if (['sqlserver', 'mssql', 'sql_server'].includes(type)) return 'sqlserver';
  return 'mysql';
}

function clickHouseConnectionOptions(
  config: Record<string, unknown>,
  timeoutMs: number
): SqlQueryEngineResult<{ connection: ClickHouseConnectionOptions; dialect: 'clickhouse' }> {
  const url = clickHouseUrl(config);
  if (!url) return { ok: false, statusCode: 400, error: 'ClickHouse data source is missing host or URL' };
  const database = asString(config.database) ?? asString(config.schema) ?? 'default';
  const username = asString(config.username) ?? asString(config.user) ?? 'default';
  const password = asString(config.password) ?? '';
  const accessToken = asString(config.accessToken) ?? asString(config.token);
  return {
    ok: true,
    data: {
      dialect: 'clickhouse',
      connection: {
        database,
        maxOpenConnections: poolMaxForConnection(config),
        password,
        requestTimeoutMs: timeoutMs,
        url,
        username,
        ...(accessToken ? { accessToken } : {})
      }
    }
  };
}

function clickHouseUrl(config: Record<string, unknown>): string | undefined {
  const directUrl = asString(config.url) ?? asString(config.connectionString);
  if (directUrl) return directUrl;
  const host = asString(config.host);
  if (!host) return undefined;
  if (/^https?:\/\//i.test(host)) return host;
  const protocol = asString(config.protocol) ?? (config.ssl === true ? 'https' : 'http');
  const port = asPort(config.port) ?? 8123;
  return `${protocol}://${host}:${port}`;
}

function isClickHouseConnector(value: string): boolean {
  return value === 'clickhouse' || value === 'click_house';
}

function connectorTypeFor(source: DataSourceRecord): string {
  return (asString(source.config.engine)
    ?? asString(source.config.provider)
    ?? source.type).toLowerCase();
}
