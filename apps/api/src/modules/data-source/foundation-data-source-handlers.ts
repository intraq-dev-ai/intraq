import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import { getRequestSecurityContext } from '../../security/request-context.js';
import { maskDataSourceConfig } from './data-source-config-secrets.js';
import type { DataSourceFoundationRouteContext } from './foundation-route-context.js';
import {
  inputJson,
  isRecord,
  readString,
  sendRawJson
} from './foundation-route-utils.js';
import {
  buildDataSource,
  dataSources,
  findDataSource,
  findTableWithSource,
  removeDataSource,
  tableDictionary,
  toLabel,
  type DataSourceRecord,
  type TableDefinition
} from './foundation-store.js';
import {
  createRuntimeDataSource,
  deleteRuntimeDataSource,
  updateRuntimeDataSource
} from './prisma-runtime-persistence.js';
import {
  applyCreateScope,
  canCreateDataSource,
  canReadDataSourceTable,
  canWriteDataSource,
  dataSourceAccessPolicy,
  scopedDataSourceForRead,
  type DataSourceAccessPolicy
} from './source-access.js';

export async function readDataSourceAccessPolicy(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage
): Promise<DataSourceAccessPolicy> {
  return dataSourceAccessPolicy(getRequestSecurityContext(req), context.prismaClient);
}

export function isDataSourceRoutePath(pathname: string): boolean {
  return pathname.startsWith('/api/data-sources')
    || pathname.startsWith('/api/public/data-sources')
    || pathname.startsWith('/api/api-groups')
    || pathname.startsWith('/api/public/api-groups')
    || pathname.startsWith('/api/v1/')
    || pathname === '/api/public/api-workflows/token'
    || pathname.startsWith('/api/sql-query');
}

export async function preloadRuntimeForRequest(
  context: DataSourceFoundationRouteContext,
  url: URL
): Promise<void> {
  if (url.pathname === '/api/data-sources/builder-catalog' || url.pathname === '/api/data-sources/analyzer-catalog') return;
  const sourceId = sourceScopedRuntimeLoadId(url.pathname);
  if (sourceId) {
    await context.ensureDataSourcesLoaded({ dataSourceId: sourceId });
    return;
  }
  if (url.pathname === '/api/sql-query/execute') return;
  await context.ensureDataSourcesLoaded();
}

export function sendNotFoundWhenSourceHidden(
  res: ServerResponse,
  dataSourceId: string,
  access: DataSourceAccessPolicy
): boolean {
  const source = findDataSource(dataSourceId);
  if (source && scopedDataSourceForRead(source, access)) return true;
  sendJson(res, 404, fail('Data source not found'));
  return false;
}

export function sendNotFoundWhenTableHidden(
  res: ServerResponse,
  dataSourceId: string,
  tableIdOrName: string,
  access: DataSourceAccessPolicy
): boolean {
  const source = findDataSource(dataSourceId);
  const table = source?.tables.find(item => item.id === tableIdOrName || item.name === tableIdOrName);
  if (source && canReadDataSourceTable(source, table, access)) return true;
  sendJson(res, 404, fail('Data source table not found'));
  return false;
}

export async function createDataSource(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  access: DataSourceAccessPolicy
): Promise<void> {
  const body = await readJsonBody(req);
  if (!isRecord(body) || !readString(body.name)) {
    sendBadRequest(res, 'name is required');
    return;
  }
  if (!canCreateDataSource(access)) {
    sendJson(res, 403, fail('Tenant context is required to create a data source'));
    return;
  }
  const sourceType = readString(body.type) ?? 'source';
  if (!isSupportedSourceType(sourceType)) {
    sendBadRequest(res, 'Unsupported data source type.');
    return;
  }
  const source = applyCreateScope(buildDataSource(body, sourceType), access);
  if (context.prismaClient) await createRuntimeDataSource(context.prismaClient, source);
  dataSources.push(source);
  sendRawJson(res, 201, dataSourceForResponse(source));
}

