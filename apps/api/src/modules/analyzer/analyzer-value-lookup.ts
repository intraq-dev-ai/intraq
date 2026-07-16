import { findDataSource } from '../data-source/foundation-store.js';
import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import { executeSqlEditorQuery } from '../sql-chart/sql-editor-service.js';
import { uniqueStrings } from './analyzer-plan-utils.js';
import { analyzerAccessPolicyCacheKey } from './analyzer-access-policy-cache-key.js';
import { lookupDatasetRowsFromTableRuntime } from './analyzer-value-lookup-table-runtime.js';
import {
  buildLookupDatasetQuery,
  buildLookupDatasetSearchQuery
} from './analyzer-value-lookup-query.js';

export { buildLookupDatasetQuery } from './analyzer-value-lookup-query.js';

const LOOKUP_DATASET_CACHE_MAX_ROWS = 1000;
const FIELD_VALUE_RESOLVER_CACHE_MAX_ENTRIES = 500;

export type AnalyzerValueLookupScope = 'client' | 'shared' | 'tenant';

export interface AnalyzerValueLookupConfig {
  cacheTtlMs: number;
  dataSourceId?: string;
  labelField?: string;
  maxRows: number;
  missingScopePolicy?: 'all_accessible' | 'fail';
  parameterPassthrough?: 'all' | 'scope_only';
  scope: AnalyzerValueLookupScope;
  scopeField?: string;
  scopeParameters: string[];
  searchFields: string[];
  tableName: string;
  valueField: string;
}

export interface AnalyzerLookupDatasetRow {
  label?: string;
  searchText: string;
  value: string;
}

interface AnalyzerLookupDatasetCacheEntry {
  expiresAt: number;
  rows: AnalyzerLookupDatasetRow[];
  sourceQuery: string;
}

interface AnalyzerLookupDatasetOptions {
  accessPolicy?: DataSourceAccessPolicy;
  parameterValues?: Record<string, unknown>;
}

export interface AnalyzerLookupDatasetResult {
  cached?: boolean;
  coalesced?: boolean;
  dataSourceId?: string;
  durationMs?: number;
  error?: string;
  executionTime?: number;
  rows?: AnalyzerLookupDatasetRow[];
  sourceQuery?: string;
  success: boolean;
  tableName?: string;
}

const lookupDatasetCache = new Map<string, AnalyzerLookupDatasetCacheEntry>();
const pendingLookupDatasetQueries = new Map<string, Promise<AnalyzerLookupDatasetResult>>();

export async function lookupDatasetRows(
  currentDataSourceId: string,
  config: AnalyzerValueLookupConfig,
  options: AnalyzerLookupDatasetOptions
): Promise<AnalyzerLookupDatasetResult> {
  const startedAt = Date.now();
  const lookupDataSourceId = config.dataSourceId ?? currentDataSourceId;
  const lookupSource = findDataSource(lookupDataSourceId);
  if (!lookupSource) {
    return {
      success: false,
      error: 'Configured lookup data source was not found.',
      dataSourceId: lookupDataSourceId,
      tableName: config.tableName
    };
  }

  const scope = lookupScopeSelection(config, options);
  if (!scope.ok) {
    return {
      success: false,
      error: scope.error,
      dataSourceId: lookupDataSourceId,
      tableName: config.tableName
    };
  }

  const cacheKey = lookupDatasetCacheKey(
    lookupDataSourceId,
    config,
    scope.cacheScope,
    options.accessPolicy,
    options.parameterValues
  );
  const cached = readLookupDatasetCache(cacheKey);
  if (cached) return { ...cached, durationMs: Date.now() - startedAt };
  return coalesceLookupDatasetQuery(cacheKey, startedAt, async () => {
    const tableRuntimeResult = await lookupDatasetRowsFromTableRuntime(
      lookupDataSourceId,
      config,
      options,
      scope.values,
      startedAt
    );
    if (tableRuntimeResult) {
      if (tableRuntimeResult.success) {
        writeLookupDatasetCache(cacheKey, tableRuntimeResult.rows ?? [], tableRuntimeResult.sourceQuery ?? '', config.cacheTtlMs);
      }
      return tableRuntimeResult;
    }

    const query = buildLookupDatasetQuery(lookupSource.type, config, scope.values);
    const executed = await executeSqlEditorQuery(lookupDataSourceId, query, {
      defaultLimit: config.maxRows,
      maxLimit: config.maxRows,
      ...(options.accessPolicy ? { policy: options.accessPolicy } : {}),
      ...(options.parameterValues ? { parameterValues: options.parameterValues } : {})
    });
    if (!executed.ok) {
      return {
        success: false,
        error: executed.error,
        dataSourceId: lookupDataSourceId,
        tableName: config.tableName
      };
    }

    const rows = executed.data.rows
      .map(row => lookupDatasetRowFromSql(row, config.searchFields.length))
      .filter(isLookupDatasetRow);
    writeLookupDatasetCache(cacheKey, rows, query, config.cacheTtlMs);
    return {
      success: true,
      cached: false,
      durationMs: Date.now() - startedAt,
      executionTime: executed.data.executionTime,
      rows,
      sourceQuery: query
    };
  });
}

