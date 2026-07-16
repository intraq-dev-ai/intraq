import {
  buildDataSource,
  findDataSource,
  rowsForTable,
  type DataSourceRecord,
  type TableDefinition
} from './foundation-store.js';
import { parseSelectQuery, validateReadOnlySelect } from './sql-query-parser.js';
import { evaluateComputedSqlExpression } from './sql-query-computed-expression.js';
import type {
  FilterExpression,
  SelectExpression,
  SqlQueryCell,
  SqlQueryEngineResult,
  SqlQueryExecuteOptions,
  SqlQueryResult,
  SqlQueryRow
} from './sql-query-types.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

export type {
  SqlQueryCell,
  SqlQueryEngineResult,
  SqlQueryExecuteOptions,
  SqlQueryResult,
  SqlQueryRow
} from './sql-query-types.js';

export function executeDataSourceSqlQuery(options: SqlQueryExecuteOptions): SqlQueryEngineResult<SqlQueryResult> {
  const query = options.query.trim();
  const safeError = validateReadOnlySelect(query);
  if (safeError) return { ok: false, statusCode: 403, error: safeError };

  const sourceResult = resolveDataSource(options.dataSourceId, options.tempDataSource);
  if (!sourceResult.ok) return sourceResult;
  const limits = {
    defaultLimit: normalizeLimit(options.defaultLimit, DEFAULT_LIMIT, MAX_LIMIT),
    maxLimit: normalizeLimit(options.maxLimit, MAX_LIMIT, MAX_LIMIT)
  };
  const unionParts = splitUnionAll(query);
  if (unionParts.length > 1) return executeUnionQuery(sourceResult.data, query, unionParts, limits, options.rowFilters ?? []);

  return executeSingleSelectQuery(sourceResult.data, query, limits, options.rowFilters ?? []);
}

function executeSingleSelectQuery(
  source: DataSourceRecord,
  query: string,
  limits: { defaultLimit: number; maxLimit: number },
  rowFilters: readonly FilterExpression[] = []
): SqlQueryEngineResult<SqlQueryResult> {
  const parsed = parseSelectQuery(query, {
    defaultLimit: limits.defaultLimit,
    maxLimit: limits.maxLimit
  });
  if (!parsed.ok) return parsed;

  if (!parsed.data.tableName) return constantResult(source, query, parsed.data.expressions);

  const table = findQueryTable(source, parsed.data.tableName);
  if (!table) return { ok: false, statusCode: 400, error: `Unknown table: ${parsed.data.tableName}` };

  const expressions = parsed.data.expressions === '*'
    ? table.fields.map(field => ({ kind: 'field' as const, fieldName: field.name, resultName: field.name }))
    : parsed.data.expressions;
  const fieldError = validateFields(table, expressions, [...rowFilters, ...parsed.data.filters], parsed.data.groupBy, parsed.data.having, parsed.data.orderBy);
  if (fieldError) return { ok: false, statusCode: 400, error: fieldError };

  const filteredRows = rowsForSourceTable(source, table)
    .filter(row => matchesFilters(row, rowFilters) && matchesFilters(row, parsed.data.filters));
  const groupedRows = buildResultRows(filteredRows, expressions, parsed.data.groupBy)
    .filter(row => matchesFilters(row, parsed.data.having));
  const rows = sortRows(groupedRows, parsed.data.orderBy)
    .slice(0, parsed.data.limit ?? filteredRows.length);
  const columns = expressions.map(expression => expression.resultName);

  return {
    ok: true,
    data: {
      columns,
      rows,
      rowCount: rows.length,
      executionTime: 1,
      dataSource: { id: source.id, name: source.name, type: source.type },
      columnTypes: columns.map(name => ({ name, type: columnTypeFor(name, expressions, table) })),
      query
    }
  };
}

function executeUnionQuery(
  source: DataSourceRecord,
  query: string,
  parts: string[],
  limits: { defaultLimit: number; maxLimit: number },
  rowFilters: readonly FilterExpression[]
): SqlQueryEngineResult<SqlQueryResult> {
  const results: SqlQueryResult[] = [];
  for (const part of parts) {
    const result = executeSingleSelectQuery(source, part, limits, rowFilters);
    if (!result.ok) return result;
    results.push(result.data);
  }
  const first = results[0];
  if (!first) return { ok: false, statusCode: 400, error: 'UNION ALL query must include SELECT statements' };
  const rows = results.flatMap(result => result.rows.map(row => remapRowByPosition(row, first.columns)));
  return {
    ok: true,
    data: {
      columns: first.columns,
      rows: rows.slice(0, limits.defaultLimit),
      rowCount: Math.min(rows.length, limits.defaultLimit),
      executionTime: Math.max(1, results.reduce((total, result) => total + result.executionTime, 0)),
      dataSource: { id: source.id, name: source.name, type: source.type },
      columnTypes: first.columnTypes,
      query
    }
  };
}

