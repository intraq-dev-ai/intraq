import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody } from '../../http.js';
import { readBearerToken } from '../auth-setup/auth-tokens.js';
import { scopedDashboardWhere, dashboardVisibilityWhere } from '../dashboard/dashboard-access.js';
import type { Dashboard, DashboardRuntimeStore } from '../dashboard/foundation-store.js';
import {
  importModelMetadata,
  listModelMetadata,
  listVisibleModelMetadata,
  testModelQuestion,
  validateModelMetadata
} from '../data-source/local-model-metadata.js';
import {
  dataSourceAccessPolicy
} from '../data-source/source-access.js';
import {
  noopEnsureDataSourcesLoaded,
  type EnsureDataSourcesLoaded
} from '../data-source/prisma-runtime-sync.js';
import { McpTokenService } from '../mcp-access/token-service.js';
import type { McpAuthenticatedPrincipal } from '../mcp-access/types.js';
import {
  executeMcpWorkflowTool,
  isMcpWorkflowTool
} from './workflow-tools.js';
import {
  executeMcpProductApiTool,
  isMcpProductApiTool,
  type ProductApiRouteHandler
} from './product-api-tools.js';
import type { JsonRpcId, JsonRpcRequest, McpToolDefinition, RpcResult } from './route-types.js';
import { MCP_PROTOCOL_VERSION, TOOL_DEFINITIONS } from './tool-definitions.js';
import {
  isMcpPath,
  isRecord,
  readHeader,
  readRpcId,
  rpcError,
  rpcSuccess,
  writeCors,
  writeJson
} from './route-utils.js';
import {
  dashboardDefinitionPayload,
  dashboardDetail,
  dashboardShellPayload,
  dashboardSummary,
  elementCreatePayload,
  elementDetail,
  elementUpdatePayload,
  filterCreatePayload,
  filterDetail,
  filterUpdatePayload,
  readLimit,
  readOptionalString,
  readRecordList,
  readRequiredString
} from './dashboard-payloads.js';
import {
  dataSourceWhere,
  hasToolScopes,
  systemStatus
} from './route-access.js';

export class McpHttpRoutes {
  private readonly sessions = new Map<string, { tokenId: string }>();

  constructor(
    private readonly tokenService: McpTokenService | null,
    private readonly prismaClient: IntraQPrismaClient | null,
    private readonly dashboardStore: DashboardRuntimeStore | null = null,
    private readonly ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
    private readonly productApiRouteHandlers: ProductApiRouteHandler[] = []
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!isMcpPath(url.pathname)) return false;
    if (req.method === 'OPTIONS') {
      writeCors(res, 204);
      res.end();
      return true;
    }

    const principal = await this.authenticate(req, res);
    if (!principal) return true;

    if (req.method === 'DELETE') {
      this.closeSession(req.headers);
      writeJson(res, 200, { closed: true });
      return true;
    }

    if (req.method !== 'POST') {
      writeJson(res, 405, rpcError(null, -32000, 'Use POST for the intraQ HTTP MCP endpoint.'));
      return true;
    }

    const body = await readJsonBody(req);
    if (body === null) {
      writeJson(res, 400, rpcError(null, -32700, 'Request body must be valid JSON.'));
      return true;
    }

    if (Array.isArray(body)) {
      await this.handleBatch(res, principal, body);
      return true;
    }

