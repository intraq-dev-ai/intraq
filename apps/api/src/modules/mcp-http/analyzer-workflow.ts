import type { AnalyzerResult } from '@intraq/contracts';
import { ProductAnalyzerAgent } from '../analyzer/product-analyzer-agent.js';
import {
  AnalyzerAgentUnavailableError,
  runAnalyzerAgentLoop
} from '../analyzer/analyzer-agent-loop.js';
import { runAnalyzerPlanAgentLoop } from '../analyzer/analyzer-plan-agent-loop.js';
import type { AnalyzerActionPlanResponse } from '../analyzer/analyzer-action-plan.js';
import { createCodexAgentRuntime, type CodexAgentResult } from '../codex-agent/codex-agent-runtime.js';
import {
  findDataSource,
  toLabel,
  type DataSourceRecord,
  type FieldDefinition,
  type TableDefinition
} from '../data-source/foundation-store.js';
import { readDataSourceTableRows } from '../data-source/source-table-rows.js';
import {
  canReadDataSource,
  canReadDataSourceTable,
  dataSourceAccessPolicy
} from '../data-source/source-access.js';
import type { McpWorkflowToolContext } from './workflow-tools.js';

export interface AnalyzerWorkflowResult {
  answer: AnalyzerResult;
  data: {
    columns: AnalyzerResultColumn[];
    rows: Array<Record<string, unknown>>;
    totalRows: number;
  };
  execution: {
    columns: AnalyzerResultColumn[];
    dataSourceId: string;
    message: string;
    rowCount: number;
    rows: Array<Record<string, unknown>>;
    tableName: string;
    title: string;
    totalRows: number;
  };
  needsClarification: boolean;
  plan: AnalyzerActionPlanResponse;
  providers: {
    answer: Record<string, unknown>;
    plan: Record<string, unknown>;
  };
  validation: {
    invalidFields: string[];
    tableName: string | null;
    valid: boolean;
  };
}

interface AnalyzerResultColumn {
  field: string;
  label: string;
  summarize?: string;
}

export async function runAnalyzerDataCheck(context: McpWorkflowToolContext): Promise<AnalyzerWorkflowResult> {
  const dataSourceId = readRequiredString(context.args.dataSourceId, 'dataSourceId');
  const question = readRequiredString(context.args.question, 'question');
  const conversationId = readOptionalString(context.args.conversationId);
  const limit = readLimit(context.args.limit, 20);
  const { source, access } = await readableSource(context, dataSourceId);
  const { plan, provider: planProvider } = await planAnalyzer({
    conversationId,
    dataSourceId,
    dataSourceTableId: readOptionalString(context.args.dataSourceTableId),
    question,
    tableName: readOptionalString(context.args.tableName)
  });
  const action = plan.actions.find(item => item.action === 'create_table');
  const tableName = readOptionalString(action?.params._tableName)
    ?? readOptionalString(action?.params.tableName)
    ?? readOptionalString(context.args.tableName)
    ?? null;
  const table = tableName ? source.tables.find(item => item.name === tableName || item.id === tableName) ?? null : null;
  const columns = analyzerColumns(action?.params.columns, table);
  const invalidFields = table ? invalidAnalyzerFields(columns, table) : [];
  const validation = {
    invalidFields,
    tableName,
    valid: Boolean(action && table && invalidFields.length === 0 && canReadDataSourceTable(source, table, access))
  };
  if (!validation.valid || !tableName || !table) {
    return {
      answer: clarificationAnswer(plan),
      data: { columns, rows: [], totalRows: 0 },
      execution: emptyExecution(dataSourceId, tableName ?? '', columns, plan),
      needsClarification: true,
      plan,
      providers: { answer: providerDetails(planProvider), plan: providerDetails(planProvider) },
      validation
    };
  }

  const result = await readDataSourceTableRows(dataSourceId, tableName, {
    access,
    defaultLimit: limit,
    maxLimit: 1000
  });
  if (!result.ok) throw new Error(result.error);
  const rows = projectRows(result.data.rows, columns);
  const execution = {
    columns,
    dataSourceId,
    message: `Executed ${tableName} with ${result.data.rowCount} row${result.data.rowCount === 1 ? '' : 's'}.`,
    rowCount: result.data.rowCount,
    rows,
    tableName,
    title: readOptionalString(action?.params.title) ?? plan.intentDetails.selectedModel?.businessName ?? toLabel(tableName),
    totalRows: result.data.rowCount
  };
  const { answer, provider: answerProvider } = await answerAnalyzer(question, conversationId, dataSourceId, plan, execution);
  return {
    answer,
    data: { columns, rows, totalRows: result.data.rowCount },
    execution,
    needsClarification: false,
    plan,
    providers: { answer: providerDetails(answerProvider), plan: providerDetails(planProvider) },
    validation
  };
}

