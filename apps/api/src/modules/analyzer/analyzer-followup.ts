import type {
  AnalyzerHistoryAccess,
  AnalyzerHistoryStore,
  AnalyzerHistoryMessage
} from './history-foundation-store.js';
import {
  isRecord,
  normalizeForSearch,
  readString,
  searchTokens
} from './analyzer-planning-utils.js';
import {
  appendAnalyzerInstructionsToQuestion
} from './analyzer-instructions.js';

export interface FollowupResolveRequest {
  conversationId: string | null;
  question: string;
}

export interface FollowupResolveResponse {
  questionForPlan: string;
  resolved: boolean;
  useConversationContext: boolean;
  hints: Array<Record<string, unknown>>;
}

export async function resolveAnalyzerFollowup(
  store: AnalyzerHistoryStore,
  request: FollowupResolveRequest,
  access: AnalyzerHistoryAccess
): Promise<FollowupResolveResponse> {
  const question = request.question.trim();
  const messages = request.conversationId
    ? await store.listMessages(request.conversationId, 'analyzer', access) ?? []
    : [];
  const analyzerInstructions = analyzerInstructionsFor(messages);
  const context = latestAnalyzerContext(messages, question);
  if (analyzerInstructions.length > 0) {
    const planRequest = appendAnalyzerInstructionsToQuestion({
      dataSourceId: '',
      question
    }, analyzerInstructions);
    if (planRequest.question !== question) {
      return {
        questionForPlan: planRequest.question,
        resolved: true,
        useConversationContext: true,
        hints: analyzerInstructions.map(instruction => ({
          type: 'analyzer_instruction',
          instruction,
          source: 'conversation'
        }))
      };
    }
  }
  if (!context) {
    return unresolved(question);
  }

  const entityHints = entityHintsFor(question, context.rows);
  const hasSignal = hasFollowupSignal(question);
  if (entityHints.length === 0 && !hasSignal) {
    return unresolved(question);
  }
  if (entityHints.length > 0 && !hasSignal && !isImplicitEntityOnlyFollowup(question, entityHints)) {
    return unresolved(question);
  }

  const contextParts = [
    context.question ? `previous question: ${context.question}` : '',
    context.tableName ? `data model: ${context.tableName}` : '',
    Object.keys(context.parameterValues).length > 0 ? `previous parameters: ${formatParameterValues(context.parameterValues)}` : '',
    entityHints.length > 0 ? `matched values: ${entityHints.map(hint => `${hint.field}=${hint.values.join(', ')}`).join('; ')}` : ''
  ].filter(Boolean);

  const carryForwardParameters = carriedForwardParameterValues(context.parameterValues, question);
  const parameterHint: Array<Record<string, unknown>> = Object.keys(carryForwardParameters).length > 0
    ? [{
        type: 'parameter_values',
        values: carryForwardParameters,
        source: 'previous_plan'
      }]
    : [];

  return {
    questionForPlan: `${question}. Use follow-up context from ${contextPartsWithParameters(
      contextParts,
      carryForwardParameters
    ).join(', ')}.`,
    resolved: true,
    useConversationContext: false,
    hints: (entityHints.map(hint => ({
      type: 'entity_values',
      field: hint.field,
      values: hint.values,
      source: 'previous_result'
    })) as Array<Record<string, unknown>>).concat(parameterHint)
  };
}

function contextPartsWithParameters(
  contextParts: string[],
  parameterValues: Record<string, unknown>
): string[] {
  const withoutParameters = contextParts.filter(part => !part.startsWith('previous parameters:'));
  return Object.keys(parameterValues).length > 0
    ? [...withoutParameters, `previous parameters: ${formatParameterValues(parameterValues)}`]
    : withoutParameters;
}

function carriedForwardParameterValues(
  values: Record<string, unknown>,
  question: string
): Record<string, unknown> {
  if (!questionMentionsDateOrPeriod(question)) return values;
  return Object.fromEntries(Object.entries(values).filter(([key]) => !isDateParameterName(key)));
}

function isDateParameterName(key: string): boolean {
  return /^(from|to|fromdate|todate|startdate|enddate|datefrom|dateto|asofdate|as_of_date|reportdate|report_date)$/i
    .test(key.replace(/[\s_-]+/g, '').toLowerCase());
}

function questionMentionsDateOrPeriod(question: string): boolean {
  return /\b(today|yesterday|tomorrow|last|previous|this|current|past|next|between|from|to|week|month|quarter|year|fiscal|fy|calendar|period|date|all time|lifetime|entire history|full history|since inception)\b/i.test(question)
    || /\b\d{4}-\d{1,2}-\d{1,2}\b/.test(question)
    || /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i.test(question);
}

function analyzerInstructionsFor(messages: AnalyzerHistoryMessage[]): string[] {
  const instructions = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !isRecord(message.metadata)) continue;
    const plan = isRecord(message.metadata.plan) ? message.metadata.plan : null;
    const actions = Array.isArray(plan?.actions) ? plan.actions : [];
    for (const action of actions) {
      if (!isRecord(action) || !isRecord(action.params)) continue;
      const instruction = readString(action.params.analyzerInstruction);
      if (instruction) instructions.add(instruction);
    }
  }
  return Array.from(instructions).slice(-5);
}

