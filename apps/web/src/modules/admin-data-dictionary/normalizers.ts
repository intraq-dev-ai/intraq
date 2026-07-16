import type {
  AdminDictionaryField,
  AdminDictionaryMetadataSummary,
  AdminDictionarySource,
  AdminDictionaryTable,
  AdminDictionaryTableDetails
} from './types';

export function normalizeAdminDictionarySources(value: unknown): AdminDictionarySource[] {
  return readCollection(value, 'dataSources').map(normalizeAdminDictionarySource).filter(isPresent);
}

export function normalizeAdminDictionarySource(value: unknown): AdminDictionarySource | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  if (!id || !name) return null;

  const dictionary = readRecord(value.dictionary);
  const config = readRecord(value.config);
  const tables = normalizeAdminDictionaryTables(value.tables);

  return {
    id,
    name,
    type: readString(value.type) ?? readString(value.sourceType) ?? 'source',
    status: readString(value.status) ?? 'unknown',
    description: readDescription(value, config, dictionary),
    dictionary,
    tables,
    tableCount: readNumber(value.tableCount) ?? tables.length
  };
}

export function normalizeAdminDictionaryTables(value: unknown): AdminDictionaryTable[] {
  const data = unwrapData(value);
  if (isRecord(data)) return readTables(data.selectedTables ?? data.tables);
  return readTables(data);
}

export function normalizeAdminDictionaryTableDetails(
  value: unknown,
  fallbackTableId: string
): AdminDictionaryTableDetails {
  const data = unwrapData(value);
  if (!isRecord(data)) throw new Error('Table dictionary response was not an object.');

  const tableName = readString(data.name) ?? readString(data.tableName) ?? fallbackTableId;
  const businessName = readString(data.businessName) ?? tableName;
  const description =
    readString(data.description) ??
    readString(data.tableDescription) ??
    'No dictionary description is available.';

  return {
    tableId: readString(data.id) ?? readString(data.tableId) ?? fallbackTableId,
    tableName,
    businessName,
    description,
    fields: readFields(data.fields ?? data.columns)
  };
}

export function normalizeAdminDictionaryMetadataSummary(value: unknown): AdminDictionaryMetadataSummary {
  const data = unwrapData(value);
  if (!isRecord(data)) throw new Error('Metadata summary response was not an object.');

  const dataSourceId = readString(data.dataSourceId);
  const dataSourceName = readString(data.dataSourceName);
  if (!dataSourceId || !dataSourceName) {
    throw new Error('Metadata summary response was missing source details.');
  }
  const tables = Array.isArray(data.tables) ? data.tables.filter(isRecord) : [];
  const fieldCount = tables.reduce((total, table) => total + (readNumber(table.fieldCount) ?? 0), 0);
  const documentedFields = tables.reduce((total, table) => total + (readNumber(table.describedFields) ?? 0), 0);
  const valueAliasCount = tables.reduce((total, table) => total + (readNumber(table.valueAliasCount) ?? 0), 0);
  const readyTables = tables.filter(table => table.ready === true).length;
  const averageScore = tables.length === 0
    ? 0
    : Math.round(tables.reduce((total, table) => total + (readNumber(table.score) ?? 0), 0) / tables.length);
  const recommendations = tables
    .flatMap(table => [...readStringArray(table.issues), ...readStringArray(table.warnings)])
    .filter((item, index, all) => all.indexOf(item) === index);

  return {
    dataSourceId,
    dataSourceName,
    documentedFields,
    fieldCount,
    overallCoverage: readNumber(data.overallCoverage) ?? readNumber(data.score) ?? averageScore,
    readyTables,
    recommendations,
    status: data.ready === true ? 'ready' : readyTables > 0 ? 'partial' : 'needs metadata',
    tableCount: tables.length,
    valueAliasCount
  };
}

function readTables(value: unknown): AdminDictionaryTable[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeTable).filter(isPresent);
}

