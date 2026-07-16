import { fetchAnalyzerPlannedTableData, streamAnalyzerExecution } from './api';
import { buildAnalyzerExecutionContract } from './analyzer-execution-contract';
import type { findExecutableAnalyzerAction } from './intent';
import { readActionTableName } from './intent';
import { analyzerPlanTableDataRequest } from './plan-table-data-request';
import { attachAnalyzerExecutionData } from './analyzer-execution-data';
import type {
  AnalyzerExecution,
  AnalyzerPlan,
  AnalyzerSelectedModel,
  AnalyzerTableData
} from './types';

interface AnalyzerExecutionTrace {
  span<T>(tool: string, summary: string, run: () => Promise<T>): Promise<T>;
}

export async function executeAnalyzerResultAction(
  params: {
    conversationId: string;
    dataSourceId: string;
    plan: AnalyzerPlan;
    prompt: string;
    signal: AbortSignal;
    tableDataLoader?: (input: {
      dataSourceId: string;
      plan: AnalyzerPlan;
      signal: AbortSignal;
      tableName: string;
    }) => Promise<AnalyzerTableData>;
  },
  executableAction: NonNullable<ReturnType<typeof findExecutableAnalyzerAction>>,
  trace: AnalyzerExecutionTrace,
  index: number,
  total: number,
  runId: string
): Promise<AnalyzerExecution> {
  const tableName = readActionTableName(executableAction);
  const dataSourceId = readActionDataSourceId(executableAction) || params.dataSourceId;
  const plannedRequest = analyzerPlanTableDataRequest(dataSourceId, tableName, params.plan);
  const stepSuffix = total > 1 ? ` (${index + 1} of ${total})` : '';
  const tableData = await trace.span(
    'load_result_rows',
    `Load result rows for ${tableName || 'selected model'}${stepSuffix}.`,
    async () => params.tableDataLoader
      ? params.tableDataLoader({
        dataSourceId,
        plan: params.plan,
        signal: params.signal,
        tableName
      })
      : fetchAnalyzerPlannedTableData(dataSourceId, tableName, params.plan, {
        request: plannedRequest,
        signal: params.signal
      })
  );
  const selectedModel = selectedModelForAction(params.plan, executableAction);
  const selectedModelLabel = selectedModel?.businessName?.trim() || selectedModel?.name?.trim() || '';
  const selectedModelId = selectedModel?.id?.trim() || '';
  const sql = tableData.sql || readActionSql(executableAction) || params.plan.intentDetails?.sql?.trim();
  const executionSummary: Parameters<typeof streamAnalyzerExecution>[0]['summary'] = {
    columns: executableAction.params.columns,
    fetchedRows: tableData.rows.length,
    tableName,
    totalRows: tableData.totalRows,
    ...(params.plan.intentDetails?.knowledgeReferences
      ? { knowledgeReferences: params.plan.intentDetails.knowledgeReferences }
      : {}),
    ...(selectedModel ? { selectedModel } : {}),
    ...(sql ? { sql } : {})
  };
  const streamedExecution = await trace.span(
    'summarize_result',
    `Build the result summary for ${tableName || 'selected model'}${stepSuffix}.`,
    () => streamAnalyzerExecution({
      dataSourceId,
      question: params.prompt,
      conversationId: params.conversationId,
      data: { rows: tableData.rows },
      summary: executionSummary
    }, { signal: params.signal })
  );
  return attachAnalyzerExecutionData(streamedExecution, {
    dataSourceId,
    executionContract: buildAnalyzerExecutionContract({
      conversationId: params.conversationId,
      request: plannedRequest.body,
      runId,
      tableData
    }),
    planColumns: executableAction.params.columns,
    ...(sql ? { sql } : {}),
    tableData,
    title: titleFromAction(executableAction.params.title, selectedModelLabel),
    ...(selectedModelId ? { dataModelId: selectedModelId } : {}),
    ...(selectedModelLabel ? { dataModelName: selectedModelLabel } : {})
  });
}

function selectedModelForAction(
  plan: AnalyzerPlan,
  action: NonNullable<ReturnType<typeof findExecutableAnalyzerAction>>
): AnalyzerSelectedModel | null {
  const models = plan.intentDetails?.selectedModels ?? [];
  const id = typeof action.params._dataSourceTableId === 'string'
    ? action.params._dataSourceTableId.trim()
    : typeof action.params.dataSourceTableId === 'string'
      ? action.params.dataSourceTableId.trim()
      : '';
  const tableName = readActionTableName(action);
  return models.find(model => model.id === id || model.name === tableName)
    ?? plan.intentDetails?.selectedModel
    ?? null;
}

function readActionDataSourceId(action: ReturnType<typeof findExecutableAnalyzerAction>): string {
  const value = action?.params._dataSourceId ?? action?.params.dataSourceId;
  return typeof value === 'string' ? value.trim() : '';
}

function readActionSql(action: ReturnType<typeof findExecutableAnalyzerAction>): string {
  const value = action?.params.sql;
  return typeof value === 'string' ? value.trim() : '';
}

function titleFromAction(value: unknown, fallbackTitle: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallbackTitle;
}
