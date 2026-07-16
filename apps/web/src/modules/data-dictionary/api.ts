import type {
  DataDictionaryField,
  DataDictionarySource,
  DataDictionaryTable,
  TableDictionaryDetails
} from './types';

const DATA_SOURCES_PATH = '/api/data-sources';

export async function fetchDataSources(): Promise<DataDictionarySource[]> {
  const payload = await getJson(DATA_SOURCES_PATH);
  if (!Array.isArray(payload)) {
    throw new Error('Data sources response was not an array.');
  }

  return payload.map(normalizeDataSource).filter(isPresent);
}

export async function fetchTablesForSource(sourceId: string): Promise<DataDictionaryTable[]> {
  const payload = await getJson(`${DATA_SOURCES_PATH}/${encodeURIComponent(sourceId)}/tables`);
  const data = unwrapApiData(payload);

  if (!isRecord(data) || !Array.isArray(data.selectedTables)) {
    throw new Error('Tables response did not include selected tables.');
  }

  return data.selectedTables.map(normalizeTable).filter(isPresent);
}

export async function fetchTableDictionary(tableId: string): Promise<TableDictionaryDetails> {
  const payload = await getJson(`${DATA_SOURCES_PATH}/tables/${encodeURIComponent(tableId)}/dictionary`);
  const data = unwrapApiData(payload);

  if (!isRecord(data)) {
    throw new Error('Table dictionary response was not an object.');
  }

  const fields = readFields(data.fields ?? data.columns);
  const tableName = readString(data.name) ?? tableId;
  const businessName = readString(data.businessName) ?? tableName;
  const description =
    readString(data.description) ??
    readString(data.tableDescription) ??
    'No table description is available.';

  return {
    tableId: readString(data.id) ?? tableId,
    tableName,
    businessName,
    description,
    fields
  };
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path, {
    headers: {
      accept: 'application/json'
    }
  });

  const payload = await readResponseJson(response);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload) ?? `Request failed with status ${response.status}.`);
  }

  return payload;
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function unwrapApiData(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  if (payload.success === false) {
    throw new Error(readErrorMessage(payload) ?? 'API request failed.');
  }
  return 'data' in payload ? payload.data : payload;
}

function normalizeDataSource(value: unknown): DataDictionarySource | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  if (!id || !name) return null;

  const source: DataDictionarySource = { id, name, isSample: value.isSample === true, tables: readTables(value.tables) };
  const type = readString(value.type);
  if (type) source.type = type;
  const status = readString(value.status);
  if (status) source.status = status;

  if (isRecord(value.dictionary)) {
    const summary =
      readString(value.dictionary.aiPurpose) ??
      readString(value.dictionary.businessContext) ??
      readString(value.dictionary.description);
    if (summary) source.dictionarySummary = summary;
  }

  return source;
}

function normalizeTable(value: unknown): DataDictionaryTable | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  if (!id || !name) return null;

  const table: DataDictionaryTable = {
    id,
    name,
    description: readString(value.description) ?? '',
    fields: readFields(value.fields ?? value.columns),
    isSelected: value.isSelected === true,
    isDataModel: isDataModelTable(value)
  };

  if (isRecord(value.dictionary)) {
    const businessName = readString(value.dictionary.businessName);
    if (businessName) table.businessName = businessName;

    const dictionaryDescription =
      readString(value.dictionary.description) ??
      readString(value.dictionary.dictionaryDescription);
    if (dictionaryDescription) table.dictionaryDescription = dictionaryDescription;

    table.fields = mergeDictionaryFieldMetadata(table.fields, value.dictionary);
  }

  return table;
}

function readTables(value: unknown): DataDictionaryTable[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeTable).filter(isPresent);
}

function readFields(value: unknown): DataDictionaryField[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeField).filter(isPresent);
}

function normalizeField(value: unknown): DataDictionaryField | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name);
  if (!name) return null;

  const description = readString(value.description) ?? '';
  return {
    name,
    type: readString(value.type) ?? 'unknown',
    description,
    dictionaryDescription: readString(value.dictionaryDescription) ?? description
  };
}

function mergeDictionaryFieldMetadata(
  fields: DataDictionaryField[],
  dictionary: Record<string, unknown>
): DataDictionaryField[] {
  const metadata = readDictionaryFields(dictionary.fields ?? dictionary.columns);
  if (metadata.size === 0) return fields;
  return fields.map(field => {
    const details = metadata.get(field.name);
    if (!details) return field;
    return {
      ...field,
      description: details.description ?? field.description,
      dictionaryDescription: details.dictionaryDescription ?? field.dictionaryDescription
    };
  });
}

function readDictionaryFields(value: unknown): Map<string, Partial<DataDictionaryField>> {
  const fields = new Map<string, Partial<DataDictionaryField>>();
  if (!Array.isArray(value)) return fields;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = readString(item.name);
    if (!name) continue;
    const label = readString(item.label);
    const description = readString(item.description) ?? label ?? undefined;
    const dictionaryDescription = readString(item.dictionaryDescription) ?? description;
    const details: Partial<DataDictionaryField> = {};
    if (description) details.description = description;
    if (dictionaryDescription) details.dictionaryDescription = dictionaryDescription;
    fields.set(name, details);
  }
  return fields;
}

function isDataModelTable(value: Record<string, unknown>): boolean {
  const settings = isRecord(value.settings) ? value.settings : {};
  return settings.isDataModel === true || value.isDataModel === true;
}

function readErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return readString(value.error) ?? readString(value.message);
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
