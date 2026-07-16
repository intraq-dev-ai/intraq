import type { IncomingMessage, ServerResponse } from 'node:http';
import { DashboardBuilderAgent } from '@intraq/agent-core';
import { fail, type BuilderAgentResponse } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendCreated, sendJson, sendOk, sendUnauthorized } from './http.js';
import {
  parseAnalyzerRequest,
  parseBuilderAgentRequest,
  parseDataModelRecommendationRequest
} from './validation.js';
import {
  findDataSource,
  type TableDefinition
} from './modules/data-source/foundation-store.js';
import {
  noopEnsureDataSourcesLoaded,
  type EnsureDataSourcesLoaded
} from './modules/data-source/prisma-runtime-sync.js';
import {
  createCodexAgentRuntime,
  type CodexAgentRuntime
} from './modules/codex-agent/codex-agent-runtime.js';
import { ProductAnalyzerAgent } from './modules/analyzer/product-analyzer-agent.js';
import {
  AnalyzerAgentUnavailableError,
  runAnalyzerAgentLoop
} from './modules/analyzer/analyzer-agent-loop.js';
import {
  BuilderConversationStore,
  type BuilderConversationContext,
  type BuilderConversationRepository,
  type BuilderConversationSnapshot
} from './modules/dashboard/builder-conversations.js';
import {
  DashboardBuilderAgentUnavailableError,
  runDashboardBuilderAgentLoop
} from './modules/dashboard/dashboard-builder-agent-loop.js';
import type {
  AgentDataModel,
  BuilderAgentRequest,
  BuilderConversationTurn,
  DataModelRecommendationRequest
} from '@intraq/contracts';
import { getRequestSecurityContext } from './security/request-context.js';
import {
  agentUnavailableAnalyzerResult,
  agentUnavailableDetails,
  agentUnavailableMessage,
  withAgentProvider
} from './product-agent-routes-agent-provider.js';
import {
  analyzerHistoryFoundationStore,
  type AnalyzerHistoryStore
} from './modules/analyzer/history-foundation-store.js';
import { bindAnalyzerAnswerContext } from './modules/analyzer/analyzer-answer-context-binding.js';

export class ProductAgentRoutes {
  private readonly builderAgent = new DashboardBuilderAgent();
  private readonly analyzerAgent = new ProductAnalyzerAgent();

  constructor(
    private readonly ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
    private readonly codexAgent: CodexAgentRuntime = createCodexAgentRuntime(),
    private readonly builderConversations: BuilderConversationRepository = new BuilderConversationStore(),
    private readonly analyzerHistoryStore: AnalyzerHistoryStore = analyzerHistoryFoundationStore,
    private readonly prismaClient: IntraQPrismaClient | null = null
  ) {}

  async handlePerformAction(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    const request = parseBuilderAgentRequest(body);
    if (!request) {
      sendBadRequest(res, 'prompt is required for Dashboard Builder actions.');
      return;
    }
    await this.ensureDataSourcesLoaded(dataSourceLoadScope(request.dataSourceId));
    const enriched = enrichBuilderRequest(request);
    const conversation = await this.ensureBuilderConversation(enriched);
    let agentRequest = enriched;
    if (conversation) {
      const userMessage = await this.builderConversations.appendMessage(enriched.dashboardId ?? '', conversation.conversation.id, 'user', enriched.prompt);
      agentRequest = withBuilderConversationMessages(enriched, [
        ...conversation.messages,
        ...(userMessage ? [userMessage] : [])
      ]);
    }
    try {
      const model = requestModel(body);
      const agentResult = await runDashboardBuilderAgentLoop({
        builderAgent: this.builderAgent,
        codexAgent: this.codexAgent,
        ...(model ? { model } : {}),
        request: agentRequest,
        tenantId: getRequestSecurityContext(req)?.tenantId ?? null
      });
      const payload = withConversationId(withAgentProvider(agentResult.response, agentResult.agentProvider), conversation);
      if (conversation) await this.appendBuilderAssistantMessage(enriched.dashboardId ?? '', conversation.conversation.id, payload);
      sendOk(res, payload);
    } catch (error) {
      if (error instanceof DashboardBuilderAgentUnavailableError) {
        sendJson(res, 503, fail(error.message, agentUnavailableDetails(error.agentProvider)));
        return;
      }
      throw error;
    }
  }

