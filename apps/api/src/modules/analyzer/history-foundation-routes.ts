import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendJson, sendOk, sendUnauthorized } from '../../http.js';
import {
  analyzerHistoryFoundationStore,
  parseConversationCreateRequest,
  parseConversationUpdateRequest,
  parseMessageCreateRequest,
  type AnalyzerHistoryStore,
  type ConversationSurface
} from './history-foundation-store.js';
import { buildAnalyzerInsightSummary } from './analyzer-insight-summary.js';
import { findDataSource } from '../data-source/foundation-store.js';
import { isAiReadyDataModel } from '../data-source/ai-ready-data-model.js';
import { getRequestSecurityContext } from '../../security/request-context.js';
import { analyzerHistoryAccessForRequest } from './analyzer-history-access.js';
import { handleAnalyzerBusinessScopeRoute } from './analyzer-business-scope-route.js';
import { canReadDataSource, dataSourceAccessPolicy } from '../data-source/source-access.js';
import {
  noopEnsureDataSourcesLoaded,
  type EnsureDataSourcesLoaded
} from '../data-source/prisma-runtime-sync.js';
import { bindAnalyzerAnswerContext } from './analyzer-answer-context-binding.js';

export type {
  AnalyzerHistoryConversation,
  AnalyzerHistoryMessage
} from './history-foundation-store.js';

type ConversationRoute = {
  surface: ConversationSurface | null;
  id: string;
  action: 'conversation' | 'messages' | 'session-clear';
};

export class AnalyzerHistoryFoundationRoutes {
  constructor(
    private readonly store: AnalyzerHistoryStore = analyzerHistoryFoundationStore,
    private readonly prismaClient: IntraQPrismaClient | null = null,
    private readonly sourceAuthorizer?: (req: IncomingMessage, dataSourceId: string) => Promise<boolean>,
    private readonly ensureDataSourcesLoaded: EnsureDataSourcesLoaded = noopEnsureDataSourcesLoaded
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (isAnalyzerHistoryApiPath(url.pathname) && !analyzerHistoryAccessForRequest(req)) {
      sendUnauthorized(res);
      return true;
    }
    if (await handleAnalyzerBusinessScopeRoute(
      req,
      res,
      url,
      this.store,
      dataSourceId => this.canReadSource(req, dataSourceId)
    )) return true;

    if (req.method === 'POST' && url.pathname === '/api/ai-data-analyzer/analyze/stream') {
      await this.handleAnalyzeStream(req, res);
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/ai-data-analyzer/conversations') {
      await this.handleListConversations(req, res, url, 'analyzer');
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/ai-data-analyzer/conversations') {
      await this.handleCreateConversation(req, res, 'analyzer');
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/ai-conversations') {
      await this.handleListConversations(req, res, url, 'builder');
      return true;
    }

    const conversationRoute = matchConversationRoute(url.pathname);
    if (!conversationRoute) return false;

    if (conversationRoute.action === 'conversation') {
      if (conversationRoute.surface !== 'analyzer') return false;
      if (req.method === 'PATCH') {
        await this.handleUpdateConversation(req, res, conversationRoute.id);
        return true;
      }
      if (req.method === 'DELETE') {
        await this.handleDeleteConversation(req, res, conversationRoute.id);
        return true;
      }
      return false;
    }

    if (req.method === 'GET' && conversationRoute.action === 'messages') {
      await this.handleListMessages(req, res, conversationRoute.id, conversationRoute.surface);
      return true;
    }

    if (req.method === 'POST' && conversationRoute.action === 'messages') {
      await this.handleCreateMessage(req, res, conversationRoute.id, conversationRoute.surface);
      return true;
    }

    if (req.method === 'POST' && conversationRoute.action === 'session-clear') {
      if (conversationRoute.surface !== 'analyzer') return false;
      await this.handleClearSession(req, res, conversationRoute.id, conversationRoute.surface);
      return true;
    }

    return false;
  }