function resolveDataSource(
  dataSourceId: string | undefined,
  tempDataSource: unknown
): SqlQueryEngineResult<DataSourceRecord> {
  if (dataSourceId) {
    const source = findDataSource(dataSourceId);
    if (!source) return { ok: false, statusCode: 404, error: 'Data source not found' };
    return { ok: true, data: source };
  }
  if (tempDataSource) return { ok: true, data: buildTemporaryDataSource(tempDataSource) };
  return { ok: false, statusCode: 400, error: 'Data source ID (or temp data source) and query are required' };
}

function buildTemporaryDataSource(value: unknown): DataSourceRecord {
  const record = isRecord(value) ? value : {};
  return buildDataSource({
    ...record,
    id: optionalString(record.id) ?? 'temp',
    name: optionalString(record.name) ?? 'Temporary SQL source',
    sourceType: 'temp',
    status: optionalString(record.status) ?? 'connected',
    type: optionalString(record.type) ?? 'temp'
  });
}

function validateFields(
  table: TableDefinition,
  expressions: SelectExpression[],
  filters: FilterExpression[],
  groupBy: string[],
  having: FilterExpression[],
  orderBy: Array<{ name: string }>
): string | null {
  const fieldNames = new Set(table.fields.map(field => field.name));
  for (const expression of expressions) {
    if (expression.kind === 'field' && !fieldNames.has(expression.fieldName)) return `Unknown column: ${expression.fieldName}`;
    if (expression.kind === 'aggregate' && expression.expressionSql) {
      for (const fieldName of expression.fieldNames ?? []) if (!fieldNames.has(fieldName)) return `Unknown column: ${fieldName}`;
    } else if (expression.kind === 'aggregate' && expression.fieldName !== '*' && !fieldNames.has(expression.fieldName)) {
      return `Unknown column: ${expression.fieldName}`;
    }
    if (expression.kind === 'computed') {
      for (const fieldName of expression.fieldNames) if (!fieldNames.has(fieldName)) return `Unknown column: ${fieldName}`;
    }
  }
  for (const filter of filters) if (!fieldNames.has(filter.fieldName)) return `Unknown column: ${filter.fieldName}`;
  for (const field of groupBy) if (!fieldNames.has(field)) return `Unknown column: ${field}`;
  const resultNames = new Set(expressions.map(expression => expression.resultName));
  for (const filter of having) {
    if (!fieldNames.has(filter.fieldName) && !resultNames.has(filter.fieldName)) return `Unknown column: ${filter.fieldName}`;
  }
  for (const order of orderBy) if (!fieldNames.has(order.name) && !resultNames.has(order.name)) return `Unknown column: ${order.name}`;
  return null;
}

function buildResultRows(
  rows: Array<Record<string, unknown>>,
  expressions: SelectExpression[],
  groupBy: string[]
): SqlQueryRow[] {
  if (!expressions.some(expression => expression.kind === 'aggregate')) {
    const rowExpressions = expressions.filter(isRowExpression);
    return rows.map(row => Object.fromEntries(rowExpressions.map(expression => [
      expression.resultName,
      resultValue(row, expression)
    ])));
  }

  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const key = groupBy.length ? JSON.stringify(groupBy.map(field => row[field])) : '__all__';
    groups.set(key, [...groups.get(key) ?? [], row]);
  }
  if (groups.size === 0 && groupBy.length === 0) groups.set('__all__', []);

  return Array.from(groups.values()).map(groupRows => {
    const sample = groupRows[0] ?? {};
    const result: SqlQueryRow = {};
    for (const expression of expressions) {
      result[expression.resultName] = expression.kind === 'aggregate'
        ? aggregateValue(groupRows, expression)
        : resultValue(sample, expression);
    }
    return result;
  });
}

function isRowExpression(expression: SelectExpression): expression is Exclude<SelectExpression, { kind: 'aggregate' }> {
  return expression.kind !== 'aggregate';
}

function resultValue(row: Record<string, unknown>, expression: Exclude<SelectExpression, { kind: 'aggregate' }>): SqlQueryCell {
  return expression.kind === 'field'
    ? toSqlQueryCell(row[expression.fieldName])
    : evaluateComputedSqlExpression(expression.sql, row);
}

