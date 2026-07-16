import type { AnalyzerRequest, AnalyzerResult, KnowledgeReference } from '@intraq/contracts';
import type {
  CodexAgentResult,
  CodexAgentRuntime
} from '../codex-agent/codex-agent-runtime.js';
import type { CodexResponsesStreamEvent } from '../codex-agent/codex-responses-client.js';
import type { CodexAgentTool } from '../codex-agent/codex-agent-tool-loop.js';
import type { ProductAnalyzerAgent } from './product-analyzer-agent.js';
import { buildAnalyzerConversationResult } from './analyzer-conversation.js';
import { analyzerParameterDateRangeForAnswer } from './analyzer-parameter-date-filter-display.js';

type AnalyzerLoopAgent = Pick<ProductAnalyzerAgent, never>;

export interface AnalyzerAgentLoopOptions {
  analyzerAgent: AnalyzerLoopAgent;
  body: unknown;
  codexAgent: CodexAgentRuntime;
  fallback: AnalyzerResult;
  model?: string;
  onAnswerDelta?: (delta: string) => void;
  request: AnalyzerRequest;
  tenantId?: string | null;
}

export interface AnalyzerAgentLoopResult {
  agentProvider: CodexAgentResult;
  response: AnalyzerResult;
}

export class AnalyzerAgentUnavailableError extends Error {
  constructor(
    readonly agentProvider: CodexAgentResult,
    message = 'Analyzer AI agent is unavailable.'
  ) {
    super(message);
    this.name = 'AnalyzerAgentUnavailableError';
  }
}

export async function runAnalyzerAgentLoop(
  options: AnalyzerAgentLoopOptions
): Promise<AnalyzerAgentLoopResult> {
  const promptContext = compactAnalyzerPromptContext(options.body);
  const model = analyzerAnswerModel(options.model);
  if (options.onAnswerDelta) {
    return runAnalyzerAnswerTextStream(options, promptContext, model);
  }

  const timeoutResult = analyzerAnswerTimeout(options);
  const resultPromise = options.codexAgent.runToolLoop<AnalyzerResult>({
    surface: 'analyzer',
    userPrompt: options.request.question,
    context: promptContext,
    instructions: ANALYZER_AGENT_INSTRUCTIONS,
    maxOutputTokens: 1200,
    preferredProvider: 'codex',
    tenantId: options.tenantId ?? null,
    fallback: () => options.fallback,
    tools: analyzerTools(options),
    model
  });
  const result = await Promise.race([
    resultPromise,
    timeoutResult.promise
  ]);
  if (result === timeoutResult.result) {
    resultPromise.catch(() => null);
  } else {
    timeoutResult.cancel();
  }

  if (result.type === 'answer' && result === timeoutResult.result) {
    return {
      agentProvider: result.provider,
      response: analyzerTextAnswerResult(options, readString(result.answer) ?? executionFallbackAnswer(options))
    };
  }

  if (result.type === 'answer') {
    throw new AnalyzerAgentUnavailableError(
      result.provider,
      'Analyzer AI returned plain text instead of a validated tool result.'
    );
  }

  if (result.type === 'tool_result' && isAnalyzerResult(result.toolResult)) {
    return {
      agentProvider: result.provider,
      response: result.toolResult
    };
  }

  throw new AnalyzerAgentUnavailableError(result.provider, analyzerAgentUnavailableMessage(result.provider));
}

async function runAnalyzerAnswerTextStream(
  options: AnalyzerAgentLoopOptions,
  promptContext: unknown,
  model: string
): Promise<AnalyzerAgentLoopResult> {
  let acceptingDeltas = true;
  let streamedAnswer = '';
  const timeoutResult = analyzerAnswerTimeout(options, () => streamedAnswer);
  const emitAnswerDelta = (delta: string): void => {
    if (!acceptingDeltas) return;
    streamedAnswer += delta;
    timeoutResult.markActivity();
    options.onAnswerDelta?.(delta);
  };
  const emitDelta = createAnalyzerOutputTextDeltaStream(delta => {
    if (acceptingDeltas) emitAnswerDelta(delta);
  });
  const resultPromise = options.codexAgent.runToolLoop<AnalyzerResult>({
    surface: 'analyzer',
    userPrompt: options.request.question,
    context: promptContext,
    instructions: ANALYZER_AGENT_TEXT_STREAM_INSTRUCTIONS,
    maxOutputTokens: 1200,
    preferredProvider: 'codex',
    tenantId: options.tenantId ?? null,
    fallback: () => options.fallback,
    onStreamEvent: emitDelta,
    tools: [],
    model
  });
  const result = await Promise.race([
    resultPromise,
    timeoutResult.promise
  ]);
  if (result === timeoutResult.result) {
    acceptingDeltas = false;
    resultPromise.catch(() => null);
  } else {
    timeoutResult.cancel();
  }

  if (result.type === 'answer') {
    const answer = readString(result.answer);
    if (!answer) {
      throw new AnalyzerAgentUnavailableError(
        result.provider,
        'Analyzer AI returned an empty streamed answer.'
      );
    }
    return {
      agentProvider: result.provider,
      response: analyzerTextAnswerResult(options, answer)
    };
  }

  if (result.type === 'fallback' && isAnalyzerResult(result.toolResult)) {
    return {
      agentProvider: result.provider,
      response: result.toolResult
    };
  }

  throw new AnalyzerAgentUnavailableError(result.provider, analyzerAgentUnavailableMessage(result.provider));
}