  async handleRestoreBuilderConversation(res: ServerResponse, url: URL): Promise<void> {
    const dashboardId = url.searchParams.get('dashboardId')?.trim();
    if (!dashboardId) {
      sendBadRequest(res, 'dashboardId is required');
      return;
    }
    sendOk(res, await this.builderConversations.restore(dashboardId, url.searchParams.get('conversationId')));
  }

  async handleCreateBuilderConversation(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.dashboardId)) {
      sendBadRequest(res, 'dashboardId is required');
      return;
    }
    if (!optionalStrings(body, ['conversationId', 'dataSourceId', 'dataSourceTableId', 'title'])) {
      sendBadRequest(res, 'conversationId, dataSourceId, dataSourceTableId, and title must be non-empty strings when provided');
      return;
    }
    const snapshot = await this.builderConversations.create(
      body.dashboardId.trim(),
      builderConversationContext(body),
      asString(body.conversationId)
    );
    sendCreated(res, snapshot);
  }

  async handleResetBuilderConversation(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.dashboardId) || !isNonEmptyString(body.conversationId)) {
      sendBadRequest(res, 'dashboardId and conversationId are required');
      return;
    }
    const snapshot = await this.builderConversations.clearSession(body.dashboardId.trim(), body.conversationId.trim());
    if (!snapshot) {
      sendJson(res, 404, fail('Dashboard Builder conversation not found'));
      return;
    }
    sendOk(res, snapshot);
  }

  async handleRecommendDataModel(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    const request = parseDataModelRecommendationRequest(body);
    if (!request) {
      sendBadRequest(res, 'prompt is required for data-model recommendation.');
      return;
    }
    await this.ensureDataSourcesLoaded(dataSourceLoadScope(request.dataSourceId));
    const enriched = enrichRecommendationRequest(request);
    const recommendation = this.builderAgent.recommendDataModel(enriched);
    const model = requestModel(body);
    const agentProvider = await this.codexAgent.invoke({
      surface: 'data-model',
      userPrompt: request.prompt,
      deterministicResult: recommendation,
      systemContext: { dataSourceId: request.dataSourceId ?? null },
      tenantId: getRequestSecurityContext(req)?.tenantId ?? null,
      ...(model ? { model } : {})
    });
    if (!agentProvider.used) {
      sendJson(res, 503, fail(agentUnavailableMessage('Data model recommendation AI', agentProvider), agentUnavailableDetails(agentProvider)));
      return;
    }
    sendOk(res, withAgentProvider(recommendation, agentProvider));
  }

  async handleAnalyzerAsk(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    const request = parseAnalyzerRequest(body);
    if (!request) {
      sendBadRequest(res, 'question is required for Analyzer requests.');
      return;
    }
    const binding = await this.bindAnalyzerContext(req, body, request);
    if (!binding.ok) {
      sendAnalyzerBindingFailure(res, binding.reason);
      return;
    }
    const boundRequest = binding.dataSourceId
      ? { ...request, dataSourceId: binding.dataSourceId }
      : request;
    try {
      const model = requestModel(body);
      const agentResult = await runAnalyzerAgentLoop({
        analyzerAgent: this.analyzerAgent,
        body: binding.body,
        codexAgent: this.codexAgent,
        fallback: agentUnavailableAnalyzerResult(request.question),
        ...(model ? { model } : {}),
        request: boundRequest,
        tenantId: getRequestSecurityContext(req)?.tenantId ?? null
      });
      sendOk(res, withAgentProvider(agentResult.response, agentResult.agentProvider));
    } catch (error) {
      if (error instanceof AnalyzerAgentUnavailableError) {
        sendJson(res, 503, fail(error.message, agentUnavailableDetails(error.agentProvider)));
        return;
      }
      throw error;
    }
  }

  async handleAnalyzerAskStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    const request = parseAnalyzerRequest(body);
    if (!request) {
      sendBadRequest(res, 'question is required for Analyzer requests.');
      return;
    }
    const binding = await this.bindAnalyzerContext(req, body, request);
    if (!binding.ok) {
      sendAnalyzerBindingFailure(res, binding.reason);
      return;
    }
    const boundRequest = binding.dataSourceId
      ? { ...request, dataSourceId: binding.dataSourceId }
      : request;
    writeSseHeaders(res);
    try {
      const model = requestModel(body);
      const agentResult = await runAnalyzerAgentLoop({
        analyzerAgent: this.analyzerAgent,
        body: binding.body,
        codexAgent: this.codexAgent,
        fallback: agentUnavailableAnalyzerResult(request.question),
        ...(model ? { model } : {}),
        onAnswerDelta: delta => writeSseEvent(res, 'delta', { delta }),
        request: boundRequest,
        tenantId: getRequestSecurityContext(req)?.tenantId ?? null
      });
      writeSseEvent(res, 'result', withAgentProvider(agentResult.response, agentResult.agentProvider));
    } catch (error) {
      if (error instanceof AnalyzerAgentUnavailableError) {
        writeSseEvent(res, 'error', {
          details: agentUnavailableDetails(error.agentProvider),
          message: error.message
        });
        return;
      }
      writeSseEvent(res, 'error', { message: error instanceof Error ? error.message : 'Analyzer stream failed.' });
    } finally {
      res.end();
    }
  }

  private async ensureBuilderConversation(request: BuilderAgentRequest): Promise<BuilderConversationSnapshot | null> {
    if (!request.dashboardId) return null;
    return this.builderConversations.ensure(
      request.dashboardId,
      request.conversationId,
      builderConversationContext(request)
    );
  }

  private async appendBuilderAssistantMessage(
    dashboardId: string,
    conversationId: string,
    response: BuilderAgentResponse
  ): Promise<void> {
    await this.builderConversations.appendMessage(
      dashboardId,
      conversationId,
      'assistant',
      builderAssistantContent(response)
    );
  }

  private bindAnalyzerContext(
    req: IncomingMessage,
    body: unknown,
    request: { conversationId?: string; dataSourceId?: string }
  ) {
    return bindAnalyzerAnswerContext({
      body: isRecord(body) ? body : {},
      ...(request.conversationId ? { conversationId: request.conversationId } : {}),
      ...(request.dataSourceId ? { dataSourceId: request.dataSourceId } : {}),
      ensureDataSourcesLoaded: this.ensureDataSourcesLoaded,
      historyStore: this.analyzerHistoryStore,
      prismaClient: this.prismaClient,
      req,
      requireScopedPlanForEvidence: true
    });
  }
}

