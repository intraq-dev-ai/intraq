import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail, uuidv7 } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import {
  buildDataSource,
  dataSources,
  findDataSource,
  type DataSourceRecord,
  type FieldDefinition,
  type TableDefinition
} from './foundation-store.js';
import {
  createRuntimeDataSource,
  deleteRuntimeDataSource,
  replaceRuntimeDataSourceTables,
  replaceRuntimeSampleRowsForTable,
  updateRuntimeDataSource
} from './prisma-runtime-persistence.js';
import {
  applyCreateScope,
  canReadDataSource,
  canWriteDataSource,
  scopedDataSourcesForRead,
  type DataSourceAccessPolicy
} from './source-access.js';

export type CustomQueryMutationResult =
  | { ok: true; source: DataSourceRecord }
  | { ok: false; error: string; statusCode: 400 | 403 };

export async function createCustomQueryDataSource(input: {
  access: DataSourceAccessPolicy;
  body: Record<string, unknown>;
  prismaClient?: IntraQPrismaClient | null;
}): Promise<CustomQueryMutationResult> {
  const { access, body, prismaClient = null } = input;
  if (!isNonEmptyString(body.name) || !isNonEmptyString(body.query)) {
    return { ok: false, statusCode: 400, error: 'name and query are required' };
  }
  const baseDataSourceId = readBaseDataSourceId(body);
  const baseSource = baseDataSourceId ? findDataSource(baseDataSourceId) : undefined;
  if (!baseSource || !canWriteDataSource(baseSource, access)) {
    return { ok: false, statusCode: 403, error: 'Base data source not found or access denied' };
  }
  const source = buildCustomQueryDataSource(body, access, baseDataSourceId);
  dataSources.push(source);
  if (prismaClient) await createRuntimeDataSource(prismaClient, source);
  return { ok: true, source };
}

export class CustomQueryRoutes {
  constructor(private readonly prismaClient: IntraQPrismaClient | null = null) {}

  async handleCollection(req: IncomingMessage, res: ServerResponse, access: DataSourceAccessPolicy): Promise<void> {
    if (req.method === 'GET') {
      sendOk(res, { dataSources: scopedDataSourcesForRead(dataSources.filter(source => source.sourceType === 'custom_query'), access) });
      return;
    }
    if (req.method === 'POST') {
      await this.create(req, res, access);
      return;
    }
    sendJson(res, 405, fail('Method not allowed'));
  }

  async handleItem(req: IncomingMessage, res: ServerResponse, id: string, access: DataSourceAccessPolicy): Promise<void> {
    const source = findDataSource(id);
    if (!source || source.sourceType !== 'custom_query' || !canReadDataSource(source, access)) {
      sendJson(res, 404, fail('Custom query data source not found'));
      return;
    }
    if (req.method === 'GET') {
      sendOk(res, source);
      return;
    }
    if (req.method === 'DELETE') {
      if (!canWriteDataSource(source, access)) {
        sendJson(res, 403, fail('Data source access is denied'));
        return;
      }
      if (this.prismaClient) await deleteRuntimeDataSource(this.prismaClient, id);
      const index = dataSources.indexOf(source);
      if (index >= 0) dataSources.splice(index, 1);
      sendOk(res, { message: 'Custom query data source deleted successfully', id });
      return;
    }
    if (req.method !== 'PUT') {
      sendJson(res, 405, fail('Method not allowed'));
      return;
    }
    await this.update(req, res, source, access);
  }

  private async create(req: IncomingMessage, res: ServerResponse, access: DataSourceAccessPolicy): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendBadRequest(res, 'name and query are required');
      return;
    }
    const result = await createCustomQueryDataSource({ access, body, prismaClient: this.prismaClient });
    if (!result.ok) {
      if (result.statusCode === 400) sendBadRequest(res, result.error);
      else sendJson(res, result.statusCode, fail(result.error));
      return;
    }
    sendOk(res, result.source);
  }

  private async update(req: IncomingMessage, res: ServerResponse, source: DataSourceRecord, access: DataSourceAccessPolicy): Promise<void> {
    if (!canWriteDataSource(source, access)) {
      sendJson(res, 403, fail('Data source access is denied'));
      return;
    }
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.name) || !isNonEmptyString(body.query)) {
      sendBadRequest(res, 'name and query are required');
      return;
    }
    const baseDataSourceId = readBaseDataSourceId(body) ?? asString(source.config.baseDataSourceId) ?? source.baseDataSourceId;
    const baseSource = baseDataSourceId ? findDataSource(baseDataSourceId) : undefined;
    if (!baseSource || !canWriteDataSource(baseSource, access)) {
      sendJson(res, 403, fail('Base data source not found or access denied'));
      return;
    }
    applyCustomQueryUpdate(source, body);
    if (this.prismaClient) {
      await updateRuntimeDataSource(this.prismaClient, source);
      await replaceRuntimeDataSourceTables(this.prismaClient, source);
      if (source.tables[0]) await replaceRuntimeSampleRowsForTable(this.prismaClient, source.tables[0]);
    }
    sendOk(res, source);
  }
}

