import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { fail } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendJson, sendOk, sendUnauthorized } from '../../http.js';
import { parseAnalyzerPlanRequest, type AnalyzerPlanRequest } from '../../validation.js';
import {
  analyzerHistoryFoundationStore,
  type AnalyzerHistoryMessage,
  type AnalyzerHistoryStore
} from './history-foundation-store.js';
import { resolveAnalyzerFollowup } from './analyzer-followup.js';
import { type AnalyzerActionPlanResponse } from './analyzer-action-plan.js';
import { ProductAnalyzerAgent } from './product-analyzer-agent.js';
import {
  noopEnsureDataSourcesLoaded,
  type EnsureDataSourcesLoaded
} from '../data-source/prisma-runtime-sync.js';
import { findDataSource, type TableDefinition } from '../data-source/foundation-store.js';
import { isAiReadyDataModel } from '../data-source/ai-ready-data-model.js';
import {
  createCodexAgentRuntime,
  type CodexAgentResult,
  type CodexAgentRuntime
} from '../codex-agent/codex-agent-runtime.js';
import {
  AnalyzerAgentUnavailableError
} from './analyzer-agent-loop.js';
import { clarificationPlanFromToolArgs } from './analyzer-plan-build-component.js';
import {
  runAnalyzerPlanAgentLoop,
  type AnalyzerPlanToolTraceEvent
} from './analyzer-plan-agent-loop.js';
import {
  analyzerValidationUserReason,
  validateAnalyzerPlan,
  type AnalyzerPlanValidationSummary
} from './analyzer-plan-validation.js';
import { segmentAnalyzerQuestion } from './analyzer-question-segmentation.js';
import { getRequestSecurityContext } from '../../security/request-context.js';
import {
  canReadDataSource,
  canReadDataSourceTable,
  dataSourceAccessPolicy
} from '../data-source/source-access.js';
import {
  configureAnalyzerUnmappedConceptPersistence,
  listAnalyzerUnmappedConceptEvents,
  type AnalyzerCapabilityGapIdentity,
  type AnalyzerUnmappedConceptEventListFilters
} from './analyzer-unmapped-concept-log.js';
import {
  listPersistedAnalyzerUnmappedConceptEvents,
  persistAnalyzerUnmappedConceptEvent
} from './analyzer-unmapped-concept-prisma-store.js';
import { withServerAnalyzerRoutingCandidates } from './analyzer-routing-candidates.js';
import { analyzerDashboardContextSignature } from './analyzer-dashboard-context.js';
import { analyzerHistoryAccessForRequest } from './analyzer-history-access.js';
import { loadAnalyzerConversationContext } from './analyzer-conversation-context.js';
import {
  analyzerBusinessScopeMatchesTableDomain,
  analyzerBusinessScopeSignature,
  applyAnalyzerBusinessScopeToPlan
} from './analyzer-business-scope-plan.js';
import type { ConfirmedAnalyzerBusinessScope } from '@intraq/contracts';
import { analyzerAccessPolicyCacheKey } from './analyzer-access-policy-cache-key.js';
import { localAnalyzerFallbackPlan } from './local-analyzer-fallback-plan.js';

const MAX_ANALYZER_PLAN_CACHE_ENTRIES = 100;
const ANALYZER_PLAN_CACHE_VERSION = 'optional-business-scope-v13';

export class AnalyzerCompatRoutes {
  private readonly analyzerAgent = new ProductAnalyzerAgent();
  private readonly analyzerPlanCache = new Map<string, AnalyzerActionPlanResponse>();

  constructor(
    private readonly historyStore: AnalyzerHistoryStore = analyzerHistoryFoundationStore,
    private readonly ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded,
    private readonly codexAgent: CodexAgentRuntime = createCodexAgentRuntime(),
    private readonly prismaClient: IntraQPrismaClient | null = null
  ) {
    configureAnalyzerUnmappedConceptPersistence(prismaClient
      ? { save: event => persistAnalyzerUnmappedConceptEvent(prismaClient, event) }
      : null);
  }