export async function lookupDatasetSearchRows(
  currentDataSourceId: string,
  config: AnalyzerValueLookupConfig,
  searchVariants: string[],
  options: AnalyzerLookupDatasetOptions
): Promise<AnalyzerLookupDatasetResult> {
  const startedAt = Date.now();
  const lookupDataSourceId = config.dataSourceId ?? currentDataSourceId;
  const lookupSource = findDataSource(lookupDataSourceId);
  if (!lookupSource) {
    return {
      success: false,
      error: 'Configured lookup data source was not found.',
      dataSourceId: lookupDataSourceId,
      tableName: config.tableName
    };
  }

  const scope = lookupScopeSelection(config, options);
  if (!scope.ok) {
    return {
      success: false,
      error: scope.error,
      dataSourceId: lookupDataSourceId,
      tableName: config.tableName
    };
  }

  const tableRuntimeResult = await lookupDatasetRowsFromTableRuntime(
    lookupDataSourceId,
    config,
    options,
    scope.values,
    startedAt,
    searchVariants
  );
  if (tableRuntimeResult) return tableRuntimeResult;

  const query = buildLookupDatasetSearchQuery(lookupSource.type, config, scope.values, searchVariants);
  const executed = await executeSqlEditorQuery(lookupDataSourceId, query, {
    defaultLimit: config.maxRows,
    maxLimit: config.maxRows,
    ...(options.accessPolicy ? { policy: options.accessPolicy } : {}),
    ...(options.parameterValues ? { parameterValues: options.parameterValues } : {})
  });
  if (!executed.ok) {
    return {
      success: false,
      error: executed.error,
      dataSourceId: lookupDataSourceId,
      tableName: config.tableName
    };
  }

  return {
    success: true,
    cached: false,
    durationMs: Date.now() - startedAt,
    executionTime: executed.data.executionTime,
    rows: executed.data.rows
      .map(row => lookupDatasetRowFromSql(row, config.searchFields.length))
      .filter(isLookupDatasetRow),
    sourceQuery: query
  };
}

export function stableLookupConfig(config: AnalyzerValueLookupConfig): Record<string, unknown> {
  return {
    dataSourceId: config.dataSourceId ?? null,
    labelField: config.labelField ?? null,
    maxRows: config.maxRows,
    missingScopePolicy: config.missingScopePolicy ?? 'fail',
    parameterPassthrough: config.parameterPassthrough ?? 'all',
    scope: config.scope,
    scopeField: config.scopeField ?? null,
    scopeParameters: [...config.scopeParameters].sort((left, right) => left.localeCompare(right)),
    searchFields: [...config.searchFields].sort((left, right) => left.localeCompare(right)),
    tableName: config.tableName,
    valueField: config.valueField
  };
}

export function resetAnalyzerLookupDatasetCacheForTest(): void {
  lookupDatasetCache.clear();
  pendingLookupDatasetQueries.clear();
}

export function analyzerLookupDatasetCacheSizeForTest(): number {
  pruneExpiredLookupDatasetCache();
  return lookupDatasetCache.size;
}

export function lookupDatasetMaxRows(): number {
  return LOOKUP_DATASET_CACHE_MAX_ROWS;
}

function lookupScopeSelection(
  config: AnalyzerValueLookupConfig,
  options: AnalyzerLookupDatasetOptions
): { cacheScope: string; ok: true; values: string[] } | { error: string; ok: false } {
  if (config.scope === 'shared') return { cacheScope: 'shared', ok: true, values: [] };
  if (!config.scopeField) {
    return { ok: false, error: `${config.scope} lookup source is missing scopeField.` };
  }
  const values = lookupScopeValues(config, options);
  if (values.length === 0) {
    if (config.missingScopePolicy === 'all_accessible') {
      return {
        cacheScope: JSON.stringify({ scope: config.scope, scopeField: config.scopeField, values: [] }),
        ok: true,
        values: []
      };
    }
    return { ok: false, error: `${config.scope} lookup source is missing scope value.` };
  }
  return {
    cacheScope: JSON.stringify({ scope: config.scope, scopeField: config.scopeField, values }),
    ok: true,
    values
  };
}

