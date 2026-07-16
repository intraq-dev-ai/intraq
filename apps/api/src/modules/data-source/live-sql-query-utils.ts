import type { DataSourceRecord } from './foundation-store.js';
import type {
  LiveSqlConnectionOptions,
  LiveSqlDialect,
  LiveSqlField
} from './live-sql-query-types.js';
import {
  DEFAULT_LIVE_SQL_POOL_MAX,
  DEFAULT_QUERY_TIMEOUT_MS,
  MAX_LIVE_SQL_POOL_MAX,
  MAX_QUERY_TIMEOUT_MS,
  MIN_QUERY_TIMEOUT_MS
} from './live-sql-query-types.js';
import { buildSqlServerLimitedSelect } from './sql-server-limited-select.js';
import type { SqlQueryCell } from './sql-query-types.js';

export function buildLimitedSelect(query: string, limit: number, dialect: LiveSqlDialect, maxLimit = limit): string {
  const inner = stripTerminatingSemicolon(query);
  if (dialect === 'sqlserver') {
    return buildSqlServerLimitedSelect(inner, limit);
  }
  if (dialect === 'clickhouse') {
    const capped = capTopLevelLimit(inner, maxLimit);
    return capped ?? `${inner} LIMIT ${limit}`;
  }
  return `SELECT * FROM (${inner}) AS intraq_live_query LIMIT ${limit}`;
}

export function visibleRowLimitForLimitedSelect(query: string, limit: number, dialect: LiveSqlDialect, maxLimit = limit): number {
  if (dialect !== 'clickhouse') return limit;
  const stripped = stripTopLevelLimit(stripTerminatingSemicolon(query));
  return Math.min(stripped.limit ?? limit, maxLimit);
}

export function normalizeRow(row: Record<string, unknown>): Record<string, SqlQueryCell> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toSqlQueryCell(value)]));
}

export function columnTypeFor(field: LiveSqlField): string {
  const typeName = field.typeName?.toLowerCase();
  if (typeName) {
    if (['date', 'datetime', 'timestamp', 'time', 'year'].some(value => typeName.includes(value))) return 'date';
    if (['decimal', 'double', 'float', 'int', 'numeric', 'real'].some(value => typeName.includes(value))) return 'number';
  }
  const type = field.columnType ?? field.type;
  if (type === undefined) return 'string';
  if ([0, 1, 2, 3, 4, 5, 8, 9, 13, 16, 246].includes(type)) return 'number';
  if ([7, 10, 11, 12].includes(type)) return 'date';
  return 'string';
}

export function postgresTypeName(typeId: number): string {
  if ([20, 21, 23, 26, 700, 701, 790, 1700].includes(typeId)) return 'numeric';
  if ([1082, 1083, 1114, 1184, 1266].includes(typeId)) return 'timestamp';
  if (typeId === 16) return 'boolean';
  return 'text';
}