  private async handleListConversations(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    surface: ConversationSurface
  ): Promise<void> {
    const dataSourceId = url.searchParams.get('dataSourceId')?.trim() ?? '';
    const limit = readOptionalLimit(url);
    if (limit === 'invalid') {
      sendBadRequest(res, 'limit must be a positive integer.');
      return;
    }
    if (dataSourceId && !await this.canReadSource(req, dataSourceId)) {
      sendJson(res, 404, fail('Data source not found'));
      return;
    }
    const conversations = await this.store.listConversations(
      surface,
      dataSourceId,
      limit ? { limit } : {},
      analyzerHistoryAccessForRequest(req)!
    );
    const visible = [];
    for (const conversation of conversations) {
      if (conversation.dataSourceId && await this.canReadSource(req, conversation.dataSourceId)) {
        visible.push(conversation);
      }
    }
    sendOk(res, visible);
  }

  private async handleCreateConversation(
    req: IncomingMessage,
    res: ServerResponse,
    surface: ConversationSurface
  ): Promise<void> {
    const body = await readJsonBody(req);
    const parsed = parseConversationCreateRequest(body);
    if (!parsed) {
      sendBadRequest(res, 'Request body must be a JSON object.');
      return;
    }
    if (!parsed.dataSourceId) {
      sendBadRequest(res, 'dataSourceId is required for Analyzer conversations.');
      return;
    }
    if (!await this.canReadSource(req, parsed.dataSourceId)) {
      sendJson(res, 404, fail('Data source not found'));
      return;
    }

    sendOk(res, await this.store.createConversation(parsed, surface, analyzerHistoryAccessForRequest(req)!));
  }

  private async handleUpdateConversation(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string
  ): Promise<void> {
    const body = await readJsonBody(req);
    const parsed = parseConversationUpdateRequest(body);
    if (!parsed) {
      sendBadRequest(res, 'Request body must be a JSON object with valid conversation fields.');
      return;
    }

    const access = analyzerHistoryAccessForRequest(req)!;
    const existing = await this.store.getConversation(conversationId, 'analyzer', access);
    if (!existing) {
      sendConversationNotFound(res);
      return;
    }
    if (!existing.dataSourceId || !await this.canReadSource(req, existing.dataSourceId)) {
      sendConversationNotFound(res);
      return;
    }
    if (parsed.dataSourceId && parsed.dataSourceId !== existing.dataSourceId) {
      sendBadRequest(res, 'Changing a conversation data source requires a new conversation.');
      return;
    }

    const conversation = await this.store.updateConversation(
      conversationId,
      'analyzer',
      parsed,
      access
    );
    if (!conversation) {
      sendConversationNotFound(res);
      return;
    }

    sendOk(res, conversation);
  }

  private async handleDeleteConversation(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string
  ): Promise<void> {
    if (!await this.readableConversation(req, conversationId, 'analyzer')) {
      sendConversationNotFound(res);
      return;
    }
    if (!await this.store.deleteConversation(conversationId, 'analyzer', analyzerHistoryAccessForRequest(req)!)) {
      sendConversationNotFound(res);
      return;
    }

    sendOk(res, undefined);
  }

  private async handleListMessages(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string,
    surface: ConversationSurface | null
  ): Promise<void> {
    if (!await this.readableConversation(req, conversationId, surface)) {
      sendConversationNotFound(res);
      return;
    }
    const messages = await this.store.listMessages(conversationId, surface, analyzerHistoryAccessForRequest(req)!);
    if (!messages) {
      sendConversationNotFound(res);
      return;
    }

    sendOk(res, messages);
  }

  private async handleCreateMessage(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string,
    surface: ConversationSurface | null
  ): Promise<void> {
    const body = await readJsonBody(req);
    const parsed = parseMessageCreateRequest(body);
    if (!parsed) {
      sendBadRequest(res, 'role and content are required');
      return;
    }
    if (!await this.readableConversation(req, conversationId, surface)) {
      sendConversationNotFound(res);
      return;
    }

    const message = await this.store.createMessage(
      conversationId,
      surface,
      parsed,
      analyzerHistoryAccessForRequest(req)!
    );
    if (!message) {
      sendConversationNotFound(res);
      return;
    }

    sendOk(res, message);
  }

  private async handleClearSession(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string,
    surface: ConversationSurface
  ): Promise<void> {
    if (!await this.readableConversation(req, conversationId, surface)) {
      sendConversationNotFound(res);
      return;
    }
    const codexSession = await this.store.clearSession(
      conversationId,
      surface,
      analyzerHistoryAccessForRequest(req)!
    );
    if (!codexSession) {
      sendConversationNotFound(res);
      return;
    }

    sendOk(res, codexSession);
  }

