import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { sendJson, sendOk } from '../../http.js';
import { readDataSourceTableRows } from './source-table-rows.js';
import type { ApiEndpointRecord, ApiGroupRecord } from './api-group-types.js';
import type { DataSourceFoundationRouteContext } from './foundation-route-context.js';
import {
  apiEndpointMethodMatches,
  apiGroupFromPrisma,
  virtualApiGroupsFromDataSources
} from './foundation-api-group-mappers.js';
import { buildApiGroupOpenApiDocument } from './foundation-api-group-openapi.js';
import {
  apiGroupScopeWhere,
  apiGroups,
  scopedApiGroups
} from './foundation-api-group-state.js';
import {
  apiWorkflowContractPayload,
  readPublicApiWorkflowOptions
} from './foundation-api-workflow-payload.js';
import {
  readPublicApiBearerClientForGroup
} from './foundation-public-api-auth.js';
import {
  readString,
  requestBaseUrl,
  sendRawJson,
  toApiSlug
} from './foundation-route-utils.js';
import {
  findDataSource,
  findTableInDataSource,
  type DataSourceRecord,
  type TableDefinition
} from './foundation-store.js';
import { updateRuntimeDataSource } from './prisma-runtime-persistence.js';
import {
  canReadDataSourceTable,
  type DataSourceAccessPolicy
} from './source-access.js';
import { sendTableData } from './data-source-table-actions.js';

export async function listApiGroups(
  context: DataSourceFoundationRouteContext,
  access: DataSourceAccessPolicy
): Promise<ApiGroupRecord[]> {
  if (context.prismaClient) {
    const rows = await context.prismaClient.apiGroup.findMany({
      where: apiGroupScopeWhere(access),
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      include: {
        clientGrants: true,
        endpoints: { orderBy: [{ name: 'asc' }, { createdAt: 'asc' }] },
        grants: true
      }
    });
    return rows.map(apiGroupFromPrisma);
  }
  return scopedApiGroups([...apiGroups, ...virtualApiGroupsFromDataSources()], access);
}

export async function findApiGroup(
  context: DataSourceFoundationRouteContext,
  idOrSlug: string,
  access?: DataSourceAccessPolicy,
  options: { requirePublic?: boolean } = {}
): Promise<ApiGroupRecord | null> {
  const normalized = idOrSlug.trim();
  if (!normalized) return null;
  if (context.prismaClient) {
    const visibilityWhere = options.requirePublic ? { visibility: 'public', status: { not: 'archived' } } : { status: { not: 'archived' } };
    const rows = await context.prismaClient.apiGroup.findMany({
      where: {
        ...apiGroupScopeWhere(access),
        ...visibilityWhere,
        OR: [{ id: normalized }, { slug: normalized }]
      },
      orderBy: [{ tenantId: 'desc' }, { createdAt: 'asc' }],
      include: {
        clientGrants: true,
        endpoints: { orderBy: [{ name: 'asc' }, { createdAt: 'asc' }] },
        grants: true
      },
      take: 2
    });
    return rows[0] ? apiGroupFromPrisma(rows[0]) : null;
  }
  return scopedApiGroups([...apiGroups, ...virtualApiGroupsFromDataSources()], access)
    .find(group => (group.id === normalized || group.slug === normalized)
      && (!options.requirePublic || group.visibility === 'public')
      && group.status !== 'archived') ?? null;
}

export async function resolveApiGroupEndpoint(
  context: DataSourceFoundationRouteContext,
  groupIdOrSlug: string,
  endpointSlug: string,
  method: string,
  access?: DataSourceAccessPolicy,
  options: { requirePublic?: boolean } = {}
): Promise<{ group: ApiGroupRecord; endpoint: ApiEndpointRecord } | null> {
  const group = await findApiGroup(context, groupIdOrSlug, access, options);
  if (!group) return null;
  const normalizedMethod = method.toUpperCase();
  const normalizedEndpointSlug = toApiSlug(endpointSlug);
  const endpoint = group.endpoints.find(item => item.status !== 'archived'
    && item.slug === normalizedEndpointSlug
    && apiEndpointMethodMatches(item.method, normalizedMethod));
  return endpoint ? { group, endpoint } : null;
}

export async function sendPublicApiGroupOpenApi(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  groupSlug: string
): Promise<void> {
  const group = await findApiGroup(context, groupSlug, undefined, { requirePublic: true });
  if (!group) {
    sendJson(res, 404, fail('Public API group not found'));
    return;
  }
  const client = await readPublicApiBearerClientForGroup(context, req, group);
  if (!client.ok) {
    sendJson(res, client.statusCode, fail(client.error));
    return;
  }
  sendRawJson(res, 200, buildApiGroupOpenApiDocument(group, {
    baseUrl: requestBaseUrl(req),
    includePrivate: false,
    includePublic: true
  }));
}

