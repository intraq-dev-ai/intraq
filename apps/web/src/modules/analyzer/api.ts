import type {
  AnalyzerAnswer,
  AnalyzerConversation,
  AnalyzerExecution,
  AnalyzerFollowupResolution,
  AnalyzerMessage,
  AnalyzerOrchestration,
  AnalyzerPlan,
  AnalyzerTableData,
  DataSourceSummary
} from './types';
import { analyzerDashboardElementInput } from './dashboard-queue-api';
import { fetchAnalyzerChartData } from './analyzer-chart-data-client';
import { normalizeAnalyzerTableData } from './analyzer-execution-data';
import {
  analyzerPlanTableDataRequest,
  type AnalyzerPlanTableDataRequest
} from './plan-table-data-request';
import { ANALYZER_RESULT_PAGE_SIZE } from './result-data';

const ANALYZER_EXPORT_ROW_LIMIT = 250_000;

interface ApiEnvelope<TData> {
  success: boolean;
  data?: TData;
  error?: string;
  meta?: unknown;
}

type JsonBody = Record<string, unknown>;

interface RequestOptions {
  signal?: AbortSignal | undefined;
}

interface RequestJsonOptions {
  body?: JsonBody;
  method?: string;
  signal?: AbortSignal | undefined;
}

export async function fetchDataSources(): Promise<DataSourceSummary[]> {
  const payload = await requestJson<unknown>('/api/data-sources/analyzer-catalog');
  const sources = Array.isArray(payload) ? payload : [];
  return sources.filter(isDataSourceSummary);
}

export async function fetchConversations(dataSourceId = ''): Promise<AnalyzerConversation[]> {
  const search = dataSourceId ? `?dataSourceId=${encodeURIComponent(dataSourceId)}` : '';
  return requestJson<AnalyzerConversation[]>(`/api/ai-data-analyzer/conversations${search}`);
}

export function createConversation(body: {
  title: string;
  dataSourceId: string;
  metadata?: Record<string, unknown>;
}, options: RequestOptions = {}): Promise<AnalyzerConversation> {
  return requestJson<AnalyzerConversation>('/api/ai-data-analyzer/conversations', {
    method: 'POST',
    body,
    ...signalOption(options)
  });
}

export function fetchMessages(
  conversationId: string,
  options: RequestOptions = {}
): Promise<AnalyzerMessage[]> {
  return requestJson<AnalyzerMessage[]>(
    `/api/ai-data-analyzer/conversations/${encodeURIComponent(conversationId)}/messages`,
    signalOption(options)
  );
}

