import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendJson, sendUnauthorized } from '../../http.js';
import type { CodexAgentRuntime } from '../codex-agent/codex-agent-runtime.js';
import { loadAnalyzerCatalogSources } from './analyzer-catalog.js';
import { loadBuilderCatalogSources } from './builder-catalog.js';
import { CustomQueryRoutes } from './custom-query-routes.js';
import {
  executeSql,
  previewQuery,
  refreshSchema,
  sendConnectionTest,
  sendDiscoveredTables
} from './data-source-query-actions.js';
import {
  handleSourceTables,
  sendFieldValues,
  sendFilterOptions,
  sendTableData
} from './data-source-table-actions.js';
import { handleModelMetadata } from './local-model-metadata.js';
import { DataSourceCompatibilityRoutes } from './compat-routes.js';
import { handleApiGroupManagement } from './foundation-api-group-dispatch.js';
import {
  createDataSource,
  dataSourceForResponse,
  handleDataSource,
  handleDataSourceDictionary,
  handleTableDictionary,
  isDataSourceRoutePath,
  preloadRuntimeForRequest,
  readDataSourceAccessPolicy,
  sendDataSourceSchema,
  sendNotFoundWhenSourceHidden,
  sendNotFoundWhenTableHidden,
  sendSqlSchema
} from './foundation-data-source-handlers.js';
import {
  handlePublicApiWorkflow,
  sendApiWorkflowOpenApi,
  sendApiWorkflowRunLogs
} from './foundation-public-api-routes.js';
import type { DataSourceFoundationRouteContext } from './foundation-route-context.js';
import {
  isRecord,
  sendRawJson
} from './foundation-route-utils.js';
import {
  dataSources,
  findDataSource
} from './foundation-store.js';
import {
  noopEnsureDataSourcesLoaded,
  type EnsureDataSourcesLoaded
} from './prisma-runtime-sync.js';
import {
  canWriteDataSource,
  requiresAuthenticatedDataSourceAccess,
  scopedDataSourcesForRead,
  type DataSourceAccessPolicy
} from './source-access.js';

export class DataSourceFoundationRoutes {
  private readonly compatibilityRoutes: DataSourceCompatibilityRoutes;
  private readonly context: DataSourceFoundationRouteContext;
  private readonly customQueryRoutes: CustomQueryRoutes;

  constructor(
    prismaClient: IntraQPrismaClient | null = null,
    ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
    _codexAgent?: CodexAgentRuntime
  ) {
    this.context = { ensureDataSourcesLoaded, prismaClient };
    this.compatibilityRoutes = new DataSourceCompatibilityRoutes(prismaClient);
    this.customQueryRoutes = new CustomQueryRoutes(prismaClient);
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!isDataSourceRoutePath(url.pathname)) return false;
    if (await handlePublicApiWorkflow(this.context, req, res, url)) return true;
    await preloadRuntimeForRequest(this.context, url);
    const access = await this.accessPolicy(req);
    if (requiresAuthenticatedDataSourceAccess(access)) {
      sendUnauthorized(res, 'Authentication is required to access data sources.');
      return true;
    }

    if (await handleApiGroupManagement(this.context, req, res, url, access)) return true;

    if (req.method === 'GET' && url.pathname === '/api/data-sources') {
      sendRawJson(res, 200, scopedDataSourcesForRead(dataSources, access).map(dataSourceForResponse));
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/data-sources/builder-catalog') {
      sendRawJson(res, 200, await loadBuilderCatalogSources(this.context.prismaClient, access));
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/data-sources/analyzer-catalog') {
      sendRawJson(res, 200, await loadAnalyzerCatalogSources(this.context.prismaClient, access));
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/data-sources') {
      await createDataSource(this.context, req, res, access);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/data-sources/test-connection') {
      await sendConnectionTest(req, res, access, this.context.prismaClient);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/data-sources/query-preview') {
      await previewQuery(req, res, access, this.context.prismaClient);
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/data-sources/custom-query') {
      await this.customQueryRoutes.handleCollection(req, res, access);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/data-sources/custom-query') {
      await this.customQueryRoutes.handleCollection(req, res, access);
      return true;
    }

    const customQueryMatch = /^\/api\/data-sources\/custom-query\/([^/]+)$/.exec(url.pathname);
    if (customQueryMatch?.[1]) {
      await this.customQueryRoutes.handleItem(req, res, decodeURIComponent(customQueryMatch[1]), access);
      return true;
    }

    const dictionaryMatch = /^\/api\/data-sources\/tables\/([^/]+)\/dictionary$/.exec(url.pathname);
    if (dictionaryMatch?.[1]) {
      await handleTableDictionary(this.context, req, res, decodeURIComponent(dictionaryMatch[1]), access);
      return true;
    }

    const tableDataMatch = /^\/api\/data-sources\/([^/]+)\/tables\/([^/]+)\/data$/.exec(url.pathname);
    if ((req.method === 'GET' || req.method === 'POST') && tableDataMatch?.[1] && tableDataMatch[2]) {
      const dataSourceId = decodeURIComponent(tableDataMatch[1]);
      const tableId = decodeURIComponent(tableDataMatch[2]);
      if (!sendNotFoundWhenTableHidden(res, dataSourceId, tableId, access)) return true;
      await sendTableData(req, res, dataSourceId, tableId, this.context.prismaClient, access);
      return true;
    }

    const discoverMatch = /^\/api\/data-sources\/([^/]+)\/discover-tables$/.exec(url.pathname);
    if (req.method === 'GET' && discoverMatch?.[1]) {
      const dataSourceId = decodeURIComponent(discoverMatch[1]);
      if (!sendNotFoundWhenSourceHidden(res, dataSourceId, access)) return true;
      await sendDiscoveredTables(res, dataSourceId, this.context.prismaClient);
      return true;
    }