function withBuilderConversationMessages(
  request: BuilderAgentRequest,
  messages: Array<{ content: string; role: BuilderConversationTurn['role'] }>
): BuilderAgentRequest {
  const conversationMessages = messages
    .slice(-8)
    .map(message => ({
      content: message.content.trim(),
      role: message.role
    }))
    .filter(message => message.content.length > 0);
  return conversationMessages.length > 0 ? { ...request, conversationMessages } : request;
}

function dataSourceLoadScope(dataSourceId: string | undefined): { dataSourceId: string } | undefined {
  return dataSourceId ? { dataSourceId } : undefined;
}

function withConversationId<T extends object>(
  payload: T,
  conversation: BuilderConversationSnapshot | null
): T & { conversationId?: string } {
  return conversation ? { ...payload, conversationId: conversation.conversation.id } : payload;
}

function enrichBuilderRequest(request: BuilderAgentRequest): BuilderAgentRequest {
  const source = request.dataSourceId ? findDataSource(request.dataSourceId) : undefined;
  const table = source?.tables.find(item =>
    item.id === request.dataSourceTableId || item.name === request.tableName || item.id === request.tableName
  );
  return table ? { ...request, dataModel: toAgentDataModel(table) } : request;
}

function enrichRecommendationRequest(request: DataModelRecommendationRequest): DataModelRecommendationRequest {
  const source = request.dataSourceId ? findDataSource(request.dataSourceId) : undefined;
  if (!source) return request;
  return {
    ...request,
    dataModels: source.tables
      .map(toAgentDataModel)
  };
}

