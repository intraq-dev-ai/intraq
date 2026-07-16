import type {
  SavedSqlModelTable,
  SqlEditorSavedDataModel,
  SqlEditorSchema
} from './types';

export function sqlDataModelsFromSchema(
  currentSchema: SqlEditorSchema | null,
  dataSourceId: string
): SqlEditorSavedDataModel[] {
  if (!currentSchema || !dataSourceId) return [];
  return currentSchema.tables.flatMap(table => {
    const sqlQuery = typeof table.sqlQuery === 'string' ? table.sqlQuery.trim() : '';
    if (!sqlQuery) return [];
    const id = table.id ?? table.name;
    return [{
      id,
      name: table.name,
      description: table.description,
      baseDataSourceId: dataSourceId,
      query: sqlQuery,
      settings: table.settings ?? {},
      fields: table.columns.map(column => ({
        name: column.name,
        type: column.type,
        description: column.description,
        dictionaryDescription: column.description
      })),
      sqlQuery
    }];
  });
}

export function sqlDataModelFromSavedTable(
  table: SavedSqlModelTable,
  dataSourceId: string
): SqlEditorSavedDataModel {
  const sqlQuery = typeof table.sqlQuery === 'string' ? table.sqlQuery : '';
  return {
    id: table.id,
    name: table.name,
    baseDataSourceId: dataSourceId,
    query: sqlQuery,
    settings: table.settings ?? {},
    fields: table.fields ?? [],
    sqlQuery,
    ...(table.description === undefined ? {} : { description: table.description }),
    ...(table.sampleRows === undefined ? {} : { sampleRows: table.sampleRows })
  };
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function csvFileNameForBaseName(baseName: string): string {
  return `${sanitizeFileToken(baseName)}.csv`;
}

function sanitizeFileToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sql-results';
}

export function downloadCsvFile(csv: string, fileName: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
