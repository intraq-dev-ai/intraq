import { findDataSource, type DataSourceRecord, type TableDefinition } from './foundation-store.js';
import {
  executeLiveDataSourceSqlQuery,
  isLiveSqlDataSource,
  type LiveSqlRunner
} from './live-sql-query-engine.js';
import { quoteSqlIdentifierForType } from './sql-dialect.js';
import {
  applySqlModelParameterBindings,
  type SqlModelParameterDefinition,
  type SqlModelParameterValues
} from './sql-model-parameters.js';
import { sanitizeReadOnlySelect, validateReadOnlySelect } from './sql-query-parser.js';
import type { SqlQueryEngineResult, SqlQueryResult } from './sql-query-types.js';

interface CustomQueryExecuteOptions {
  bypassCache?: boolean;
  defaultLimit?: number;
  maxLimit?: number;
  parameterValues?: SqlModelParameterValues;
  preLimited?: boolean;
  query: string;
  runner?: LiveSqlRunner;
  source: DataSourceRecord;
}

const RESERVED_AFTER_TABLE = new Set([
  'where',
  'group',
  'order',
  'limit',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'cross',
  'full',
  'on',
  'union',
  'having',
  'window'
]);

export function isCustomQueryDataSource(source: DataSourceRecord): boolean {
  return source.sourceType === 'custom_query';
}

export function isSqlModelTable(table: TableDefinition | undefined): table is TableDefinition & { sqlQuery: string } {
  return typeof table?.sqlQuery === 'string' && table.sqlQuery.trim().length > 0;
}

export async function executeSqlModelTableQuery(options: {
  bypassCache?: boolean;
  defaultLimit?: number;
  maxLimit?: number;
  parameterValues?: SqlModelParameterValues;
  preLimited?: boolean;
  query: string;
  runner?: LiveSqlRunner;
  source: DataSourceRecord;
  table: TableDefinition;
}): Promise<SqlQueryEngineResult<SqlQueryResult>> {
  if (!isSqlModelTable(options.table)) {
    return { ok: false, statusCode: 400, error: 'Data source table is not a saved SQL data model' };
  }
  return executeModelSqlQuery({
    baseSource: options.source,
    modelSql: options.table.sqlQuery,
    parameterDefinitions: parameterDefinitionsFor(options.source, options.table),
    parameterValues: options.parameterValues ?? {},
    query: options.query,
    sourceType: options.source.type,
    tableName: options.table.name,
    ...(options.defaultLimit ? { defaultLimit: options.defaultLimit } : {}),
    ...(options.maxLimit ? { maxLimit: options.maxLimit } : {}),
    ...(options.runner ? { runner: options.runner } : {}),
    ...(options.preLimited ? { preLimited: options.preLimited } : {})
  });
}

export async function executeCustomQueryDataSourceSqlQuery(
  options: CustomQueryExecuteOptions
): Promise<SqlQueryEngineResult<SqlQueryResult>> {
  const table = options.source.tables[0];
  if (!table) return { ok: false, statusCode: 400, error: 'Saved SQL data model is missing a table name' };
  const baseSource = baseLiveSourceFor(options.source);
  if (!baseSource.ok) return baseSource;
  return executeModelSqlQuery({
    baseSource: baseSource.data,
    modelSql: customQuerySql(options.source) ?? '',
    parameterDefinitions: parameterDefinitionsFor(options.source, table),
    parameterValues: options.parameterValues ?? {},
    query: options.query,
    sourceType: baseSource.data.type,
    tableName: table.name,
    ...(options.defaultLimit ? { defaultLimit: options.defaultLimit } : {}),
    ...(options.maxLimit ? { maxLimit: options.maxLimit } : {}),
    ...(options.runner ? { runner: options.runner } : {}),
    ...(options.preLimited ? { preLimited: options.preLimited } : {}),
    ...(options.bypassCache ? { bypassCache: options.bypassCache } : {})
  });
}