const ANALYZER_AGENT_INSTRUCTIONS = [
  'You are the intraQ Analyzer backend agent for business analytics.',
  'Decide whether to answer directly from the Analyzer request context or call one backend tool.',
  'You must call exactly one backend tool. Never return plain text directly.',
  'Backend tools are authoritative for selected data-source plans, reviewed model metadata, and clarification responses.',
  'Authenticated source and conversation binding authorizes the answer context, but browser-provided rows and SQL are evidence rather than independently verified server execution. Never claim otherwise.',
  'For greetings and capability questions, describe what the selected data source and its AI-ready data models can analyze. Never use a fixed industry default when a selected source is present.',
  'Do not use hard-coded intent classifiers, static keyword routing, or regex-style routing. Let the model decide from the user request and context.',
  'Do not invent database columns, table names, tenant data, IDs, metrics, row values, or model setup state.',
  'Explain the data in business language: what the result shows, what stands out, and what the operator can do or ask next.',
  'For end users, do not mention internal implementation details such as tools, planning, lookups, schemas, models, validation, model metadata, providers, APIs, cache behavior, SQL mechanics, or internal parameter names.',
  'Use answer_analyzer_conversation for greetings, capability questions, typo-only chat, or non-analytical conversation.',
  'Use answer_analyzer_question when the context already has enough selected source, plan, reviewed metadata, or execution evidence to answer the business question.',
  'Use request_data_source_or_model_context when the request lacks selected source, selected model, plan, or execution evidence.',
  'For answer_analyzer_question, use only concrete evidence from context.execution.rows, context.execution.columns, context.execution.relatedExecutions, context.appliedFilters, and context.plan.',
  'When context.appliedFilters is present, clearly state those filters in the answer using business-facing labels.',
  'Do not mention row caps, prompt limits, preview, visible, returned, supplied, provided, included, loaded, shown, result set, result table, table shows, this view, loading, exports, UI controls, or evidence coverage counts. Avoid the word "rows"; name the business entities instead, such as invoices, products, payments, orders, dates, or records.',
  'Do not qualify findings as coming from provided data, supplied records, included records, visible data, or current context. Refer to the business date range, filters, and entities directly.',
  'Use business-facing labels for fields in the answer. For example, say "order count" instead of raw names like "order_count".',
  'When context.execution.relatedExecutions is present, synthesize across all result blocks. Name which result each key finding comes from when it helps, and reconcile conflicting summary/detail/audit evidence instead of ignoring supporting data.',
  'Format business answers as markdown in this exact Analyzer structure: "## Main Takeaway" with one concise bullet, then "## Key Findings" with 3 to 6 bullets when rows support it, then "## Next" only for useful follow-up questions or deferred analysis.',
  'Bold short metric labels or entity names only inside sentences. Do not put each bold value on its own line.',
  'When rows are grouped by a dimension, call out the highest and lowest values with labels, the next comparison point, and a quick takeaway. For many rows, summarize top 3 and bottom 3 instead of listing every row.',
  'When the question asks for a comparison, trend, increase, decrease, same period last year, last week, previous period, or rows contain current/prior period columns, compute and state absolute change and percentage change when the needed values are present.',
  'Add 2 or 3 concrete next questions the user can ask next, grounded in the current data.',
  'The separate Analyzer planning route creates Dashboard Builder action plans; this answer route does not create plans.'
].join('\n');

