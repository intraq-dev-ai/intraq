import type { IntraQPrismaClient } from '@intraq/db';
import { findDataSource } from './foundation-store.js';
import { readDataSourceTableRows } from './source-table-rows.js';
import {
  scopedDataSourceForRead,
  type DataSourceAccessPolicy
} from './source-access.js';
import {
  updateRuntimeDataSource
} from './prisma-runtime-persistence.js';
import type { DataSourceRecord } from './foundation-store.js';
import {
  asPositiveInteger,
  asString,
  isNonEmptyString,
  isRecord
} from './data-source-table-common.js';
import {
  parameterTargetAliases,
  readParameterValues
} from './data-source-table-request-options.js';

export interface DataSourceFieldOptionItem {
  label: string;
  value: string;
}

export type DataSourceFieldOptionsResult =
  | { ok: true; data: { options: DataSourceFieldOptionItem[]; total: number; values: string[] } }
  | { ok: false; statusCode: 400 | 401 | 403 | 404 | 502 | 504; error: string };

export async function readDataSourceFieldOptions(
  dataSourceId: string,
  body: unknown,
  prismaClient: IntraQPrismaClient | null = null,
  access?: DataSourceAccessPolicy
): Promise<DataSourceFieldOptionsResult> {
  const source = findDataSource(dataSourceId);
  const scopedSource = source && access ? scopedDataSourceForRead(source, access) : source;
  if (!source || !scopedSource) {
    return { ok: false, statusCode: 404, error: 'Data source not found' };
  }
  if (!isRecord(body) || !isNonEmptyString(body.tableName) || !isNonEmptyString(body.fieldName)) {
    return { ok: false, statusCode: 400, error: 'Table name and field name are required' };
  }
  const tableName = body.tableName.trim();
  if (!scopedSource.tables.some(table => table.name === tableName || table.id === tableName)) {
    return { ok: false, statusCode: 404, error: 'Data source table not found' };
  }
  const valueField = asString(body.valueField) ?? body.fieldName.trim();
  const labelField = asString(body.labelField ?? body.textField ?? body.displayField) ?? valueField;
  const limit = asPositiveInteger(body.limit) ?? asPositiveInteger(body.defaultLimit) ?? 500;
  const maxLimit = asPositiveInteger(body.maxLimit) ?? Math.max(limit, 500);
  const parameterValues = readParameterValues(body, parameterTargetAliases(dataSourceId, tableName));
  const selectFields = Array.from(new Set([valueField, labelField].filter(isNonEmptyString)));
  const tableRowsResult = await readDataSourceTableRows(dataSourceId, tableName, {
    ...apiRuntimePersistence(prismaClient),
    ...(access ? { access } : {}),
    ...(Object.keys(parameterValues).length > 0 ? { parameterValues } : {}),
    defaultLimit: limit,
    maxLimit,
    selectFields
  });
  if (!tableRowsResult.ok) {
    return {
      ok: false,
      statusCode: tableRowsResult.statusCode as 400 | 401 | 403 | 404 | 502 | 504,
      error: tableRowsResult.error
    };
  }
  const options = uniqueOptionItems(tableRowsResult.data.rows, valueField, labelField);
  return {
    ok: true,
    data: {
      options,
      total: options.length,
      values: options.map(option => option.value)
    }
  };
}

function uniqueOptionItems(
  rows: Array<Record<string, unknown>>,
  valueField: string,
  labelField: string
): DataSourceFieldOptionItem[] {
  const options: DataSourceFieldOptionItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const rawValue = row[valueField];
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    const value = String(rawValue);
    if (seen.has(value)) continue;
    seen.add(value);
    const rawLabel = row[labelField];
    const label = rawLabel === undefined || rawLabel === null || rawLabel === '' ? value : String(rawLabel);
    options.push({ label, value });
  }
  return options;
}

function apiRuntimePersistence(
  prismaClient: IntraQPrismaClient | null
): { persistSourceConfig?: (source: DataSourceRecord) => Promise<void> } {
  return prismaClient
    ? { persistSourceConfig: source => updateRuntimeDataSource(prismaClient, source) }
    : {};
}
