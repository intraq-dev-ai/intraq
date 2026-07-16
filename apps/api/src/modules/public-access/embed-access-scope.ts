import {
  findDataSource,
  type DataSourceRecord,
  type TableDefinition
} from '../data-source/foundation-store.js';
import { executeDataSourceSqlQuery } from '../data-source/sql-query-engine.js';
import { sanitizeReadOnlySelect, validateReadOnlySelect } from '../data-source/sql-query-parser.js';
import type {
  EmbedDataAccessFilter,
  EmbedDataAccessRule,
  EmbedScopeFilter,
  EmbedToken
} from './embed-token-store.js';

export function normalizeEmbedAccessContext(
  value: unknown,
  base: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> | undefined {
  const context: Record<string, unknown> = {};
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (!isSafeContextKey(key) || item === undefined) continue;
      context[key] = normalizeContextValue(item);
    }
  }
  for (const [key, item] of Object.entries(base)) {
    if (!isSafeContextKey(key) || item === undefined) continue;
    context[key] = normalizeContextValue(item);
  }
  return Object.keys(context).length > 0 ? context : undefined;
}

export function normalizeEmbedDataAccessRules(value: unknown): EmbedDataAccessRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const filtersSource = Array.isArray(item.filters) ? item.filters : [item];
    const filters = filtersSource.flatMap(normalizeEmbedDataAccessFilter);
    if (filters.length === 0) return [];
    const dataSourceId = readString(item.dataSourceId);
    const tableId = readString(item.tableId ?? item.dataSourceTableId);
    const tableName = readString(item.tableName ?? item.table);
    return [{
      filters,
      ...(dataSourceId ? { dataSourceId } : {}),
      ...(tableId ? { tableId } : {}),
      ...(tableName ? { tableName } : {})
    }];
  });
}

export function dataSourceAllowedByDataAccessRules(source: DataSourceRecord, token: EmbedToken): boolean {
  const rules = token.dataAccessRules ?? [];
  if (rules.length === 0) return true;
  return rules.some(rule => !rule.dataSourceId || rule.dataSourceId === source.id);
}

export async function resolveEmbedDataAccessFilters(
  token: EmbedToken,
  source: DataSourceRecord,
  table: TableDefinition
): Promise<{ denyAll: boolean; filters: EmbedScopeFilter[] }> {
  const rules = (token.dataAccessRules ?? []).filter(ruleMatchesTable(source, table));
  if (rules.length === 0) return { denyAll: false, filters: [] };

  const filters: EmbedScopeFilter[] = [];
  for (const rule of rules) {
    for (const filter of rule.filters) {
      const resolved = await resolveEmbedDataAccessFilter(filter, token.accessContext ?? {}, source);
      if (!resolved.ok) return { denyAll: true, filters: [] };
      filters.push(resolved.filter);
    }
  }
  return { denyAll: false, filters };
}

export function summarizeDataAccessRules(rules: readonly EmbedDataAccessRule[] | undefined): Record<string, unknown> {
  const filterCount = rules?.reduce((count, rule) => count + rule.filters.length, 0) ?? 0;
  return {
    accessRuleCount: rules?.length ?? 0,
    accessFilterCount: filterCount
  };
}

function normalizeEmbedDataAccessFilter(value: unknown): EmbedDataAccessFilter[] {
  if (!isRecord(value)) return [];
  const column = readString(value.column ?? value.field ?? value.fieldName);
  if (!column) return [];
  const sqlQuery = readString(value.sqlQuery ?? value.query);
  const type = normalizeFilterType(value.type ?? value.filterType, Boolean(sqlQuery));
  const operator = readString(value.operator) ?? (type === 'dynamic' || type === 'sql' ? 'in' : 'equals');
  const filterDataSourceId = readString(value.filterDataSourceId ?? value.filterSourceId);
  return [{
    column,
    operator,
    type,
    ...(filterDataSourceId ? { filterDataSourceId } : {}),
    ...(sqlQuery ? { sqlQuery } : {}),
    ...('value' in value ? { value: value.value } : {}),
    ...(Array.isArray(value.values) ? { values: [...value.values] } : {}),
    ...(isRecord(value.variableDataTypes) ? { variableDataTypes: readVariableDataTypes(value.variableDataTypes) } : {})
  }];
}

async function resolveEmbedDataAccessFilter(
  filter: EmbedDataAccessFilter,
  context: Readonly<Record<string, unknown>>,
  source: DataSourceRecord
): Promise<{ ok: true; filter: EmbedScopeFilter } | { ok: false }> {
  const templateContext = { ...context, ...(filter.templateValues ?? {}) };
  if (filter.type === 'dynamic' || filter.type === 'sql') {
    const values = await resolveDynamicFilterValues(filter, templateContext, source);
    if (!values.ok || values.values.length === 0) return { ok: false };
    return {
      ok: true,
      filter: {
        column: filter.column,
        operator: 'in',
        values: values.values
      }
    };
  }

  const value = resolveTemplateValue(filter.values ?? filter.value, templateContext, filter.variableDataTypes ?? {});
  if (!value.ok) return { ok: false };
  return {
    ok: true,
    filter: {
      column: filter.column,
      operator: filter.operator,
      ...(Array.isArray(value.value) ? { values: value.value } : { value: value.value })
    }
  };
}

