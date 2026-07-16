import { referencedTableNames } from '../data-source/query-table-resolution.js';
import type { SqlEditorDataSource } from './sql-editor-data.js';

export function rawTableOnlySqlError(source: SqlEditorDataSource, sql: string): string | null {
  const dataModelNames = findReferencedDataModels(source, sql);
  if (dataModelNames.length === 0) return null;
  return [
    'SQL Editor creates data models from raw source tables only.',
    `Do not query existing data models in SQL: ${dataModelNames.join(', ')}.`,
    'Call list_tables to find raw_table sources and rewrite the query against those raw tables.'
  ].join(' ');
}

export function findReferencedDataModels(source: SqlEditorDataSource, sql: string): string[] {
  const references = referencedTableNames(sql);
  const names = source.tables
    .filter(table => table.targetType === 'data_model')
    .filter(table => references.has(normalizeIdentifier(table.name)))
    .map(table => table.name);
  return Array.from(new Set(names));
}

function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed.slice(1, -1).replaceAll(']]', ']').toLowerCase();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
    return trimmed.slice(1, -1).toLowerCase();
  }
  return trimmed.toLowerCase();
}
