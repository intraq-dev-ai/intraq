import type {
  AnalyzerAnswer,
  AnalyzerExecution,
  AnalyzerMessage,
  AnalyzerOrchestration,
  AnalyzerPlan,
  AnalyzerPlanAction,
  DataSourceSummary
} from './types';
import { readAnalyzerExecutionMetadata } from './result-data';
import { userFacingAnalyzerGuidance } from './user-facing-guidance';

const ANALYZER_FALLBACK_QUESTIONS = [
  'Top 10 by revenue',
  'Sales trend by month',
  'Highest margin products'
] as const;

export function collectSampleQuestions(source: DataSourceSummary | null): string[] {
  void source;
  return Array.from(ANALYZER_FALLBACK_QUESTIONS);
}

export function readLatestPlanTitle(plan: AnalyzerPlan | null): string {
  if (!plan) return '';
  const executableTitle = findExecutableAnalyzerAction(plan)?.params.title;
  if (typeof executableTitle === 'string' && executableTitle.trim()) return executableTitle.trim();
  return plan.intentDetails?.selectedModel?.businessName ?? '';
}

export function findExecutableAnalyzerAction(plan: AnalyzerPlan): AnalyzerPlanAction | null {
  return findExecutableAnalyzerActions(plan)[0] ?? null;
}

export function findExecutableAnalyzerActions(plan: AnalyzerPlan): AnalyzerPlanAction[] {
  return plan.actions.filter(action => action.action === 'create_table' && readActionTableName(action));
}

export function findClarificationAction(plan: AnalyzerPlan): AnalyzerPlanAction | null {
  return plan.actions.find(action => action.action === 'request_clarification') ?? null;
}

export function readActionTableName(action: AnalyzerPlanAction | null): string {
  const tableName = action?.params._tableName;
  return typeof tableName === 'string' ? tableName.trim() : '';
}

export function buildClarificationAnswer(plan: AnalyzerPlan): AnalyzerAnswer {
  const clarification = findClarificationAction(plan);
  const reason = typeof clarification?.params.reason === 'string' && clarification.params.reason.trim()
    ? clarification.params.reason.trim()
    : plan.message;
  return {
    answer: reason,
    suggestedFollowUps: userFacingAnalyzerGuidance(plan.intentDetails?.insightGuidance),
    knowledgeReferences: plan.intentDetails?.knowledgeReferences ?? []
  };
}

export function readLatestAnswer(items: AnalyzerMessage[]): AnalyzerAnswer | null {
  const assistant = latestAssistant(items);
  if (!assistant) return null;
  const metadata = assistant.metadata ?? {};
  return {
    answer: assistant.content,
    suggestedFollowUps: userFacingAnalyzerGuidance(
      Array.isArray(metadata.suggestedFollowUps) ? metadata.suggestedFollowUps.filter(isString) : []
    ),
    knowledgeReferences: Array.isArray(metadata.knowledgeReferences)
      ? metadata.knowledgeReferences.filter(isKnowledgeReference)
      : []
  };
}

export function readLatestPlan(items: AnalyzerMessage[]): AnalyzerPlan | null {
  const assistant = latestAssistant(items);
  return assistant ? readMessagePlan(assistant) : null;
}

export function readLatestExecution(items: AnalyzerMessage[]): AnalyzerExecution | null {
  const assistant = latestAssistant(items);
  return assistant ? readMessageExecution(assistant) : null;
}

export function readMessageExecutions(message: AnalyzerMessage): AnalyzerExecution[] {
  const execution = readMessageExecution(message);
  if (!execution) return [];
  return [execution, ...(execution.relatedExecutions ?? [])];
}

export function readLatestOrchestration(items: AnalyzerMessage[]): AnalyzerOrchestration | null {
  const assistant = latestAssistant(items);
  return assistant ? readMessageOrchestration(assistant) : null;
}

export function readMessagePlan(message: AnalyzerMessage): AnalyzerPlan | null {
  const plan = message.metadata?.plan;
  return isAnalyzerPlan(plan) ? plan : null;
}

export function readMessageExecution(message: AnalyzerMessage): AnalyzerExecution | null {
  return readAnalyzerExecutionMetadata(message.metadata);
}

export function readMessageOrchestration(message: AnalyzerMessage): AnalyzerOrchestration | null {
  const orchestration = message.metadata?.orchestration;
  return isAnalyzerOrchestration(orchestration) ? orchestration : null;
}

function latestAssistant(items: AnalyzerMessage[]): AnalyzerMessage | null {
  return [...items].reverse().find(item => item.role === 'assistant') ?? null;
}

function isAnalyzerPlan(value: unknown): value is AnalyzerPlan {
  return isRecord(value) && typeof value.message === 'string' && Array.isArray(value.actions);
}

function isAnalyzerOrchestration(value: unknown): value is AnalyzerOrchestration {
  return isRecord(value)
    && typeof value.originalQuestion === 'string'
    && Array.isArray(value.coveredQuestions)
    && Array.isArray(value.deferredQuestions);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isKnowledgeReference(value: unknown): value is AnalyzerAnswer['knowledgeReferences'][number] {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