function toAgentDataModel(table: TableDefinition): AgentDataModel {
  return {
    id: table.id,
    name: table.name,
    ...(typeof table.dictionary.businessName === 'string' ? { businessName: table.dictionary.businessName } : {}),
    description: table.description,
    dictionary: table.dictionary,
    fields: table.fields.map(field => ({
      name: field.name,
      type: field.type,
      ...(field.aliases ? { aliases: field.aliases } : {}),
      ...(field.columnType ? { columnType: field.columnType } : {}),
      description: field.description,
      dictionaryDescription: field.dictionaryDescription,
      ...(field.format ? { format: field.format } : {}),
      ...(field.label ? { label: field.label } : {}),
      ...(field.role ? { role: field.role } : {}),
      ...(field.sampleValues ? { sampleValues: field.sampleValues } : {}),
      ...(field.semanticRole ? { semanticRole: field.semanticRole } : {}),
      ...(field.synonyms ? { synonyms: field.synonyms } : {})
    }))
  };
}

function builderAssistantContent(response: BuilderAgentResponse): string {
  const details = [
    response.title,
    response.summary,
    modelLineFromSummary(response.summary),
    createdLineFromResponse(response),
    ...('suggestedActions' in response ? response.suggestedActions.slice(0, 3) : []),
    ...('visualizations' in response
      ? response.visualizations.slice(0, 1).flatMap(visualization => [
        `Visualization: ${visualization.kind}`,
        ...visualization.encodings.map(visualizationEncodingSummary)
      ])
      : [])
  ].filter(Boolean);
  return details.join('\n');
}

function modelLineFromSummary(summary: string): string {
  const match = /#([^:\n.]+)/.exec(summary);
  const modelName = match?.[1]?.trim();
  return modelName ? `Model: #${modelName}` : '';
}

function createdLineFromResponse(response: BuilderAgentResponse): string {
  if (!('visualizations' in response) || response.visualizations.length === 0 || !response.title.trim()) return '';
  return `I created "${response.title}".`;
}

function visualizationEncodingSummary(encoding: { field: string; label?: string; role: string }): string {
  const label = encoding.label || encoding.field;
  const role = encoding.role.toLowerCase();
  if (role === 'measure' || role === 'metric' || role === 'value') return `Measures: ${label}`;
  if (role === 'dimension' || role === 'time' || role === 'category') return `Dimensions: ${label}`;
  return `${encoding.role}: ${label}`;
}

function builderConversationContext(input: {
  dataSourceId?: unknown;
  dataSourceTableId?: unknown;
  prompt?: unknown;
  title?: unknown;
}): BuilderConversationContext {
  const dataSourceId = asString(input.dataSourceId);
  const dataSourceTableId = asString(input.dataSourceTableId);
  return {
    ...(dataSourceId ? { dataSourceId } : {}),
    ...(dataSourceTableId ? { dataSourceTableId } : {}),
    title: asString(input.title) ?? asString(input.prompt) ?? 'Dashboard Builder'
  };
}

function optionalStrings(input: Record<string, unknown>, keys: string[]): boolean {
  return keys.every(key => input[key] === undefined || isNonEmptyString(input[key]));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requestModel(body: unknown): string | undefined {
  return isRecord(body) ? asString(body.model) : undefined;
}

function writeSseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('\n');
}

function writeSseEvent(res: ServerResponse, event: string, payload: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendAnalyzerBindingFailure(
  res: ServerResponse,
  reason: 'not_found' | 'unauthorized'
): void {
  if (reason === 'unauthorized') sendUnauthorized(res);
  else sendJson(res, 404, fail('Analyzer context not found'));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