function customQueryConfig(body: Record<string, unknown>, baseDataSourceId?: string): Record<string, unknown> {
  return {
    ...(isRecord(body.config) ? body.config : {}),
    ...(baseDataSourceId ? { baseDataSourceId } : {}),
    query: String(body.query).trim()
  };
}

function buildCustomQueryDataSource(
  body: Record<string, unknown>,
  access: DataSourceAccessPolicy,
  baseDataSourceId?: string
): DataSourceRecord {
  const source = applyCreateScope(buildDataSource({ name: body.name, type: 'custom_query' }, 'custom_query'), access);
  const fields = fieldsForCustomQuery(body.query, baseDataSourceId, body.fields ?? body.columns);
  const sampleRows = readSampleRows(body.sampleRows ?? body.rows);
  const tableName = slugFromName(body.name, 'custom_query');
  source.sourceType = 'custom_query';
  source.isSample = false;
  source.dictionary = {
    description: asString(body.description) ?? 'Saved SQL data model.',
    ...readRecord(body.dictionary)
  };
  source.config = customQueryConfig(body, baseDataSourceId);
  if (baseDataSourceId) source.baseDataSourceId = baseDataSourceId;
  source.query = String(body.query).trim();
  source.settings = {
    ...(isRecord(body.settings) ? body.settings : {}),
    parameters: Array.isArray(body.parameters) ? body.parameters : []
  };
  source.tables = [{
    id: uuidv7(),
    name: tableName,
    description: asString(body.description) ?? 'Saved SQL data model.',
    fields,
    dictionary: {
      businessName: String(body.name).trim(),
      description: asString(body.description) ?? '',
      ...readRecord(body.tableDictionary ?? body.modelDictionary)
    },
    settings: {
      ...readRecord(body.tableSettings ?? body.modelSettings),
      isDataModel: true
    },
    isSelected: true,
    ...(sampleRows === undefined ? {} : { sampleRows }),
    sqlQuery: String(body.query).trim()
  }];
  return source;
}

function applyCustomQueryUpdate(source: DataSourceRecord, body: Record<string, unknown>): void {
  const name = asString(body.name);
  const query = asString(body.query);
  if (!name || !query) return;
  source.name = name;
  if (isNonEmptyString(body.description)) source.dictionary.description = body.description.trim();
  if (isRecord(body.dictionary)) source.dictionary = { ...source.dictionary, ...body.dictionary };
  source.type = 'custom_query';
  const baseDataSourceId = readBaseDataSourceId(body) ?? asString(source.config.baseDataSourceId) ?? source.baseDataSourceId;
  source.config = customQueryConfig(body, baseDataSourceId);
  if (baseDataSourceId) {
    source.baseDataSourceId = baseDataSourceId;
  } else {
    delete source.baseDataSourceId;
  }
  source.query = query;
  if (isRecord(body.settings)) source.settings = { ...source.settings, ...body.settings };
  if (Array.isArray(body.parameters)) source.settings.parameters = body.parameters;
  const table = source.tables[0] ?? {
    id: uuidv7(),
    name: slugFromName(name, 'custom_query'),
    description: 'Saved SQL data model.',
    fields: [],
    dictionary: {},
    settings: { isDataModel: true },
    isSelected: true,
    sqlQuery: query
  };
  table.description = asString(body.description) ?? table.description;
  table.fields = fieldsForCustomQuery(query, baseDataSourceId, body.fields ?? body.columns);
  table.dictionary = {
    ...table.dictionary,
    businessName: name,
    description: asString(body.description) ?? asString(table.dictionary.description) ?? '',
    ...readRecord(body.tableDictionary ?? body.modelDictionary)
  };
  table.settings = {
    ...table.settings,
    ...readRecord(body.tableSettings ?? body.modelSettings),
    isDataModel: true
  };
  const sampleRows = readSampleRows(body.sampleRows ?? body.rows);
  if (sampleRows !== undefined) table.sampleRows = sampleRows;
  table.sqlQuery = query;
  if (!source.tables[0]) source.tables = [table];
}

