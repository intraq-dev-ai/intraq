import {
  dataSources,
  findDataSource,
  rowsForTable,
  toLabel,
  type FieldDefinition as SourceFieldDefinition,
  type TableDefinition
} from '../data-source/foundation-store.js';
import {
  scopedDataSourceForRead,
  scopedDataSourcesForRead,
  type DataSourceAccessPolicy
} from '../data-source/source-access.js';

export type SqlEditorCell = string | number | boolean | null;
export type SqlEditorRow = Record<string, SqlEditorCell>;

export interface SqlEditorColumn {
  name: string;
  label: string;
  type: 'date' | 'number' | 'string' | 'boolean';
  description: string;
}

export interface SqlEditorTable {
  id?: string;
  name: string;
  description: string;
  guidance: string[];
  hasSqlQuery: boolean;
  isDataModel: boolean;
  rowCount: number;
  settings?: Record<string, unknown>;
  sqlQuery?: string | null;
  targetType: 'data_model' | 'raw_table';
  columns: SqlEditorColumn[];
}

export interface SqlEditorDataSource {
  id: string;
  name: string;
  type: string;
  status: string;
  tables: SqlEditorTable[];
}

export interface SqlEditorSourceSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  tableCount: number;
}

export function sqlEditorDataSources(policy?: DataSourceAccessPolicy): SqlEditorDataSource[] {
  const sources = policy ? scopedDataSourcesForRead(dataSources, policy) : dataSources;
  return sources.filter(isSqlEditorVisibleSource).map(source => ({
    id: source.id,
    name: source.name,
    type: source.type,
    status: source.status,
    tables: source.tables.map(table => toSqlEditorTable(source.id, table))
  }));
}

export function findSqlEditorDataSource(
  dataSourceId: string,
  policy?: DataSourceAccessPolicy
): SqlEditorDataSource | undefined {
  const source = dataSources.find(item => item.id === dataSourceId);
  const scopedSource = source && policy ? scopedDataSourceForRead(source, policy) : source;
  return scopedSource ? toSqlEditorDataSource(scopedSource) : undefined;
}

export function findSqlEditorTable(
  dataSourceId: string,
  tableIdOrName: string,
  policy?: DataSourceAccessPolicy
): { source: SqlEditorDataSource; table: SqlEditorTable; rows: SqlEditorRow[] } | undefined {
  const source = findDataSource(dataSourceId);
  const scopedSource = source && policy ? scopedDataSourceForRead(source, policy) : source;
  if (!source || !scopedSource) return undefined;
  const table = scopedSource.tables.find(item => item.id === tableIdOrName || item.name === tableIdOrName);
  if (!table) return undefined;
  const rows = sqlEditorRows(scopedSource.id, table.name);
  const editorTable = toSqlEditorTable(scopedSource.id, table, rows);
  return {
    source: {
      id: scopedSource.id,
      name: scopedSource.name,
      type: scopedSource.type,
      status: scopedSource.status,
      tables: [editorTable]
    },
    table: editorTable,
    rows
  };
}

export function sqlEditorRows(dataSourceId: string, tableName: string): SqlEditorRow[] {
  return rowsForTable(dataSourceId, tableName).map(row => {
    const projected: SqlEditorRow = {};
    for (const [key, value] of Object.entries(row)) projected[key] = toSqlEditorCell(value);
    return projected;
  });
}

function toSqlEditorTable(dataSourceId: string, table: TableDefinition, rows = sqlEditorRows(dataSourceId, table.name)): SqlEditorTable {
  return {
    id: table.id,
    name: table.name,
    description: table.description,
    guidance: tableGuidance(table),
    hasSqlQuery: typeof table.sqlQuery === 'string' && table.sqlQuery.trim().length > 0,
    isDataModel: table.settings?.isDataModel === true,
    rowCount: readTableRowCount(table) ?? rows.length,
    settings: table.settings ?? {},
    sqlQuery: table.sqlQuery ?? null,
    targetType: table.settings?.isDataModel === true ? 'data_model' : 'raw_table',
    columns: table.fields.length > 0 ? table.fields.map(toColumn) : inferColumns(rows)
  };
}

function toSqlEditorDataSource(source: typeof dataSources[number]): SqlEditorDataSource {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    status: source.status,
    tables: source.tables.map(table => toSqlEditorTable(source.id, table))
  };
}

function isSqlEditorVisibleSource(source: typeof dataSources[number]): boolean {
  return source.type !== 'api' && !source.name.toLowerCase().startsWith('api endpoint');
}

function tableGuidance(table: TableDefinition): string[] {
  const guidance: string[] = [];
  addGuidance(guidance, table.dictionary.businessPurpose);
  addGuidance(guidance, table.dictionary.aiPurpose);
  addGuidance(guidance, table.dictionary.aiKeyRules);
  addGuidance(guidance, table.dictionary.aiCommonMistakes);
  addGuidance(guidance, table.dictionary.aiImportantNotes);

  const ai = isRecord(table.dictionary.ai) ? table.dictionary.ai : {};
  addGuidance(guidance, ai.keyRules);
  addGuidance(guidance, ai.commonMistakes);
  addGuidance(guidance, ai.importantNotes);

  addGuidance(guidance, table.settings?.grain, 'Row grain');
  addGuidance(guidance, table.settings?.primaryTimeField, 'Primary time field');

  return Array.from(new Set(guidance));
}

function addGuidance(items: string[], value: unknown, label?: string): void {
  const text = typeof value === 'string'
    ? value.trim()
    : Array.isArray(value)
      ? value.filter(item => typeof item === 'string' && item.trim()).join('; ')
      : '';
  if (!text) return;
  items.push(label ? `${label}: ${text}` : text);
}

function toColumn(field: SourceFieldDefinition): SqlEditorColumn {
  return {
    name: field.name,
    label: toLabel(field.name),
    type: normalizeColumnType(field.type),
    description: field.description || field.dictionaryDescription || `${toLabel(field.name)} field`
  };
}

function inferColumns(rows: SqlEditorRow[]): SqlEditorColumn[] {
  const sample = rows[0] ?? {};
  return Object.entries(sample).map(([name, value]) => ({
    name,
    label: toLabel(name),
    type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : looksLikeDate(value) ? 'date' : 'string',
    description: `${toLabel(name)} field`
  }));
}

function normalizeColumnType(value: string): SqlEditorColumn['type'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('date') || normalized.includes('time')) return 'date';
  if (['number', 'numeric', 'decimal', 'float', 'double', 'integer', 'int', 'bigint'].some(item => normalized.includes(item))) {
    return 'number';
  }
  if (normalized.includes('bool')) return 'boolean';
  return 'string';
}

function toSqlEditorCell(value: unknown): SqlEditorCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function looksLikeDate(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);
}

function readTableRowCount(table: TableDefinition): number | null {
  const rawSchema = isRecord(table.dictionary.rawSchema) ? table.dictionary.rawSchema : null;
  const candidate = rawSchema?.rowCount;
  if (typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0) return candidate;
  if (typeof candidate === 'string') {
    const parsed = Number(candidate);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
