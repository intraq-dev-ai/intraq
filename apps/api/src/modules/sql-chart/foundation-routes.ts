import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fail } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import { getRequestSecurityContext } from '../../security/request-context.js';
import type { ApiRuntimeStateOptions } from '../data-source/api-data-source-runtime.js';
import type { DataSourceRecord } from '../data-source/foundation-store.js';
import { updateRuntimeDataSource } from '../data-source/prisma-runtime-persistence.js';
import {
  noopEnsureDataSourcesLoaded,
  type EnsureDataSourcesLoaded
} from '../data-source/prisma-runtime-sync.js';
import {
  dataSourceAccessPolicy,
  type DataSourceAccessPolicy
} from '../data-source/source-access.js';
import {
  createCodexAgentRuntime,
  type CodexAgentResult,
  type CodexAgentRuntime
} from '../codex-agent/codex-agent-runtime.js';
import { applyChartFilters, chartConfigForLoadedRows, numericStats } from './chart-data-builder.js';
import { sendChartDataForBody } from './chart-data-routes.js';
import { sendChartDataCsvDownloadForBody, sendChartDataExportForBody } from './chart-export-routes.js';
import { resolveWorkflowExportRequestForPrisma } from './chart-export-workflows.js';
import { chartFields, mergeChartConfigWithComponentConfig, normalizeChartConfig, validateChartBody } from './chart-config.js';
import { lookupSource, lookupTable } from './chart-source-lookup.js';
import { parseChartRequest } from './chart-request-parser.js';
import { chartDataOperationTimeoutMs, loadChartRows } from './chart-row-loader.js';
import type { ComponentConfig } from './component-sql-builder/index.js';
import type { ChartDataExportItem, ChartRequestParseResult, WorkflowExportResolution } from './foundation-route-types.js';
import {
  asString,
  completeEventContent,
  isNonEmptyString,
  isRecord,
  isSqlChartRoutePath,
  readParameterValues,
  sendEventStream,
  sendRawJson,
  sendSqlTimeout
} from './foundation-route-utils.js';
import {
  SqlAssistantAgent,
  SqlAssistantAgentUnavailableError
} from './sql-assistant-agent.js';
import {
  SqlAssistantConversationStore,
  type SqlAssistantConversationRepository
} from './sql-assistant-conversations.js';
import { SqlAssistantPrismaConversationStore } from './sql-assistant-prisma-conversations.js';
import { suggestedQueries } from './sql-assistant-planner.js';
import { SqlEditorRoutes } from './sql-editor-routes.js';
import { executeSqlEditorQuery } from './sql-editor-service.js';
import {
  SqlOperationTimeoutError,
  withSqlOperationTimeout
} from './sql-operation-timeout.js';

export { sendChartDataForBody } from './chart-data-routes.js';
export { sendChartDataExportForBody } from './chart-export-routes.js';
export { resolveWorkflowExportRequestForPrisma } from './chart-export-workflows.js';
export type { WorkflowExportResolution, WorkflowExportResolver } from './foundation-route-types.js';

export class SqlChartFoundationRoutes {
  private readonly exportTickets = new Map<string, {
    body: unknown;
    expiresAt: number;
    tenantId?: string;
    userId?: string;
  }>();
  private readonly sqlEditorRoutes: SqlEditorRoutes;
  private readonly sqlAssistantAgent: SqlAssistantAgent;

  constructor(
    private readonly sqlAssistantConversations: SqlAssistantConversationRepository = new SqlAssistantConversationStore(),
    private readonly ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
    codexAgent: CodexAgentRuntime = createCodexAgentRuntime(),
    private readonly prismaClient: IntraQPrismaClient | null = null
  ) {
    this.sqlEditorRoutes = new SqlEditorRoutes(
      req => this.accessPolicy(req),
      this.ensureDataSourcesLoaded,
      source => this.persistApiRuntimeSourceConfig(source)
    );
    this.sqlAssistantAgent = new SqlAssistantAgent(codexAgent);
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!isSqlChartRoutePath(url.pathname)) return false;

