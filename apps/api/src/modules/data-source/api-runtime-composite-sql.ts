import type { DataSourceRecord, TableDefinition } from './foundation-store.js';
import { quoteSqlIdentifierForType } from './sql-dialect.js';
import { validateApiWorkflowReadOnlySql } from './api-workflow-sql-safety.js';
import {
  type ApiRuntimeResult,
  type CompositeApiSegmentConfig,
  type CompositeApiSqlFragmentConfig
} from './api-runtime-types.js';
import { readPath } from './api-runtime-utils.js';

export interface CompositeSqlQuery {
  sql: string;
  values: unknown[];
}

type CompositeSqlParameterDialect = 'databricks' | 'mysql' | 'postgres' | 'sqlserver';

export function compositeSegmentSqlQuery(
  source: DataSourceRecord,
  segment: CompositeApiSegmentConfig,
  templateValues: Record<string, unknown>,
  table?: TableDefinition
): ApiRuntimeResult<CompositeSqlQuery> {
  const configuredQuery = segment.query;
  const baseQuery = configuredQuery
    ?? (table ? `select * from ${quoteSqlIdentifierForType(table.name, source.type)}` : undefined);
  if (!baseQuery) return { ok: false, statusCode: 400, error: `Composite API segment is missing a query or table: ${segment.name ?? segment.dataSourceId}` };
  const query = applyCompositeSqlFragments(baseQuery, segment.queryFragments, templateValues);
  const readOnlyError = validateApiWorkflowReadOnlySql(query);
  if (readOnlyError) return { ok: false, statusCode: 400, error: readOnlyError };
  return applyCompositeSqlParameterBindings(query, templateValues, sqlParameterDialectForSource(source));
}

function applyCompositeSqlFragments(
  baseQuery: string,
  fragments: CompositeApiSqlFragmentConfig[],
  templateValues: Record<string, unknown>
): string {
  const activeFragments = fragments.filter(fragment => {
    if (!fragment.sql.trim()) return false;
    return !fragment.condition || evaluateCompositeSegmentCondition(fragment.condition, templateValues);
  });
  if (fragments.length === 0) return baseQuery;
  let query = baseQuery;
  const appendFragments: string[] = [];
  const knownSlots = new Set(fragments.map(fragment => fragment.slot.trim()).filter(slot => slot && slot !== 'append'));
  for (const fragment of activeFragments) {
    const sql = fragment.sql.trim();
    const slot = fragment.slot.trim();
    if (slot && slot !== 'append') {
      const marker = new RegExp(`\\{\\{\\s*(?:slot:)?${escapeRegExp(slot)}\\s*\\}\\}`, 'gi');
      if (marker.test(query)) {
        query = query.replace(marker, `${sql}\n{{${slot}}}`);
        continue;
      }
    }
    appendFragments.push(sql);
  }
  for (const slot of knownSlots) {
    const marker = new RegExp(`\\{\\{\\s*(?:slot:)?${escapeRegExp(slot)}\\s*\\}\\}`, 'gi');
    query = query.replace(marker, '');
  }
  return [query.trim(), ...appendFragments].filter(Boolean).join('\n');
}

export function evaluateCompositeSegmentCondition(condition: string, values: Record<string, unknown>): boolean {
  const trimmed = condition.trim();
  if (!trimmed) return true;
  const expression = trimmed.replace(/^if\s+/i, '');
  const orParts = splitCompositeBooleanExpression(expression, '||');
  if (orParts.length > 1) return orParts.some(part => evaluateCompositeSegmentCondition(part, values));
  const andParts = splitCompositeBooleanExpression(expression, '&&');
  if (andParts.length > 1) return andParts.every(part => evaluateCompositeSegmentCondition(part, values));
  const unaryMatch = expression.match(/^!?\s*(?:\{\{\s*)?([a-zA-Z0-9_.-]+)(?:\s*\}\})?\s*$/);
  if (unaryMatch?.[1]) {
    const result = compositeConditionTruthy(readPath(values, unaryMatch[1]));
    return expression.trim().startsWith('!') ? !result : result;
  }
  const match = expression.match(/^(?:\{\{\s*)?([a-zA-Z0-9_.-]+)(?:\s*\}\})?\s*(===|!==|==|!=|>=|<=|>|<|=)\s*(.+?)\s*$/);
  if (!match) return true;
  const left = readPath(values, match[1] ?? '');
  const right = parseCompositeConditionLiteral(match[3] ?? '');
  const comparison = compareCompositeConditionValues(left, right);
  const operator = match[2] ?? '==';
  if (operator === '=' || operator === '==' || operator === '===') return comparison === 0;
  if (operator === '!=' || operator === '!==') return comparison !== 0;
  if (operator === '>') return comparison > 0;
  if (operator === '>=') return comparison >= 0;
  if (operator === '<') return comparison < 0;
  if (operator === '<=') return comparison <= 0;
  return true;
}