async function executeModelSqlQuery(options: {
  baseSource: DataSourceRecord;
  bypassCache?: boolean;
  defaultLimit?: number;
  maxLimit?: number;
  modelSql: string;
  parameterDefinitions: SqlModelParameterDefinition[];
  parameterValues: SqlModelParameterValues;
  preLimited?: boolean;
  query: string;
  runner?: LiveSqlRunner;
  sourceType: string;
  tableName: string;
}): Promise<SqlQueryEngineResult<SqlQueryResult>> {
  const query = sanitizeReadOnlySelect(options.query);
  const queryError = validateReadOnlySelect(query);
  if (queryError) return { ok: false, statusCode: 403, error: queryError };

  const resolved = applySqlModelParameterBindings(
    options.modelSql,
    options.parameterDefinitions,
    options.parameterValues,
    sqlParameterDialect(options.sourceType)
  );
  if (resolved.unresolvedParameters.length > 0) {
    return {
      ok: false,
      statusCode: 400,
      error: `Missing SQL data model parameter values: ${resolved.unresolvedParameters.join(', ')}`
    };
  }
  const modelSql = expandSqlModelReferences(resolved.sql.trim(), options.baseSource, options.sourceType);
  if (!modelSql) return { ok: false, statusCode: 403, error: 'Saved SQL data model is missing a SELECT query' };
  const modelError = validateReadOnlySelect(modelSql);
  if (modelError) return { ok: false, statusCode: 403, error: modelError };

  const rewrittenQuery = rewriteCustomQueryDataModelSql(query, options.tableName, modelSql, options.sourceType);
  if (!rewrittenQuery) {
    return {
      ok: false,
      statusCode: 400,
      error: `Query must reference the saved SQL data model table: ${options.tableName}`
    };
  }

  return executeLiveDataSourceSqlQuery({
    source: options.baseSource,
    query: rewrittenQuery,
    ...(options.defaultLimit ? { defaultLimit: options.defaultLimit } : {}),
    ...(options.maxLimit ? { maxLimit: options.maxLimit } : {}),
    ...(options.runner ? { runner: options.runner } : {}),
    ...(resolved.bindings ? { values: resolved.bindings } : {}),
    ...(options.preLimited ? { preLimited: options.preLimited } : {}),
    ...(options.bypassCache ? { bypassCache: options.bypassCache } : {})
  });
}

function sqlParameterDialect(sourceType: string): 'mysql' | 'postgres' | 'sqlserver' {
  const normalized = sourceType.toLowerCase();
  if (normalized === 'postgres' || normalized === 'postgresql') return 'postgres';
  if (normalized === 'sqlserver' || normalized === 'mssql' || normalized === 'sql_server') return 'sqlserver';
  return 'mysql';
}

function expandSqlModelReferences(
  sql: string,
  source: DataSourceRecord,
  sourceType: string,
  visited = new Set<string>()
): string {
  const modelTablesByName = new Map(source.tables
    .filter((table): table is TableDefinition & { sqlQuery: string } => isSqlModelTable(table) && !visited.has(table.name))
    .map(table => [table.name, table]));
  let output = sql;
  for (const tableName of referencedSqlModelNames(sql, modelTablesByName)) {
    const table = modelTablesByName.get(tableName);
    if (!table) continue;
    const firstPass = rewriteCustomQueryDataModelSql(output, table.name, table.sqlQuery, sourceType);
    if (!firstPass) continue;
    const expandedTableSql = expandSqlModelReferences(
      table.sqlQuery,
      source,
      sourceType,
      new Set([...visited, table.name])
    );
    output = rewriteCustomQueryDataModelSql(output, table.name, expandedTableSql, sourceType) ?? firstPass;
  }
  return output;
}

function referencedSqlModelNames(
  sql: string,
  modelTablesByName: ReadonlyMap<string, TableDefinition & { sqlQuery: string }>
): string[] {
  const names = new Set<string>();
  let quote: string | null = null;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    const keyword = wordAt(sql, index, 'from') ? 'from' : wordAt(sql, index, 'join') ? 'join' : null;
    if (!keyword) continue;
    const tableStart = skipWhitespace(sql, index + keyword.length);
    const identifier = readIdentifier(sql, tableStart);
    const tableName = identifier ? normalizeIdentifier(identifier.text) : null;
    if (tableName && modelTablesByName.has(tableName)) names.add(tableName);
    index = identifier ? identifier.end - 1 : index;
  }
  return Array.from(names);
}

