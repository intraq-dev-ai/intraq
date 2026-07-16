import { uuidv7 } from '@intraq/contracts';
import {
  appendMessage,
  askAnalyzer,
  recordAnalyzerRunTrace,
} from './api';
import { executeAnalyzerResultAction } from './analyzer-result-action-executor';
import {
  buildClarificationAnswer,
  findExecutableAnalyzerActions
} from './intent';
import type {
  AnalyzerAnswer,
  AnalyzerExecution,
  AnalyzerMessage,
  AnalyzerOrchestration,
  AnalyzerPlan,
  AnalyzerSelectedModel,
  AnalyzerTableData
} from './types';
import {
  analyzerPlanForUserFacingAnswer
} from './user-facing-guidance';
import { buildAnalyzerRunTraceMetadata } from './analyzer-run-trace-metadata';
import { classifyAnalyzerRunOutcome, type AnalyzerRunResultState } from './analyzer-run-outcome';

export interface AnalyzerRunCompletion {
  answer: AnalyzerAnswer;
  assistantMessage: AnalyzerMessage;
  execution: AnalyzerExecution | null;
  needsClarification: boolean;
}

export async function completeAnalyzerPlan(params: {
  conversationId: string;
  dataSourceId: string;
  latestPlanTitle: string;
  onStatus: (status: string) => void;
  orchestration: AnalyzerOrchestration | null;
  plan: AnalyzerPlan;
  prompt: string;
  signal: AbortSignal;
  tableDataLoader?: (input: {
    dataSourceId: string;
    plan: AnalyzerPlan;
    signal: AbortSignal;
    tableName: string;
  }) => Promise<AnalyzerTableData>;
}): Promise<AnalyzerRunCompletion> {
  const conversationAction = params.plan.actions.find(action => action.action === 'answer_conversation');
  if (conversationAction) return saveClarificationMessage(params, false);

  const executableActions = findExecutableAnalyzerActions(params.plan);
  if (executableActions.length === 0) {
    return saveClarificationMessage(params, true);
  }

  const trace = createAnalyzerRunTrace();
  const runId = uuidv7();
  const executions: AnalyzerExecution[] = [];
  let execution: AnalyzerExecution | null = null;
  let answer: AnalyzerAnswer | null = null;
  try {
    for (let index = 0; index < executableActions.length; index += 1) {
      const action = executableActions[index]!;
      params.onStatus(executableActions.length === 1
        ? 'Loading result rows'
        : `Loading result rows ${index + 1} of ${executableActions.length}`);
      executions.push(await executeAnalyzerResultAction(params, action, trace, index, executableActions.length, runId));
    }
    execution = {
      ...executions[0]!,
      ...(executions.length > 1 ? { relatedExecutions: executions.slice(1) } : {})
    };
    const answerPlan = analyzerPlanForUserFacingAnswer(params.plan);

    params.onStatus(executions.length === 1 ? 'Generating analyzer explanation' : 'Generating combined analyzer explanation');
    answer = await trace.span('answer_explanation', 'Write the business answer from the fetched result rows.', () => askAnalyzer({
      question: params.prompt,
      conversationId: params.conversationId,
      dataSourceId: params.dataSourceId,
      execution: execution!,
      plan: answerPlan
    }, { signal: params.signal }));

    params.onStatus('Saving analyzer answer');
    const assistantMessage = await trace.span('save_answer', 'Save the answer and result metadata into the conversation.', () => appendMessage(params.conversationId, {
      role: 'assistant',
      content: answer!.answer,
      metadata: {
        suggestedFollowUps: answer!.suggestedFollowUps,
        knowledgeReferences: answer!.knowledgeReferences,
        execution,
        plan: answerPlan,
        orchestration: params.orchestration,
        subQuestion: params.prompt,
        tableName: execution!.tableName
      }
    }, { signal: params.signal }));
    const runOutcome = classifyAnalyzerRunOutcome(executions);
    await persistAnalyzerRunTrace(params, {
      answer,
      execution,
      executions,
      outcome: runOutcome.outcome,
      ...(runOutcome.reason ? { reason: runOutcome.reason } : {}),
      resultState: runOutcome.resultState,
      trace
    });
    return {
      answer,
      assistantMessage,
      execution,
      needsClarification: false
    };
  } catch (caught) {
    trace.failOpenSpan(caught);
    await persistAnalyzerRunTrace(params, {
      answer,
      execution,
      executions,
      outcome: 'failed',
      reason: readErrorMessage(caught),
      trace
    });
    throw caught;
  }
}

interface AnalyzerRunTraceStep {
  at: string;
  durationMs: number;
  error?: string;
  status: 'completed' | 'failed';
  summary: string;
  tool: string;
}

interface AnalyzerRunTraceRecorder {
  failOpenSpan(caught: unknown): void;
  steps: AnalyzerRunTraceStep[];
  totalElapsedMs(): number;
  span<T>(tool: string, summary: string, run: () => Promise<T>): Promise<T>;
}

