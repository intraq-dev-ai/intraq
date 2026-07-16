import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import { ROW_COUNT_FIELD, type Row } from './foundation-route-types.js';
import {
  findSqlEditorTable,
  type SqlEditorDataSource,
  type SqlEditorTable
} from './sql-editor-data.js';
import { getSqlEditorSchema } from './sql-editor-service.js';

export function lookupSource(dataSourceId: string, access?: DataSourceAccessPolicy): SqlEditorDataSource | null {
  const result = getSqlEditorSchema(dataSourceId.trim(), access);
  return result.ok ? result.data : null;
}

export function lookupTable(
  dataSourceId: string,
  tableName: string,
  access?: DataSourceAccessPolicy
): { source: SqlEditorDataSource; table: SqlEditorTable; rows: Row[] } | null {
  return findSqlEditorTable(dataSourceId, tableName, access) ?? null;
}

export function hasField(table: SqlEditorTable, name: string): boolean {
  return table.columns.some(field => field.name === name);
}

export function hasChartField(table: SqlEditorTable, name: string): boolean {
  return name === ROW_COUNT_FIELD || hasField(table, name);
}
