import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import {
  buildDataSource,
  findDataSource,
  rowsForTable,
  schemaForRows,
  toLabel,
  type DataSourceRecord,
  type TableDefinition
} from './foundation-store.js';
import {
  executeCustomQueryDataSourceSqlQuery,
  executeSqlModelTableQuery,
  isCustomQueryDataSource,
  isSqlModelTable
} from './custom-query-live-engine.js';
import {
  discoverLiveDataSourceTables,
  executeLiveDataSourceSqlQuery,
  isLiveSqlDataSource,
  testLiveDataSourceConnection
} from './live-sql-query-engine.js';
import {
  replaceRuntimeDataSourceTables,
  updateRuntimeDataSource
} from './prisma-runtime-persistence.js';
import { readDataSourceTableRows } from './source-table-rows.js';
import type { EnsureDataSourcesLoaded } from './prisma-runtime-sync.js';
import { executeDataSourceSqlQuery } from './sql-query-engine.js';
import { quoteSqlIdentifierForType } from './sql-dialect.js';
import {
  canReadDataSourceTable,
  scopedDataSourceForRead,
  type DataSourceAccessPolicy
} from './source-access.js';
import { findReferencedTable } from './query-table-resolution.js';
import {
  discoverApiDataSourceTables,
  executeApiDataSourceSqlQuery,
  isApiDataSource,
  testApiDataSourceConnection
} from './api-data-source-runtime.js';

export async function sendConnectionTest(
  req: IncomingMessage,
  res: ServerResponse,
  access?: DataSourceAccessPolicy,
  prismaClient: IntraQPrismaClient | null = null
): Promise<void> {
  const body = await readJsonBody(req);
  if (!isRecord(body)) {
    sendBadRequest(res, 'Connection test body is required');
    return;
  }

  const dataSourceId = asString(body.dataSourceId) ?? asString(body.id);
  const source = dataSourceId ? findDataSource(dataSourceId) : buildDataSource(body);
  if (dataSourceId && !source) {
    sendJson(res, 404, fail('Data source not found'));
    return;
  }
  if (source && dataSourceId && access && !scopedDataSourceForRead(source, access)) {
    sendJson(res, 404, fail('Data source not found'));
    return;
  }
  if (source && isApiDataSource(source)) {
    const result = await testApiDataSourceConnection(source, {
      ...(dataSourceId ? apiRuntimePersistence(prismaClient) : {})
    });
    if (!result.ok) {
      sendJson(res, result.statusCode, fail(result.error));
      return;
    }
    sendOk(res, {
      success: true,
      message: 'Connection successful',
      tables: result.data.tables,
      executionTime: result.data.executionTime
    });
    return;
  }

  if (!source || !isLiveSqlDataSource(source)) {
    sendOk(res, { success: true, message: 'Connection successful', tables: source?.tables.map(table => table.name) ?? [] });
    return;
  }

  const result = await testLiveDataSourceConnection(source);
  if (!result.ok) {
    sendJson(res, result.statusCode, fail(result.error));
    return;
  }
  sendOk(res, {
    success: true,
    message: 'Connection successful',
    tables: source.tables.map(table => table.name),
    executionTime: result.data.executionTime
  });
}

export async function sendDiscoveredTables(
  res: ServerResponse,
  dataSourceId: string,
  prismaClient: IntraQPrismaClient | null = null
): Promise<void> {
  const source = findDataSource(dataSourceId);
  if (!source) {
    sendJson(res, 404, fail('Data source not found'));
    return;
  }
  if (isApiDataSource(source)) {
    const result = await discoverApiDataSourceTables(source, apiRuntimePersistence(prismaClient));
    if (!result.ok) {
      sendJson(res, result.statusCode, fail(result.error));
      return;
    }
    sendOk(res, { tables: result.data.tables.map(table => ({ name: table.name, fields: table.fields })) });
    return;
  }
  if (isLiveSqlDataSource(source)) {
    const result = await discoverLiveDataSourceTables(source);
    if (!result.ok) {
      sendJson(res, result.statusCode, fail(result.error));
      return;
    }
    sendOk(res, result.data);
    return;
  }
  sendOk(res, { tables: source.tables.map(table => ({ name: table.name, fields: table.fields })) });
}

