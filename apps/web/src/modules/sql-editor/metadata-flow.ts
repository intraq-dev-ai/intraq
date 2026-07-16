import { fetchTableDictionary } from './api';
import { metadataColumnsFromSavedFields } from './workflow';

export interface SqlEditorMetadataField {
  description?: string;
  dictionaryDescription?: string;
  name: string;
  type: string;
}

export interface SqlEditorMetadataInitialValues {
  columns: Array<{ name: string; type: string; columnType: string; dictionaryDescription: string }>;
  dataModelDefinition: string;
}

export async function buildMetadataInitialValues(
  tableId: string,
  fields: SqlEditorMetadataField[],
  fallbackDefinition: string
): Promise<SqlEditorMetadataInitialValues> {
  const currentColumns = metadataColumnsFromSavedFields(fields);
  try {
    const dictionary = await fetchTableDictionary(tableId);
    const existingColumns = dictionaryColumns(dictionary);
    const columns = currentColumns.map(column => {
      const existing = existingColumns.get(column.name);
      return {
        ...column,
        columnType: existing?.columnType || column.columnType,
        dictionaryDescription: existing?.dictionaryDescription || column.dictionaryDescription
      };
    });
    return {
      dataModelDefinition: String(dictionary.description ?? dictionary.tableDescription ?? fallbackDefinition),
      columns
    };
  } catch {
    return { dataModelDefinition: fallbackDefinition, columns: currentColumns };
  }
}

function dictionaryColumns(dictionary: Record<string, unknown>): Map<string, { columnType: string; dictionaryDescription: string }> {
  const columns = Array.isArray(dictionary.fields)
    ? dictionary.fields
    : Array.isArray(dictionary.columns) ? dictionary.columns : [];
  return new Map(columns.flatMap(item => {
    if (!isRecord(item) || typeof item.name !== 'string') return [];
    return [[item.name, {
      columnType: typeof item.columnType === 'string' ? item.columnType : '',
      dictionaryDescription: typeof item.dictionaryDescription === 'string'
        ? item.dictionaryDescription
        : typeof item.description === 'string' ? item.description : ''
    }]];
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
