import type {
  ClickHouseClient,
  ClickHouseClientFactory,
  ClickHouseConnectionOptions,
  LiveSqlField,
  LiveSqlRunnerResult
} from './live-sql-query-types.js';
import { asString, isRecord } from './live-sql-query-utils.js';

let clickHouseClientFactoryForTest: ClickHouseClientFactory | null = null;

export function setClickHouseClientFactoryForTest(factory: ClickHouseClientFactory | null): void {
  clickHouseClientFactoryForTest = factory;
}

export function resetClickHouseClientFactoryForTest(): void {
  clickHouseClientFactoryForTest = null;
}

export async function runClickHouseQuery(request: {
  connection: ClickHouseConnectionOptions;
  sql: string;
  timeoutMs: number;
  values?: unknown[];
}): Promise<LiveSqlRunnerResult> {
  const client = await createClickHouseClient(request.connection);
  try {
    const prepared = prepareClickHouseSql(request.sql, request.values);
    const result = await client.query({
      format: 'JSON',
      query: prepared.sql,
      ...(Object.keys(prepared.queryParams).length > 0 ? { query_params: prepared.queryParams } : {})
    });
    const payload = await result.json<{
      data?: Array<Record<string, unknown>>;
      meta?: Array<{ name?: string; type?: string }>;
    }>();
    const rows = Array.isArray(payload.data) ? payload.data.map(row => ({ ...row })) : [];
    return {
      fields: clickHouseFields(payload.meta, rows),
      rows
    };
  } finally {
    await Promise.resolve(client.close()).catch(() => undefined);
  }
}

async function createClickHouseClient(connection: ClickHouseConnectionOptions): Promise<ClickHouseClient> {
  if (clickHouseClientFactoryForTest) return clickHouseClientFactoryForTest(connection);
  try {
    const clickhouse = await import('@clickhouse/client') as {
      createClient: (options: {
        access_token?: string;
        application: string;
        database: string;
        max_open_connections: number;
        password?: string;
        request_timeout: number;
        url: string;
        username?: string;
      }) => ClickHouseClient;
    };
    return clickhouse.createClient({
      ...(connection.accessToken
        ? { access_token: connection.accessToken }
        : { username: connection.username, password: connection.password }),
      application: 'intraq',
      database: connection.database,
      max_open_connections: connection.maxOpenConnections,
      request_timeout: connection.requestTimeoutMs,
      url: connection.url
    });
  } catch (error) {
    if (isMissingClickHouseRuntime(error)) {
      throw new Error('ClickHouse Node driver is not installed. Install @clickhouse/client and restart the API.');
    }
    throw error;
  }
}

function clickHouseFields(
  meta: Array<{ name?: string; type?: string }> | undefined,
  rows: Array<Record<string, unknown>>
): LiveSqlField[] {
  if (Array.isArray(meta) && meta.length > 0) {
    return meta.flatMap((column, index) => {
      const name = asString(column.name) ?? `column_${index + 1}`;
      const typeName = asString(column.type);
      return [{ name, ...(typeName ? { typeName } : {}) }];
    });
  }
  const firstRow = rows[0];
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

function prepareClickHouseSql(sqlText: string, values: unknown[] | undefined): {
  queryParams: Record<string, unknown>;
  sql: string;
} {
  if (!values?.length) return { queryParams: {}, sql: sqlText };
  const queryParams: Record<string, unknown> = {};
  let valueIndex = 0;
  const sql = replaceQuestionPlaceholders(sqlText, () => {
    const name = `p${valueIndex + 1}`;
    const value = values[valueIndex];
    queryParams[name] = value;
    valueIndex += 1;
    return `{${name}: ${clickHouseTypeForValue(value)}}`;
  });
  return { queryParams, sql };
}

function replaceQuestionPlaceholders(sqlText: string, replacement: () => string): string {
  let quote: '"' | "'" | '`' | null = null;
  let output = '';
  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const previous = sqlText[index - 1];
    if (quote) {
      output += char;
      if (char === quote && previous !== '\\') quote = null;
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char;
      output += char;
    } else if (char === '?') {
      output += replacement();
    } else {
      output += char;
    }
  }
  return output;
}

function clickHouseTypeForValue(value: unknown): string {
  if (value === null || value === undefined) return 'Nullable(String)';
  if (typeof value === 'boolean') return 'Bool';
  if (typeof value === 'bigint') return 'Int64';
  if (typeof value === 'number') return Number.isInteger(value) ? 'Int64' : 'Float64';
  if (value instanceof Date) return 'DateTime';
  return 'String';
}

function isMissingClickHouseRuntime(error: unknown): boolean {
  return isRecord(error)
    && /(Cannot find package '@clickhouse\/client'|Cannot find module '@clickhouse\/client'|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND)/i
      .test(asString(error.message) ?? '');
}