export function normalizeLimit(value: number | undefined, fallback: number, max: number): number {
  if (!value || !Number.isSafeInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

export function queryTimeoutMsFor(source: DataSourceRecord, override: number | undefined): number {
  return normalizeTimeoutMs(
    override,
    readTimeoutCandidate(source.settings.queryTimeoutMs),
    readTimeoutCandidate(source.config.timeoutMs),
    readTimeoutCandidate(source.config.requestTimeoutMs),
    readTimeoutCandidate(source.config.queryTimeoutMs),
    readTimeoutCandidate(source.config.sqlQueryTimeoutMs),
    readTimeoutCandidate(source.config.statementTimeoutMs),
    readTimeoutCandidate(process.env.INTRAQ_SQL_QUERY_TIMEOUT_MS),
    readTimeoutCandidate(process.env.LIVE_SQL_QUERY_TIMEOUT_MS),
    DEFAULT_QUERY_TIMEOUT_MS
  );
}

export function poolMaxForConnection(value: unknown): number {
  const directMax = isRecord(value) ? readPoolMaxCandidate(value.max) : undefined;
  const nestedMax = isRecord(value) && isRecord(value.pool) ? readPoolMaxCandidate(value.pool.max) : undefined;
  const envMax = readPoolMaxCandidate(process.env.INTRAQ_LIVE_SQL_POOL_MAX);
  const candidate = directMax ?? nestedMax ?? envMax ?? DEFAULT_LIVE_SQL_POOL_MAX;
  return Math.min(MAX_LIVE_SQL_POOL_MAX, Math.max(1, candidate));
}

export function poolCacheKey(dialect: LiveSqlDialect, connection: LiveSqlConnectionOptions, timeoutMs: number): string {
  return `${dialect}:${timeoutMs}:${stableSerialize(connection)}`;
}

export function liveSqlResultCacheKey(
  source: DataSourceRecord,
  limitedSql: string,
  values: unknown[] | undefined
): string {
  return `${source.id}:${limitedSql}:${stableSerialize(values ?? [])}`;
}

export function liveSqlErrorMessage(error: unknown, config: Record<string, unknown>, timeoutMs: number): string {
  const message = safeErrorMessage(error, config);
  if (/(timeout|timed out|canceling statement due to statement timeout)/i.test(message)) {
    return `Query exceeded ${formatTimeout(timeoutMs)} timeout`;
  }
  return message;
}

export function sqlStringLiteral(value: string): string {
  return `'${value.split("'").join("''")}'`;
}

export function isDatabricksConnector(value: string): boolean {
  return value === 'databricks' || value === 'spark';
}

export function databricksServerHostname(config: Record<string, unknown>): string | undefined {
  return asString(config.serverHostname) ?? asString(config.host);
}

export function databricksHttpPath(config: Record<string, unknown>): string | undefined {
  return asString(config.httpPath) ?? asString(config.warehousePath) ?? asString(config.warehouseId);
}

export function databricksAccessToken(config: Record<string, unknown>): string | undefined {
  return asString(config.accessToken) ?? asString(config.token) ?? asString(config.password);
}

export function normalizeDatabaseType(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes('date') || normalized.includes('time') || normalized === 'year') return 'date';
  if (['bigint', 'decimal', 'double', 'float', 'int', 'integer', 'mediumint', 'numeric', 'real', 'smallint', 'tinyint'].some(item => normalized.includes(item))) {
    return 'number';
  }
  if (normalized.includes('bool')) return 'boolean';
  return 'string';
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function asPort(value: unknown): number | undefined {
  const port = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(port) && port > 0 && port <= 65535 ? port : undefined;
}

export function asInteger(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(numberValue) && numberValue >= 0 ? numberValue : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripTopLevelLimit(query: string): { query: string; limit?: number } {
  let depth = 0;
  let quote: '"' | "'" | '`' | null = null;
  let lastLimitPos = -1;
  for (let i = 0; i < query.length - 4; i++) {
    const char = query[i];
    if (quote) {
      if (char === quote && query[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (depth === 0 && /^limit\b/i.test(query.slice(i))) lastLimitPos = i;
  }
  if (lastLimitPos < 0) return { query };
  const parsedLimit = parseTopLevelLimit(query.slice(lastLimitPos + 5).trim());
  if (!parsedLimit) return { query };
  return {
    query: query.slice(0, lastLimitPos).trimEnd(),
    limit: parsedLimit
  };
}

function capTopLevelLimit(query: string, maxLimit: number): string | null {
  const stripped = stripTopLevelLimit(query);
  if (!stripped.limit) return null;
  if (stripped.limit <= maxLimit) return query;
  return `${stripped.query} LIMIT ${maxLimit}`;
}

function parseTopLevelLimit(value: string): number | null {
  const simple = /^(\d+)\s*$/i.exec(value);
  if (simple?.[1]) return positiveLimit(simple[1]);
  const offset = /^(\d+)\s+offset\s+\d+\s*$/i.exec(value);
  if (offset?.[1]) return positiveLimit(offset[1]);
  const comma = /^\d+\s*,\s*(\d+)\s*$/i.exec(value);
  return comma?.[1] ? positiveLimit(comma[1]) : null;
}

function positiveLimit(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function stripTerminatingSemicolon(query: string): string {
  const trimmed = query.trim();
  return trimmed.endsWith(';') ? trimmed.slice(0, -1).trim() : trimmed;
}

function toSqlQueryCell(value: unknown): SqlQueryCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return JSON.stringify(value);
}

function normalizeTimeoutMs(...values: Array<number | undefined>): number {
  const value = values.find(item => item !== undefined) ?? DEFAULT_QUERY_TIMEOUT_MS;
  return Math.min(MAX_QUERY_TIMEOUT_MS, Math.max(MIN_QUERY_TIMEOUT_MS, Math.floor(value)));
}

function readPoolMaxCandidate(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function readTimeoutCandidate(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function safeErrorMessage(error: unknown, config: Record<string, unknown>): string {
  const message = error instanceof Error ? error.message : 'Unknown database error';
  return [config.password, config.accessToken, config.token]
    .map(asString)
    .filter((value): value is string => Boolean(value))
    .reduce((current, secret) => current.split(secret).join('***'), message);
}

function formatTimeout(timeoutMs: number): string {
  return timeoutMs % 1000 === 0 ? `${timeoutMs / 1000}s` : `${timeoutMs}ms`;
}