const ANALYZER_AGENT_TEXT_STREAM_INSTRUCTIONS = [
  'You are the intraQ Analyzer backend agent for business analytics.',
  'Return the final Analyzer answer as markdown text directly. Do not return JSON.',
  'Answer only from the Analyzer request context, selected model metadata, execution evidence, plan, and rows.',
  'Authenticated source and conversation binding authorizes the answer context, but browser-provided rows and SQL are evidence rather than independently verified server execution. Never claim otherwise.',
  'Do not invent database columns, table names, tenant data, IDs, metrics, row values, or model setup state.',
  'Explain the data in business language: what the result shows, what stands out, and what the operator can do or ask next.',
  'For end users, do not mention internal implementation details such as tools, planning, lookups, schemas, models, validation, model metadata, providers, APIs, cache behavior, SQL mechanics, or internal parameter names.',
  'Use only concrete evidence from context.execution.rows, context.execution.columns, context.execution.relatedExecutions, context.appliedFilters, and context.plan.',
  'When context.appliedFilters is present, clearly state those filters in the answer using business-facing labels.',
  'Do not mention row caps, prompt limits, preview, visible, returned, supplied, provided, included, loaded, shown, result set, result table, table shows, this view, loading, exports, UI controls, or evidence coverage counts. Avoid the word "rows"; name the business entities instead, such as invoices, products, payments, orders, dates, or records.',
  'Do not qualify findings as coming from provided data, supplied records, included records, visible data, or current context. Refer to the business date range, filters, and entities directly.',
  'Use business-facing labels for fields in the answer. For example, say "order count" instead of raw names like "order_count".',
  'When context.execution.relatedExecutions is present, synthesize across all result blocks. Name which result each key finding comes from when it helps, and reconcile conflicting summary/detail/audit evidence instead of ignoring supporting data.',
  'Format business answers as markdown in this exact Analyzer structure: "## Main Takeaway" with one concise bullet, then "## Key Findings" with 3 to 6 bullets when rows support it, then "## Next" only for useful follow-up questions or deferred analysis.',
  'Bold short metric labels or entity names only inside sentences. Do not put each bold value on its own line.',
  'When rows are grouped by a dimension, call out the highest and lowest values with labels, the next comparison point, and a quick takeaway. For many rows, summarize top 3 and bottom 3 instead of listing every row.',
  'When the question asks for a comparison, trend, increase, decrease, same period last year, last week, previous period, or rows contain current/prior period columns, compute and state absolute change and percentage change when the needed values are present.',
  'Add 2 or 3 concrete next questions the user can ask next, grounded in the current data.',
  'The separate Analyzer planning route creates Dashboard Builder action plans; this answer route does not create plans.'
].join('\n');

const DATA_SOURCE_OR_MODEL_CONTEXT_FOLLOWUPS = [
  'Select a data source for this Analyzer conversation.',
  'Choose which business data set to analyze.',
  'Ask the question again after the data context is available.'
];

const ANALYZER_PROMPT_EXECUTION_ROW_LIMIT = 20;
const DEFAULT_ANALYZER_ANSWER_TIMEOUT_MS = 8_000;
const DEFAULT_ANALYZER_ANSWER_MODEL = 'gpt-5.4-mini';

function analyzerTools(options: AnalyzerAgentLoopOptions): CodexAgentTool[] {
  return [
    {
      terminal: true,
      definition: {
        type: 'function',
        name: 'answer_analyzer_conversation',
        description: 'Answer conversational Analyzer chat without requiring a model-backed business answer.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            answer: {
              type: 'string',
              description: 'Concise operator-facing answer.'
            },
            suggestedFollowUps: {
              type: 'array',
              description: 'Useful Analyzer questions grounded in the selected data and current answer context.',
              items: { type: 'string' }
            }
          }
        }
      },
      run: args => buildAnalyzerConversationResult(
        options.request.question,
        readString(args.answer),
        readStringArray(args.suggestedFollowUps),
        selectedConversationDataSourceId(options)
      )
    },
    {
      terminal: true,
      definition: {
        type: 'function',
        name: 'answer_analyzer_question',
        description: 'Return the final Analyzer answer after reading the plan, execution rows, and reviewed model metadata.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            answer: {
              type: 'string',
              description: 'Markdown operator-facing answer grounded only in the Analyzer context and execution rows. Follow the requested Main Takeaway, Key Findings, and optional Next structure.'
            },
            knowledgeReferenceIds: {
              type: 'array',
              description: 'Knowledge reference ids from the Analyzer context that support the answer.',
              items: { type: 'string' }
            },
            suggestedFollowUps: {
              type: 'array',
              description: 'Concrete follow-up questions the operator can ask next.',
              items: { type: 'string' }
            }
          },
          required: ['answer']
        }
      },
      run: args => answerAnalyzerQuestionResult(options, args)
    },
    {
      terminal: true,
      definition: {
        type: 'function',
        name: 'request_data_source_or_model_context',
        description: 'Ask for selected data source or model context when Analyzer cannot answer safely.',
        parameters: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'Short reason the Analyzer context is insufficient.'
            }
          }
        }
      },
      run: () => dataSourceOrModelContextClarification(options.request, options.fallback)
    }
  ];
}

function selectedConversationDataSourceId(options: AnalyzerAgentLoopOptions): string | undefined {
  const fromRequest = readString(options.request.dataSourceId);
  if (fromRequest) return fromRequest;
  const body = isRecord(options.body) ? options.body : {};
  const fromBody = readString(body.dataSourceId);
  if (fromBody) return fromBody;
  const request = isRecord(body.request) ? body.request : {};
  return readString(request.dataSourceId) ?? undefined;
}