  private async canReadSource(req: IncomingMessage, dataSourceId: string): Promise<boolean> {
    await this.ensureDataSourcesLoaded({ dataSourceId });
    if (this.sourceAuthorizer) return this.sourceAuthorizer(req, dataSourceId);
    const source = findDataSource(dataSourceId);
    if (!source) return false;
    return canReadDataSource(source, await dataSourceAccessPolicy(getRequestSecurityContext(req), this.prismaClient));
  }

  private async readableConversation(
    req: IncomingMessage,
    conversationId: string,
    surface: ConversationSurface | null
  ): Promise<boolean> {
    const access = analyzerHistoryAccessForRequest(req)!;
    const conversation = surface
      ? await this.store.getConversation(conversationId, surface, access)
      : await this.store.getConversation(conversationId, 'analyzer', access)
        ?? await this.store.getConversation(conversationId, 'builder', access);
    return Boolean(conversation?.dataSourceId && await this.canReadSource(req, conversation.dataSourceId));
  }

  private async handleAnalyzeStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    const request = parseStreamRequest(body);
    if (!request) {
      writeStreamHeaders(res);
      writeSseEvent(res, 'error', {
        message: 'dataSourceId and question are required (sql or data must be provided)'
      });
      res.end();
      return;
    }
    const bodyRecord = isRecord(body) ? body : {};
    const conversationId = readOptionalText(bodyRecord.conversationId, 160) ?? undefined;
    const binding = await bindAnalyzerAnswerContext({
      body: bodyRecord,
      ...(conversationId ? { conversationId } : {}),
      dataSourceId: request.dataSourceId,
      ensureDataSourcesLoaded: this.ensureDataSourcesLoaded,
      historyStore: this.store,
      prismaClient: this.prismaClient,
      req,
      requireScopedPlanForEvidence: false,
      ...(this.sourceAuthorizer
        ? { sourceAuthorizer: dataSourceId => this.sourceAuthorizer!(req, dataSourceId) }
        : {})
    });
    if (!binding.ok) {
      if (binding.reason === 'unauthorized') sendUnauthorized(res);
      else sendJson(res, 404, fail('Analyzer context not found'));
      return;
    }

    writeStreamHeaders(res);

    const rowCount = countRows(request.data);
    const metadataMissingMessage = metadataMissingSelectedModelMessage(request.dataSourceId, request.summary);
    if (metadataMissingMessage) {
      writeSseEvent(res, 'status', { message: 'Analyzer needs data model metadata.' });
      writeSseEvent(res, 'chunk', { text: metadataMissingMessage });
      writeSseEvent(res, 'done', {
        data: {
          message: metadataMissingMessage,
          insights: [metadataMissingMessage],
          recommendations: [
            'Add AI metadata for the selected data model.',
            'Choose a data model with AI metadata.',
            'Use Dashboard Builder manual mode if you want to build without AI.'
          ],
          placeholder: ''
        }
      });
      res.end();
      return;
    }
    const insight = buildExplanationMessage(request.question, request.data, rowCount, request.summary);
    writeSseEvent(res, 'status', { message: 'Preparing your answer...' });
    writeSseEvent(res, 'chunk', { text: insight.message });
    writeSseEvent(res, 'done', {
      data: {
        message: insight.message,
        insights: [`Analyzed ${rowCount} row${rowCount === 1 ? '' : 's'} for ${request.dataSourceId}.`],
        recommendations: insight.suggestedFollowUps,
        placeholder: ''
      }
    });
    res.end();
  }
}

function metadataMissingSelectedModelMessage(dataSourceId: string, summary: unknown): string | null {
  const summaryRecord = isRecord(summary) ? summary : {};
  const tableName = typeof summaryRecord.tableName === 'string' ? summaryRecord.tableName.trim() : '';
  if (!tableName) return null;
  const table = findDataSource(dataSourceId)?.tables.find(item => item.name === tableName || item.id === tableName);
  const tableReady: boolean = isAiReadyDataModel(table);
  if (!table || tableReady) return null;
  const modelName = typeof table.dictionary.businessName === 'string' ? table.dictionary.businessName : table.name;
  return `AI metadata is incomplete for #${modelName}. Add field definitions before using this model with Analyzer.`;
}