function splitCompositeBooleanExpression(expression: string, operator: '&&' | '||'): string[] {
  const parts: string[] = [];
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < expression.length - 1; index += 1) {
    const char = expression[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (expression.slice(index, index + 2) === operator) {
      parts.push(expression.slice(start, index).trim());
      start = index + 2;
      index += 1;
    }
  }
  if (parts.length === 0) return [expression];
  parts.push(expression.slice(start).trim());
  return parts.filter(Boolean);
}

function compositeConditionTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return Boolean(value);
}

function parseCompositeConditionLiteral(value: string): unknown {
  const trimmed = value.trim().replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if (/^null$/i.test(trimmed)) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function compareCompositeConditionValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' || typeof right === 'number') {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
      return leftNumber === rightNumber ? 0 : leftNumber > rightNumber ? 1 : -1;
    }
  }
  const leftText = left === null || left === undefined ? '' : String(left);
  const rightText = right === null || right === undefined ? '' : String(right);
  return leftText === rightText ? 0 : leftText > rightText ? 1 : -1;
}

function applyCompositeSqlParameterBindings(
  value: string,
  templateValues: Record<string, unknown>,
  dialect: CompositeSqlParameterDialect
): ApiRuntimeResult<CompositeSqlQuery> {
  try {
    const values: unknown[] = [];
    const sql = value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key: string, offset: number) => {
      if (isInsideSqlString(value, offset)) return match;
      const replacement = readPath(templateValues, key);
      if (replacement === undefined || replacement === null || replacement === '') {
        throw new Error(`Missing API parameter value: ${key}`);
      }
      if (Array.isArray(replacement)) {
        if (replacement.length === 0) return 'NULL';
        return replacement.map(item => {
          values.push(item);
          return compositeSqlPlaceholder(dialect, values.length);
        }).join(', ');
      }
      values.push(replacement);
      return compositeSqlPlaceholder(dialect, values.length);
    });
    const unresolved = sql.match(/\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/);
    if (unresolved) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Composite SQL parameters must be used as SQL values, not inside SQL string literals'
      };
    }
    return { ok: true, data: { sql, values } };
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      error: error instanceof Error ? error.message : 'Missing API parameter value'
    };
  }
}

function compositeSqlPlaceholder(dialect: CompositeSqlParameterDialect, index: number): string {
  if (dialect === 'postgres') return `$${index}`;
  if (dialect === 'sqlserver') return `@p${index}`;
  return '?';
}

function sqlParameterDialectForSource(source: DataSourceRecord): CompositeSqlParameterDialect {
  const normalized = String(source.config.engine ?? source.config.provider ?? source.type).toLowerCase();
  if (normalized === 'postgres' || normalized === 'postgresql') return 'postgres';
  if (normalized === 'sqlserver' || normalized === 'mssql' || normalized === 'sql_server') return 'sqlserver';
  if (normalized === 'databricks' || normalized === 'spark') return 'databricks';
  return 'mysql';
}

function isInsideSqlString(sql: string, offset: number): boolean {
  let quote: string | null = null;
  for (let index = 0; index < offset; index += 1) {
    const char = sql[index];
    if (quote) {
      if (char === quote) {
        if (sql[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
  }
  return quote !== null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