async function resolveDynamicFilterValues(
  filter: EmbedDataAccessFilter,
  context: Readonly<Record<string, unknown>>,
  source: DataSourceRecord
): Promise<{ ok: true; values: unknown[] } | { ok: false }> {
  if (!filter.sqlQuery) return { ok: false };
  const populated = substituteSqlTemplates(filter.sqlQuery, context, filter.variableDataTypes ?? {});
  if (!populated.ok) return { ok: false };
  const query = sanitizeReadOnlySelect(populated.value);
  if (validateReadOnlySelect(query)) return { ok: false };

  const targetSourceId = filter.filterDataSourceId ?? source.id;
  const targetSource = findDataSource(targetSourceId);
  if (!targetSource) return { ok: false };

  const result = executeDataSourceSqlQuery({
    dataSourceId: targetSource.id,
    defaultLimit: 100,
    maxLimit: 500,
    query
  });
  if (!result.ok) return { ok: false };

  const firstRow = result.data.rows.find(row => row && typeof row === 'object');
  if (!firstRow) return { ok: false };
  const valueColumn = Object.keys(firstRow)[0];
  if (!valueColumn) return { ok: false };
  const seen = new Set<string>();
  const values: unknown[] = [];
  for (const row of result.data.rows) {
    const raw = row[valueColumn];
    if (raw === null || raw === undefined) continue;
    const key = `${typeof raw}:${String(raw)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(raw);
  }
  return values.length > 0 ? { ok: true, values } : { ok: false };
}

function ruleMatchesTable(source: DataSourceRecord, table: TableDefinition): (rule: EmbedDataAccessRule) => boolean {
  return rule => {
    if (rule.dataSourceId && rule.dataSourceId !== source.id) return false;
    if (rule.tableId && rule.tableId !== table.id) return false;
    if (rule.tableName && rule.tableName !== table.name) return false;
    return true;
  };
}

function substituteSqlTemplates(
  value: string,
  context: Readonly<Record<string, unknown>>,
  variableDataTypes: Readonly<Record<string, string>>
): { ok: true; value: string } | { ok: false } {
  let missing = false;
  const output = value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, name: string) => {
    const variable = name.trim();
    if (!(variable in context)) {
      missing = true;
      return 'null';
    }
    return sqlLiteral(coerceContextValue(context[variable], variableDataTypes[variable]));
  });
  return missing ? { ok: false } : { ok: true, value: output };
}

function resolveTemplateValue(
  value: unknown,
  context: Readonly<Record<string, unknown>>,
  variableDataTypes: Readonly<Record<string, string>>
): { ok: true; value: unknown } | { ok: false } {
  if (Array.isArray(value)) {
    const values: unknown[] = [];
    for (const item of value) {
      const resolved = resolveTemplateValue(item, context, variableDataTypes);
      if (!resolved.ok) return resolved;
      values.push(resolved.value);
    }
    return { ok: true, value: values };
  }
  if (typeof value !== 'string') return { ok: true, value };
  const exact = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(value.trim());
  if (exact?.[1]) {
    const key = exact[1].trim();
    return key in context
      ? { ok: true, value: coerceContextValue(context[key], variableDataTypes[key]) }
      : { ok: false };
  }
  let missing = false;
  const output = value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, name: string) => {
    const key = name.trim();
    if (!(key in context)) {
      missing = true;
      return '';
    }
    return String(coerceContextValue(context[key], variableDataTypes[key]) ?? '');
  });
  return missing ? { ok: false } : { ok: true, value: output };
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function coerceContextValue(value: unknown, dataType: string | undefined): unknown {
  if (!dataType) return value;
  const normalized = dataType.trim().toLowerCase();
  if (['number', 'integer', 'float', 'decimal'].includes(normalized)) {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (normalized === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
  return value;
}

function normalizeContextValue(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.filter(item => ['string', 'number', 'boolean'].includes(typeof item));
  return value;
}

function normalizeFilterType(value: unknown, hasSqlQuery: boolean): 'dynamic' | 'simple' | 'sql' {
  const type = readString(value)?.toLowerCase();
  if (type === 'dynamic' || type === 'sql') return type;
  return hasSqlQuery ? 'dynamic' : 'simple';
}

function readVariableDataTypes(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const dataType = readString(item);
    return dataType ? [[key, dataType]] : [];
  }));
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isSafeContextKey(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_.-]{0,80}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