export async function sendPrivateApiGroupOpenApi(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  groupIdOrSlug: string,
  access: DataSourceAccessPolicy
): Promise<void> {
  const group = await findApiGroup(context, groupIdOrSlug, access);
  if (!group) {
    sendJson(res, 404, fail('API group not found'));
    return;
  }
  sendRawJson(res, 200, buildApiGroupOpenApiDocument(group, {
    baseUrl: requestBaseUrl(req),
    includePrivate: true,
    includePublic: group.visibility === 'public'
  }));
}

export async function sendPublicApiGroupEndpointData(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  groupSlug: string,
  endpointSlug: string
): Promise<void> {
  const resolved = await resolveApiGroupEndpoint(context, groupSlug, endpointSlug, req.method ?? 'GET', undefined, { requirePublic: true });
  if (!resolved) {
    sendJson(res, 404, fail('Public API endpoint not found'));
    return;
  }
  const client = await readPublicApiBearerClientForGroup(context, req, resolved.group);
  if (!client.ok) {
    sendJson(res, client.statusCode, fail(client.error));
    return;
  }
  await executePublicApiGroupEndpoint(context, req, res, url, resolved.endpoint);
}

export async function sendPrivateApiGroupEndpointData(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  groupIdOrSlug: string,
  endpointSlug: string,
  access: DataSourceAccessPolicy
): Promise<void> {
  const resolved = await resolveApiGroupEndpoint(context, groupIdOrSlug, endpointSlug, req.method ?? 'GET', access);
  if (!resolved) {
    sendJson(res, 404, fail('API endpoint not found'));
    return;
  }
  await executePrivateApiGroupEndpoint(context, req, res, resolved.endpoint, access);
}

async function executePublicApiGroupEndpoint(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  endpoint: ApiEndpointRecord
): Promise<void> {
  const target = await resolveEndpointDataModelTarget(context, endpoint);
  if (!target.ok) {
    sendJson(res, target.statusCode, fail(target.error));
    return;
  }
  const options = await readPublicApiWorkflowOptions(req, url);
  const result = await readDataSourceTableRows(target.source.id, target.table.name, {
    ...options,
    ...(context.prismaClient ? { persistSourceConfig: runtimeSource => updateRuntimeDataSource(context.prismaClient!, runtimeSource) } : {})
  });
  if (!result.ok) {
    sendJson(res, result.statusCode, fail(result.error));
    return;
  }
  const contractPayload = apiWorkflowContractPayload(target.table, result.data);
  if (contractPayload) {
    sendRawJson(res, 200, contractPayload);
    return;
  }
  sendOk(res, {
    columns: result.data.columns,
    rows: result.data.rows,
    totalRows: result.data.rowCount,
    page: result.data.pagination?.page ?? 1,
    pageSize: result.data.pagination?.pageSize ?? result.data.rowCount,
    offset: result.data.pagination?.offset ?? 0,
    hasMore: result.data.pagination?.hasMore ?? false,
    ...(result.data.pagination?.totalRows !== undefined ? { totalAvailableRows: result.data.pagination.totalRows } : {})
  });
}

async function executePrivateApiGroupEndpoint(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  endpoint: ApiEndpointRecord,
  access: DataSourceAccessPolicy
): Promise<void> {
  const target = await resolveEndpointDataModelTarget(context, endpoint);
  if (!target.ok) {
    sendJson(res, target.statusCode, fail(target.error));
    return;
  }
  if (!canReadDataSourceTable(target.source, target.table, access)) {
    sendJson(res, 404, fail('API endpoint target not found'));
    return;
  }
  await sendTableData(req, res, target.source.id, target.table.name, context.prismaClient, access);
}

async function resolveEndpointDataModelTarget(
  context: DataSourceFoundationRouteContext,
  endpoint: ApiEndpointRecord
): Promise<
  | { ok: true; source: DataSourceRecord; table: TableDefinition }
  | { ok: false; statusCode: 400 | 404 | 501; error: string }
> {
  const executionType = endpoint.executionType.toLowerCase();
  if (!['data_model', 'data-source-table', 'table'].includes(executionType)) {
    return { ok: false, statusCode: 501, error: `API endpoint execution type ${endpoint.executionType} is not supported yet` };
  }
  const dataSourceId = endpoint.dataSourceId?.trim();
  if (!dataSourceId) return { ok: false, statusCode: 400, error: 'API endpoint data source is not configured' };
  await context.ensureDataSourcesLoaded({ dataSourceId });
  const source = findDataSource(dataSourceId);
  if (!source) return { ok: false, statusCode: 404, error: 'API endpoint data source not found' };
  const tableIdentifier = endpoint.dataSourceTableId
    ?? readString(endpoint.settings.tableName)
    ?? readString(endpoint.settings.table)
    ?? endpoint.slug;
  const lookup = findTableInDataSource(source.id, tableIdentifier);
  if (!lookup?.table || lookup.table.isSelected === false) {
    return { ok: false, statusCode: 404, error: 'API endpoint data model not found' };
  }
  return { ok: true, source, table: lookup.table };
}