export async function readableSource(
  context: McpWorkflowToolContext,
  dataSourceId: string
): Promise<{ access: Awaited<ReturnType<typeof dataSourceAccessPolicy>>; source: DataSourceRecord }> {
  const access = await dataSourceAccessPolicy(context.principal, context.prismaClient);
  const source = findDataSource(dataSourceId);
  if (!source || !canReadDataSource(source, access)) throw new Error('Data source not found or not visible to this token.');
  return { access, source };
}

export function analyzerElementInput(result: AnalyzerWorkflowResult): Record<string, unknown> {
  const fields = result.execution.columns.map(column => column.field);
  const measures = result.execution.columns.filter(column => column.summarize && column.summarize !== 'none');
  const dimensions = result.execution.columns.filter(column => !column.summarize || column.summarize === 'none');
  const title = result.execution.title || 'Analyzer Result';
  return {
    name: title,
    type: 'table',
    chartType: 'table',
    dataSourceId: result.execution.dataSourceId,
    layout: { x: 0, y: 0, w: 12, h: 8 },
    config: {
      title,
      dataSourceId: result.execution.dataSourceId,
      tableName: result.execution.tableName,
      fields,
      columns: result.execution.columns,
      xField: dimensions[0]?.field ?? fields[0],
      ySeries: measures.map(column => column.field),
      aggregations: Object.fromEntries(measures.map(column => [column.field, column.summarize ?? 'sum'])),
      visualization: {
        id: `mcp-${slugFromText(title, 'analyzer-result')}`,
        schemaVersion: 1,
        kind: 'table',
        title,
        description: `${title} created from MCP Analyzer validation.`,
        dataRef: { sourceId: result.execution.dataSourceId, tableName: result.execution.tableName },
        encodings: result.execution.columns.map(column => ({
          field: column.field,
          label: column.label,
          role: column.summarize && column.summarize !== 'none' ? 'measure' : 'dimension',
          ...(column.summarize && column.summarize !== 'none' ? { aggregation: column.summarize } : {})
        })),
        filters: [],
        sort: [],
        limit: 100,
        interactions: { tooltip: true, legend: false, crossFilter: true, drilldown: false },
        accessibility: { label: `${title} table`, summary: `${title} uses verified Analyzer result rows.` },
        rendererHints: { requiredCapabilities: ['tabular'], fallback: 'table' }
      }
    }
  };
}

async function planAnalyzer(input: {
  conversationId?: string | null;
  dataSourceId: string;
  dataSourceTableId?: string | null;
  question: string;
  tableName?: string | null;
}): Promise<{ plan: AnalyzerActionPlanResponse; provider: CodexAgentResult }> {
  const analyzerAgent = new ProductAnalyzerAgent();
  const request = {
    dataSourceId: input.dataSourceId,
    question: input.question,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.dataSourceTableId ? { dataSourceTableId: input.dataSourceTableId } : {}),
    ...(input.tableName ? { tableName: input.tableName } : {})
  };
  const fallback = analyzerAgent.plan(request);
  try {
    const result = await runAnalyzerPlanAgentLoop({
      analyzerAgent,
      body: request,
      codexAgent: createCodexAgentRuntime(),
      fallback,
      request
    });
    return { plan: result.response, provider: result.agentProvider };
  } catch (error) {
    if (error instanceof AnalyzerAgentUnavailableError) return { plan: fallback, provider: error.agentProvider };
    throw error;
  }
}