function readBaseDataSourceId(body: Record<string, unknown>): string | undefined {
  const configBaseId = isRecord(body.config) ? asString(body.config.baseDataSourceId) : null;
  return asString(body.baseDataSourceId) ?? configBaseId ?? undefined;
}

function fieldsForCustomQuery(query: unknown, baseDataSourceId: string | undefined, override?: unknown): Array<{
  name: string;
  type: string;
  description: string;
  dictionaryDescription: string;
}> {
  const configuredFields = readConfiguredFields(override);
  if (configuredFields.length > 0) return configuredFields;
  const baseSource = baseDataSourceId ? findDataSource(baseDataSourceId) : undefined;
  const baseFields = baseFieldsForCustomQuery(String(query), baseSource);
  const selectedNames = inferColumnsFromSelect(String(query));
  const selectedFields = selectedNames.length > 0
    ? selectedNames.map(name => baseFields.find(field => field.name === name) ?? { name, type: 'string' })
    : baseFields;
  const fields = selectedFields.length > 0 ? selectedFields : [{ name: 'result_value', type: 'string' }];
  return fields.map(field => ({
    name: field.name,
    type: field.type,
    description: `${field.name} returned by the saved SQL data model.`,
    dictionaryDescription: `${field.name} returned by the saved SQL data model.`
  }));
}

function baseFieldsForCustomQuery(query: string, baseSource: DataSourceRecord | undefined): FieldDefinition[] {
  if (!baseSource) return [];
  const referencedTables = inferReferencedTableNames(query)
    .map(tableName => findTableByName(baseSource, tableName))
    .filter((table): table is TableDefinition => Boolean(table));
  const candidateTables = referencedTables.length > 0
    ? referencedTables
    : baseSource.tables.filter(table => table.isSelected);
  return candidateTables.flatMap(table => table.fields);
}

function inferReferencedTableNames(query: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const tableReferencePattern = /\b(?:from|join)\s+((?:"[^"]+"|`[^`]+`|[a-z_][a-z0-9_]*)(?:\.(?:"[^"]+"|`[^`]+`|[a-z_][a-z0-9_]*))?)/gi;
  for (const match of query.matchAll(tableReferencePattern)) {
    const rawName = match[1];
    if (!rawName) continue;
    const tableName = unquoteIdentifier(rawName.split('.').pop() ?? rawName);
    const key = tableName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(tableName);
  }
  return names;
}

function findTableByName(source: DataSourceRecord, name: string): TableDefinition | undefined {
  const normalized = name.toLowerCase();
  return source.tables.find(table => table.name.toLowerCase() === normalized || table.id.toLowerCase() === normalized);
}

function inferColumnsFromSelect(query: string): string[] {
  const match = /^select\s+(.+?)\s+from\s+/is.exec(query.trim());
  if (!match?.[1] || match[1].trim() === '*') return [];
  return match[1]
    .split(',')
    .map(inferOutputColumnName)
    .filter(Boolean);
}

function inferOutputColumnName(column: string): string {
  const trimmed = column.trim();
  const aliasMatch = /\s+as\s+("[^"]+"|`[^`]+`|[a-z_][a-z0-9_]*)$/i.exec(trimmed);
  if (aliasMatch?.[1]) return unquoteIdentifier(aliasMatch[1]);
  const simpleName = trimmed.split('.').pop() ?? '';
  return unquoteIdentifier(simpleName);
}

function readConfiguredFields(value: unknown): Array<{
  name: string;
  type: string;
  description: string;
  dictionaryDescription: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const name = asString(item.name) ?? asString(item.field);
    if (!name) return [];
    const description = asString(item.description) ?? asString(item.dictionaryDescription) ?? '';
    return [{
      name,
      type: asString(item.type) ?? 'string',
      description,
      dictionaryDescription: asString(item.dictionaryDescription) ?? description
    }];
  });
}

function readSampleRows(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap(item => isRecord(item) ? [{ ...item }] : []);
}

function unquoteIdentifier(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('`') && trimmed.endsWith('`')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function slugFromName(value: unknown, fallback: string): string {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || fallback;
}

function asString(value: unknown): string | null {
  return isNonEmptyString(value) ? value.trim() : null;
}