function normalizeTable(value: unknown): AdminDictionaryTable | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name) ?? readString(value.tableName);
  const id = readString(value.id) ?? name;
  if (!id || !name) return null;

  const dictionary = readRecord(value.dictionary);
  const settings = readRecord(value.settings);
  const dictionaryFields = readFields(dictionary.fields);
  const fields = mergeDictionaryFields(readFields(value.fields ?? value.columns), dictionaryFields);
  const table: AdminDictionaryTable = {
    id,
    name,
    description: readString(value.description) ?? readString(value.tableDescription) ?? '',
    fields,
    isSelected: value.isSelected !== false,
    isDataModel: settings.isDataModel === true || value.isDataModel === true,
    issues: readIssueList(value.issues)
  };
  const recordCount = readNumber(value.recordCount);
  if (recordCount !== null) table.recordCount = recordCount;
  const lastUpdated = readString(value.lastUpdated) ?? readString(value.updatedAt);
  if (lastUpdated) table.lastUpdated = lastUpdated;

  const businessName = readString(dictionary.businessName);
  if (businessName) table.businessName = businessName;
  const category = readString(value.category) ?? readString(dictionary.category);
  if (category) table.category = category;
  const dictionaryDescription = readString(dictionary.description) ?? readString(dictionary.dictionaryDescription);
  if (dictionaryDescription) table.dictionaryDescription = dictionaryDescription;
  return table;
}

function readFields(value: unknown): AdminDictionaryField[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeField).filter(isPresent);
}

function normalizeField(value: unknown): AdminDictionaryField | null {
  if (typeof value === 'string' && value.trim()) {
    return { name: value.trim(), type: 'string', description: '', dictionaryDescription: '' };
  }
  if (!isRecord(value)) return null;
  const name = readString(value.name) ?? readString(value.field);
  if (!name) return null;

  const description = readString(value.description) ?? readString(value.dictionaryDescription) ?? '';
  const field: AdminDictionaryField = {
    name,
    type: readString(value.type) ?? readString(value.columnType) ?? 'string',
    description,
    dictionaryDescription: readString(value.dictionaryDescription) ?? description
  };
  const label = readString(value.label);
  if (label) field.label = label;
  return field;
}

function mergeDictionaryFields(
  fields: AdminDictionaryField[],
  dictionaryFields: AdminDictionaryField[]
): AdminDictionaryField[] {
  if (dictionaryFields.length === 0) return fields;
  const dictionaryByName = new Map(dictionaryFields.map(field => [field.name, field]));
  const mergedFields = fields.map(field => {
    const dictionaryField = dictionaryByName.get(field.name);
    if (!dictionaryField) return field;
    const mergedField: AdminDictionaryField = {
      ...field,
      dictionaryDescription: dictionaryField.dictionaryDescription || field.dictionaryDescription,
      description: field.description || dictionaryField.description,
      type: field.type || dictionaryField.type
    };
    const label = dictionaryField.label ?? field.label;
    if (label) mergedField.label = label;
    return mergedField;
  });
  const existingNames = new Set(mergedFields.map(field => field.name));
  return [
    ...mergedFields,
    ...dictionaryFields.filter(field => !existingNames.has(field.name))
  ];
}

function readIssueList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
    if (!isRecord(item)) return [];
    const message = readString(item.message) ?? readString(item.description) ?? readString(item.name);
    return message ? [message] : [];
  });
}

function readDescription(
  value: Record<string, unknown>,
  config: Record<string, unknown>,
  dictionary: Record<string, unknown>
): string {
  return readString(value.description) ??
    readString(dictionary.description) ??
    readString(dictionary.aiPurpose) ??
    readString(dictionary.businessContext) ??
    readString(config.description) ??
    '';
}

function readCollection(value: unknown, key: string): unknown[] {
  const data = unwrapData(value);
  if (Array.isArray(data)) return data;
  if (isRecord(data) && Array.isArray(data[key])) return data[key];
  return [];
}

function unwrapData(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return 'data' in value ? value.data : value;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const text = readString(item);
    return text ? [text] : [];
  });
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}