async function answerAnalyzer(
  question: string,
  conversationId: string | null,
  dataSourceId: string,
  plan: AnalyzerActionPlanResponse,
  execution: AnalyzerWorkflowResult['execution']
): Promise<{ answer: AnalyzerResult; provider: CodexAgentResult }> {
  const analyzerAgent = new ProductAnalyzerAgent();
  const request = { question, ...(conversationId ? { conversationId } : {}) };
  const body = { question, ...(conversationId ? { conversationId } : {}), dataSourceId, plan, execution };
  const fallback = analyzerAgent.answer(request, body);
  try {
    const result = await runAnalyzerAgentLoop({
      analyzerAgent,
      body,
      codexAgent: createCodexAgentRuntime(),
      fallback,
      request
    });
    return { answer: result.response, provider: result.agentProvider };
  } catch (error) {
    if (error instanceof AnalyzerAgentUnavailableError) return { answer: fallback, provider: error.agentProvider };
    throw error;
  }
}

function analyzerColumns(value: unknown, table: TableDefinition | null): AnalyzerResultColumn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const record = typeof item === 'string' ? { field: item } : optionalRecord(item);
    const field = readOptionalString(record?.field) ?? readOptionalString(record?.name);
    if (!field) return [];
    const tableField = table?.fields.find(candidate => candidate.name === field);
    return [{
      field,
      label: readOptionalString(record?.label) ?? toLabel(field),
      summarize: readOptionalString(record?.summarize) ?? (tableField && fieldRole(tableField) === 'measure' ? 'sum' : 'none')
    }];
  });
}

function invalidAnalyzerFields(columns: AnalyzerResultColumn[], table: TableDefinition): string[] {
  const valid = new Set(table.fields.map(field => field.name));
  return columns.flatMap(column => valid.has(column.field) ? [] : [column.field]);
}

function projectRows(rows: Array<Record<string, unknown>>, columns: AnalyzerResultColumn[]): Array<Record<string, unknown>> {
  const fields = columns.map(column => column.field);
  if (fields.length === 0) return rows;
  return rows.map(row => Object.fromEntries(fields.map(field => [field, row[field]])));
}

function emptyExecution(
  dataSourceId: string,
  tableName: string,
  columns: AnalyzerResultColumn[],
  plan: AnalyzerActionPlanResponse
): AnalyzerWorkflowResult['execution'] {
  return {
    columns,
    dataSourceId,
    message: plan.message,
    rowCount: 0,
    rows: [],
    tableName,
    title: plan.intentDetails.selectedModel?.businessName ?? tableName,
    totalRows: 0
  };
}

function clarificationAnswer(plan: AnalyzerActionPlanResponse): AnalyzerResult {
  return {
    workflow: 'analyzer',
    answer: plan.message,
    suggestedFollowUps: plan.intentDetails.insightGuidance,
    knowledgeReferences: plan.intentDetails.knowledgeReferences
  };
}

function fieldRole(field: FieldDefinition): 'dimension' | 'measure' | 'time' {
  if (/date|time/i.test(`${field.name} ${field.type}`)) return 'time';
  return /number|numeric|decimal|float|double|int/i.test(field.type) ? 'measure' : 'dimension';
}

function providerDetails(provider: CodexAgentResult): Record<string, unknown> {
  return {
    provider: provider.provider,
    auth: provider.auth,
    model: provider.model,
    used: provider.used,
    fallbackReason: provider.fallbackReason ?? null,
    error: provider.error ?? null
  };
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readRequiredString(value: unknown, name: string): string {
  const result = readOptionalString(value);
  if (!result) throw new Error(`${name} is required.`);
  return result;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readLimit(value: unknown, fallback: number): number {
  const limit = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1, Math.min(1000, limit));
}

function slugFromText(value: string, fallback: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
