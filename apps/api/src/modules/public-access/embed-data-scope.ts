import type { DataSourceRecord, TableDefinition } from '../data-source/foundation-store.js';
import type { EmbedDataScope, EmbedScopeFilter } from './embed-token-store.js';

export function normalizeEmbedDataScope(value: unknown): EmbedDataScope | undefined {
  if (!isRecord(value)) return undefined;
  const dataSourceIds = readStringArray(value.dataSourceIds);
  const filters = Array.isArray(value.filters)
    ? value.filters.flatMap(normalizeScopeFilter)
    : [];
  if (dataSourceIds.length === 0 && filters.length === 0) return undefined;
  return {
    ...(dataSourceIds.length > 0 ? { dataSourceIds } : {}),
    filters
  };
}

export function dataSourceAllowedByScope(source: DataSourceRecord, scope: EmbedDataScope | undefined): boolean {
  if (!scope?.dataSourceIds || scope.dataSourceIds.length === 0) return true;
  return scope.dataSourceIds.includes(source.id);
}

export function filtersForEmbedTable(
  scope: EmbedDataScope | undefined,
  source: DataSourceRecord,
  table: TableDefinition
): EmbedScopeFilter[] {
  if (!scope) return [];
  return scope.filters.filter(filter => {
    if (filter.dataSourceId && filter.dataSourceId !== source.id) return false;
    if (filter.tableId && filter.tableId !== table.id) return false;
    if (filter.tableName && filter.tableName !== table.name) return false;
    return true;
  });
}

export function filterRowsByEmbedScope(
  rows: Array<Record<string, unknown>>,
  filters: readonly EmbedScopeFilter[]
): Array<Record<string, unknown>> {
  if (filters.length === 0) return rows;
  const conditions = filters.map(rowConditionFor).filter(isPresent);
  return rows.filter(row => conditions.every(condition => condition(row)));
}

function normalizeScopeFilter(value: unknown): EmbedScopeFilter[] {
  if (!isRecord(value)) return [];
  const column = readString(value.column ?? value.field);
  if (!column) return [];
  const operator = readString(value.operator) ?? '=';
  const dataSourceId = readString(value.dataSourceId);
  const tableId = readString(value.tableId);
  const tableName = readString(value.tableName ?? value.table);
  const values = Array.isArray(value.values) ? value.values : undefined;
  return [{
    column,
    operator,
    ...(dataSourceId ? { dataSourceId } : {}),
    ...(tableId ? { tableId } : {}),
    ...(tableName ? { tableName } : {}),
    ...(values ? { values: [...values] } : {}),
    ...(value.value !== undefined ? { value: value.value } : {})
  }];
}

type RowCondition = (row: Record<string, unknown>) => boolean;

function rowConditionFor(filter: EmbedScopeFilter): RowCondition | null {
  const operator = normalizeOperator(filter.operator);
  if (!operator) return null;
  const values = filterValues(filter).map(toComparableCell);
  return row => {
    const actual = toComparableCell(row[filter.column]);
    if (operator === 'is-null') return actual === null;
    if (operator === 'is-not-null') return actual !== null;
    if (operator === 'contains') return String(actual ?? '').toLowerCase().includes(String(values[0] ?? '').toLowerCase());
    if (operator === 'in') return values.some(value => compareValues(actual, value) === 0);
    if (operator === 'not-in') return values.every(value => compareValues(actual, value) !== 0);
    const expected = values[0] ?? null;
    const comparison = compareValues(actual, expected);
    if (operator === '=') return comparison === 0;
    if (operator === '!=') return comparison !== 0;
    if (operator === '<') return comparison < 0;
    if (operator === '<=') return comparison <= 0;
    if (operator === '>') return comparison > 0;
    return comparison >= 0;
  };
}

function filterValues(filter: EmbedScopeFilter): unknown[] {
  if (Array.isArray(filter.values)) return filter.values;
  if (['in', 'not_in', 'not-in'].includes(filter.operator.trim().toLowerCase()) && typeof filter.value === 'string') {
    return filter.value.split(',').map(value => value.trim()).filter(Boolean);
  }
  return [filter.value];
}

function normalizeOperator(value: string): '=' | '!=' | '<' | '<=' | '>' | '>=' | 'contains' | 'in' | 'not-in' | 'is-null' | 'is-not-null' | null {
  const operator = value.trim().toLowerCase();
  if (['equals', '='].includes(operator)) return '=';
  if (['not_equals', 'not-equals', '!=', '<>'].includes(operator)) return '!=';
  if (['greater_than', 'greater-than', '>'].includes(operator)) return '>';
  if (['greater_than_or_equal', 'greater-than-or-equal', '>='].includes(operator)) return '>=';
  if (['less_than', 'less-than', '<'].includes(operator)) return '<';
  if (['less_than_or_equal', 'less-than-or-equal', '<='].includes(operator)) return '<=';
  if (operator === 'contains') return 'contains';
  if (operator === 'in') return 'in';
  if (['not_in', 'not-in'].includes(operator)) return 'not-in';
  if (['is_null', 'is-null'].includes(operator)) return 'is-null';
  if (['is_not_null', 'is-not-null'].includes(operator)) return 'is-not-null';
  return null;
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  const leftNumber = typeof left === 'number' ? left : typeof left === 'string' && left.trim() !== '' ? Number(left) : NaN;
  const rightNumber = typeof right === 'number' ? right : typeof right === 'string' && right.trim() !== '' ? Number(right) : NaN;
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left ?? '').localeCompare(String(right ?? ''));
}

function toComparableCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(readString).filter(isPresent)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}
