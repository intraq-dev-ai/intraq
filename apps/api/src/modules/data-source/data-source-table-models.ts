import { uuidv7 } from '@intraq/contracts';
import type { IntraQPrismaClient, Prisma } from '@intraq/db';
import type { FieldDefinition, TableDefinition } from './foundation-store.js';
import {
  asString,
  compactRecord,
  isRecord,
  readRecord
} from './data-source-table-common.js';

export function buildSqlModelTable(body: Record<string, unknown>, tables: TableDefinition[]): TableDefinition | null {
  const label = asString(body.name) ?? asString(body.tableName);
  const query = asString(body.query) ?? asString(body.sqlQuery);
  if (!label || !query) return null;
  const name = slugFromName(asString(body.tableName) ?? label, 'sql_model');
  const existing = tables.find(table => table.name === name || table.id === asString(body.id));
  const sampleRows = Array.isArray(body.sampleRows)
    ? readSampleRows(body.sampleRows)
    : Array.isArray(body.rows)
      ? readSampleRows(body.rows)
      : existing?.sampleRows;
  return {
    id: existing?.id ?? asString(body.id) ?? uuidv7(),
    name,
    description: asString(body.description) ?? existing?.description ?? 'Saved SQL data model.',
    fields: readFields(body.fields ?? body.columns),
    dictionary: {
      ...existing?.dictionary,
      businessName: label,
      description: asString(body.description) ?? '',
      ...readRecord(body.dictionary ?? body.tableDictionary ?? body.modelDictionary)
    },
    settings: {
      ...existing?.settings,
      ...readRecord(body.settings ?? body.tableSettings ?? body.modelSettings),
      ...(Array.isArray(body.parameters) ? { parameters: body.parameters } : {}),
      isDataModel: true
    },
    isSelected: true,
    ...(sampleRows ? { sampleRows } : {}),
    sqlQuery: query
  };
}

export function isApiTableRequest(body: Record<string, unknown>): boolean {
  return isRecord(body.api)
    || isRecord(body.request)
    || isRecord(body.apiRequest)
    || asString(body.endpoint) !== null
    || asString(body.method) !== null
    || asString(body.tableName) !== null && asString(body.query) === null && asString(body.sqlQuery) === null;
}

export function buildApiTable(body: Record<string, unknown>, tables: TableDefinition[]): TableDefinition | null {
  const label = asString(body.name) ?? asString(body.tableName);
  if (!label) return null;
  const requestedId = asString(body.id);
  const requestedTableName = asString(body.tableName);
  const existing = tables.find(table =>
    (requestedId && table.id === requestedId)
    || (requestedTableName && table.name === requestedTableName)
    || table.name === slugFromName(requestedTableName ?? label, 'api_table')
  );
  const name = existing?.name ?? slugFromName(requestedTableName ?? label, 'api_table');
  const existingSettings = readRecord(existing?.settings);
  const existingApi = readRecord(existingSettings.api ?? existingSettings.request);
  const apiInput = {
    ...readRecord(body.api ?? body.request ?? body.apiRequest),
    ...compactRecord({
      body: body.body,
      dataPath: body.dataPath,
      endpoint: body.endpoint,
      headers: body.headers,
      method: body.method,
      queryParams: body.queryParams,
      responseMapping: body.responseMapping
    })
  };
  const api = compactRecord({
    ...existingApi,
    ...apiInput,
    method: (asString(apiInput.method) ?? asString(existingApi.method) ?? 'GET').toUpperCase()
  });
  const hasEndpoint = asString(api.endpoint ?? api.path ?? api.apiEndpoint);
  if (!hasEndpoint) return null;
  const fields = readFields(body.fields ?? body.columns);
  const settingsInput = readRecord(body.settings ?? body.tableSettings);
  const defaults = readRecord(body.defaults ?? settingsInput.defaults);
  const settings = {
    ...existingSettings,
    ...settingsInput,
    ...(Object.keys(defaults).length > 0 ? { defaults } : {}),
    api,
    isDataModel: body.isDataModel === true || settingsInput.isDataModel === true || existingSettings.isDataModel === true
  };
  return {
    id: existing?.id ?? requestedId ?? uuidv7(),
    name,
    description: asString(body.description) ?? existing?.description ?? 'API endpoint table.',
    fields: fields.length > 0 ? fields : existing?.fields ?? [],
    dictionary: {
      ...existing?.dictionary,
      businessName: label,
      description: asString(body.description) ?? asString(existing?.dictionary?.description) ?? '',
      ...readRecord(body.dictionary ?? body.tableDictionary)
    },
    settings,
    isSelected: body.isSelected === false ? false : existing?.isSelected ?? true,
    ...(existing?.sampleRows ? { sampleRows: existing.sampleRows } : {})
  };
}

export async function replaceSampleRowsForTable(
  client: IntraQPrismaClient,
  table: TableDefinition
): Promise<void> {
  if (!table.sampleRows) return;
  await client.sampleDataRow.deleteMany({ where: { tableId: table.id } });
  if (table.sampleRows.length === 0) return;
  const baseTimestamp = Date.now();
  await client.sampleDataRow.createMany({
    data: table.sampleRows.map((row, index) => ({
      id: uuidv7(baseTimestamp + index),
      tableId: table.id,
      data: row as Prisma.InputJsonValue
    }))
  });
}

function readFields(value: unknown): FieldDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string' && item.trim()) {
      return [{ name: item.trim(), type: 'string', description: '', dictionaryDescription: '' }];
    }
    if (!isRecord(item)) return [];
    const name = asString(item.name) ?? asString(item.field);
    if (!name) return [];
    const description = asString(item.description) ?? asString(item.dictionaryDescription) ?? '';
    const aliases = readStringArray(item.aliases);
    const columnType = asString(item.columnType);
    const format = asString(item.format);
    const label = asString(item.label);
    const role = asString(item.role);
    const semanticRole = asString(item.semanticRole);
    const synonyms = readStringArray(item.synonyms);
    return [{
      name,
      type: asString(item.type) ?? 'string',
      description,
      dictionaryDescription: asString(item.dictionaryDescription) ?? description,
      ...(aliases.length > 0 ? { aliases } : {}),
      ...(item.analyzerHidden === true ? { analyzerHidden: true } : {}),
      ...(columnType ? { columnType } : {}),
      ...(format ? { format } : {}),
      ...(item.hiddenFromAnalyzer === true ? { hiddenFromAnalyzer: true } : {}),
      ...(label ? { label } : {}),
      ...(role ? { role } : {}),
      ...(Array.isArray(item.sampleValues) ? { sampleValues: item.sampleValues } : {}),
      ...(semanticRole ? { semanticRole } : {}),
      ...(synonyms.length > 0 ? { synonyms } : {})
    }];
  });
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const text = asString(item);
    return text ? [text] : [];
  });
}

function slugFromName(value: string, fallback: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || fallback;
}

function readSampleRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => isRecord(item) ? [{ ...item }] : []);
}