function answerAnalyzerQuestionResult(
  options: AnalyzerAgentLoopOptions,
  args: Record<string, unknown>
): AnalyzerResult {
  const answer = readString(args.answer);
  if (!answer) {
    throw new Error('answer_analyzer_question requires an answer.');
  }
  const userFacingAnswer = userFacingAnalyzerAnswer(answer);
  const fallbackFollowUps = readPlanGuidance(options.body);
  const requestedKnowledgeIds = new Set(readStringArray(args.knowledgeReferenceIds));
  const contextReferences = knowledgeReferencesFromContext(options.body, options.fallback.knowledgeReferences);
  const selectedReferences = requestedKnowledgeIds.size > 0
    ? contextReferences.filter(reference => requestedKnowledgeIds.has(reference.id))
    : contextReferences;
  return {
    workflow: 'analyzer',
    answer: finalizeAnalyzerAnswer(userFacingAnswer, options.body),
    suggestedFollowUps: nonEmptyStrings(readStringArray(args.suggestedFollowUps), fallbackFollowUps),
    knowledgeReferences: nonEmptyKnowledgeReferences(selectedReferences, options.fallback.knowledgeReferences)
  };
}

function analyzerTextAnswerResult(
  options: AnalyzerAgentLoopOptions,
  answer: string
): AnalyzerResult {
  const userFacingAnswer = userFacingAnalyzerAnswer(answer);
  const finalAnswer = finalizeAnalyzerAnswer(userFacingAnswer, options.body);
  const baseAnswer = userFacingAnswer.trimEnd();
  const appended = finalAnswer.startsWith(baseAnswer) ? finalAnswer.slice(baseAnswer.length) : '';
  if (appended.trim()) options.onAnswerDelta?.(appended);
  return {
    workflow: 'analyzer',
    answer: finalAnswer,
    suggestedFollowUps: readPlanGuidance(options.body),
    knowledgeReferences: nonEmptyKnowledgeReferences(
      knowledgeReferencesFromContext(options.body, options.fallback.knowledgeReferences),
      options.fallback.knowledgeReferences
    )
  };
}

function analyzerAnswerTimeout(
  options: AnalyzerAgentLoopOptions,
  streamedAnswer: () => string = () => ''
): {
  cancel: () => void;
  markActivity: () => void;
  promise: Promise<CodexAgentToolLoopTimeoutResult>;
  result: CodexAgentToolLoopTimeoutResult;
} {
  let timer: NodeJS.Timeout | null = null;
  let resolved = false;
  let resolveTimeout: ((result: CodexAgentToolLoopTimeoutResult) => void) | null = null;
  const result: CodexAgentToolLoopTimeoutResult = {
    answer: executionFallbackAnswer(options),
    provider: {
      provider: 'codex',
      auth: 'oauth',
      model: analyzerAnswerModel(options.model),
      used: false,
      responseText: null,
      fallbackReason: 'codex_request_failed',
      error: `Analyzer answer exceeded ${analyzerAnswerTimeoutMs()}ms.`
    },
    toolName: null,
    toolResult: null,
    turns: 0,
    type: 'answer'
  };
  const resolveWithCurrentAnswer = (): void => {
    resolved = true;
    result.answer = readString(streamedAnswer()) ?? executionFallbackAnswer(options);
    resolveTimeout?.(result);
  };
  return {
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      resolved = true;
    },
    markActivity: () => {
      if (resolved) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(resolveWithCurrentAnswer, analyzerAnswerTimeoutMs());
    },
    promise: new Promise(resolve => {
      resolveTimeout = resolve;
      timer = setTimeout(resolveWithCurrentAnswer, analyzerAnswerTimeoutMs());
    }),
    result
  };
}

interface CodexAgentToolLoopTimeoutResult {
  answer: string;
  provider: CodexAgentResult;
  toolName: null;
  toolResult: null;
  turns: number;
  type: 'answer';
}

function analyzerAnswerTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.ANALYZER_ANSWER_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 5_000 ? Math.min(parsed, 60_000) : DEFAULT_ANALYZER_ANSWER_TIMEOUT_MS;
}

function analyzerAnswerModel(override: string | undefined): string {
  return override?.trim()
    || process.env.ANALYZER_ANSWER_MODEL?.trim()
    || process.env.ANALYZER_EXPLANATION_MODEL?.trim()
    || DEFAULT_ANALYZER_ANSWER_MODEL;
}