export async function handleDataSource(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  access: DataSourceAccessPolicy
): Promise<void> {
  const source = findDataSource(id);
  if (!source || !scopedDataSourceForRead(source, access)) {
    sendRawJson(res, 404, { error: 'Data source not found' });
    return;
  }
  if (req.method === 'PUT') {
    if (!canWriteDataSource(source, access)) {
      sendJson(res, 403, fail('Data source access is denied'));
      return;
    }
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendBadRequest(res, 'Data source update body must be an object');
      return;
    }
    const nextType = readString(body.type);
    if (nextType && !isSupportedSourceType(nextType)) {
      sendBadRequest(res, 'Unsupported data source type.');
      return;
    }
    applyDataSourceUpdate(source, body);
    if (context.prismaClient) await updateRuntimeDataSource(context.prismaClient, source);
    sendRawJson(res, 200, dataSourceForResponse(source));
    return;
  }
  if (req.method === 'DELETE') {
    if (!canWriteDataSource(source, access)) {
      sendJson(res, 403, fail('Data source access is denied'));
      return;
    }
    if (context.prismaClient) await deleteRuntimeDataSource(context.prismaClient, id);
    removeDataSource(id);
    sendRawJson(res, 200, { message: 'Data source deleted successfully' });
    return;
  }
  sendRawJson(res, 405, { error: 'Method not allowed' });
}

export async function handleTableDictionary(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  tableId: string,
  access: DataSourceAccessPolicy
): Promise<void> {
  const lookup = findTableWithSource(tableId);
  if (!lookup || !canReadDataSourceTable(lookup.source, lookup.table, access)) {
    sendJson(res, 404, fail('Data source table not found'));
    return;
  }
  const { table } = lookup;
  if (req.method === 'PUT') {
    if (!canWriteDataSource(lookup.source, access)) {
      sendJson(res, 403, fail('Data source access is denied'));
      return;
    }
    const body = await readJsonBody(req);
    table.dictionary = isRecord(body) ? body : {};
    await persistTableDictionary(context, table);
  }
  if (req.method === 'DELETE') {
    if (!canWriteDataSource(lookup.source, access)) {
      sendJson(res, 403, fail('Data source access is denied'));
      return;
    }
    table.dictionary = {};
    await persistTableDictionary(context, table);
  }
  sendOk(res, tableDictionary(table));
}

export async function handleDataSourceDictionary(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  access: DataSourceAccessPolicy
): Promise<void> {
  const source = findDataSource(id);
  if (!source || !scopedDataSourceForRead(source, access)) {
    sendJson(res, 404, fail('Data source not found'));
    return;
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    if (!canWriteDataSource(source, access)) {
      sendJson(res, 403, fail('Data source access is denied'));
      return;
    }
    const body = await readJsonBody(req);
    source.dictionary = isRecord(body) ? body : {};
    if (context.prismaClient) await updateRuntimeDataSource(context.prismaClient, source);
  }
  sendOk(res, source.dictionary);
}

export function sendDataSourceSchema(
  res: ServerResponse,
  dataSourceId: string,
  access: DataSourceAccessPolicy
): void {
  const source = findDataSource(dataSourceId);
  const scopedSource = source ? scopedDataSourceForRead(source, access) : null;
  if (!scopedSource) {
    sendJson(res, 404, fail('Data source not found'));
    return;
  }
  sendOk(res, {
    dataSourceId: scopedSource.id,
    tables: scopedSource.tables.map(table => ({
      ...table,
      columns: table.fields.map(field => ({ name: field.name, label: toLabel(field.name), type: field.type }))
    }))
  });
}

export function sendSqlSchema(res: ServerResponse, dataSourceId: string, access: DataSourceAccessPolicy): void {
  const source = findDataSource(dataSourceId);
  const scopedSource = source ? scopedDataSourceForRead(source, access) : null;
  if (!scopedSource) {
    sendJson(res, 404, fail('Data source not found or access denied'));
    return;
  }
  sendOk(res, { tables: scopedSource.tables.map(table => ({ name: table.name, columns: table.fields })) });
}

export function dataSourceForResponse(source: DataSourceRecord): DataSourceRecord {
  return {
    ...source,
    config: maskDataSourceConfig(source.config)
  };
}