    const result = await this.handleSingle(principal, body);
    if (!result.payload) {
      writeCors(res, result.statusCode ?? 202, result.headers);
      res.end();
      return true;
    }
    writeJson(res, result.statusCode ?? 200, result.payload, result.headers);
    return true;
  }

  private async authenticate(req: IncomingMessage, res: ServerResponse): Promise<McpAuthenticatedPrincipal | null> {
    if (!this.tokenService) {
      writeJson(res, 503, rpcError(null, -32002, 'MCP token service is unavailable.'));
      return null;
    }
    const principal = await this.tokenService.authenticate(readBearerToken(req.headers.authorization));
    if (!principal) {
      writeJson(res, 401, rpcError(null, -32001, 'Missing or invalid MCP bearer token.'), {
        'www-authenticate': 'Bearer'
      });
      return null;
    }
    const sessionId = readHeader(req.headers, 'mcp-session-id');
    const session = sessionId ? this.sessions.get(sessionId) : null;
    if (session && session.tokenId !== principal.tokenId) {
      writeJson(res, 401, rpcError(null, -32001, 'MCP session does not match the bearer token.'));
      return null;
    }
    return principal;
  }

  private async handleBatch(
    res: ServerResponse,
    principal: McpAuthenticatedPrincipal,
    requests: unknown[]
  ): Promise<void> {
    const responses: unknown[] = [];
    for (const request of requests) {
      const result = await this.handleSingle(principal, request);
      if (result.payload) responses.push(result.payload);
    }
    if (responses.length === 0) {
      writeCors(res, 202);
      res.end();
      return;
    }
    writeJson(res, 200, responses);
  }

  private async handleSingle(principal: McpAuthenticatedPrincipal, value: unknown): Promise<RpcResult> {
    if (!isRecord(value)) return { payload: rpcError(null, -32600, 'JSON-RPC request must be an object.'), statusCode: 400 };
    const request = value as JsonRpcRequest;
    const id = readRpcId(request.id);
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return { payload: rpcError(id, -32600, 'JSON-RPC request must include jsonrpc 2.0 and a method.'), statusCode: 400 };
    }
    if (!('id' in request) && request.method.startsWith('notifications/')) return {};

    try {
      if (request.method === 'initialize') return this.initialize(id, principal);
      if (request.method === 'tools/list') return { payload: rpcSuccess(id, { tools: this.visibleTools(principal) }) };
      if (request.method === 'tools/call') return { payload: rpcSuccess(id, await this.callTool(principal, request.params)) };
      return { payload: rpcError(id, -32601, `Unsupported MCP method: ${request.method}`), statusCode: 404 };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MCP request failed.';
      return { payload: rpcError(id, -32000, message), statusCode: 400 };
    }
  }

  private initialize(id: JsonRpcId, principal: McpAuthenticatedPrincipal): RpcResult {
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { tokenId: principal.tokenId });
    return {
      headers: { 'mcp-session-id': sessionId },
      payload: rpcSuccess(id, {
        capabilities: { tools: { listChanged: false } },
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: { name: 'intraq-http-mcp', version: '0.1.0' }
      })
    };
  }

  private async callTool(principal: McpAuthenticatedPrincipal, params: unknown): Promise<unknown> {
    if (!isRecord(params) || typeof params.name !== 'string') throw new Error('tools/call requires a tool name.');
    const tool = TOOL_DEFINITIONS.find(item => item.name === params.name);
    if (!tool || !hasToolScopes(principal, tool)) throw new Error('Tool is not available for this token.');
    const args = isRecord(params.arguments) ? params.arguments : {};
    const data = await this.executeTool(tool.name, principal, args);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: data
    };
  }

  private visibleTools(principal: McpAuthenticatedPrincipal): Array<Omit<McpToolDefinition, 'scope'>> {
    return TOOL_DEFINITIONS
      .filter(tool => hasToolScopes(principal, tool))
      .map(({ scope: _scope, ...tool }) => tool);
  }

  private async executeTool(
    name: string,
    principal: McpAuthenticatedPrincipal,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (name === 'get_system_status') return systemStatus(principal);
    if (name === 'list_dashboards') return this.listDashboards(principal, args);
    if (name === 'get_dashboard') return this.getDashboard(principal, args);
    if (name === 'create_dashboard') return this.createDashboard(principal, args);
    if (name === 'save_dashboard_definition') return this.saveDashboardDefinition(principal, args);
    if (name === 'update_dashboard') return this.updateDashboard(principal, args);
    if (name === 'add_dashboard_element') return this.addDashboardElement(principal, args);
    if (name === 'update_dashboard_element') return this.updateDashboardElement(principal, args);
    if (name === 'add_dashboard_filter') return this.addDashboardFilter(principal, args);
    if (name === 'update_dashboard_filter') return this.updateDashboardFilter(principal, args);
    if (name === 'publish_dashboard') return this.publishDashboard(principal, args);
    if (isMcpWorkflowTool(name)) {
      await this.ensureDataSourcesLoaded();
      return executeMcpWorkflowTool(name, {
        args,
        dashboardStore: this.dashboardStore,
        principal,
        prismaClient: this.prismaClient
      });
    }
    if (isMcpProductApiTool(name)) {
      await this.ensureDataSourcesLoaded();
      return executeMcpProductApiTool(name, {
        args,
        principal,
        routeHandlers: this.productApiRouteHandlers
      });
    }
    if (name === 'list_ai_model_metadata') return this.listAiModelMetadata(principal, args);
    if (name === 'get_ai_model_metadata') return this.getAiModelMetadata(principal, args);
    if (name === 'validate_ai_model_metadata') return this.validateAiModelMetadata(principal, args);
    if (name === 'test_ai_model_question_mapping') return this.testAiModelQuestionMapping(principal, args);
    if (name === 'import_ai_model_metadata') return this.importAiModelMetadata(principal, args);
    if (!this.prismaClient) throw new Error('Database-backed MCP tools are unavailable.');
    if (name === 'list_data_sources') return this.listDataSources(principal, args);
    throw new Error(`Unknown MCP tool: ${name}`);
  }

  private async listDashboards(principal: McpAuthenticatedPrincipal, args: Record<string, unknown>): Promise<unknown> {
    if (this.dashboardStore) {
      const status = args.status === 'draft' || args.status === 'published' ? args.status : undefined;
      const dashboards = (await this.dashboardStore.listDashboards(principal))
        .filter(dashboard => !status || dashboard.status === status)
        .slice(0, readLimit(args.limit))
        .map(dashboardSummary);
      return { dashboards, total: dashboards.length };
    }
    if (!this.prismaClient) throw new Error('Dashboard MCP tools are unavailable.');
    const where = await dashboardVisibilityWhere(this.prismaClient!, principal);
    const status = args.status === 'draft' || args.status === 'published' ? args.status : undefined;
    const queryWhere = status ? { AND: [where ?? {}, { status }] } : where;
    const dashboards = await this.prismaClient!.dashboard.findMany({
      ...(queryWhere ? { where: queryWhere } : {}),
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        section: true,
        status: true,
        tenantId: true,
        updatedAt: true
      },
      take: readLimit(args.limit)
    });
    return {
      dashboards: dashboards.map(item => ({
        ...item,
        updatedAt: item.updatedAt.toISOString()
      })),
      total: dashboards.length
    };
  }

  private async getDashboard(principal: McpAuthenticatedPrincipal, args: Record<string, unknown>): Promise<unknown> {
    const dashboardId = typeof args.dashboardId === 'string' ? args.dashboardId.trim() : '';
    if (!dashboardId) throw new Error('dashboardId is required.');
    if (this.dashboardStore) {
      const dashboard = await this.dashboardStore.getDashboard(dashboardId, principal);
      if (!dashboard) throw new Error('Dashboard not found or not visible to this token.');
      return dashboardDetail(dashboard);
    }
    if (!this.prismaClient) throw new Error('Dashboard MCP tools are unavailable.');
    const visibilityWhere = await dashboardVisibilityWhere(this.prismaClient!, principal);
    const dashboard = await this.prismaClient!.dashboard.findFirst({
      where: scopedDashboardWhere(dashboardId, visibilityWhere),
      include: {
        elements: { orderBy: { order: 'asc' } },
        filters: { orderBy: { order: 'asc' } }
      }
    });
    if (!dashboard) throw new Error('Dashboard not found or not visible to this token.');
    return {
      id: dashboard.id,
      name: dashboard.name,
      section: dashboard.section,
      status: dashboard.status,
      filters: dashboard.filters.map(filter => ({ id: filter.id, name: filter.name, type: filter.type })),
      elements: dashboard.elements.map(element => ({
        chartType: element.chartType,
        dataSourceId: element.dataSourceId,
        id: element.id,
        name: element.name,
        order: element.order,
        type: element.type
      }))
    };
  }

  private async createDashboard(principal: McpAuthenticatedPrincipal, args: Record<string, unknown>): Promise<unknown> {
    if (!this.dashboardStore) throw new Error('Dashboard creation is unavailable.');
    const payload = dashboardShellPayload(args);
    const dashboard = await this.dashboardStore.createDashboard(payload, principal);
    for (const elementInput of readRecordList(args.elements)) {
      const element = await this.dashboardStore.createElement(dashboard.id, elementCreatePayload(elementInput), principal);
      if (!element) throw new Error('Dashboard was created, but a component could not be added.');
    }
    for (const filterInput of readRecordList(args.filters)) {
      const filter = await this.dashboardStore.createFilter(dashboard.id, filterCreatePayload(filterInput), principal);
      if (!filter) throw new Error('Dashboard was created, but a filter could not be added.');
    }
    const latest = await this.dashboardStore.getDashboard(dashboard.id, principal) ?? dashboard;
    const published = args.publish === true ? await this.dashboardStore.publishDashboard(dashboard.id, principal) : latest;
    if (!published) throw new Error('Dashboard was created but could not be published.');
    return dashboardDetail(published);
  }

  private async saveDashboardDefinition(principal: McpAuthenticatedPrincipal, args: Record<string, unknown>): Promise<unknown> {
    if (!this.dashboardStore) throw new Error('Dashboard definition saving is unavailable.');
    const requestedDashboardId = readOptionalString(args.dashboardId);
    const matchByName = args.matchByName !== false;
    const existingDashboard = requestedDashboardId
      ? await this.dashboardStore.getDashboard(requestedDashboardId, principal)
      : matchByName
        ? await this.findDashboardByName(principal, readRequiredString(args.name, 'name'), readOptionalString(args.category))
        : null;
    if (existingDashboard) {
      const dashboard = await this.updateDashboardDefinition(existingDashboard.id, args, principal);
      return { operation: 'updated', dashboard };
    }

    const dashboard = await this.createDashboardFromDefinition(args, principal);
    return { operation: 'created', dashboard };
  }

  private async updateDashboard(principal: McpAuthenticatedPrincipal, args: Record<string, unknown>): Promise<unknown> {
    if (!this.dashboardStore) throw new Error('Dashboard updates are unavailable.');
    const dashboardId = readRequiredString(args.dashboardId, 'dashboardId');
    const dashboard = await this.updateDashboardDefinition(dashboardId, args, principal);
    return { operation: 'updated', dashboard };
  }

  private async addDashboardElement(principal: McpAuthenticatedPrincipal, args: Record<string, unknown>): Promise<unknown> {
    if (!this.dashboardStore) throw new Error('Dashboard component creation is unavailable.');
    const dashboardId = readRequiredString(args.dashboardId, 'dashboardId');
    const element = await this.dashboardStore.createElement(dashboardId, elementCreatePayload(args), principal);
    if (!element) throw new Error('Dashboard not found or not writable by this token.');
    return elementDetail(element);
  }

  private async updateDashboardElement(principal: McpAuthenticatedPrincipal, args: Record<string, unknown>): Promise<unknown> {
    if (!this.dashboardStore) throw new Error('Dashboard component updates are unavailable.');
    const elementId = readRequiredString(args.elementId, 'elementId');
    const element = await this.dashboardStore.updateElement(elementId, elementUpdatePayload(args), principal);
    if (!element) throw new Error('Dashboard component not found or not writable by this token.');
    return elementDetail(element);
  }

  private async addDashboardFilter(principal: McpAuthenticatedPrincipal, args: Record<string, unknown>): Promise<unknown> {
    if (!this.dashboardStore) throw new Error('Dashboard filter creation is unavailable.');
    const dashboardId = readRequiredString(args.dashboardId, 'dashboardId');
    const filter = await this.dashboardStore.createFilter(dashboardId, filterCreatePayload(args), principal);
    if (!filter) throw new Error('Dashboard not found or not writable by this token.');
    return filterDetail(filter);
  }

  private async updateDashboardFilter(principal: McpAuthenticatedPrincipal, args: Record<string, unknown>): Promise<unknown> {
    if (!this.dashboardStore) throw new Error('Dashboard filter updates are unavailable.');
    const dashboardId = readRequiredString(args.dashboardId, 'dashboardId');
    const filterId = readRequiredString(args.filterId, 'filterId');
    const filter = await this.dashboardStore.updateFilter(dashboardId, filterId, filterUpdatePayload(args), principal);
    if (!filter) throw new Error('Dashboard filter not found or not writable by this token.');
    return filterDetail(filter);
  }

  private async publishDashboard(principal: McpAuthenticatedPrincipal, args: Record<string, unknown>): Promise<unknown> {
    if (!this.dashboardStore) throw new Error('Dashboard publishing is unavailable.');
    const dashboardId = readRequiredString(args.dashboardId, 'dashboardId');
    const dashboard = await this.dashboardStore.publishDashboard(dashboardId, principal);
    if (!dashboard) throw new Error('Dashboard not found or not writable by this token.');
    return dashboardDetail(dashboard);
  }

  private async findDashboardByName(
    principal: McpAuthenticatedPrincipal,
    name: string,
    category: string | null
  ): Promise<Dashboard | null> {
    if (!this.dashboardStore) return null;
    const normalizedName = name.trim().toLowerCase();
    const normalizedCategory = category?.trim().toLowerCase() ?? null;
    const dashboards = await this.dashboardStore.listDashboards(principal, { limit: 100 });
    return dashboards.find(dashboard =>
      dashboard.name.trim().toLowerCase() === normalizedName
      && (!normalizedCategory || dashboard.category.trim().toLowerCase() === normalizedCategory)
    ) ?? null;
  }

  private async createDashboardFromDefinition(
    args: Record<string, unknown>,
    principal: McpAuthenticatedPrincipal
  ): Promise<Record<string, unknown>> {
    if (!this.dashboardStore) throw new Error('Dashboard definition saving is unavailable.');
    const created = await this.dashboardStore.createDashboard(
      dashboardDefinitionPayload(args, { requireName: true }) as Record<string, unknown> & { name: string },
      principal
    );
    const published = args.publish === true || args.status === 'published'
      ? await this.dashboardStore.publishDashboard(created.id, principal)
      : created;
    if (!published) throw new Error('Dashboard was created but could not be published.');
    return dashboardDetail(published);
  }

  private async updateDashboardDefinition(
    dashboardId: string,
    args: Record<string, unknown>,
    principal: McpAuthenticatedPrincipal
  ): Promise<Record<string, unknown>> {
    if (!this.dashboardStore) throw new Error('Dashboard definition saving is unavailable.');
    const updated = await this.dashboardStore.updateDashboard(dashboardId, dashboardDefinitionPayload(args), principal);
    if (!updated) throw new Error('Dashboard not found or not writable by this token.');
    const published = args.publish === true || args.status === 'published'
      ? await this.dashboardStore.publishDashboard(dashboardId, principal)
      : updated;
    if (!published) throw new Error('Dashboard was updated but could not be published.');
    return dashboardDetail(published);
  }

  private async listDataSources(principal: McpAuthenticatedPrincipal, args: Record<string, unknown>): Promise<unknown> {
    const where = dataSourceWhere(principal);
    const dataSources = await this.prismaClient!.dataSource.findMany({
      ...(where ? { where } : {}),
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        isActive: true,
        isSample: true,
        tenantId: true,
        updatedAt: true,
        _count: { select: { tables: true } }
      },
      take: readLimit(args.limit)
    });
    return {
      dataSources: dataSources.map(source => ({
        id: source.id,
        isActive: source.isActive,
        isSample: source.isSample,
        name: source.name,
        tableCount: source._count.tables,
        tenantId: source.tenantId,
        type: source.type,
        updatedAt: source.updatedAt.toISOString()
      })),
      total: dataSources.length
    };
  }

  private async listAiModelMetadata(
    principal: McpAuthenticatedPrincipal,
    args: Record<string, unknown>
  ): Promise<unknown> {
    await this.ensureDataSourcesLoaded();
    const access = await dataSourceAccessPolicy(principal, this.prismaClient);
    return listVisibleModelMetadata({ access, prismaClient: this.prismaClient }, readLimit(args.limit));
  }

  private async getAiModelMetadata(
    principal: McpAuthenticatedPrincipal,
    args: Record<string, unknown>
  ): Promise<unknown> {
    await this.ensureDataSourcesLoaded();
    const access = await dataSourceAccessPolicy(principal, this.prismaClient);
    return listModelMetadata(
      readRequiredString(args.dataSourceId, 'dataSourceId'),
      { access, prismaClient: this.prismaClient },
      readOptionalString(args.table)
    );
  }

  private async validateAiModelMetadata(
    principal: McpAuthenticatedPrincipal,
    args: Record<string, unknown>
  ): Promise<unknown> {
    await this.ensureDataSourcesLoaded();
    const access = await dataSourceAccessPolicy(principal, this.prismaClient);
    return validateModelMetadata(
      readRequiredString(args.dataSourceId, 'dataSourceId'),
      { access, prismaClient: this.prismaClient },
      readOptionalString(args.table)
    );
  }

  private async testAiModelQuestionMapping(
    principal: McpAuthenticatedPrincipal,
    args: Record<string, unknown>
  ): Promise<unknown> {
    await this.ensureDataSourcesLoaded();
    const access = await dataSourceAccessPolicy(principal, this.prismaClient);
    return testModelQuestion(
      readRequiredString(args.dataSourceId, 'dataSourceId'),
      { access, prismaClient: this.prismaClient },
      readRequiredString(args.question, 'question'),
      readOptionalString(args.table)
    );
  }

  private async importAiModelMetadata(
    principal: McpAuthenticatedPrincipal,
    args: Record<string, unknown>
  ): Promise<unknown> {
    await this.ensureDataSourcesLoaded();
    const access = await dataSourceAccessPolicy(principal, this.prismaClient);
    return importModelMetadata(
      readRequiredString(args.dataSourceId, 'dataSourceId'),
      { access, prismaClient: this.prismaClient },
      args
    );
  }

  private closeSession(headers: IncomingHttpHeaders): void {
    const sessionId = readHeader(headers, 'mcp-session-id');
    if (sessionId) this.sessions.delete(sessionId);
  }
}

export function createMcpHttpRoutes(
  tokenService: McpTokenService | null,
  prismaClient: IntraQPrismaClient | null,
  dashboardStore: DashboardRuntimeStore | null = null,
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
  productApiRouteHandlers: ProductApiRouteHandler[] = []
): McpHttpRoutes {
  return new McpHttpRoutes(tokenService, prismaClient, dashboardStore, ensureDataSourcesLoaded, productApiRouteHandlers);
}