function executionFallbackAnswer(options: AnalyzerAgentLoopOptions): string {
  const body = isRecord(options.body) ? options.body : {};
  const execution = isRecord(body.execution) ? body.execution : null;
  const rows = execution && Array.isArray(execution.rows) ? execution.rows : [];
  const fetchedRows = execution ? readNumber(execution.fetchedRows ?? execution.returnedRows) ?? rows.length : rows.length;
  const totalRows = execution ? readNumber(execution.totalRows ?? execution.rowCount) ?? fetchedRows : fetchedRows;
  const filtersLine = appliedFiltersLine(options.body);
  const groupedAnswer = execution ? groupedExecutionFallbackAnswer(rows, execution, filtersLine) : null;
  if (groupedAnswer) return groupedAnswer;
  if (rows.length === 0) {
    return [
      '## Main Takeaway',
      '- No matching records were found for this request.',
      '',
      '## Key Findings',
      filtersLine,
      '- The selected date range and filters did not return any data.',
      '- This usually means one of the requested values is not present for that period or location.',
      '',
      '## Next',
      '- Broaden the date range or remove one filter at a time to identify which filter removes the data.'
    ].filter(line => line !== null).join('\n');
  }
  return [
    '## Main Takeaway',
    '- The request completed for the selected filters.',
    '',
    '## Key Findings',
    filtersLine,
    '- Matching data is available for the selected date range and filters.',
    totalRows > fetchedRows
      ? '- Ask for a grouped summary before making full-population decisions from detailed records.'
      : null,
    '- Ask for totals or grouped views if you want this converted into a summary.',
    '',
    '## Next',
    '- If you need a summary, ask for totals or counts grouped by the relevant field.'
  ].filter(line => line !== null).join('\n');
}

function groupedExecutionFallbackAnswer(
  rows: unknown[],
  execution: Record<string, unknown>,
  filtersLine: string | null
): string | null {
  const records = rows.filter(isRecord);
  if (records.length === 0) return null;
  const fields = Array.from(new Set(records.flatMap(row => Object.keys(row))));
  const measure = bestMeasureField(fields, records);
  const dimension = bestDimensionField(fields, records, measure);
  if (!measure || !dimension) return null;
  const sorted = records
    .map(row => ({
      label: readString(row[dimension]) ?? String(row[dimension] ?? ''),
      value: readNumber(row[measure])
    }))
    .filter(item => item.label && item.value !== null)
    .sort((left, right) => right.value! - left.value!);
  const top = sorted[0];
  const second = sorted[1];
  const bottom = sorted[sorted.length - 1];
  if (!top) return null;
  const dimensionLabel = executionColumnLabel(execution, dimension);
  const measureLabel = executionColumnLabel(execution, measure);
  return [
    '## Main Takeaway',
    `- **${top.label}** has the highest **${measureLabel}** at **${formatNumber(top.value)}**.`,
    '',
    '## Key Findings',
    filtersLine,
    `- **${top.label}** leads ${dimensionLabel.toLowerCase()} with ${formatNumber(top.value)} in ${measureLabel.toLowerCase()}.`,
    second ? `- **${second.label}** is next at ${formatNumber(second.value)}.` : null,
    bottom && bottom.label !== top.label ? `- **${bottom.label}** is lowest at ${formatNumber(bottom.value)}.` : null,
    '',
    '## Next',
    `- Show ${measureLabel} by another breakdown, such as category or location.`,
    `- Show the ${measureLabel} trend over time.`
  ].filter(line => line !== null).join('\n');
}

function bestMeasureField(fields: string[], records: Record<string, unknown>[]): string | null {
  const numeric = fields.filter(field => records.some(row => readNumber(row[field]) !== null));
  return bestNamedField(numeric, ['revenue', 'sales', 'amount', 'total', 'margin', 'orders', 'count'])
    ?? numeric[0]
    ?? null;
}

function bestDimensionField(
  fields: string[],
  records: Record<string, unknown>[],
  measure: string | null
): string | null {
  const dimensions = fields.filter(field =>
    field !== measure && records.some(row => readString(row[field]) !== null)
  );
  return bestNamedField(dimensions, ['channel', 'category', 'location', 'date', 'day', 'type'])
    ?? dimensions[0]
    ?? null;
}

function bestNamedField(fields: string[], terms: string[]): string | null {
  return fields.find(field => {
    const normalized = field.toLowerCase().replace(/[_-]+/g, ' ');
    return terms.some(term => normalized.includes(term));
  }) ?? null;
}

function executionColumnLabel(execution: Record<string, unknown>, field: string): string {
  const columns = Array.isArray(execution.columns) ? execution.columns.filter(isRecord) : [];
  const match = columns.find(column =>
    readString(column.field) === field || readString(column.name) === field
  );
  return humanizeFilterLabel(readString(match?.label) ?? field) ?? field;
}