export async function refreshSchema(
  res: ServerResponse,
  dataSourceId: string,
  prismaClient: IntraQPrismaClient | null,
  options: { includeAllTables?: boolean } = {}
): Promise<void> {
  const source = findDataSource(dataSourceId);
  if (!source) {
    sendJson(res, 404, fail('Data source not found'));
    return;
  }
  if (isApiDataSource(source)) {
    const result = await discoverApiDataSourceTables(source, apiRuntimePersistence(prismaClient));
    if (!result.ok) {
      sendJson(res, result.statusCode, fail(result.error));
      return;
    }
    const existingByName = new Map(source.tables.map(table => [table.name, table]));
    source.tables = result.data.tables.map(table => ({
      ...existingByName.get(table.name),
      ...table,
      dictionary: {
        ...(existingByName.get(table.name)?.dictionary ?? {}),
        ...table.dictionary
      },
      settings: {
        ...(existingByName.get(table.name)?.settings ?? {}),
        ...(table.settings ?? {})
      }
    }));
    source.settings = { ...source.settings, schemaRefreshedAt: new Date().toISOString() };
    if (prismaClient) {
      await updateRuntimeDataSource(prismaClient, source);
      await replaceRuntimeDataSourceTables(prismaClient, source);
    }
    sendOk(res, {
      dataSourceId: source.id,
      discoveredTableCount: result.data.tables.length,
      registeredTableCount: source.tables.length,
      savedDataModelCount: source.tables.filter(isSavedDataModelTable).length,
      tables: source.tables.map(table => ({ name: table.name, fields: table.fields }))
    });
    return;
  }

  if (!isLiveSqlDataSource(source)) {
    sendJson(res, 400, fail('Schema refresh is only available for live SQL or API data sources'));
    return;
  }

  const result = await discoverLiveDataSourceTables(source, { includeAllTables: options.includeAllTables === true });
  if (!result.ok) {
    sendJson(res, result.statusCode, fail(result.error));
    return;
  }
  const existingTables = source.tables;
  const existingByName = new Map(existingTables.map(table => [table.name, table]));
  const discoveredNames = new Set(result.data.tables.map(table => table.name));
  const refreshedTables: TableDefinition[] = result.data.tables.map(table => {
    const existing = existingByName.get(table.name);
    if (existing && isSavedDataModelTable(existing)) return existing;
    const existingSettings = existing?.settings ?? {};
    const existingDictionary = existing?.dictionary ?? {};
    const existingRawSchema = isRecord(existingDictionary.rawSchema) ? existingDictionary.rawSchema : {};
    return {
      id: existing?.id ?? buildDataSource({ tables: [table] }).tables[0]?.id ?? table.name,
      name: table.name,
      description: existing?.description ?? `${toLabel(table.name)} table`,
      fields: table.fields,
      dictionary: {
        ...existingDictionary,
        targetType: 'raw_table',
        rawSchema: {
          ...existingRawSchema,
          ...(table.rowCount !== null ? { rowCount: table.rowCount } : {}),
          refreshedAt: new Date().toISOString()
        }
      },
      settings: {
        ...existingSettings,
        isDataModel: false,
        targetType: 'raw_table'
      },
      isSelected: existing?.isSelected ?? true,
      ...(existing?.sqlQuery ? { sqlQuery: existing.sqlQuery } : {})
    };
  });
  const savedModels = existingTables.filter(table => isSavedDataModelTable(table) && !discoveredNames.has(table.name));
  source.tables = [
    ...refreshedTables,
    ...savedModels
  ];
  source.settings = { ...source.settings, schemaRefreshedAt: new Date().toISOString() };
  if (prismaClient) {
    await updateRuntimeDataSource(prismaClient, source);
    await replaceRuntimeDataSourceTables(prismaClient, source);
  }
  sendOk(res, {
    dataSourceId: source.id,
    discoveredTableCount: result.data.tables.length,
    registeredTableCount: source.tables.length,
    savedDataModelCount: savedModels.length + refreshedTables.filter(isSavedDataModelTable).length,
    tables: source.tables.map(table => ({ name: table.name, fields: table.fields }))
  });
}

function isSavedDataModelTable(table: TableDefinition | undefined): boolean {
  return isSqlModelTable(table) || table?.settings?.isDataModel === true;
}

function apiRuntimePersistence(
  prismaClient: IntraQPrismaClient | null
): { persistSourceConfig?: (source: DataSourceRecord) => Promise<void> } {
  return prismaClient
    ? { persistSourceConfig: source => updateRuntimeDataSource(prismaClient, source) }
    : {};
}

export async function previewQuery(
  req: IncomingMessage,
  res: ServerResponse,
  access?: DataSourceAccessPolicy,
  prismaClient: IntraQPrismaClient | null = null
): Promise<void> {
  const body = await readJsonBody(req);
  if (!isRecord(body) || !isNonEmptyString(body.dataSourceId) || !isNonEmptyString(body.query)) {
    sendBadRequest(res, 'dataSourceId and query are required');
    return;
  }
  const source = findDataSource(body.dataSourceId.trim());
  if (!source) {
    sendJson(res, 404, fail('Data source not found'));
    return;
  }
  const scopedSource = access ? scopedDataSourceForRead(source, access) : source;
  if (!scopedSource) {
    sendJson(res, 404, fail('Data source not found'));
    return;
  }
  const table = findReferencedTable(scopedSource, body.query.trim()) ?? scopedSource.tables[0];
  if (!canReadDataSourceTable(source, table, access ?? defaultAccessPolicy())) {
    sendJson(res, 403, fail('Data source table access is denied'));
    return;
  }
  const livePreview = table && (isLiveSqlDataSource(source) || isCustomQueryDataSource(source) || isApiDataSource(source))
    ? await readDataSourceTableRows(source.id, table.name, {
      ...apiRuntimePersistence(prismaClient),
      ...(access ? { access } : {}),
      defaultLimit: 1,
      maxLimit: 1
    })
    : null;
  if (livePreview && !livePreview.ok) {
    sendJson(res, livePreview.statusCode, fail(livePreview.error));
    return;
  }
  const sampleData = livePreview?.ok
    ? livePreview.data.rows
    : table ? rowsForTable(source.id, table.name).slice(0, 1) : [];
  const schema = livePreview?.ok
    ? livePreview.data.columnTypes
    : sampleData.length > 0
      ? schemaForRows(sampleData)
      : (table?.fields.map(field => ({ name: field.name, type: field.type })) ?? []);
  sendOk(res, { schema, sampleData, rowCount: sampleData.length });
}

