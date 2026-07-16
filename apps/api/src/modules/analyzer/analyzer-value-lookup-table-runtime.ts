import {
  findDataSource,
  findTableInDataSource,
  type TableDefinition
} from '../data-source/foundation-store.js';
import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import { readDataSourceTableRows } from '../data-source/source-table-rows.js';
import { executeSqlEditorQuery } from '../sql-chart/sql-editor-service.js';
import { uniqueStrings } from './analyzer-plan-utils.js';
import {
  buildLookupDatasetQuery,
  buildLookupDatasetBroadSearchQuery,
  buildLookupDatasetSearchQuery
} from './analyzer-value-lookup-query.js';
import type {
  AnalyzerLookupDatasetResult,
  AnalyzerLookupDatasetRow,
  AnalyzerValueLookupConfig
} from './analyzer-value-lookup.js';

interface AnalyzerLookupDatasetOptions {
  accessPolicy?: DataSourceAccessPolicy;
  parameterValues?: Record<string, unknown>;
}

export async function lookupDatasetRowsFromTableRuntime(
  dataSourceId: string,
  config: AnalyzerValueLookupConfig,
  options: AnalyzerLookupDatasetOptions,
  scopeValues: string[],
  startedAt: number,
  searchVariants?: string[]
): Promise<AnalyzerLookupDatasetResult | null> {
  const source = findDataSource(dataSourceId);
  const table = findTableInDataSource(dataSourceId, config.tableName)?.table;
  if (!source || !shouldReadLookupWithTableRuntime(table)) return null;
  if (Array.isArray(searchVariants) && searchVariants.length > 0) {
    const query = buildLookupDatasetSearchQuery(source.type, config, scopeValues, searchVariants);
    const result = await executeSqlEditorQuery(dataSourceId, query, {
      ...(options.accessPolicy ? { policy: options.accessPolicy } : {}),
      ...(options.parameterValues ? { parameterValues: options.parameterValues } : {}),
      defaultLimit: config.maxRows,
      maxLimit: config.maxRows
    });
    if (!result.ok) {
      return {
        success: false,
        error: result.error,
        dataSourceId,
        tableName: config.tableName
      };
    }
    const rows = result.data.rows
      .map(row => lookupDatasetRowFromQueryRow(row, config))
      .filter(isLookupDatasetRow);
    if (rows.length > 0) {
      return {
        success: true,
        cached: false,
        durationMs: Date.now() - startedAt,
        executionTime: result.data.executionTime,
        rows,
        sourceQuery: result.data.query
      };
    }

    const broadQuery = buildLookupDatasetBroadSearchQuery(source.type, config, scopeValues, searchVariants);
    const broadResult = await executeSqlEditorQuery(dataSourceId, broadQuery, {
      ...(options.accessPolicy ? { policy: options.accessPolicy } : {}),
      ...(options.parameterValues ? { parameterValues: options.parameterValues } : {}),
      defaultLimit: config.maxRows,
      maxLimit: config.maxRows
    });
    if (!broadResult.ok) {
      return {
        success: false,
        error: broadResult.error,
        dataSourceId,
        tableName: config.tableName
      };
    }
    const broadRows = broadResult.data.rows
      .map(row => lookupDatasetRowFromQueryRow(row, config))
      .filter(isLookupDatasetRow);
    if (broadRows.length > 0) {
      return {
        success: true,
        cached: false,
        durationMs: Date.now() - startedAt,
        executionTime: broadResult.data.executionTime,
        rows: broadRows,
        sourceQuery: broadResult.data.query
      };
    }

    const scopedQuery = buildLookupDatasetQuery(source.type, config, scopeValues);
    const scopedResult = await executeSqlEditorQuery(dataSourceId, scopedQuery, {
      ...(options.accessPolicy ? { policy: options.accessPolicy } : {}),
      ...(options.parameterValues ? { parameterValues: options.parameterValues } : {}),
      defaultLimit: config.maxRows,
      maxLimit: config.maxRows
    });
    if (!scopedResult.ok) {
      return {
        success: false,
        error: scopedResult.error,
        dataSourceId,
        tableName: config.tableName
      };
    }
    const scopedRows = scopedResult.data.rows
      .map(row => lookupDatasetRowFromQueryRow(row, config))
      .filter(isLookupDatasetRow);
    return {
      success: true,
      cached: false,
      durationMs: Date.now() - startedAt,
      executionTime: scopedResult.data.executionTime,
      rows: scopedRows,
      sourceQuery: scopedResult.data.query
    };
  }
  const selectedFields = lookupRuntimeSelectedFields(config);
  const result = await readDataSourceTableRows(dataSourceId, config.tableName, {
    ...(options.accessPolicy ? { access: options.accessPolicy } : {}),
    ...(options.parameterValues ? { parameterValues: options.parameterValues } : {}),
    defaultLimit: config.maxRows,
    maxLimit: config.maxRows,
    pageSize: config.maxRows,
    selectFields: selectedFields
  });
  if (!result.ok) {
    return {
      success: false,
      error: result.error,
      dataSourceId,
      tableName: config.tableName
    };
  }
  const rows = result.data.rows
    .filter(row => rowMatchesLookupScope(row, config, scopeValues))
    .map(row => lookupDatasetRowFromNamedFields(row, config))
    .filter(isLookupDatasetRow);
  return {
    success: true,
    cached: false,
    durationMs: Date.now() - startedAt,
    executionTime: result.data.executionTime,
    rows,
    sourceQuery: result.data.query
  };
}

function shouldReadLookupWithTableRuntime(table: TableDefinition | undefined): boolean {
  return typeof table?.sqlQuery === 'string' && table.sqlQuery.trim().length > 0;
}

function lookupRuntimeSelectedFields(config: AnalyzerValueLookupConfig): string[] {
  return uniqueStrings([
    config.valueField,
    config.labelField,
    ...config.searchFields,
    config.scopeField
  ].filter((value): value is string => Boolean(value)));
}

function rowMatchesLookupScope(
  row: Record<string, unknown>,
  config: AnalyzerValueLookupConfig,
  scopeValues: string[]
): boolean {
  if (!config.scopeField || scopeValues.length === 0) return true;
  const value = row[config.scopeField];
  if (value === null || value === undefined) return false;
  return scopeValues.includes(String(value).trim());
}

function lookupDatasetRowFromNamedFields(
  row: Record<string, unknown>,
  config: AnalyzerValueLookupConfig
): AnalyzerLookupDatasetRow | null {
  const value = String(row[config.valueField] ?? '').trim();
  if (!value) return null;
  const label = config.labelField ? String(row[config.labelField] ?? '').trim() : '';
  const searchParts = [
    value,
    label,
    ...config.searchFields.map(field => String(row[field] ?? '').trim())
  ].filter(Boolean);
  return {
    ...(label ? { label } : {}),
    searchText: uniqueStrings(searchParts).join(' '),
    value
  };
}

function lookupDatasetRowFromQueryRow(
  row: Record<string, unknown>,
  config: AnalyzerValueLookupConfig
): AnalyzerLookupDatasetRow | null {
  const value = String(row.value ?? '').trim();
  if (!value) return null;
  const label = String(row.label ?? '').trim();
  const searchParts = [
    value,
    label,
    ...config.searchFields
      .filter(field => field !== config.valueField && field !== config.labelField)
      .slice(0, 6)
      .map((_, index) => String(row[`search_${index}`] ?? '').trim())
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