function formatNumber(value: number | null): string {
  return value === null ? '0' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function finalizeAnalyzerAnswer(answer: string, body: unknown): string {
  return appendAppliedFiltersNote(answer, body);
}

function appendAppliedFiltersNote(answer: string, body: unknown): string {
  const line = appliedFiltersLine(body);
  if (!line || /\bfilters?\s+applied\b|\bapplied\s+filters?\b/i.test(answer)) return answer;
  const keyFindingsHeader = /(^## Key Findings\s*\n)/im;
  if (keyFindingsHeader.test(answer)) {
    return answer.replace(keyFindingsHeader, `$1${line}\n`);
  }
  return `${answer.trimEnd()}\n\n${line}`;
}

interface AppliedAnalyzerFilter {
  label: string;
  operator: string;
  value: string;
}

function appliedFiltersLine(body: unknown): string | null {
  const filters = appliedFiltersForAnswer(body);
  return filters.length > 0 ? `- **Filters applied:** ${appliedFiltersSummary(filters)}.` : null;
}

function appliedFiltersSummary(filters: AppliedAnalyzerFilter[]): string {
  return filters.map(formatAppliedFilter).join('; ');
}

function formatAppliedFilter(filter: AppliedAnalyzerFilter): string {
  const operator = normalizeFilterOperator(filter.operator);
  if (operator === 'between') return `${filter.label}: ${normalizeBetweenDisplay(filter.value)}`;
  if (operator === 'in') return `${filter.label}: ${filter.value}`;
  if (operator === 'contains') return `${filter.label}: contains ${filter.value}`;
  if (operator === 'not equals' || operator === 'not_equal' || operator === 'ne') {
    return `${filter.label}: not ${filter.value}`;
  }
  if (operator === 'gt' || operator === 'greater_than') return `${filter.label}: greater than ${filter.value}`;
  if (operator === 'gte' || operator === 'greater_than_or_equal') return `${filter.label}: at least ${filter.value}`;
  if (operator === 'lt' || operator === 'less_than') return `${filter.label}: less than ${filter.value}`;
  if (operator === 'lte' || operator === 'less_than_or_equal') return `${filter.label}: at most ${filter.value}`;
  return `${filter.label}: ${filter.value}`;
}

function appliedFiltersForAnswer(body: unknown): AppliedAnalyzerFilter[] {
  const plan = isRecord(body) && isRecord(body.plan) ? body.plan : null;
  const actions = Array.isArray(plan?.actions) ? plan.actions.filter(isRecord) : [];
  const filters: AppliedAnalyzerFilter[] = [];
  const seen = new Set<string>();
  const parameterDateLabel = parameterDateFilterLabel(plan);
  for (const action of actions) {
    const params = isRecord(action.params) ? action.params : null;
    if (!params) continue;
    for (const filter of [
      ...readFilterRecords(params.filters),
      ...readFilterRecords(params.filter)
    ]) {
      const label = readFilterLabel(filter);
      const value = readFilterValue(filter);
      if (!label || !value) continue;
      const operator = readString(filter.operator ?? filter.filterOperator) ?? 'equals';
      const item = { label, operator, value };
      const key = `${item.label}|${normalizeFilterOperator(item.operator)}|${item.value}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      filters.push(item);
    }
    const parameterDateFilter = parameterDateFilterForAnswer(
      body,
      plan,
      params,
      parameterDateLabel
    );
    if (parameterDateFilter && !hasDateLikeAppliedFilter(filters)) {
      const key = `${parameterDateFilter.label}|${normalizeFilterOperator(parameterDateFilter.operator)}|${parameterDateFilter.value}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        filters.push(parameterDateFilter);
      }
    }
  }
  return filters;
}

function hasDateLikeAppliedFilter(filters: AppliedAnalyzerFilter[]): boolean {
  return filters.some(filter => /\b(date|day|time|period|month|week|year)\b/i.test(filter.label));
}

function parameterDateFilterLabel(plan: Record<string, unknown> | null): string {
  const intentDetails = isRecord(plan?.intentDetails) ? plan.intentDetails : null;
  const selectedModel = isRecord(intentDetails?.selectedModel) ? intentDetails.selectedModel : null;
  return humanizeFilterLabel(readString(selectedModel?.primaryTimeField)) ?? 'Date Range';
}

function parameterDateFilterForAnswer(
  body: unknown,
  plan: Record<string, unknown> | null,
  params: Record<string, unknown>,
  label: string
): AppliedAnalyzerFilter | null {
  const range = analyzerParameterDateRangeForAnswer(body, plan, params);
  if (!range) return null;
  return {
    label,
    operator: 'between',
    value: `${range.from} to ${range.to}`
  };
}

function readFilterRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

function readFilterLabel(filter: Record<string, unknown>): string | null {
  return humanizeFilterLabel(
    readString(filter.label)
      ?? readString(filter.field)
      ?? readString(filter.name)
  );
}

function readFilterValue(filter: Record<string, unknown>): string | null {
  const rawValue = filter.value ?? filter.values ?? filter.searchText ?? filter.defaultValue;
  if (rawValue === null || rawValue === undefined) return null;
  return filterValueToDisplay(rawValue);
}

function filterValueToDisplay(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const values = value.map(filterValueToDisplay).filter((item): item is string => item !== null);
    return values.length > 0 ? values.join(', ') : null;
  }
  if (!isRecord(value)) return null;
  const from = readString(value.from ?? value.start ?? value.min ?? value.startDate);
  const to = readString(value.to ?? value.end ?? value.max ?? value.endDate);
  if (from && to) return `${from} to ${to}`;
  const label = readString(value.label ?? value.name ?? value.value);
  if (label) return label;
  const entries = Object.entries(value)
    .map(([key, item]) => {
      const display = filterValueToDisplay(item);
      return display ? `${humanizeFilterLabel(key)} ${display}` : null;
    })
    .filter((item): item is string => item !== null);
  return entries.length > 0 ? entries.join(', ') : null;
}