export function rewriteCustomQueryDataModelSql(
  query: string,
  tableName: string,
  modelSql: string,
  sourceType = 'mysql'
): string | null {
  const trimmedModelSql = stripTerminatingSemicolon(modelSql);
  let output = '';
  let lastIndex = 0;
  let replacements = 0;
  let quote: string | null = null;

  for (let index = 0; index < query.length; index += 1) {
    const char = query[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    const keyword = wordAt(query, index, 'from') ? 'from' : wordAt(query, index, 'join') ? 'join' : null;
    if (!keyword) continue;
    const tableStart = skipWhitespace(query, index + keyword.length);
    const identifier = readIdentifier(query, tableStart);
    if (!identifier || normalizeIdentifier(identifier.text) !== tableName) continue;

    const replacement = hasExplicitAlias(query, identifier.end)
      ? `(${trimmedModelSql})`
      : `(${trimmedModelSql}) AS ${quoteSqlIdentifier(tableName, sourceType)}`;
    output += query.slice(lastIndex, tableStart) + replacement;
    lastIndex = identifier.end;
    replacements += 1;
    index = identifier.end - 1;
  }

  if (replacements === 0) return null;
  return output + query.slice(lastIndex);
}

export function quoteSqlIdentifier(value: string, sourceType = 'mysql'): string {
  return quoteSqlIdentifierForType(value, sourceType);
}

function parameterDefinitionsFor(source: DataSourceRecord, table: TableDefinition): SqlModelParameterDefinition[] {
  return dedupeParameterDefinitions([
    ...readParameterDefinitions(source.dictionary.parameters),
    ...readParameterDefinitions(source.settings.parameters),
    ...readParameterDefinitions(table.dictionary.parameters),
    ...readParameterDefinitions(table.settings?.parameters)
  ]);
}

function readParameterDefinitions(value: unknown): SqlModelParameterDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const name = asString(item.name);
    if (!name) return [];
    const dataType = asString(item.dataType) ?? asString(item.type);
    const dateRole = asString(item.dateRole);
    return [{
      name,
      defaultValue: item.defaultValue,
      required: item.required !== false,
      ...(dataType ? { dataType } : {}),
      ...(dateRole ? { dateRole } : {})
    }];
  });
}

function dedupeParameterDefinitions(definitions: SqlModelParameterDefinition[]): SqlModelParameterDefinition[] {
  return Array.from(new Map(definitions.map(definition => [definition.name, definition])).values());
}

function baseLiveSourceFor(source: DataSourceRecord): SqlQueryEngineResult<DataSourceRecord> {
  const baseDataSourceId = asString(source.baseDataSourceId) ?? asString(source.config.baseDataSourceId);
  if (!baseDataSourceId) {
    return { ok: false, statusCode: 400, error: 'Saved SQL data model is missing a base data source' };
  }
  const baseSource = findDataSource(baseDataSourceId);
  if (!baseSource) return { ok: false, statusCode: 404, error: 'Base data source for saved SQL data model was not found' };
  if (!isLiveSqlDataSource(baseSource)) {
    return { ok: false, statusCode: 400, error: 'Base data source is not configured for live SQL execution' };
  }
  return { ok: true, data: baseSource };
}

function customQuerySql(source: DataSourceRecord): string | null {
  return asString(source.query) ?? asString(source.config.query) ?? asString(source.tables[0]?.sqlQuery);
}

function hasExplicitAlias(query: string, startAt: number): boolean {
  const index = skipWhitespace(query, startAt);
  const next = readIdentifier(query, index);
  if (!next) return false;
  const word = normalizeIdentifier(next.text).toLowerCase();
  if (word === 'as') return true;
  return !RESERVED_AFTER_TABLE.has(word);
}

function readIdentifier(value: string, startAt: number): { end: number; text: string } | null {
  const char = value[startAt];
  if (!char) return null;
  if (char === '`' || char === '"') {
    const end = value.indexOf(char, startAt + 1);
    return end > startAt ? { text: value.slice(startAt, end + 1), end: end + 1 } : null;
  }
  if (char === '[') {
    const end = value.indexOf(']', startAt + 1);
    return end > startAt ? { text: value.slice(startAt, end + 1), end: end + 1 } : null;
  }
  const match = /^[a-z_][a-z0-9_]*/i.exec(value.slice(startAt));
  return match?.[0] ? { text: match[0], end: startAt + match[0].length } : null;
}

function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('`') && trimmed.endsWith('`')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed.slice(1, -1).replaceAll(']]', ']');
  return trimmed;
}

function skipWhitespace(value: string, startAt: number): number {
  let index = startAt;
  while (/\s/.test(value[index] ?? '')) index += 1;
  return index;
}

function wordAt(value: string, index: number, word: string): boolean {
  const before = index === 0 ? ' ' : value[index - 1] ?? ' ';
  const after = value[index + word.length] ?? ' ';
  return value.slice(index, index + word.length).toLowerCase() === word
    && !/[a-z0-9_]/i.test(before)
    && !/[a-z0-9_]/i.test(after);
}

function stripTerminatingSemicolon(query: string): string {
  const trimmed = query.trim();
  return trimmed.endsWith(';') ? trimmed.slice(0, -1).trim() : trimmed;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