function aggregateValue(rows: Array<Record<string, unknown>>, expression: Extract<SelectExpression, { kind: 'aggregate' }>): SqlQueryCell {
  if (expression.functionName === 'count') {
    if (expression.expressionSql) {
      return rows.filter(row => evaluateComputedSqlExpression(expression.expressionSql ?? '', row) !== null).length;
    }
    return expression.fieldName === '*'
      ? rows.length
      : rows.filter(row => row[expression.fieldName] !== null && row[expression.fieldName] !== undefined).length;
  }
  const values = rows
    .map(row => Number(expression.expressionSql ? evaluateComputedSqlExpression(expression.expressionSql, row) : row[expression.fieldName]))
    .filter(Number.isFinite);
  if (values.length === 0) return null;
  if (expression.functionName === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (expression.functionName === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (expression.functionName === 'min') return Math.min(...values);
  return Math.max(...values);
}

function matchesFilters(row: Record<string, unknown>, filters: readonly FilterExpression[]): boolean {
  return filters.every(filter => {
    const actual = toSqlQueryCell(row[filter.fieldName]);
    if (filter.operator === 'is-null') return actual === null;
    if (filter.operator === 'is-not-null') return actual !== null;
    if (filter.operator === 'between') return compareValues(actual, filter.values?.[0] ?? null) >= 0
      && compareValues(actual, filter.values?.[1] ?? null) <= 0;
    if (filter.operator === 'in') return (filter.values ?? []).some(value => compareValues(actual, value) === 0);
    if (filter.operator === 'like') return likePattern(String(filter.value ?? '')).test(String(actual ?? ''));
    const comparison = compareValues(actual, filter.value ?? null);
    if (filter.operator === '=') return comparison === 0;
    if (filter.operator === '!=') return comparison !== 0;
    if (filter.operator === '<') return comparison < 0;
    if (filter.operator === '<=') return comparison <= 0;
    if (filter.operator === '>') return comparison > 0;
    return comparison >= 0;
  });
}

function sortRows(rows: SqlQueryRow[], orderBy: Array<{ name: string; direction: 'asc' | 'desc' }>): SqlQueryRow[] {
  if (orderBy.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const order of orderBy) {
      const comparison = compareValues(left[order.name] ?? null, right[order.name] ?? null);
      if (comparison !== 0) return order.direction === 'desc' ? -comparison : comparison;
    }
    return 0;
  });
}

function constantResult(
  source: DataSourceRecord,
  query: string,
  expressions: SelectExpression[] | '*'
): SqlQueryEngineResult<SqlQueryResult> {
  const expression = expressions === '*' ? null : expressions[0];
  const column = expression?.resultName ?? 'metric_value';
  const value = expression?.kind === 'field' ? Number(expression.fieldName) : 1;
  return {
    ok: true,
    data: {
      columns: [column],
      rows: [{ [column]: Number.isFinite(value) ? value : 1 }],
      rowCount: 1,
      executionTime: 1,
      dataSource: { id: source.id, name: source.name, type: source.type },
      columnTypes: [{ name: column, type: 'number' }],
      query
    }
  };
}

function columnTypeFor(name: string, expressions: SelectExpression[], table: TableDefinition): string {
  const expression = expressions.find(item => item.resultName === name);
  if (!expression) return 'string';
  if (expression.kind === 'aggregate') return 'number';
  if (expression.kind === 'computed') return expression.valueType;
  return table.fields.find(field => field.name === expression.fieldName)?.type ?? 'string';
}

function remapRowByPosition(row: SqlQueryRow, columns: string[]): SqlQueryRow {
  const values = Object.values(row);
  return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null]));
}

function splitUnionAll(query: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < query.length; index += 1) {
    const char = query[index] ?? '';
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth !== 0 || !isUnionAllAt(query, index)) continue;
    parts.push(query.slice(start, index).trim());
    start = index + 'union all'.length;
  }
  parts.push(query.slice(start).trim());
  return parts.filter(Boolean);
}

function isUnionAllAt(value: string, index: number): boolean {
  const keyword = 'union all';
  const before = index === 0 ? ' ' : value[index - 1] ?? ' ';
  const after = value[index + keyword.length] ?? ' ';
  return value.slice(index, index + keyword.length).toLowerCase() === keyword
    && !/[a-z0-9_]/i.test(before)
    && !/[a-z0-9_]/i.test(after);
}

function findQueryTable(source: DataSourceRecord, tableName: string): TableDefinition | undefined {
  const normalized = tableName.toLowerCase();
  return source.tables.find(table => table.name.toLowerCase() === normalized || table.id.toLowerCase() === normalized);
}

function rowsForSourceTable(source: DataSourceRecord, table: TableDefinition): Array<Record<string, unknown>> {
  return table.sampleRows ?? rowsForTable(source.id, table.name);
}

function compareValues(left: SqlQueryCell, right: SqlQueryCell): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function likePattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function normalizeLimit(value: number | undefined, fallback: number, cap: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return fallback;
  return Math.min(value, cap);
}

function toSqlQueryCell(value: unknown): SqlQueryCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