function latestAnalyzerContext(
  messages: AnalyzerHistoryMessage[],
  currentQuestion: string
): {
  parameterValues: Record<string, unknown>;
  question: string | null;
  tableName: string | null;
  rows: Array<Record<string, unknown>>;
} | null {
  const normalizedCurrent = normalizeForSearch(currentQuestion);
  for (const message of [...messages].reverse()) {
    if (message.role === 'user' && normalizeForSearch(message.content) === normalizedCurrent) continue;
    if (message.role !== 'assistant' || !isRecord(message.metadata)) continue;

    const rows = readContextRows(message.metadata);
    const tableName = readContextTableName(message.metadata);
    const subQuestion = readContextQuestion(message.metadata);
    const parameterValues = readContextParameterValues(message.metadata);
    if (rows.length === 0 && !tableName && !subQuestion && Object.keys(parameterValues).length === 0) continue;

    return {
      parameterValues,
      question: subQuestion ?? extractResultQuestion(message.content),
      tableName,
      rows
    };
  }
  return null;
}

function entityHintsFor(
  question: string,
  rows: Array<Record<string, unknown>>
): Array<{ field: string; values: string[] }> {
  const normalizedQuestion = normalizeForSearch(question);
  const matches = new Map<string, Set<string>>();
  for (const row of rows.slice(0, 20)) {
    for (const [field, value] of Object.entries(row)) {
      if (typeof value !== 'string' || value.trim().length < 2) continue;
      const normalizedValue = normalizeForSearch(value);
      if (!normalizedValue || !normalizedQuestion.includes(normalizedValue)) continue;
      const values = matches.get(field) ?? new Set<string>();
      values.add(value.trim());
      matches.set(field, values);
    }
  }

  return Array.from(matches.entries()).map(([field, values]) => ({
    field,
    values: Array.from(values).slice(0, 5)
  }));
}

function readRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord).map(row => ({ ...row })) : [];
}

function readContextRows(metadata: Record<string, unknown>): Array<Record<string, unknown>> {
  const execution = isRecord(metadata.execution) ? metadata.execution : null;
  const legacyRows = readRows(metadata.rows);
  return legacyRows.length > 0 ? legacyRows : readRows(execution?.rows);
}

function readContextTableName(metadata: Record<string, unknown>): string | null {
  const execution = isRecord(metadata.execution) ? metadata.execution : null;
  const plan = isRecord(metadata.plan) ? metadata.plan : null;
  return readString(metadata.tableName)
    ?? readString(execution?.tableName)
    ?? readPlanTableName(plan);
}

function readContextQuestion(metadata: Record<string, unknown>): string | null {
  const orchestration = isRecord(metadata.orchestration) ? metadata.orchestration : null;
  const plan = isRecord(metadata.plan) ? metadata.plan : null;
  const intentDetails = isRecord(plan?.intentDetails) ? plan.intentDetails : null;
  return readString(metadata.subQuestion)
    ?? readString(orchestration?.originalQuestion)
    ?? readString(intentDetails?.question);
}

function readContextParameterValues(metadata: Record<string, unknown>): Record<string, unknown> {
  const plan = isRecord(metadata.plan) ? metadata.plan : null;
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  for (const action of actions) {
    if (!isRecord(action) || !isRecord(action.params) || action.action !== 'create_table') continue;
    if (isRecord(action.params.parameterValues)) return safeParameterValues(action.params.parameterValues);
  }
  return {};
}

function safeParameterValues(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values)
    .filter(([key, value]) => Boolean(readString(key)) && isSafeParameterValue(value))
    .slice(0, 12));
}

function isSafeParameterValue(value: unknown): boolean {
  return typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function formatParameterValues(values: Record<string, unknown>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ');
}

function readPlanTableName(plan: Record<string, unknown> | null): string | null {
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  for (const action of actions) {
    if (!isRecord(action) || !isRecord(action.params)) continue;
    const tableName = readString(action.params._tableName);
    if (tableName) return tableName;
  }
  return null;
}

function extractResultQuestion(content: string): string | null {
  const marker = ': ';
  const index = content.indexOf(marker);
  const value = index >= 0 ? content.slice(index + marker.length).trim() : content.trim();
  return value.length > 0 ? value : null;
}

function hasFollowupSignal(question: string): boolean {
  const normalized = normalizeForSearch(question);
  const tokens = new Set(searchTokens(question));
  return [
    'how about',
    'what about',
    'same',
    'that',
    'those',
    'these',
    'it',
    'them',
    'also',
    'instead',
    'previous',
    'above',
    'drill',
    'breakdown'
  ].some(term => term.includes(' ') ? normalized.includes(term) : tokens.has(term));
}

const IMPLICIT_ENTITY_FILLER_TOKENS = new Set([
  'and',
  'or',
  'vs',
  'versus'
]);

function isImplicitEntityOnlyFollowup(
  question: string,
  entityHints: Array<{ field: string; values: string[] }>
): boolean {
  const tokens = searchTokens(question)
    .filter(token => !COMMON_ENTITY_QUESTION_TOKENS.has(token) && !IMPLICIT_ENTITY_FILLER_TOKENS.has(token));
  if (tokens.length === 0 || tokens.length > 4) return false;
  const valueTokens = new Set<string>();
  for (const hint of entityHints) {
    for (const value of hint.values) {
      for (const token of searchTokens(value)) valueTokens.add(token);
    }
  }
  return tokens.every(token => valueTokens.has(token));
}

const COMMON_ENTITY_QUESTION_TOKENS = new Set([
  'show',
  'what',
  'wat',
  'which',
  'why',
  'how',
  'iis',
  'is',
  'are',
  'the',
  'a',
  'an',
  'for',
  'by',
  'of',
  'in',
  'to'
]);

function unresolved(question: string): FollowupResolveResponse {
  return {
    questionForPlan: question,
    resolved: false,
    useConversationContext: false,
    hints: []
  };
}