  async handleOrchestrate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    const request = parseAnalyzerPlanRequest(body);
    if (!request) {
      sendBadRequest(res, 'dataSourceId and question are required for Analyzer orchestration.');
      return;
    }
    const historyAccess = analyzerHistoryAccessForRequest(req);
    if (!historyAccess) {
      sendUnauthorized(res);
      return;
    }
    await this.ensureDataSourcesLoaded({ dataSourceId: request.dataSourceId });
    const source = findDataSource(request.dataSourceId);
    const accessPolicy = await dataSourceAccessPolicy(getRequestSecurityContext(req), this.prismaClient);
    if (!source || !canReadDataSource(source, accessPolicy)) {
      sendJson(res, 404, fail('Data source not found'));
      return;
    }
    const context = request.conversationId
      ? await loadAnalyzerConversationContext(this.historyStore, req, request.conversationId)
      : null;
    if (request.conversationId && !context) {
      sendJson(res, 404, fail('Conversation not found'));
      return;
    }
    if (context && context.conversation.dataSourceId !== request.dataSourceId) {
      sendBadRequest(res, 'Conversation does not belong to the requested data source.');
      return;
    }
    const resolved = await resolveAnalyzerFollowup(this.historyStore, {
      conversationId: request.conversationId ?? null,
      question: request.question
    }, context?.access ?? historyAccess);
    const segmented = segmentAnalyzerQuestion(request.question);
    const coveredQuestion = resolved.resolved
      ? resolved.questionForPlan
      : segmented.coveredQuestion || request.question;

