import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { sendJson, sendOk } from '../../http.js';
import { listApiWorkflowRunLogs } from './api-data-source-runtime.js';
import {
  buildApiWorkflowOpenApiDocument,
  isPublicApiWorkflowSource
} from './api-workflow-openapi.js';
import { readDataSourceTableRows } from './source-table-rows.js';
import type { DataSourceFoundationRouteContext } from './foundation-route-context.js';
import {
  apiWorkflowContractPayload,
  readPublicApiWorkflowOptions
} from './foundation-api-workflow-payload.js';
import {
  sendPublicApiGroupEndpointData,
  sendPublicApiGroupOpenApi
} from './foundation-api-group-core.js';
import {
  issuePublicApiWorkflowToken,
  readPublicApiBearerClient
} from './foundation-public-api-auth.js';
import {
  requestBaseUrl,
  sendRawJson
} from './foundation-route-utils.js';
import {
  findDataSource,
  findTableInDataSource,
  type DataSourceRecord
} from './foundation-store.js';
import { updateRuntimeDataSource } from './prisma-runtime-persistence.js';
import {
  scopedDataSourceForRead,
  type DataSourceAccessPolicy
} from './source-access.js';

export async function handlePublicApiWorkflow(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  if (req.method === 'POST' && url.pathname === '/api/public/api-workflows/token') {
    await issuePublicApiWorkflowToken(context, req, res);
    return true;
  }

  const publicGroupOpenApiMatch = /^\/api\/public\/api-groups\/([^/]+)\/openapi\.json$/.exec(url.pathname);
  if (req.method === 'GET' && publicGroupOpenApiMatch?.[1]) {
    await sendPublicApiGroupOpenApi(context, req, res, decodeURIComponent(publicGroupOpenApiMatch[1]));
    return true;
  }

  const cleanPublicEndpointMatch = /^\/api\/v1\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if ((req.method === 'GET' || req.method === 'POST') && cleanPublicEndpointMatch?.[1] && cleanPublicEndpointMatch[2]) {
    await sendPublicApiGroupEndpointData(
      context,
      req,
      res,
      url,
      decodeURIComponent(cleanPublicEndpointMatch[1]),
      decodeURIComponent(cleanPublicEndpointMatch[2])
    );
    return true;
  }

  const openApiMatch = /^\/api\/public\/data-sources\/([^/]+)\/openapi\.json$/.exec(url.pathname);
  if (req.method === 'GET' && openApiMatch?.[1]) {
    const dataSourceId = decodeURIComponent(openApiMatch[1]);
    await context.ensureDataSourcesLoaded({ dataSourceId });
    const source = findDataSource(dataSourceId);
    if (!source || source.type.toLowerCase() !== 'api') {
      sendJson(res, 404, fail('API workflow data source not found'));
      return true;
    }
    if (!isPublicApiWorkflowSource(source)) {
      sendJson(res, 403, fail('API workflow is private'));
      return true;
    }
    const client = await readPublicApiBearerClient(context, req, source);
    if (!client.ok) {
      sendJson(res, client.statusCode, fail(client.error));
      return true;
    }
    sendApiWorkflowOpenApiDocument(req, res, source);
    return true;
  }

  const tableDataMatch = /^\/api\/public\/data-sources\/([^/]+)\/tables\/([^/]+)\/data$/.exec(url.pathname);
  if ((req.method === 'GET' || req.method === 'POST') && tableDataMatch?.[1] && tableDataMatch[2]) {
    await sendPublicApiWorkflowTableData(
      context,
      req,
      res,
      url,
      decodeURIComponent(tableDataMatch[1]),
      decodeURIComponent(tableDataMatch[2])
    );
    return true;
  }
  return false;
}

export function sendApiWorkflowOpenApi(
  req: IncomingMessage,
  res: ServerResponse,
  dataSourceId: string,
  access: DataSourceAccessPolicy
): void {
  const source = findDataSource(dataSourceId);
  const scopedSource = source ? scopedDataSourceForRead(source, access) : null;
  if (!scopedSource || scopedSource.type.toLowerCase() !== 'api') {
    sendJson(res, 404, fail('API workflow data source not found'));
    return;
  }
  sendApiWorkflowOpenApiDocument(req, res, scopedSource);
}

export function sendApiWorkflowRunLogs(
  res: ServerResponse,
  url: URL,
  dataSourceId: string,
  access: DataSourceAccessPolicy
): void {
  const source = findDataSource(dataSourceId);
  const scopedSource = source ? scopedDataSourceForRead(source, access) : null;
  if (!scopedSource || scopedSource.type.toLowerCase() !== 'api') {
    sendJson(res, 404, fail('API workflow data source not found'));
    return;
  }
  const table = url.searchParams.get('table') ?? undefined;
  const limit = Number(url.searchParams.get('limit') ?? 25);
  sendOk(res, {
    dataSourceId: scopedSource.id,
    runs: listApiWorkflowRunLogs(scopedSource.id, table, Number.isFinite(limit) ? limit : 25)
  });
}

async function sendPublicApiWorkflowTableData(
  context: DataSourceFoundationRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  dataSourceId: string,
  tableIdOrName: string
): Promise<void> {
  await context.ensureDataSourcesLoaded({ dataSourceId });
  const source = findDataSource(dataSourceId);
  if (!source || source.type.toLowerCase() !== 'api') {
    sendJson(res, 404, fail('API workflow data source not found'));
    return;
  }
  if (!isPublicApiWorkflowSource(source)) {
    sendJson(res, 403, fail('API workflow is private'));
    return;
  }
  const table = findTableInDataSource(source.id, tableIdOrName)?.table;
  if (!table || table.isSelected === false) {
    sendJson(res, 404, fail('API workflow endpoint not found'));
    return;
  }
  const client = await readPublicApiBearerClient(context, req, source);
  if (!client.ok) {
    sendJson(res, client.statusCode, fail(client.error));
    return;
  }
  const options = await readPublicApiWorkflowOptions(req, url);
  const result = await readDataSourceTableRows(source.id, table.name, {
    ...options,
    ...(context.prismaClient ? { persistSourceConfig: runtimeSource => updateRuntimeDataSource(context.prismaClient!, runtimeSource) } : {})
  });
  if (!result.ok) {
    sendJson(res, result.statusCode, fail(result.error));
    return;
  }
  const contractPayload = apiWorkflowContractPayload(table, result.data);
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

function sendApiWorkflowOpenApiDocument(req: IncomingMessage, res: ServerResponse, source: DataSourceRecord): void {
  sendRawJson(res, 200, buildApiWorkflowOpenApiDocument(source, {
    baseUrl: requestBaseUrl(req),
    includePrivate: true,
    includePublic: true
  }));
}