async function persistTableDictionary(context: DataSourceFoundationRouteContext, table: TableDefinition): Promise<void> {
  if (!context.prismaClient) return;
  await context.prismaClient.dataSourceTable.update({
    where: { id: table.id },
    data: {
      dictionary: inputJson(table.dictionary),
      fields: inputJson(table.fields)
    }
  });
}

function sourceScopedRuntimeLoadId(pathname: string): string | null {
  const matchers = [
    /^\/api\/public\/data-sources\/([^/]+)\/openapi\.json$/,
    /^\/api\/public\/data-sources\/([^/]+)\/tables\/[^/]+\/data$/,
    /^\/api\/data-sources\/embed-compatible\/([^/]+)\/tables\/[^/]+\/data$/,
    /^\/api\/data-sources\/([^/]+)\/tables\/[^/]+\/data$/,
    /^\/api\/data-sources\/([^/]+)\/openapi\.json$/,
    /^\/api\/data-sources\/([^/]+)\/api-workflow-runs$/,
    /^\/api\/data-sources\/([^/]+)\/tables\/[^/]+\/year-over-year$/,
    /^\/api\/data-sources\/([^/]+)\/tables\/[^/]+\/sync-to-cloud$/,
    /^\/api\/data-sources\/([^/]+)\/discover-tables$/,
    /^\/api\/data-sources\/([^/]+)\/refresh-schema$/,
    /^\/api\/data-sources\/([^/]+)\/schema$/,
    /^\/api\/data-sources\/([^/]+)\/model-metadata(?:\/(?:import|validate|test-question))?$/,
    /^\/api\/data-sources\/([^/]+)\/field-values$/,
    /^\/api\/data-sources\/([^/]+)\/filter-options$/,
    /^\/api\/data-sources\/([^/]+)\/tables$/,
    /^\/api\/data-sources\/([^/]+)\/dictionary$/,
    /^\/api\/data-sources\/([^/]+)\/(?:sync-to-cloud|clear-kb|dashboard-settings|data-models|sample-visibility)$/,
    /^\/api\/data-sources\/([^/]+)$/
  ];
  for (const matcher of matchers) {
    const match = matcher.exec(pathname);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

function applyDataSourceUpdate(source: DataSourceRecord, body: Record<string, unknown>): void {
  if (readString(body.name)) source.name = readString(body.name)!;
  if (readString(body.description)) source.dictionary.description = readString(body.description)!;
  if (readString(body.type)) source.type = readString(body.type)!;
  if (typeof body.isGloballyVisible === 'boolean') source.isGloballyVisible = body.isGloballyVisible;
  if (isRecord(body.config)) source.config = mergeDataSourceConfig(source.config, body.config);
  if (isRecord(body.settings)) source.settings = { ...source.settings, ...body.settings };
  if (Array.isArray(body.parameters)) source.settings.parameters = body.parameters;
  const query = isRecord(body.config) ? readString(body.config.query) : null;
  if (query && source.tables[0]) source.tables[0].sqlQuery = query;
}

function isSupportedSourceType(value: string): boolean {
  return new Set([
    'api',
    'athena',
    'bigquery',
    'clickhouse',
    'custom_query',
    'database',
    'databricks',
    'databricks-sql',
    'databricks_sql',
    'dynamodb',
    'file',
    'flatfile',
    'mariadb',
    'mongodb',
    'mysql',
    'oracle',
    'postgres',
    'sample',
    's3',
    'snowflake',
    'source',
    'sqlserver'
  ]).has(value.toLowerCase());
}

function mergeDataSourceConfig(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing, ...patch };
  if (isRecord(existing.defaults) && isRecord(patch.defaults)) {
    merged.defaults = { ...existing.defaults, ...patch.defaults };
  }
  if (isRecord(existing.tokenRequest) && isRecord(patch.tokenRequest)) {
    const existingApply = isRecord(existing.tokenRequest.apply) ? existing.tokenRequest.apply : {};
    const patchApply = isRecord(patch.tokenRequest.apply) ? patch.tokenRequest.apply : {};
    merged.tokenRequest = {
      ...existing.tokenRequest,
      ...patch.tokenRequest,
      ...(Object.keys(existingApply).length > 0 || Object.keys(patchApply).length > 0
        ? { apply: { ...existingApply, ...patchApply } }
        : {})
    };
  }
  return merged;
}