    sendOk(res, {
      originalQuestion: request.question,
      isMultiDomain: false,
      coveredQuestions: [coveredQuestion],
      deferredQuestions: resolved.resolved ? [] : segmented.deferredQuestions,
      followup: resolved
    });
  }

  async handleFollowupResolve(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.question)) {
      sendBadRequest(res, 'question is required for Analyzer follow-up resolution.');
      return;
    }
    const historyAccess = analyzerHistoryAccessForRequest(req);
    if (!historyAccess) {
      sendUnauthorized(res);
      return;
    }

    const conversationId = isNonEmptyString(body.conversationId) ? body.conversationId.trim() : null;
    const context = conversationId
      ? await loadAnalyzerConversationContext(this.historyStore, req, conversationId)
      : null;
    if (conversationId && !context) {
      sendJson(res, 404, fail('Conversation not found'));
      return;
    }
    const conversationDataSourceId = context?.conversation.dataSourceId;
    if (conversationDataSourceId) {
      await this.ensureDataSourcesLoaded({ dataSourceId: conversationDataSourceId });
      const source = findDataSource(conversationDataSourceId);
      const policy = await dataSourceAccessPolicy(getRequestSecurityContext(req), this.prismaClient);
      if (!source || !canReadDataSource(source, policy)) {
        sendJson(res, 404, fail('Conversation not found'));
        return;
      }
    }
    sendOk(res, await resolveAnalyzerFollowup(this.historyStore, {
      conversationId,
      question: body.question.trim()
    }, context?.access ?? historyAccess));
  }

  async handlePlan(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    const request = parseAnalyzerPlanRequest(body);
    if (!request) {
      sendBadRequest(res, 'dataSourceId and question are required for Analyzer planning.');
      return;
    }
    const historyAccess = analyzerHistoryAccessForRequest(req);
    if (!historyAccess) {
      sendUnauthorized(res);
      return;
    }

    await this.ensureDataSourcesLoaded({ dataSourceId: request.dataSourceId });
    const requestContext = getRequestSecurityContext(req);
    const accessPolicy = await dataSourceAccessPolicy(requestContext, this.prismaClient);
    const source = findDataSource(request.dataSourceId);
    if (!source || !canReadDataSource(source, accessPolicy)) {
      sendJson(res, 404, fail('Data source not found'));
      return;
    }
    const conversationContext = request.conversationId
      ? await loadAnalyzerConversationContext(this.historyStore, req, request.conversationId)
      : null;
    if (request.conversationId && !conversationContext) {
      sendJson(res, 404, fail('Conversation not found'));
      return;
    }
    if (conversationContext && conversationContext.conversation.dataSourceId !== request.dataSourceId) {
      sendBadRequest(res, 'Conversation does not belong to the requested data source.');
      return;
    }
    if (conversationContext?.invalidBusinessScope) {
      sendJson(res, 409, fail('Conversation business scope is invalid. Confirm scope again before asking Analyzer.'));
      return;
    }
    const capabilityGapIdentity: AnalyzerCapabilityGapIdentity = {
      dataSourceId: source.id,
      tenantId: historyAccess.tenantId,
      userId: historyAccess.userId,
      ...(conversationContext ? { conversationId: conversationContext.conversation.id } : {})
    };
    const businessScope = conversationContext?.businessScope ?? null;
    const selectedModel = selectedAnalyzerModel(request);
    if (source && selectedModel && !canReadDataSourceTable(source, selectedModel, accessPolicy)) {
      sendJson(res, 404, fail('Data model not found'));
      return;
    }
    if (selectedModel && !isAiReadyDataModel(selectedModel)) {
      const plan = metadataMissingAnalyzerModelPlan(request, selectedModel);
      sendCompatJson(res, plan);
      return;
    }
    const localFallbackPlan = localAnalyzerFallbackPlan(request, source);
    if (localFallbackPlan) {
      sendCompatJson(res, localFallbackPlan);
      return;
    }
    const analyzerInstructions = request.conversationId
      ? readAnalyzerInstructions(await this.historyStore.listMessages(
        request.conversationId,
        'analyzer',
        conversationContext?.access ?? historyAccess
      ) ?? [])
      : [];
    const bodyRecord = isRecord(body) ? body : {};
    const loopBody = withServerAnalyzerRoutingCandidates(request.dataSourceId, request.question, {
      ...bodyRecord,
      analyzerInstructions,
      businessScope
    });
    const model = requestModel(body);
    const dashboardContextSignature = analyzerDashboardContextSignature(bodyRecord.dashboardContext);
    const cacheKey = analyzerPlanCacheKey(
      request,
      requestContext?.tenantId ?? null,
      model,
      analyzerInstructions,
      dashboardContextSignature,
      analyzerBusinessScopeSignature(businessScope),
      JSON.stringify(analyzerAccessPolicyCacheKey(accessPolicy))
    );
    const cachedPlan = cacheKey ? this.analyzerPlanCache.get(cacheKey) : undefined;
    if (cachedPlan) {
      const plan = cloneAnalyzerPlan(cachedPlan);
      const validation = validateAnalyzerPlan(request, plan);
      if (!validation.valid) {
        if (cacheKey) this.analyzerPlanCache.delete(cacheKey);
      } else {
        const agentProvider: CodexAgentResult = {
          provider: 'codex',
          auth: 'oauth',
          model: 'plan-cache',
          used: false,
          responseText: null,
          fallbackReason: 'plan_cache_hit'
        };
        sendCompatJson(res, {
          ...plan,
          agentProvider,
          toolTrace: [],
          validation
        });
        return;
      }
    }
    try {
      const agentResult = await runAnalyzerPlanAgentLoop({
        accessPolicy,
        analyzerAgent: this.analyzerAgent,
        body: loopBody,
        capabilityGapIdentity,
        codexAgent: this.codexAgent,
        fallback: agentUnavailablePlan(request),
        ...(model ? { model } : {}),
        request,
        tenantId: requestContext?.tenantId ?? null
      });
      let guardedResponse = applyRequiredScopeGuard(request, agentResult.response, businessScope);
      let validation = validateAnalyzerPlan(request, guardedResponse);
      if (!validation.valid) {
        guardedResponse = clarificationPlanFromToolArgs(request, {
          missingContextType: 'schema',
          reason: analyzerValidationUserReason(validation),
          suggestedFollowUps: [
            'Ask for the available values for this field.',
            'Try the exact product, category, location, or payment wording from the source system.',
            'Ask the question without that filter to see the broader result.'
          ]
        });
        validation = validateAnalyzerPlan(request, guardedResponse);
      }
      if (cacheKey && analyzerPlanIsCacheable(guardedResponse, validation, dashboardContextSignature !== null)) {
        rememberAnalyzerPlan(this.analyzerPlanCache, cacheKey, guardedResponse);
      }
      sendCompatJson(res, {
        ...guardedResponse,
        agentProvider: agentResult.agentProvider,
        toolTrace: agentResult.toolTrace,
        validation
      });
    } catch (error) {
      if (error instanceof AnalyzerAgentUnavailableError) {
        sendJson(res, 503, fail(error.message, agentUnavailableDetails(error.agentProvider)));
        return;
      }
      throw error;
    }
  }

  async handleUnmappedConcepts(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const tenantId = getRequestSecurityContext(req)?.tenantId;
    const filters: AnalyzerUnmappedConceptEventListFilters = tenantId ? { tenantId } : {};
    const events = await this.listUnmappedConceptEvents(filters);
    sendOk(res, {
      events,
      total: events.length
    });
  }

  private async listUnmappedConceptEvents(
    filters: AnalyzerUnmappedConceptEventListFilters
  ): Promise<ReturnType<typeof listAnalyzerUnmappedConceptEvents>> {
    if (!this.prismaClient) return listAnalyzerUnmappedConceptEvents(filters);
    try {
      const persistedEvents = await listPersistedAnalyzerUnmappedConceptEvents(this.prismaClient, filters);
      return persistedEvents.length > 0 ? persistedEvents : listAnalyzerUnmappedConceptEvents(filters);
    } catch {
      return listAnalyzerUnmappedConceptEvents(filters);
    }
  }
}