function humanizeFilterLabel(value: string | null): string | null {
  if (!value) return null;
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  return words.map(word => {
    const lower = word.toLowerCase();
    if (['id', 'ids', 'api', 'url', 'pos', 'gst', 'abn', 'csv'].includes(lower)) return lower.toUpperCase();
    return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
  }).join(' ');
}

function normalizeFilterOperator(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeBetweenDisplay(value: string): string {
  const trimmed = value.trim();
  const commaPair = /^([^,]+),\s*([^,]+)$/.exec(trimmed);
  if (commaPair) return `${commaPair[1]!.trim()} to ${commaPair[2]!.trim()}`;
  return trimmed.replace(/\s+(?:to|-)\s+/i, ' to ');
}

function relatedExecutions(execution: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(execution.relatedExecutions)
    ? execution.relatedExecutions.filter(isRecord)
    : [];
}

function compactAnalyzerPromptContext(body: unknown): unknown {
  if (!isRecord(body)) return body;
  const execution = isRecord(body.execution) ? compactExecutionForPrompt(body.execution) : body.execution;
  const plan = isRecord(body.plan) ? compactPlanForPrompt(body.plan) : body.plan;
  const appliedFilters = appliedFiltersForAnswer(body);
  return {
    ...body,
    execution,
    plan,
    ...(appliedFilters.length > 0 ? {
      appliedFilters: {
        items: appliedFilters,
        summary: appliedFiltersSummary(appliedFilters)
      }
    } : {})
  };
}

function compactPlanForPrompt(plan: Record<string, unknown>): Record<string, unknown> {
  const intentDetails = isRecord(plan.intentDetails) ? plan.intentDetails : null;
  return {
    ...plan,
    actions: compactPlanActionsForAnswer(plan.actions),
    agentProvider: undefined,
    toolTrace: undefined,
    validation: compactPlanValidationForAnswer(plan.validation),
    ...(intentDetails
      ? {
          intentDetails: {
            ...intentDetails,
            insightGuidance: []
          }
        }
      : {})
  };
}

function compactPlanActionsForAnswer(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map(action => {
    if (!isRecord(action)) return action;
    const params = isRecord(action.params) ? compactPlanActionParamsForAnswer(action.params) : action.params;
    return {
      ...action,
      params
    };
  });
}

function compactPlanActionParamsForAnswer(params: Record<string, unknown>): Record<string, unknown> {
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith('_')) continue;
    if (key === 'analyzerInstruction') continue;
    compacted[key] = value;
  }
  return compacted;
}

function compactPlanValidationForAnswer(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const status = readString(value.status);
  const failedCount = readNumber(value.failedCount);
  const passedCount = readNumber(value.passedCount);
  const warningCount = readNumber(value.warningCount);
  const valid = typeof value.valid === 'boolean' ? value.valid : undefined;
  return {
    ...(valid === undefined ? {} : { valid }),
    ...(status ? { status } : {}),
    ...(failedCount === null ? {} : { failedCount }),
    ...(passedCount === null ? {} : { passedCount }),
    ...(warningCount === null ? {} : { warningCount })
  };
}

function compactExecutionForPrompt(execution: Record<string, unknown>): Record<string, unknown> {
  const { message: _message, ...executionForAnswer } = execution;
  const rows = Array.isArray(execution.rows) ? execution.rows : null;
  const compactedRows = rows && rows.length > ANALYZER_PROMPT_EXECUTION_ROW_LIMIT
    ? rows.slice(0, ANALYZER_PROMPT_EXECUTION_ROW_LIMIT)
    : rows;
  const rowCount = readNumber(execution.rowCount ?? execution.totalRows);
  const fetchedRows = readNumber(execution.fetchedRows ?? execution.returnedRows) ?? rows?.length;
  const related = relatedExecutions(execution).map(compactExecutionForPrompt);
  return {
    ...executionForAnswer,
    ...(compactedRows ? { rows: compactedRows } : {}),
    ...(rows && rows.length > ANALYZER_PROMPT_EXECUTION_ROW_LIMIT
      ? {
          promptRows: compactedRows?.length ?? 0,
          promptRowsOmitted: rows.length - ANALYZER_PROMPT_EXECUTION_ROW_LIMIT,
          promptRowsNote: [
            'Write the business explanation from the business records and filters in context.',
            rowCount && fetchedRows && rowCount > fetchedRows ? 'Do not imply that every matching record was individually inspected.' : null,
            'Do not mention prompt, context, preview, visible, returned, loaded, shown rows, shown here, result set, supplied records, included records, records provided, records shown, available set, row caps, evidence coverage, this view, or UI. Do not say "provided data" or "current data"; use the business date range and filters.'
          ].filter(Boolean).join(' ')
        }
      : {}),
    ...(related.length > 0 ? { relatedExecutions: related } : {})
  };
}