export function appendMessage(
  conversationId: string,
  body: {
    role: AnalyzerMessage['role'];
    content: string;
    metadata?: Record<string, unknown>;
  },
  options: RequestOptions = {}
): Promise<AnalyzerMessage> {
  return requestJson<AnalyzerMessage>(`/api/ai-data-analyzer/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body,
    ...signalOption(options)
  });
}

export function askAnalyzer(body: {
  question: string;
  conversationId?: string;
  dataSourceId?: string;
  execution?: AnalyzerExecution;
  plan?: AnalyzerPlan;
}, options: RequestOptions = {}): Promise<AnalyzerAnswer> {
  return requestJson<AnalyzerAnswer>('/api/analyzer/ask', {
    method: 'POST',
    body,
    ...signalOption(options)
  });
}

export function recordAnalyzerRunTrace(body: {
  agentProvider?: Record<string, unknown>;
  answerSummary: string;
  conversationId: string;
  dataSourceId: string;
  dataSourceTableId?: string;
  metadata: Record<string, unknown>;
  outcome: 'answered' | 'conversation' | 'failed' | 'needs_review' | 'safely_refused';
  question: string;
  reason?: string;
  selectedModel?: Record<string, unknown>;
  selectedModels?: Array<Record<string, unknown>>;
  tableName?: string;
}): Promise<unknown> {
  return requestJson<unknown>('/api/ai-data-analyzer/run-trace', {
    method: 'POST',
    body
  });
}

export function orchestrateAnalyzer(body: {
  dataSourceId: string;
  question: string;
  conversationId: string;
}, options: RequestOptions = {}): Promise<AnalyzerOrchestration> {
  return requestJson<AnalyzerOrchestration>('/api/ai-data-analyzer/orchestrate', {
    method: 'POST',
    body,
    ...signalOption(options)
  });
}

export function resolveAnalyzerFollowup(body: {
  question: string;
  conversationId: string;
}, options: RequestOptions = {}): Promise<AnalyzerFollowupResolution> {
  return requestJson<AnalyzerFollowupResolution>('/api/ai-data-analyzer/followup-resolve', {
    method: 'POST',
    body,
    ...signalOption(options)
  });
}

export function createAnalyzerPlan(body: {
  dataSourceId: string;
  question: string;
  conversationId: string;
  dashboardContext?: Record<string, unknown>;
  dataSourceTableId?: string;
  tableName?: string;
}, options: RequestOptions = {}): Promise<AnalyzerPlan> {
  return requestJson<AnalyzerPlan>('/api/ai-data-analyzer/plan', {
    method: 'POST',
    body,
    ...signalOption(options)
  });
}

export async function fetchAnalyzerTableData(
  dataSourceId: string,
  tableName: string,
  options: { limit?: number; offset?: number; signal?: AbortSignal } = {}
): Promise<AnalyzerTableData> {
  const body: JsonBody = { limit: options.limit ?? ANALYZER_RESULT_PAGE_SIZE };
  if (typeof options.offset === 'number') body.offset = options.offset;
  const payload = await requestJson<unknown>(
    `/api/data-sources/${encodeURIComponent(dataSourceId)}/tables/${encodeURIComponent(tableName)}/data`,
    { method: 'POST', body, ...signalOption(options) }
  );
  return normalizeAnalyzerTableData(payload);
}

export async function fetchAnalyzerPlannedTableData(
  dataSourceId: string,
  tableName: string,
  plan: AnalyzerPlan,
  options: { limit?: number; request?: AnalyzerPlanTableDataRequest; signal?: AbortSignal } = {}
): Promise<AnalyzerTableData> {
  const request = options.request ?? analyzerPlanTableDataRequest(
    dataSourceId,
    tableName,
    plan,
    typeof options.limit === 'number' ? { limit: options.limit } : {}
  );
  return fetchAnalyzerChartData(request, tableName, options.signal);
}

export async function downloadAnalyzerResultCsv(body: {
  dataSourceId: string;
  plan: AnalyzerPlan;
  tableName: string;
}, options: RequestOptions = {}): Promise<{ downloadUrl: string; expiresAt: string }> {
  const request = analyzerPlanTableDataRequest(body.dataSourceId, body.tableName, body.plan, {
    ignoreTopN: true,
    limit: ANALYZER_EXPORT_ROW_LIMIT
  });
  const chartDataRequest = {
    ...request.body,
    requester: 'ai-data-analyzer-export'
  };
  return requestJson<{ downloadUrl: string; expiresAt: string }>('/api/chart-data/export-tickets', {
    method: 'POST',
    body: {
      dashboardName: 'analyzer_result',
      format: 'csv',
      limit: ANALYZER_EXPORT_ROW_LIMIT,
      items: [{
        componentTitle: body.tableName,
        componentType: 'table',
        chartDataRequest
      }]
    },
    ...signalOption(options)
  });
}

export async function streamAnalyzerExecution(body: {
  dataSourceId: string;
  question: string;
  conversationId?: string;
  data: { rows: Array<Record<string, unknown>> };
  summary: {
    columns?: unknown;
    insightGuidance?: string[];
    knowledgeReferences?: AnalyzerAnswer['knowledgeReferences'];
    selectedModel?: unknown;
    fetchedRows?: number;
    sql?: string;
    tableName: string;
    totalRows?: number;
  };
}, options: RequestOptions = {}): Promise<AnalyzerExecution> {
  const init: RequestInit = {
    method: 'POST',
    headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
  if (options.signal) init.signal = options.signal;
  const response = await fetch('/api/ai-data-analyzer/analyze/stream', init);
  const text = await response.text();
  if (!response.ok) throw new Error('Analyzer stream failed.');
  const done = readSseEvent(text, 'done');
  const data = isRecord(done?.data) ? done.data : {};
  const message = typeof data.message === 'string' ? data.message : '';
  return {
    tableName: body.summary.tableName,
    fetchedRows: body.summary.fetchedRows ?? body.data.rows.length,
    rowCount: body.summary.totalRows ?? body.data.rows.length,
    message,
    ...(typeof body.summary.sql === 'string' && body.summary.sql.trim()
      ? { sql: body.summary.sql.trim() }
      : {})
  };
}

export async function createDashboardFromAnalyzer(body: {
  name: string;
  elementName: string;
  dataSourceId: string;
  tableName: string;
  execution?: AnalyzerExecution;
}): Promise<{ id: string }> {
  const dashboard = await requestJson<{ id: string }>('/api/dashboards', {
    method: 'POST',
    body: { name: body.name, category: 'Analyzer', description: 'Created from AI Analyzer handoff.' }
  });
  await requestJson<unknown>(`/api/dashboards/${encodeURIComponent(dashboard.id)}/elements`, {
    method: 'POST',
    body: analyzerDashboardElementInput({
      execution: {
        ...(body.execution ?? { message: '', rowCount: 0 }),
        tableName: body.tableName,
        dataSourceId: body.execution?.dataSourceId ?? body.dataSourceId
      },
      latestPlanTitle: body.elementName,
      selectedDataSourceId: body.dataSourceId,
      title: body.elementName,
      type: 'table'
    }, 0)
  });
  return dashboard;
}

export function clearAnalyzerSession(conversationId: string): Promise<unknown> {
  return requestJson<unknown>(`/api/ai-data-analyzer/conversations/${encodeURIComponent(conversationId)}/session/clear`, {
    method: 'POST',
    body: {}
  });
}

function readSseEvent(text: string, eventName: string): Record<string, unknown> | null {
  for (const chunk of text.split('\n\n')) {
    const lines = chunk.split('\n');
    if (lines[0] !== `event: ${eventName}`) continue;
    const dataLine = lines.find(line => line.startsWith('data: '));
    if (!dataLine) return null;
    try {
      const parsed = JSON.parse(dataLine.slice(6)) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function requestJson<TData>(
  path: string,
  options: RequestJsonOptions = {}
): Promise<TData> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.signal) init.signal = options.signal;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  const payload = await parseJson(response, path);
  if (isApiEnvelope<TData>(payload)) {
    if (!response.ok || !payload.success) throw new Error(payload.error ?? `Request to ${path} failed.`);
    return payload.data as TData;
  }
  if (!response.ok) throw new Error(readRawError(payload, path));
  return payload as TData;
}

async function parseJson(response: Response, path: string): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Response from ${path} was not valid JSON.`);
  }
}

function readRawError(payload: unknown, path: string): string {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : `Request to ${path} failed.`;
}

function isApiEnvelope<TData>(value: unknown): value is ApiEnvelope<TData> {
  return isRecord(value) && typeof value.success === 'boolean' && ('data' in value || 'error' in value);
}

function isDataSourceSummary(value: unknown): value is DataSourceSummary {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function signalOption(options: RequestOptions): Pick<RequestJsonOptions, 'signal'> {
  return options.signal ? { signal: options.signal } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