    if (req.method === 'POST' && url.pathname === '/api/chart-data') {
      await this.sendChartData(req, res);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/chart-data/export') {
      await this.exportChartData(req, res);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/chart-data/export-tickets') {
      await this.createChartDataExportTicket(req, res);
      return true;
    }

    const exportDownloadMatch = /^\/api\/chart-data\/export-download\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && exportDownloadMatch?.[1]) {
      await this.downloadChartDataExport(req, res, exportDownloadMatch[1]);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/chart-data/summary') {
      await this.sendChartDataSummary(req, res);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/chart-data/validate') {
      await this.validateChart(req, res);
      return true;
    }

    if (await this.sqlEditorRoutes.handle(req, res, url)) return true;

    try {
      await withSqlOperationTimeout(this.ensureDataSourcesLoaded(), 'SQL data source catalog load timed out.');
    } catch (error) {
      if (sendSqlTimeout(res, error)) return true;
      throw error;
    }

    if (req.method === 'GET' && url.pathname === '/api/ai-sql-assistant/conversation') {
      await this.restoreAssistantConversation(req, res, url);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/ai-sql-assistant/conversation') {
      await this.createAssistantConversation(req, res);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/ai-sql-assistant/conversation/reset-session') {
      await this.resetAssistantConversation(req, res);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/ai-sql-assistant/assistance') {
      await this.assist(req, res);
      return true;
    }

    const schemaMatch = /^\/api\/ai-sql-assistant\/schema\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && schemaMatch?.[1]) {
      this.sendSchema(res, decodeURIComponent(schemaMatch[1]), await this.accessPolicy(req));
      return true;
    }

    const suggestionsMatch = /^\/api\/ai-sql-assistant\/suggestions\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && suggestionsMatch?.[1]) {
      this.sendSuggestions(res, decodeURIComponent(suggestionsMatch[1]), await this.accessPolicy(req));
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/ai-sql-assistant/tools') {
      await this.runTool(req, res);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/chart-summary') {
      await this.summarizeChart(req, res);
      return true;
    }

    return false;
  }

  private async assist(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const access = await this.accessPolicy(req);
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.dataSourceId) || !isNonEmptyString(body.userMessage)) {
      sendRawJson(res, 400, { error: 'Data source ID and user message are required' });
      return;
    }
    const source = lookupSource(body.dataSourceId, access);
    if (!source) {
      sendRawJson(res, 404, { error: 'Data source not found' });
      return;
    }

    const conversation = await this.sqlAssistantConversations.ensure(
      source.id,
      asString(body.conversationId),
      body.userMessage.trim(),
      { dataSourceName: source.name, dataSourceType: source.type }
    );
    await this.sqlAssistantConversations.appendMessage(source.id, conversation.conversation.id, 'user', body.userMessage.trim());
    let events: Array<Record<string, unknown>>;
    try {
      events = await this.sqlAssistantAgent.assist({
        conversationId: conversation.conversation.id,
        currentQuery: asString(body.currentQuery),
        parameterValues: readParameterValues(body),
        source,
        tenantId: getRequestSecurityContext(req)?.tenantId ?? null,
        userMessage: body.userMessage.trim()
      });
    } catch (error) {
      if (error instanceof SqlAssistantAgentUnavailableError) {
        sendRawJson(res, 503, {
          success: false,
          error: error.message,
          details: agentUnavailableDetails(error.agentProvider)
        });
        return;
      }
      throw error;
    }
    const assistantContent = completeEventContent(events);
    if (assistantContent) {
      await this.sqlAssistantConversations.appendMessage(source.id, conversation.conversation.id, 'assistant', assistantContent);
    }
    sendEventStream(res, events);
  }

  private async restoreAssistantConversation(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const access = await this.accessPolicy(req);
    const dataSourceId = url.searchParams.get('dataSourceId')?.trim() ?? '';
    if (!dataSourceId) {
      sendBadRequest(res, 'dataSourceId is required');
      return;
    }
    const source = lookupSource(dataSourceId, access);
    if (!source) {
      sendJson(res, 404, fail('Data source not found'));
      return;
    }
    sendOk(res, await this.sqlAssistantConversations.restore(source.id, url.searchParams.get('conversationId')));
  }

  private async createAssistantConversation(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const access = await this.accessPolicy(req);
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.dataSourceId)) {
      sendBadRequest(res, 'dataSourceId is required');
      return;
    }
    const source = lookupSource(body.dataSourceId, access);
    if (!source) {
      sendJson(res, 404, fail('Data source not found'));
      return;
    }
    const snapshot = await this.sqlAssistantConversations.create(
      source.id,
      asString(body.title) ?? 'New SQL conversation',
      { dataSourceName: source.name, dataSourceType: source.type },
      asString(body.conversationId)
    );
    sendOk(res, snapshot);
  }

  private async resetAssistantConversation(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const access = await this.accessPolicy(req);
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.dataSourceId) || !isNonEmptyString(body.conversationId)) {
      sendBadRequest(res, 'dataSourceId and conversationId are required');
      return;
    }
    const source = lookupSource(body.dataSourceId, access);
    if (!source) {
      sendJson(res, 404, fail('Data source not found'));
      return;
    }
    const snapshot = await this.sqlAssistantConversations.clearSession(source.id, body.conversationId.trim());
    if (!snapshot) {
      sendJson(res, 404, fail('SQL assistant conversation not found'));
      return;
    }
    sendOk(res, snapshot);
  }

  private sendSchema(res: ServerResponse, dataSourceId: string, access: DataSourceAccessPolicy): void {
    const source = lookupSource(dataSourceId, access);
    if (!source) {
      sendRawJson(res, 404, { error: 'Data source not found' });
      return;
    }
    sendRawJson(res, 200, {
      dataSource: { id: source.id, name: source.name, type: source.type },
      tables: source.tables.map(table => ({
        name: table.name,
        description: table.description,
        guidance: table.guidance,
        columns: table.columns.map(column => ({ ...column, nullable: false }))
      }))
    });
  }

  private sendSuggestions(res: ServerResponse, dataSourceId: string, access: DataSourceAccessPolicy): void {
    const source = lookupSource(dataSourceId, access);
    if (!source) {
      sendRawJson(res, 404, { error: 'Data source not found' });
      return;
    }
    sendRawJson(res, 200, { suggestions: suggestedQueries(source) });
  }

  private async runTool(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const access = await this.accessPolicy(req);
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.dataSourceId) || !isNonEmptyString(body.tool)) {
      sendBadRequest(res, 'dataSourceId and tool are required');
      return;
    }
    const source = lookupSource(body.dataSourceId, access);
    if (!source) {
      sendJson(res, 404, fail('Data source not found'));
      return;
    }
    const tool = body.tool.trim();
    if (tool === 'schema') {
      sendRawJson(res, 200, {
        success: true,
        data: {
          tables: source.tables.map(table => ({
            name: table.name,
            description: table.description,
            guidance: table.guidance,
            fields: table.columns
          }))
        }
      });
      return;
    }
    if (tool === 'suggest_queries') {
      sendRawJson(res, 200, { success: true, data: { suggestions: [] } });
      return;
    }
    if (tool === 'execute_sql') {
      const args = isRecord(body.args) ? body.args : {};
      const sql = asString(args.sql) ?? asString(args.query);
      if (!sql) {
        sendBadRequest(res, 'args.sql is required for execute_sql');
        return;
      }
      const result = await executeSqlEditorQuery(source.id, sql, {
        ...this.apiRuntimeStateOptions(),
        parameterValues: readParameterValues(args),
        policy: access
      });
      if (!result.ok) {
        sendJson(res, result.statusCode, fail(result.error));
        return;
      }
      sendRawJson(res, 200, { success: true, data: result.data });
      return;
    }
    sendBadRequest(res, `Unsupported SQL assistant tool: ${tool}`);
  }

  private async sendChartData(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const access = await this.accessPolicy(req);
    const body = await readJsonBody(req);
    await sendChartDataForBody(body, res, access, this.ensureDataSourcesLoaded, this.apiRuntimeStateOptions());
  }

  private async exportChartData(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const access = await this.accessPolicy(req);
    const body = await readJsonBody(req);
    await sendChartDataExportForBody(
      body,
      res,
      access,
      this.ensureDataSourcesLoaded,
      (exportItem, request) => this.resolveWorkflowExportRequest(exportItem, request),
      this.apiRuntimeStateOptions()
    );
  }

  private async createChartDataExportTicket(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendRawJson(res, 400, { success: false, error: 'Export request body is required' });
      return;
    }
    this.pruneExpiredExportTickets();
    const security = getRequestSecurityContext(req);
    const id = randomUUID();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    this.exportTickets.set(id, {
      body,
      expiresAt,
      ...(security?.tenantId ? { tenantId: security.tenantId } : {}),
      ...(security?.userId ? { userId: security.userId } : {})
    });
    sendOk(res, {
      downloadUrl: `/api/chart-data/export-download/${encodeURIComponent(id)}`,
      expiresAt: new Date(expiresAt).toISOString()
    });
  }

  private async downloadChartDataExport(req: IncomingMessage, res: ServerResponse, ticketId: string): Promise<void> {
    this.pruneExpiredExportTickets();
    const ticket = this.exportTickets.get(ticketId);
    if (!ticket) {
      sendRawJson(res, 404, { success: false, error: 'Export ticket not found or expired' });
      return;
    }
    const security = getRequestSecurityContext(req);
    if (
      (ticket.tenantId && ticket.tenantId !== security?.tenantId)
      || (ticket.userId && ticket.userId !== security?.userId)
    ) {
      sendRawJson(res, 403, { success: false, error: 'Export ticket is not available for this user' });
      return;
    }
    this.exportTickets.delete(ticketId);
    const access = await this.accessPolicy(req);
    await sendChartDataCsvDownloadForBody(
      ticket.body,
      res,
      access,
      this.ensureDataSourcesLoaded,
      (exportItem, request) => this.resolveWorkflowExportRequest(exportItem, request),
      this.apiRuntimeStateOptions()
    );
  }

  private pruneExpiredExportTickets(): void {
    const now = Date.now();
    for (const [id, ticket] of this.exportTickets) {
      if (ticket.expiresAt <= now) this.exportTickets.delete(id);
    }
  }

  private async resolveWorkflowExportRequest(
    item: ChartDataExportItem,
    request: unknown
  ): Promise<WorkflowExportResolution> {
    return resolveWorkflowExportRequestForPrisma(this.prismaClient, item, request);
  }

  private async sendChartDataSummary(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsed = await this.parseChartRequestWithTimeout(req, 'Chart data source load timed out.');
    if ('error' in parsed) {
      sendRawJson(res, 'statusCode' in parsed ? parsed.statusCode : 400, { success: false, error: parsed.error });
      return;
    }
    const rows = await withSqlOperationTimeout(
      loadChartRows({ ...parsed, apiRuntimeState: this.apiRuntimeStateOptions() }),
      'Chart data query timed out.',
      chartDataOperationTimeoutMs(parsed)
    ).catch(error => {
      if (error instanceof SqlOperationTimeoutError) return { error: error.message, statusCode: 504 } as const;
      throw error;
    });
    if ('error' in rows) {
      sendRawJson(res, rows.statusCode, { success: false, error: rows.error });
      return;
    }
    const chartConfig = chartConfigForLoadedRows(parsed.chartConfig, parsed.componentConfig, rows.rows, rows.rowsAggregatedAtSource);
    const summaryRows = rows.filtersAppliedAtSource ? rows.rows : applyChartFilters(rows.rows, chartConfig.filters);
    const field = chartConfig.yFields[0] ?? parsed.table.columns.find(column => column.type === 'number')?.name ?? '';
    const values = summaryRows.map(row => Number(row[field])).filter(Number.isFinite);
    sendRawJson(res, 200, {
      success: true,
      data: {
        summary: { rowCount: summaryRows.length, xField: chartConfig.xField, yFields: chartConfig.yFields },
        sampleData: summaryRows.slice(0, 2),
        statistics: { [field]: numericStats(values) },
        optimizedForAI: true
      }
    });
  }

  private async validateChart(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (isRecord(body) && isNonEmptyString(body.dataSourceId)) {
      try {
        await withSqlOperationTimeout(
          this.ensureDataSourcesLoaded({ dataSourceId: body.dataSourceId.trim() }),
          'Chart validation data source load timed out.'
        );
      } catch (error) {
        if (sendSqlTimeout(res, error)) return;
        throw error;
      }
    }
    const access = await this.accessPolicy(req);
    const config = isRecord(body) ? normalizeChartConfig(body.visualization ?? body.chartConfig) : null;
    const componentConfig = isRecord(body) && isRecord(body.componentConfig) ? (body.componentConfig as ComponentConfig) : null;
    const mergedConfig = mergeChartConfigWithComponentConfig(config, componentConfig);
    const chartTable = isRecord(body) && isNonEmptyString(body.dataSourceId) && isNonEmptyString(body.tableName)
      ? lookupTable(body.dataSourceId, body.tableName, access)
      : null;
    const errors = validateChartBody(body, mergedConfig, chartTable?.table ?? null, access);
    const warnings = mergedConfig && mergedConfig.yFields.length > 2 ? ['Too many Y-fields may impact performance'] : [];
    const suggestions = mergedConfig?.limit ? [] : ['Consider adding a limit for better performance'];
    sendRawJson(res, 200, { success: true, validation: { valid: errors.length === 0, errors, warnings, suggestions } });
  }

  private async summarizeChart(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.chartType) || !Array.isArray(body.chartData)) {
      sendRawJson(res, 400, { error: 'Missing required fields: chartType and chartData are required' });
      return;
    }
    const chartConfig = isRecord(body.chartConfig) ? body.chartConfig : {};
    const title = asString(chartConfig.title) ?? 'Chart';
    const fields = chartFields(body.chartData, chartConfig);
    const fieldText = fields.length ? ` using ${fields.join(', ')}` : '';
    const summary = `${title} contains ${body.chartData.length} ${body.chartType.trim()} data points${fieldText}.`;
    sendRawJson(res, 200, { success: true, summary, chartType: body.chartType.trim(), dataCount: body.chartData.length });
  }

  private async accessPolicy(req: IncomingMessage): Promise<DataSourceAccessPolicy> {
    return dataSourceAccessPolicy(getRequestSecurityContext(req), this.prismaClient);
  }

  private async parseChartRequestWithTimeout(
    req: IncomingMessage,
    timeoutMessage: string
  ): Promise<ChartRequestParseResult | { error: string; statusCode: 504 }> {
    const access = await this.accessPolicy(req);
    try {
      return await withSqlOperationTimeout(
        parseChartRequest(req, access, this.ensureDataSourcesLoaded),
        timeoutMessage
      );
    } catch (error) {
      if (error instanceof SqlOperationTimeoutError) return { error: error.message, statusCode: 504 };
      throw error;
    }
  }

  private apiRuntimeStateOptions(): ApiRuntimeStateOptions {
    return this.prismaClient
      ? { persistSourceConfig: source => this.persistApiRuntimeSourceConfig(source) }
      : {};
  }

  private async persistApiRuntimeSourceConfig(source: DataSourceRecord): Promise<void> {
    if (!this.prismaClient) return;
    await updateRuntimeDataSource(this.prismaClient, source);
  }
}

export function createSqlChartFoundationRoutes(
  client?: IntraQPrismaClient | null,
  ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
  codexAgent: CodexAgentRuntime = createCodexAgentRuntime()
): SqlChartFoundationRoutes {
  return new SqlChartFoundationRoutes(
    client ? new SqlAssistantPrismaConversationStore(client) : undefined,
    ensureDataSourcesLoaded,
    codexAgent,
    client ?? null
  );
}

function agentUnavailableDetails(agentProvider: CodexAgentResult): Record<string, string> {
  return {
    provider: agentProvider.provider,
    auth: agentProvider.auth,
    model: agentProvider.model,
    reason: agentProvider.fallbackReason ?? 'agent_unavailable'
  };
}