function matchConversationRoute(pathname: string): ConversationRoute | null {
  const segments = pathname.split('/').filter(Boolean);
  try {
    if (segments[0] === 'api' && segments[1] === 'ai-data-analyzer' && segments[2] === 'conversations' && segments[3]) {
      if (segments.length === 4) return { surface: 'analyzer', id: decodeURIComponent(segments[3]), action: 'conversation' };
      if (segments.length === 5 && segments[4] === 'messages') return { surface: 'analyzer', id: decodeURIComponent(segments[3]), action: 'messages' };
      if (segments.length === 6 && segments[4] === 'session' && segments[5] === 'clear') return { surface: 'analyzer', id: decodeURIComponent(segments[3]), action: 'session-clear' };
    }
    if (segments.length === 4 && segments[0] === 'api' && segments[1] === 'ai-conversations' && segments[3] === 'messages') {
      const builderConversationId = segments[2];
      if (!builderConversationId) return null;
      return { surface: null, id: decodeURIComponent(builderConversationId), action: 'messages' };
    }
    return null;
  } catch {
    return null;
  }
}

function isAnalyzerHistoryApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/ai-data-analyzer/')
    || pathname === '/api/ai-conversations'
    || pathname.startsWith('/api/ai-conversations/');
}

function parseStreamRequest(input: unknown): {
  dataSourceId: string;
  question: string;
  data: unknown;
  summary: unknown;
} | null {
  if (!isRecord(input)) return null;
  const analysisMode = typeof input.analysisMode === 'string' ? input.analysisMode.toLowerCase() : '';
  const dashboardSummary = analysisMode === 'dashboard_summary';
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  const dataSourceId = typeof input.dataSourceId === 'string' ? input.dataSourceId.trim() : '';
  const hasSql = isNonEmptyString(input.sql);
  const hasData = countRows(input.data) >= 0 && input.data !== undefined;
  if (!dataSourceId || (!question && !dashboardSummary) || (!hasSql && !hasData)) return null;

  return {
    dataSourceId,
    question: question || 'Dashboard summary',
    data: input.data,
    summary: input.summary
  };
}

function writeStreamHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive'
  });
}

function writeSseEvent(res: ServerResponse, event: string, data: Record<string, unknown>): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function buildExplanationMessage(
  question: string,
  data: unknown,
  rowCount: number,
  summary: unknown
): { message: string; suggestedFollowUps: string[] } {
  const summaryRecord = isRecord(summary) ? summary : {};
  const tableName = typeof summaryRecord.tableName === 'string' ? summaryRecord.tableName : 'the selected data';
  const selectedModel = isRecord(summaryRecord.selectedModel) ? summaryRecord.selectedModel : {};
  return buildAnalyzerInsightSummary({
    question,
    tableName,
    modelName: typeof selectedModel.businessName === 'string' ? selectedModel.businessName : null,
    modelDomain: typeof selectedModel.domain === 'string' ? selectedModel.domain : null,
    columns: summaryRecord.columns,
    knowledgeReferences: summaryRecord.knowledgeReferences,
    rows: rowsFromData(data),
    sql: typeof summaryRecord.sql === 'string' ? summaryRecord.sql : null,
    totalRows: readNumber(summaryRecord.totalRows) ?? rowCount,
    guidance: readStringArray(summaryRecord.insightGuidance)
  });
}

function countRows(data: unknown): number {
  if (!isRecord(data)) return 0;
  const rows = Array.isArray(data.rows) ? data.rows.length : 0;
  const blockRows = Array.isArray(data.blocks) ? data.blocks.reduce(countBlockRows, 0) : 0;
  return Math.max(rows, blockRows);
}

function countBlockRows(total: number, block: unknown): number {
  return total + (isRecord(block) && Array.isArray(block.rows) ? block.rows.length : 0);
}

function rowsFromData(data: unknown): Array<Record<string, unknown>> {
  if (!isRecord(data)) return [];
  if (Array.isArray(data.rows)) return data.rows.filter(isRecord).map(row => ({ ...row }));
  if (!Array.isArray(data.blocks)) return [];
  return data.blocks.flatMap(block =>
    isRecord(block) && Array.isArray(block.rows)
      ? block.rows.filter(isRecord).map(row => ({ ...row }))
      : []
  );
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 1)}…`;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function sendConversationNotFound(res: ServerResponse): void {
  sendJson(res, 404, fail('Conversation not found'));
}

function readOptionalLimit(url: URL): number | null | 'invalid' {
  const raw = url.searchParams.get('limit');
  if (raw === null || raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 100) return 'invalid';
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