function selectedAnalyzerModel(request: AnalyzerPlanRequest): TableDefinition | null {
  if (!request.dataSourceTableId && !request.tableName) return null;
  const source = findDataSource(request.dataSourceId);
  return source?.tables.find(table =>
    table.id === request.dataSourceTableId ||
    table.name === request.tableName ||
    table.id === request.tableName
  ) ?? null;
}

function applyRequiredScopeGuard(
  request: AnalyzerPlanRequest,
  response: AnalyzerActionPlanResponse,
  businessScope: ConfirmedAnalyzerBusinessScope | null
): AnalyzerActionPlanResponse {
  if (response.actions.some(action => action.action === 'request_clarification')) return response;
  if (!businessScope) return response;
  const originalAction = response.actions.find(item => item.action === 'create_table');
  if (!originalAction) return response;
  const source = findDataSource(request.dataSourceId);
  const table = source?.tables.find(item =>
    item.id === originalAction.params.dataSourceTableId ||
    item.id === originalAction.params._dataSourceTableId ||
    item.name === originalAction.params.tableName ||
    item.name === originalAction.params._tableName ||
    item.id === response.params.dataSourceTableId ||
    item.name === response.params.tableName
  );
  if (!table) return response;
  if (!analyzerBusinessScopeMatchesTableDomain(businessScope, table)) return response;
  return applyAnalyzerBusinessScopeToPlan(response, table, businessScope);
}

function metadataMissingAnalyzerModelPlan(
  request: AnalyzerPlanRequest,
  table: TableDefinition
): AnalyzerActionPlanResponse {
  const modelName = typeof table.dictionary.businessName === 'string' ? table.dictionary.businessName : table.name;
  return {
    success: true,
    type: 'action-plan',
    mode: 'create',
    provider: 'intraq',
    requester: 'ai-data-analyzer',
    componentType: 'table',
    params: {
      element: { clientElementId: 'analyzer-result' },
      dataSourceId: request.dataSourceId,
      dataSourceTableId: table.id,
      tableName: table.name
    },
    actions: [{
      action: 'request_clarification',
      params: {
        dataSourceId: request.dataSourceId,
        dataSourceTableId: table.id,
        question: request.question,
        reason: `AI metadata is incomplete for #${modelName}. Add field definitions before using this model with Analyzer.`
      }
    }],
    message: `AI metadata is incomplete for #${modelName}. Add field definitions before using this model with Analyzer.`,
    intentDetails: {
      question: request.question,
      knowledgeReferences: [],
      selectedModel: null,
      sql: '',
      insightGuidance: []
    }
  };
}

function readAnalyzerInstructions(messages: AnalyzerHistoryMessage[]): string[] {
  const instructions = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !isRecord(message.metadata)) continue;
    const plan = isRecord(message.metadata.plan) ? message.metadata.plan : null;
    const actions = Array.isArray(plan?.actions) ? plan.actions : [];
    for (const action of actions) {
      if (!isRecord(action) || !isRecord(action.params)) continue;
      const instruction = isNonEmptyString(action.params.analyzerInstruction)
        ? action.params.analyzerInstruction.trim()
        : null;
      if (instruction) instructions.add(instruction);
    }
  }
  return Array.from(instructions).slice(-5);
}

