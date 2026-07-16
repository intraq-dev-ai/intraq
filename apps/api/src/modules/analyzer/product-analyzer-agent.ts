import type { AnalyzerRequest, AnalyzerResult, KnowledgeReference } from '@intraq/contracts';
import type { AnalyzerPlanRequest } from '../../validation.js';
import { findDataSource, rowsForTable, toLabel } from '../data-source/foundation-store.js';
import { buildAnalyzerActionPlan, type AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

interface AnalyzerExecutionContext {
  columns?: unknown;
  rows: Array<Record<string, unknown>>;
  tableName: string;
  totalRows?: number;
}

const metadataReference: KnowledgeReference = {
  id: 'metadata-guided-analysis',
  title: 'Metadata-guided analysis',
  domain: 'generic',
  summary: 'Analyzer used selected data model metadata and result rows as evidence.',
  tags: ['metadata', 'data-model']
};

export class ProductAnalyzerAgent {
  plan(request: AnalyzerPlanRequest): AnalyzerActionPlanResponse {
    return buildAnalyzerActionPlan(request, [metadataReference]);
  }

  answer(request: AnalyzerRequest, body: unknown): AnalyzerResult {
    const dataSourceId = isRecord(body) ? readString(body.dataSourceId) : null;
    if (!dataSourceId) return dataSourceModelContextClarification(request.question);

    const plan = readAnalyzerPlan(body)
      ?? buildAnalyzerActionPlan({
        dataSourceId,
        question: request.question,
        ...(request.conversationId ? { conversationId: request.conversationId } : {})
      }, [metadataReference]);
    const action = plan.actions.find(item => item.action === 'create_table');
    const execution = readAnalyzerExecution(body);
    const tableName = execution?.tableName ?? readString(action?.params._tableName);
    const selectedTable = tableName
      ? findDataSource(dataSourceId)?.tables.find(table => table.name === tableName || table.id === tableName)
      : null;

    if (!tableName || !plan.intentDetails?.selectedModel) {
      return {
        workflow: 'analyzer',
        answer: plan.message || 'Analyzer needs selected data source and data model context before it can answer this question.',
        suggestedFollowUps: [
          'Choose a data model with readable measures and dimensions.',
          'Add field labels, aliases, and descriptions to improve the answer.',
          'Ask the same question again after model context is available.'
        ],
        knowledgeReferences: plan.intentDetails?.knowledgeReferences ?? [metadataReference]
      };
    }

    const rows = execution?.rows.length ? execution.rows : rowsForTable(dataSourceId, tableName);
    const columns = readColumnLabels(action?.params.columns ?? execution?.columns, rows);
    const modelName = plan.intentDetails.selectedModel.businessName || readString(selectedTable?.dictionary.businessName) || toLabel(tableName);
    const rowCount = execution?.totalRows ?? rows.length;
    return {
      workflow: 'analyzer',
      answer: answerFromRows(request.question, modelName, tableName, columns, rows, rowCount),
      suggestedFollowUps: followUpsFor(modelName, columns),
      knowledgeReferences: plan.intentDetails.knowledgeReferences.length > 0
        ? plan.intentDetails.knowledgeReferences
        : [metadataReference]
    };
  }
}

function dataSourceModelContextClarification(question: string): AnalyzerResult {
  return {
    workflow: 'analyzer',
    answer: `Analyzer needs a selected data source and data model context before it can answer "${question}" with model, query, and row evidence.`,
    suggestedFollowUps: [
      'Select a data source for this Analyzer conversation.',
      'Choose a data model with business measures, dimensions, and descriptions.',
      'Ask the question again after model context is available.'
    ],
    knowledgeReferences: [metadataReference]
  };
}

function answerFromRows(
  question: string,
  modelName: string,
  tableName: string,
  columns: Array<{ field: string; label: string; summarize?: string }>,
  rows: Array<Record<string, unknown>>,
  rowCount: number
): string {
  const metric = columns.find(column => column.summarize && column.summarize !== 'none')
    ?? numericColumn(columns, rows);
  const dimension = columns.find(column => !column.summarize || column.summarize === 'none');
  const summary = metric ? metricSummary(metric, dimension, rows) : null;
  const fields = columns.length > 0
    ? columns.map(column => column.label || column.field).slice(0, 6).join(', ')
    : Object.keys(rows[0] ?? {}).slice(0, 6).join(', ');
  return [
    `Using ${modelName}, Analyzer found ${rowCount} row${rowCount === 1 ? '' : 's'} for "${question}".`,
    summary,
    `Evidence came from ${tableName}${fields ? ` using ${fields}` : ''}.`,
    'The answer is limited to the selected model metadata and returned rows.'
  ].filter(Boolean).join(' ');
}

function metricSummary(
  metric: { field: string; label: string },
  dimension: { field: string; label: string } | undefined,
  rows: Array<Record<string, unknown>>
): string | null {
  const ranked = rows
    .map(row => ({
      label: dimension ? String(row[dimension.field] ?? 'Unlabelled') : metric.label,
      value: numberValue(row[metric.field])
    }))
    .filter(item => item.value !== null)
    .sort((left, right) => (right.value ?? 0) - (left.value ?? 0));
  const top = ranked[0];
  if (!top || top.value === null) return null;
  const next = ranked[1];
  const lead = dimension
    ? `${top.label} has the strongest ${metric.label} signal at ${formatNumber(top.value)}`
    : `${metric.label} is ${formatNumber(top.value)}`;
  return next && next.value !== null
    ? `${lead}; the next comparison point is ${next.label} at ${formatNumber(next.value)}.`
    : `${lead}.`;
}

function followUpsFor(modelName: string, columns: Array<{ label: string }>): string[] {
  const column = columns[0]?.label.toLowerCase() ?? 'this result';
  return [
    `Break down ${column} further in ${modelName}.`,
    `Create a dashboard view for ${modelName}.`,
    'Show the source rows behind this answer.'
  ];
}

function readAnalyzerPlan(body: unknown): AnalyzerActionPlanResponse | null {
  const plan = isRecord(body) && isRecord(body.plan) ? body.plan : null;
  return plan && Array.isArray(plan.actions) && isRecord(plan.intentDetails)
    ? plan as unknown as AnalyzerActionPlanResponse
    : null;
}

function readAnalyzerExecution(body: unknown): AnalyzerExecutionContext | null {
  const execution = isRecord(body) && isRecord(body.execution) ? body.execution : null;
  const tableName = readString(execution?.tableName);
  if (!execution || !tableName) return null;
  const rows = Array.isArray(execution.rows) ? execution.rows.filter(isRecord).map(row => ({ ...row })) : [];
  const result: AnalyzerExecutionContext = {
    columns: execution.columns,
    rows,
    tableName
  };
  const totalRows = readNumber(execution.totalRows) ?? readNumber(execution.rowCount);
  if (totalRows !== null) result.totalRows = totalRows;
  return result;
}

function readColumnLabels(
  value: unknown,
  rows: Array<Record<string, unknown>>
): Array<{ field: string; label: string; summarize?: string }> {
  const columns = Array.isArray(value) ? value.flatMap(item => {
    const record = typeof item === 'string' ? { field: item } : isRecord(item) ? item : null;
    const field = readString(record?.field) ?? readString(record?.name);
    if (!field) return [];
    const summarize = readString(record?.summarize);
    return [{
      field,
      label: readString(record?.label) ?? toLabel(field),
      ...(summarize ? { summarize } : {})
    }];
  }) : [];
  if (columns.length > 0) return columns;
  return Object.keys(rows[0] ?? {}).map(field => ({ field, label: toLabel(field) }));
}

function numericColumn(
  columns: Array<{ field: string; label: string; summarize?: string }>,
  rows: Array<Record<string, unknown>>
): { field: string; label: string; summarize?: string } | null {
  return columns.find(column => rows.some(row => numberValue(row[column.field]) !== null)) ?? null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