function lookupScopeValues(config: AnalyzerValueLookupConfig, options: AnalyzerLookupDatasetOptions): string[] {
  const values = config.scopeParameters.flatMap(parameter => valuesForParameter(options.parameterValues, parameter));
  if (config.scope === 'tenant') {
    const tenantId = options.accessPolicy?.scope?.tenantId;
    if (tenantId) values.push(tenantId);
  }
  return uniqueStrings(values.map(value => value.trim()).filter(Boolean))
    .sort((left, right) => left.localeCompare(right));
}

function valuesForParameter(record: Record<string, unknown> | undefined, key: string): string[] {
  if (!record) return [];
  const value = record[key];
  if (Array.isArray(value)) return value.flatMap(item => primitiveLookupScopeValue(item));
  return primitiveLookupScopeValue(value);
}

function primitiveLookupScopeValue(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)];
  return [];
}

function lookupDatasetRowFromSql(row: Record<string, unknown>, searchFieldCount: number): AnalyzerLookupDatasetRow | null {
  const value = String(row.value ?? '').trim();
  if (!value) return null;
  const label = String(row.label ?? '').trim();
  const searchParts = [
    value,
    label,
    ...Array.from({ length: searchFieldCount }, (_, index) => String(row[`search_${index}`] ?? '').trim())
  ].filter(Boolean);
  return {
    ...(label ? { label } : {}),
    searchText: uniqueStrings(searchParts).join(' '),
    value
  };
}

function isLookupDatasetRow(value: unknown): value is AnalyzerLookupDatasetRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.value === 'string'
    && row.value.trim().length > 0
    && typeof row.searchText === 'string';
}

function readLookupDatasetCache(key: string): AnalyzerLookupDatasetResult | null {
  const cached = lookupDatasetCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    lookupDatasetCache.delete(key);
    return null;
  }
  return {
    success: true,
    cached: true,
    rows: cached.rows,
    sourceQuery: cached.sourceQuery
  };
}

function writeLookupDatasetCache(key: string, rows: AnalyzerLookupDatasetRow[], sourceQuery: string, ttlMs: number): void {
  pruneExpiredLookupDatasetCache();
  if (lookupDatasetCache.size >= FIELD_VALUE_RESOLVER_CACHE_MAX_ENTRIES) {
    const oldestKey = lookupDatasetCache.keys().next().value;
    if (oldestKey) lookupDatasetCache.delete(oldestKey);
  }
  lookupDatasetCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    rows,
    sourceQuery
  });
}

function pruneExpiredLookupDatasetCache(): void {
  const now = Date.now();
  for (const [key, entry] of lookupDatasetCache.entries()) {
    if (entry.expiresAt <= now) lookupDatasetCache.delete(key);
  }
}

function lookupDatasetCacheKey(
  dataSourceId: string,
  config: AnalyzerValueLookupConfig,
  cacheScope: string,
  accessPolicy: DataSourceAccessPolicy | undefined,
  parameterValues: Record<string, unknown> | undefined
): string {
  return JSON.stringify({
    dataSourceId,
    cacheScope,
    config: stableLookupConfig(config),
    accessPolicy: analyzerAccessPolicyCacheKey(accessPolicy),
    parameterValues: stableLookupValue(parameterValues ?? null)
  });
}

async function coalesceLookupDatasetQuery(
  key: string,
  startedAt: number,
  load: () => Promise<AnalyzerLookupDatasetResult>
): Promise<AnalyzerLookupDatasetResult> {
  const pending = pendingLookupDatasetQueries.get(key);
  if (pending) {
    return {
      ...await pending,
      coalesced: true,
      durationMs: Date.now() - startedAt
    };
  }
  const current = load();
  pendingLookupDatasetQueries.set(key, current);
  try {
    return await current;
  } finally {
    if (pendingLookupDatasetQueries.get(key) === current) pendingLookupDatasetQueries.delete(key);
  }
}

function stableLookupValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableLookupValue);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .map(key => [key, stableLookupValue(record[key])]));
}