function dataSourceOrModelContextClarification(
  request: AnalyzerRequest,
  fallback: AnalyzerResult
): AnalyzerResult {
  return {
    workflow: 'analyzer',
    answer: `Choose a data source and business data set before asking "${request.question}".`,
    suggestedFollowUps: DATA_SOURCE_OR_MODEL_CONTEXT_FOLLOWUPS,
    knowledgeReferences: fallback.knowledgeReferences
  };
}

function knowledgeReferencesFromContext(body: unknown, fallback: KnowledgeReference[]): KnowledgeReference[] {
  const plan = isRecord(body) && isRecord(body.plan) ? body.plan : null;
  const intentDetails = isRecord(plan?.intentDetails) ? plan.intentDetails : null;
  const references = Array.isArray(intentDetails?.knowledgeReferences)
    ? intentDetails.knowledgeReferences.filter(isKnowledgeReference)
    : [];
  return references.length > 0 ? references : fallback;
}

function readPlanGuidance(body: unknown): string[] {
  void body;
  return [];
}

function isAnalyzerResult(value: unknown): value is AnalyzerResult {
  if (!isRecord(value)) return false;
  return value.workflow === 'analyzer'
    && typeof value.answer === 'string'
    && Array.isArray(value.suggestedFollowUps)
    && value.suggestedFollowUps.every(item => typeof item === 'string')
    && Array.isArray(value.knowledgeReferences)
    && value.knowledgeReferences.every(isKnowledgeReference);
}

function isKnowledgeReference(value: unknown): value is KnowledgeReference {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.domain === 'string'
    && typeof value.summary === 'string'
    && Array.isArray(value.tags)
    && value.tags.every(item => typeof item === 'string');
}

function nonEmptyStrings(primary: string[], fallback: string[]): string[] {
  return primary.length > 0 ? primary : fallback;
}

function createAnalyzerOutputTextDeltaStream(
  emit: ((delta: string) => void) | undefined
): (event: CodexResponsesStreamEvent) => void {
  return event => {
    if (event.type !== 'output_text_delta') return;
    if (event.delta) emit?.(event.delta);
  };
}

function nonEmptyKnowledgeReferences(
  primary: KnowledgeReference[],
  fallback: KnowledgeReference[]
): KnowledgeReference[] {
  return primary.length > 0 ? primary : fallback;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => readString(item)).filter((item): item is string => item !== null)
    : [];
}

function userFacingAnalyzerAnswer(value: string): string {
  return value.trim() || [
    '## Main Takeaway',
    '- Analyzer completed the request. Review the result table for the matched rows.'
  ].join('\n');
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function analyzerAgentUnavailableMessage(provider: CodexAgentResult): string {
  if (provider.fallbackReason === 'openai_api_key_not_configured') {
    return 'Analyzer AI requires an OpenAI API key to be configured.';
  }
  if (provider.fallbackReason === 'openai_agent_disabled') {
    return 'Analyzer OpenAI agent is disabled.';
  }
  if (provider.fallbackReason === 'openai_request_failed') {
    return 'Analyzer OpenAI request failed.';
  }
  if (provider.fallbackReason === 'openai_tool_loop_turn_limit') {
    return 'Analyzer AI reached its tool-call limit before producing an answer.';
  }
  if (provider.fallbackReason === 'gemini_api_key_not_configured') {
    return 'Analyzer AI requires a Gemini API key to be configured.';
  }
  if (provider.fallbackReason === 'gemini_agent_disabled') {
    return 'Analyzer Gemini agent is disabled.';
  }
  if (provider.fallbackReason === 'gemini_admin_config_failed') {
    return 'Analyzer Gemini configuration failed.';
  }
  if (provider.fallbackReason === 'gemini_request_failed') {
    return 'Analyzer Gemini request failed.';
  }
  if (provider.fallbackReason === 'gemini_tool_loop_turn_limit') {
    return 'Analyzer AI reached its tool-call limit before producing an answer.';
  }
  if (provider.fallbackReason === 'codex_oauth_not_configured') {
    return 'Analyzer AI requires Codex OAuth to be connected.';
  }
  if (provider.fallbackReason === 'codex_agent_disabled') {
    return 'Analyzer AI agent is disabled.';
  }
  if (provider.fallbackReason === 'codex_request_failed') {
    return 'Analyzer AI request failed.';
  }
  if (provider.fallbackReason === 'codex_tool_loop_turn_limit') {
    return 'Analyzer AI reached its tool-call limit before producing an answer.';
  }
  return 'Analyzer AI agent is unavailable.';
}