    const refreshSchemaMatch = /^\/api\/data-sources\/([^/]+)\/refresh-schema$/.exec(url.pathname);
    if (req.method === 'POST' && refreshSchemaMatch?.[1]) {
      await this.handleRefreshSchema(req, res, decodeURIComponent(refreshSchemaMatch[1]), access);
      return true;
    }

    const schemaMatch = /^\/api\/data-sources\/([^/]+)\/schema$/.exec(url.pathname);
    if (req.method === 'GET' && schemaMatch?.[1]) {
      sendDataSourceSchema(res, decodeURIComponent(schemaMatch[1]), access);
      return true;
    }

    const modelMetadataMatch = /^\/api\/data-sources\/([^/]+)\/model-metadata(?:\/(import|validate|test-question))?$/.exec(url.pathname);
    if (modelMetadataMatch?.[1]) {
      await handleModelMetadata(
        this.context,
        req,
        res,
        url,
        decodeURIComponent(modelMetadataMatch[1]),
        modelMetadataMatch[2] as 'import' | 'validate' | 'test-question' | undefined,
        access
      );
      return true;
    }

    const openApiMatch = /^\/api\/data-sources\/([^/]+)\/openapi\.json$/.exec(url.pathname);
    if (req.method === 'GET' && openApiMatch?.[1]) {
      sendApiWorkflowOpenApi(req, res, decodeURIComponent(openApiMatch[1]), access);
      return true;
    }

    const apiRunLogsMatch = /^\/api\/data-sources\/([^/]+)\/api-workflow-runs$/.exec(url.pathname);
    if (req.method === 'GET' && apiRunLogsMatch?.[1]) {
      sendApiWorkflowRunLogs(res, url, decodeURIComponent(apiRunLogsMatch[1]), access);
      return true;
    }

    const fieldValuesMatch = /^\/api\/data-sources\/([^/]+)\/field-values$/.exec(url.pathname);
    if (req.method === 'POST' && fieldValuesMatch?.[1]) {
      const dataSourceId = decodeURIComponent(fieldValuesMatch[1]);
      if (!sendNotFoundWhenSourceHidden(res, dataSourceId, access)) return true;
      await sendFieldValues(req, res, dataSourceId, this.context.prismaClient, access);
      return true;
    }

    const filterOptionsMatch = /^\/api\/data-sources\/([^/]+)\/filter-options$/.exec(url.pathname);
    if (req.method === 'POST' && filterOptionsMatch?.[1]) {
      const dataSourceId = decodeURIComponent(filterOptionsMatch[1]);
      if (!sendNotFoundWhenSourceHidden(res, dataSourceId, access)) return true;
      await sendFilterOptions(req, res, dataSourceId, this.context.prismaClient, access);
      return true;
    }

    const tablesMatch = /^\/api\/data-sources\/([^/]+)\/tables$/.exec(url.pathname);
    if (tablesMatch?.[1]) {
      const dataSourceId = decodeURIComponent(tablesMatch[1]);
      if (!sendNotFoundWhenSourceHidden(res, dataSourceId, access)) return true;
      await handleSourceTables(req, res, dataSourceId, this.context.prismaClient, access);
      return true;
    }

    const dataSourceDictionaryMatch = /^\/api\/data-sources\/([^/]+)\/dictionary$/.exec(url.pathname);
    if (dataSourceDictionaryMatch?.[1]) {
      await handleDataSourceDictionary(this.context, req, res, decodeURIComponent(dataSourceDictionaryMatch[1]), access);
      return true;
    }

    if (await this.compatibilityRoutes.handle(req, res, url, access)) return true;

    const dataSourceMatch = /^\/api\/data-sources\/([^/]+)$/.exec(url.pathname);
    if (dataSourceMatch?.[1]) {
      await handleDataSource(this.context, req, res, decodeURIComponent(dataSourceMatch[1]), access);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/sql-query/execute') {
      await executeSql(req, res, access, this.context.ensureDataSourcesLoaded, this.context.prismaClient);
      return true;
    }

    const sqlSchemaMatch = /^\/api\/sql-query\/schema\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && sqlSchemaMatch?.[1]) {
      sendSqlSchema(res, decodeURIComponent(sqlSchemaMatch[1]), access);
      return true;
    }

    return false;
  }

  private async handleRefreshSchema(
    req: IncomingMessage,
    res: ServerResponse,
    dataSourceId: string,
    access: DataSourceAccessPolicy
  ): Promise<void> {
    if (!sendNotFoundWhenSourceHidden(res, dataSourceId, access)) return;
    const source = findDataSource(dataSourceId);
    if (!source || !canWriteDataSource(source, access)) {
      sendJson(res, 403, fail('Data source access is denied'));
      return;
    }
    const body = await readJsonBody(req);
    const includeAllTables = isRecord(body) && body.includeAllTables === true;
    await refreshSchema(res, dataSourceId, this.context.prismaClient, { includeAllTables });
  }

  private async accessPolicy(req: IncomingMessage): Promise<DataSourceAccessPolicy> {
    return readDataSourceAccessPolicy(this.context, req);
  }
}

export function createDataSourceFoundationRoutes(
  prismaClient: IntraQPrismaClient | null = null,
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
  codexAgent?: CodexAgentRuntime
): DataSourceFoundationRoutes {
  return new DataSourceFoundationRoutes(prismaClient, ensureDataSourcesLoaded, codexAgent);
}
