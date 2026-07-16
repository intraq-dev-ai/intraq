import { toLabel } from '../data-source/foundation-store.js';

export interface AnalyzerInsightSummaryInput {
  question: string;
  tableName: string;
  modelName?: string | null;
  modelDomain?: string | null;
  columns?: unknown;
  rows?: Array<Record<string, unknown>>;
  totalRows?: number;
  guidance?: string[];
  knowledgeReferences?: unknown;
  sql?: string | null;
}

export interface AnalyzerInsightSummary {
  message: string;
  suggestedFollowUps: string[];
}

export function buildAnalyzerInsightSummary(input: AnalyzerInsightSummaryInput): AnalyzerInsightSummary {
  const rows = input.rows ?? [];
  const columns = normalizeColumns(input.columns, rows);
  const metric = columns.find(column => column.summarize && column.summarize !== 'none')
    ?? columns.find(column => rows.some(row => numberValue(row[column.field]) !== null));
  const dimension = columns.find(column => column.field !== metric?.field && (!column.summarize || column.summarize === 'none'));
  const rowCount = input.totalRows ?? rows.length;
  const modelName = input.modelName?.trim() || toLabel(input.tableName);
  const summary = metric ? metricSummary(metric, dimension, rows) : null;
  return {
    message: [
      `Analyzer used ${modelName} and ${rowCount} row${rowCount === 1 ? '' : 's'} for "${input.question}".`,
      summary,
      `Evidence came from ${input.tableName}.`,
      'This answer is limited to the selected model metadata and returned rows.'
    ].filter(Boolean).join(' '),
    suggestedFollowUps: [
      `Break down ${metric?.label.toLowerCase() ?? 'this result'} further.`,
      `Create a dashboard view for ${modelName}.`,
      'Show the source rows behind this answer.'
    ]
  };
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
  return next && next.value !== null
    ? `${top.label} leads ${metric.label} at ${formatNumber(top.value)}; ${next.label} is next at ${formatNumber(next.value)}.`
    : `${metric.label} is ${formatNumber(top.value)}.`;
}

function normalizeColumns(
  input: unknown,
  rows: Array<Record<string, unknown>>
): Array<{ field: string; label: string; summarize?: string }> {
  const columns = Array.isArray(input) ? input.flatMap(item => {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