function createAnalyzerRunTrace(): AnalyzerRunTraceRecorder {
  const startedAt = nowMs();
  const steps: AnalyzerRunTraceStep[] = [];
  return {
    failOpenSpan(caught: unknown): void {
      if (steps.some(step => step.status === 'failed')) return;
      steps.push({
        at: new Date().toISOString(),
        durationMs: Math.round(nowMs() - startedAt),
        error: readErrorMessage(caught),
        status: 'failed',
        summary: 'Analyzer run failed before the next stage completed.',
        tool: 'complete_analyzer_run'
      });
    },
    steps,
    totalElapsedMs(): number {
      return Math.round(nowMs() - startedAt);
    },
    async span<T>(tool: string, summary: string, run: () => Promise<T>): Promise<T> {
      const stepStartedAt = nowMs();
      try {
        const result = await run();
        steps.push({
          at: new Date().toISOString(),
          durationMs: Math.round(nowMs() - stepStartedAt),
          status: 'completed',
          summary,
          tool
        });
        return result;
      } catch (caught) {
        steps.push({
          at: new Date().toISOString(),
          durationMs: Math.round(nowMs() - stepStartedAt),
          error: readErrorMessage(caught),
          status: 'failed',
          summary,
          tool
        });
        throw caught;
      }
    }
  };
}

async function persistAnalyzerRunTrace(
  params: {
    conversationId: string;
    dataSourceId: string;
    latestPlanTitle: string;
    orchestration: AnalyzerOrchestration | null;
    plan: AnalyzerPlan;
    prompt: string;
  },
  input: {
    answer: AnalyzerAnswer | null;
    execution: AnalyzerExecution | null;
    executions: AnalyzerExecution[];
    outcome: 'answered' | 'failed' | 'needs_review';
    reason?: string;
    resultState?: AnalyzerRunResultState;
    trace: AnalyzerRunTraceRecorder;
  }
): Promise<void> {
  const primaryExecution = input.execution ?? input.executions[0] ?? null;
  const selectedModel = selectedModelForExecution(params.plan, primaryExecution);
  const planTrace = Array.isArray(params.plan.toolTrace) ? params.plan.toolTrace.filter(isRecord) : [];
  const runTrace = input.trace.steps.map(step => ({ ...step }));
  const toolTrace = [...planTrace, ...runTrace];
  const answerSummary = input.answer?.answer
    ? truncateForTrace(input.answer.answer, 360)
    : input.reason || 'Analyzer run failed before an answer was saved.';
  try {
    await recordAnalyzerRunTrace({
      answerSummary,
      conversationId: params.conversationId,
      dataSourceId: primaryExecution?.dataSourceId || params.dataSourceId,
      ...(selectedModel?.id ? { dataSourceTableId: selectedModel.id } : {}),
      metadata: {
        ...buildAnalyzerRunTraceMetadata({
          answer: input.answer,
          dataSourceId: params.dataSourceId,
          executions: input.executions,
          plan: params.plan
        }),
        elapsedMs: input.trace.totalElapsedMs(),
        executionCount: input.executions.length,
        fetchedRows: sumExecutions(input.executions, 'fetchedRows'),
        latestPlanTitle: params.latestPlanTitle,
        orchestration: params.orchestration,
        planToolCount: planTrace.length,
        resultState: input.resultState ?? 'populated',
        runStepCount: runTrace.length,
        source: 'analyzer-run',
        toolTrace,
        totalRows: sumExecutions(input.executions, 'rowCount')
      },
      outcome: input.outcome,
      question: params.prompt,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(selectedModel ? { selectedModel: selectedModel as unknown as Record<string, unknown> } : {}),
      selectedModels: selectedModelsForTrace(params.plan),
      ...(primaryExecution?.tableName ? { tableName: primaryExecution.tableName } : {})
    });
  } catch {
    // Trace logging must not break the Analyzer path the user is already waiting on.
  }
}

function selectedModelForExecution(plan: AnalyzerPlan, execution: AnalyzerExecution | null): AnalyzerSelectedModel | null {
  const models = plan.intentDetails?.selectedModels ?? [];
  const modelId = execution?.dataModelId?.trim() ?? '';
  const tableName = execution?.tableName?.trim() ?? '';
  return models.find(model => model.id === modelId || model.name === tableName)
    ?? plan.intentDetails?.selectedModel
    ?? null;
}

function selectedModelsForTrace(plan: AnalyzerPlan): Array<Record<string, unknown>> {
  return (plan.intentDetails?.selectedModels ?? [])
    .filter(isRecord)
    .slice(0, 12) as unknown as Array<Record<string, unknown>>;
}

function sumExecutions(executions: AnalyzerExecution[], key: 'fetchedRows' | 'rowCount'): number {
  return executions.reduce((total, execution) => total + (typeof execution[key] === 'number' ? execution[key] : 0), 0);
}

function truncateForTrace(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function readErrorMessage(caught: unknown): string {
  return caught instanceof Error && caught.message ? caught.message : 'Analyzer run failed.';
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function saveClarificationMessage(params: {
  conversationId: string;
  onStatus: (status: string) => void;
  orchestration: AnalyzerOrchestration | null;
  plan: AnalyzerPlan;
  signal: AbortSignal;
}, needsClarification: boolean): Promise<AnalyzerRunCompletion> {
  const answerPlan = analyzerPlanForUserFacingAnswer(params.plan);
  const answer = buildClarificationAnswer(answerPlan);
  params.onStatus(needsClarification ? 'Saving clarification request' : 'Saving analyzer answer');
  const assistantMessage = await appendMessage(params.conversationId, {
    role: 'assistant',
    content: answer.answer,
    metadata: {
      suggestedFollowUps: answer.suggestedFollowUps,
      knowledgeReferences: answer.knowledgeReferences,
      plan: answerPlan,
      orchestration: params.orchestration,
      clarificationRequested: needsClarification
    }
  }, { signal: params.signal });
  return {
    answer,
    assistantMessage,
    execution: null,
    needsClarification
  };
}
