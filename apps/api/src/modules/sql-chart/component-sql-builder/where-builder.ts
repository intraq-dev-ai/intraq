import type { FilterCondition } from './types.js';
import { resolveDynamicDateValue } from './date-utils.js';
import type { Dialect } from './dialect.js';

type SqlOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'IN'
  | 'NOT IN'
  | 'LIKE'
  | 'NOT LIKE'
  | 'BETWEEN'
  | 'IS NULL'
  | 'IS NOT NULL';

type PatternMode = 'contains' | 'startsWith' | 'endsWith';

interface NormalizedOperator {
  sql: SqlOperator;
  patternMode?: PatternMode;
}

function escapeStringValue(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeOperator(operator: string): NormalizedOperator {
  const raw = String(operator ?? '').trim();
  const token = raw.toLowerCase().replace(/[\s_-]+/g, '');

  if (raw === '=' || raw === '==') return { sql: '=' };
  if (raw === '!=' || raw === '<>') return { sql: '!=' };
  if (raw === '>') return { sql: '>' };
  if (raw === '>=') return { sql: '>=' };
  if (raw === '<') return { sql: '<' };
  if (raw === '<=') return { sql: '<=' };

  switch (token) {
    case '':
    case 'equal':
    case 'equals':
    case 'is':
      return { sql: '=' };
    case 'notequal':
    case 'notequals':
    case 'neq':
    case 'isnot':
      return { sql: '!=' };
    case 'greaterthan':
    case 'gt':
      return { sql: '>' };
    case 'greaterthanorequal':
    case 'greaterthanorequals':
    case 'gte':
      return { sql: '>=' };
    case 'lessthan':
    case 'lt':
      return { sql: '<' };
    case 'lessthanorequal':
    case 'lessthanorequals':
    case 'lte':
      return { sql: '<=' };
    case 'in':
    case 'inlist':
      return { sql: 'IN' };
    case 'notin':
    case 'notinlist':
      return { sql: 'NOT IN' };
    case 'like':
      return { sql: 'LIKE' };
    case 'notlike':
      return { sql: 'NOT LIKE' };
    case 'contains':
      return { sql: 'LIKE', patternMode: 'contains' };
    case 'notcontains':
      return { sql: 'NOT LIKE', patternMode: 'contains' };
    case 'startswith':
      return { sql: 'LIKE', patternMode: 'startsWith' };
    case 'endswith':
      return { sql: 'LIKE', patternMode: 'endsWith' };
    case 'between':
      return { sql: 'BETWEEN' };
    case 'isnull':
    case 'isempty':
      return { sql: 'IS NULL' };
    case 'isnotnull':
    case 'isnotempty':
      return { sql: 'IS NOT NULL' };
    default:
      return { sql: '=' };
  }
}

function emptyFilterValue(value: unknown): boolean {
  return value === undefined
    || value === null
    || (typeof value === 'string' && (value.trim() === '' || value.trim().toLowerCase() === 'all'));
}

function filterValues(value: unknown): unknown[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.includes(',')
      ? value.split(',').map(item => item.trim())
      : [value];
  return values.filter(item => !emptyFilterValue(item));
}

function scalarSqlValue(value: unknown): string {
  const strVal = String(value ?? '');
  const numVal = Number(strVal);
  return !isNaN(numVal) && strVal.trim() !== '' ? strVal : escapeStringValue(strVal);
}

function patternValue(value: unknown, mode: PatternMode | undefined): string {
  const raw = String(value ?? '');
  if (mode === 'contains') return `%${raw}%`;
  if (mode === 'startsWith') return `${raw}%`;
  if (mode === 'endsWith') return `%${raw}`;
  return raw;
}

function isLastOperator(operator: string): boolean {
  return String(operator ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '') === 'last';
}

function dateRangeFromLastValue(value: unknown): { end: string; start: string } | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizeLastDateToken(value);
  const days = Number(normalized.match(/^(\d+)\s+days$/i)?.[1] ?? '');
  if (!Number.isFinite(days) || days <= 0) return null;
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - Math.floor(days) + 1);
  return { start: formatInputDate(start), end: formatInputDate(end) };
}

function normalizeLastDateToken(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  const aliases: Record<string, string> = {
    lastweek: '7 days',
    lastmonth: '30 days',
    lastquarter: '90 days',
    lastyear: '365 days'
  };
  const alias = aliases[normalized.replace(/[\s_-]+/g, '')];
  if (alias) return alias;
  const match = normalized.match(/^last[_\s-]*(\d+)(?:[_\s-]*(day|days|d|week|weeks|w|month|months|m|year|years|y))?$/)
    ?? normalized.match(/^(\d+)[_\s-]*(day|days|d|week|weeks|w|month|months|m|year|years|y)$/);
  if (match) return `${daysForLastToken(Number(match[1] ?? '0'), match[2])} days`;
  return trimmed;
}

function daysForLastToken(amount: number, unit = 'days'): number {
  if (unit.startsWith('w')) return amount * 7;
  if (unit.startsWith('m')) return amount * 30;
  if (unit.startsWith('y')) return amount * 365;
  return amount;
}

function formatInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function conditionSql(filter: FilterCondition, d: Dialect): string {
  const field = d.escapeField(filter.column);
  if (isLastOperator(filter.operator)) {
    const range = dateRangeFromLastValue(filter.value);
    if (range) return `${field} BETWEEN ${scalarSqlValue(range.start)} AND ${scalarSqlValue(range.end)}`;
    const value = resolveDynamicDateValue(filter.value);
    if (!emptyFilterValue(value)) return `${field} >= ${scalarSqlValue(value)}`;
    return '';
  }
  const value = resolveDynamicDateValue(filter.value);
  const op = normalizeOperator(filter.operator);

  if (op.sql === 'IS NULL') return `${field} IS NULL`;
  if (op.sql === 'IS NOT NULL') return `${field} IS NOT NULL`;

  if (op.sql === 'IN' || op.sql === 'NOT IN') {
    const safe = filterValues(value);
    if (safe.length === 0) return '';
    const vals = safe.map(v => scalarSqlValue(v)).join(', ');
    return `${field} ${op.sql} (${vals})`;
  }

  if (op.sql === 'LIKE' || op.sql === 'NOT LIKE') {
    if (emptyFilterValue(value)) return '';
    return `${field} ${op.sql} ${escapeStringValue(patternValue(value, op.patternMode))}`;
  }

  if (op.sql === 'BETWEEN') {
    const arr = Array.isArray(value)
      ? value
      : typeof value === 'string' && value.includes(',')
        ? value.split(',').map(v => v.trim())
        : value && typeof value === 'object'
          ? [(value as Record<string, unknown>).start ?? (value as Record<string, unknown>).from, (value as Record<string, unknown>).end ?? (value as Record<string, unknown>).to]
        : [];
    if (arr.length >= 2 && !emptyFilterValue(arr[0]) && !emptyFilterValue(arr[1])) {
      return `${field} BETWEEN ${scalarSqlValue(arr[0])} AND ${scalarSqlValue(arr[1])}`;
    }
    return '';
  }

  if (emptyFilterValue(value)) return '';
  return `${field} ${op.sql} ${scalarSqlValue(value)}`;
}

export function buildWhereClause(filters: FilterCondition[], d: Dialect): string {
  if (!filters || filters.length === 0) return '';
  const conditions = filters.map(f => conditionSql(f, d)).filter(Boolean);
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

export function buildOrderByClause(xField: string | undefined, sortOrder: string | undefined, d: Dialect): string {
  if (!xField) return '';
  const order = sortOrder === 'desc' ? 'DESC' : 'ASC';
  return `ORDER BY ${d.escapeField(xField)} ${order}`;
}

export interface HavingResult {
  rowFilters: FilterCondition[];
  havingClauses: string[];
}

export function separateHavingFilters(
  filters: FilterCondition[],
  aggregatedAliases: Set<string>,
  aggregateExprMap: Map<string, string>,
  d: Dialect
): HavingResult {
  const rowFilters: FilterCondition[] = [];
  const havingClauses: string[] = [];

  for (const filter of filters) {
    const colKey = filter.column.toLowerCase();
    const aggExpr = aggregateExprMap.get(colKey);
    if (!aggExpr && !aggregatedAliases.has(colKey)) {
      rowFilters.push(filter);
      continue;
    }
    const expr = aggExpr ?? d.escapeField(filter.column);
    if (isLastOperator(filter.operator)) {
      const range = dateRangeFromLastValue(filter.value);
      if (range) {
        havingClauses.push(`${expr} BETWEEN ${scalarSqlValue(range.start)} AND ${scalarSqlValue(range.end)}`);
      } else {
        const value = resolveDynamicDateValue(filter.value);
        if (!emptyFilterValue(value)) havingClauses.push(`${expr} >= ${scalarSqlValue(value)}`);
      }
      continue;
    }
    const value = resolveDynamicDateValue(filter.value);
    const op = normalizeOperator(filter.operator);
    if (op.sql === 'IS NULL' || op.sql === 'IS NOT NULL') {
      havingClauses.push(`${expr} ${op.sql}`);
    } else if (op.sql === 'IN' || op.sql === 'NOT IN') {
      const arr = filterValues(value).map(v => scalarSqlValue(v));
      if (arr.length > 0) havingClauses.push(`${expr} ${op.sql} (${arr.join(', ')})`);
    } else if (op.sql === 'LIKE' || op.sql === 'NOT LIKE') {
      if (!emptyFilterValue(value)) havingClauses.push(`${expr} ${op.sql} ${escapeStringValue(patternValue(value, op.patternMode))}`);
    } else if (op.sql === 'BETWEEN') {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length >= 2 && !emptyFilterValue(arr[0]) && !emptyFilterValue(arr[1])) {
        havingClauses.push(`${expr} BETWEEN ${scalarSqlValue(arr[0])} AND ${scalarSqlValue(arr[1])}`);
      }
    } else {
      if (!emptyFilterValue(value)) havingClauses.push(`${expr} ${op.sql} ${scalarSqlValue(value)}`);
    }
  }

  return { rowFilters, havingClauses };
}