function sendCompatJson(
  res: ServerResponse,
  payload: AnalyzerActionPlanResponse & {
    agentProvider?: CodexAgentResult;
    toolTrace?: AnalyzerPlanToolTraceEvent[];
    validation?: AnalyzerPlanValidationSummary;
  }
): void {
  const body = JSON.stringify(payload);
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function requestModel(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  return typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined;
}

function agentUnavailableDetails(agentProvider: CodexAgentResult): Record<string, string> {
  const details: Record<string, string> = {
    provider: agentProvider.provider,
    auth: agentProvider.auth,
    model: agentProvider.model,
    reason: agentProvider.fallbackReason ?? 'agent_unavailable'
  };
  if (agentProvider.error) {
    details.error = agentProvider.error;
  }
  return details;
}

function agentUnavailablePlan(request: AnalyzerPlanRequest): AnalyzerActionPlanResponse {
  return {
    success: true,
    type: 'action-plan',
    mode: 'create',
    provider: 'intraq',
    requester: 'ai-data-analyzer',
    componentType: 'table',
    params: {
      element: { clientElementId: 'analyzer-result' },
      dataSourceId: request.dataSourceId
    },
    actions: [{
      action: 'request_clarification',
      params: {
        reason: 'Analyzer AI agent is unavailable.',
        question: request.question,
        dataSourceId: request.dataSourceId
      }
    }],
    message: 'Analyzer AI agent is unavailable.',
    intentDetails: {
      question: request.question,
      knowledgeReferences: [],
      selectedModel: null,
      sql: '',
      insightGuidance: []
    }
  };
}

function analyzerPlanCacheKey(
  request: AnalyzerPlanRequest,
  tenantId: string | null,
  model: string | undefined,
  analyzerInstructions: string[],
  dashboardContextSignature: string | null,
  businessScopeSignature: string,
  accessPolicySignature: string
): string | null {
  if (analyzerInstructions.length > 0) return null;
  const question = request.question.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!question) return null;
  return [
    ANALYZER_PLAN_CACHE_VERSION,
    tenantId ?? 'foundation',
    request.dataSourceId,
    analyzerPlanMetadataSignature(request.dataSourceId),
    model ?? '',
    dashboardContextSignature
      ? createHash('sha256').update(dashboardContextSignature).digest('hex').slice(0, 16)
      : '',
    createHash('sha256').update(businessScopeSignature).digest('hex').slice(0, 16),
    createHash('sha256').update(accessPolicySignature).digest('hex').slice(0, 16),
    question
  ].join('\u001f');
}

function analyzerPlanMetadataSignature(dataSourceId: string): string {
  const source = findDataSource(dataSourceId);
  if (!source) return 'missing-source';
  const payload = source.tables
    .filter(table => table.isSelected !== false)
    .map(table => ({
      id: table.id,
      name: table.name,
      dictionary: table.dictionary,
      sqlQuery: table.sqlQuery,
      dictionaryParameters: table.dictionary?.parameters,
      settingsDefaults: table.settings?.defaults,
      settingsParameters: table.settings?.parameters,
      settingsScopePolicy: table.settings?.scopePolicy,
      settingsTargetType: table.settings?.targetType
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function rememberAnalyzerPlan(
  cache: Map<string, AnalyzerActionPlanResponse>,
  cacheKey: string,
  plan: AnalyzerActionPlanResponse
): void {
  if (cache.size >= MAX_ANALYZER_PLAN_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(cacheKey, cloneAnalyzerPlan(plan));
}

function analyzerPlanIsCacheable(
  plan: AnalyzerActionPlanResponse,
  validation: AnalyzerPlanValidationSummary,
  hasDashboardContext: boolean
): boolean {
  if (!validation.valid) return false;
  if (validation.checks.some(check => check.status === 'warning' && (
    check.id.startsWith('lookup-values-resolved')
    || check.id.startsWith('lookup-filter-proof')
  ))) {
    return false;
  }
  return plan.actions.some(action => action.action === 'create_table')
    || (!hasDashboardContext && plan.actions.some(action => action.action === 'answer_conversation'));
}

function cloneAnalyzerPlan(plan: AnalyzerActionPlanResponse): AnalyzerActionPlanResponse {
  return JSON.parse(JSON.stringify(plan)) as AnalyzerActionPlanResponse;
}