export async function executeSql(
  req: IncomingMessage,
  res: ServerResponse,
  access?: DataSourceAccessPolicy,
  ensureDataSourcesLoaded?: EnsureDataSourcesLoaded,
  prismaClient: IntraQPrismaClient | null = null
): Promise<void> {
  const body = await readJsonBody(req);
  const query = isRecord(body) ? asString(body.query) ?? asString(body.sql) : null;
  if (!isRecord(body) || (!isNonEmptyString(body.dataSourceId) && !isRecord(body.tempDataSource)) || !query) {
    sendBadRequest(res, 'Data source ID (or temp data source) and query are required');
    return;
  }
  const executeOptions = {
    parameterValues: readParameterValues(body),
    query,
    tempDataSource: body.tempDataSource
  };
  const dataSourceId = asString(body.dataSourceId);
  if (dataSourceId && ensureDataSourcesLoaded) {
    await ensureDataSourcesLoaded({ dataSourceId });
  }
  const defaultLimit = asPositiveInteger(body.defaultLimit);
  const maxLimit = asPositiveInteger(body.maxLimit);
  const source = dataSourceId ? findDataSource(dataSourceId) : undefined;
  if (dataSourceId && !source) {
    sendJson(res, 404, fail('Data source not found'));
    return;
  }
  const scopedSource = source && access ? scopedDataSourceForRead(source, access) : source;
  if (source && !scopedSource) {
    sendJson(res, 404, fail('Data source not found'));
    return;
  }
  const referencedTable = source && scopedSource ? findReferencedTable(scopedSource, query) : undefined;
  if (source && scopedSource && access && referencedTable && !canReadDataSourceTable(source, referencedTable, access)) {
    sendJson(res, 403, fail('Data source table access is denied'));
    return;
  }
  if (source && scopedSource && access && scopedSource.tables.length < source.tables.length && !referencedTable) {
    sendJson(res, 403, fail('Data source table access is denied'));
    return;
  }
  const result = source && isApiDataSource(source)
    ? await executeApiDataSourceSqlQuery(source, {
      query,
      ...(defaultLimit ? { defaultLimit } : {}),
      ...(maxLimit ? { maxLimit } : {}),
      ...apiRuntimePersistence(prismaClient),
      parameterValues: executeOptions.parameterValues
    })
    : source && isLiveSqlDataSource(source) && isSqlModelTable(referencedTable)
    ? await executeSqlModelTableQuery({
      source,
      table: referencedTable,
      query,
      parameterValues: executeOptions.parameterValues,
      ...(defaultLimit ? { defaultLimit } : {}),
      ...(maxLimit ? { maxLimit } : {})
    })
    : source && isCustomQueryDataSource(source)
    ? await executeCustomQueryDataSourceSqlQuery({
      source,
      ...executeOptions,
      ...(defaultLimit ? { defaultLimit } : {}),
      ...(maxLimit ? { maxLimit } : {})
    })
    : source && isLiveSqlDataSource(source)
      ? await executeLiveDataSourceSqlQuery({
        source,
        query,
        ...(defaultLimit ? { defaultLimit } : {}),
        ...(maxLimit ? { maxLimit } : {})
      })
      : executeDataSourceSqlQuery({
      ...executeOptions,
      ...(dataSourceId ? { dataSourceId } : {}),
      ...(defaultLimit ? { defaultLimit } : {}),
      ...(maxLimit ? { maxLimit } : {})
      });
  if (!result.ok) {
    sendJson(res, result.statusCode, fail(result.error));
    return;
  }
  sendOk(res, result.data);
}

function defaultAccessPolicy(): DataSourceAccessPolicy {
  return {
    allowUnscopedAccess: true,
    showSampleDataSources: true
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asString(value: unknown): string | null {
  return isNonEmptyString(value) ? value.trim() : null;
}

function asPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readParameterValues(body: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(body.parameterValues)) return body.parameterValues;
  if (isRecord(body.parameters)) return body.parameters;
  return {};
}
