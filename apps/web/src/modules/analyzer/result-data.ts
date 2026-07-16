import { readAnalyzerExecutionContract } from './analyzer-execution-contract';
import type {
  AnalyzerColumn,
  AnalyzerExecution
} from './types';

export const ANALYZER_RESULT_PAGE_SIZE = 20;
export const ANALYZER_CHART_TYPES = ['bar', 'column', 'line', 'area', 'pie'] as const;
export const ANALYZER_CHART_AREA_FILL = 'var(--analyzer-chart-area-fill)';
export const ANALYZER_CHART_EMPTY_COLOR = 'var(--analyzer-chart-empty)';
export const ANALYZER_CHART_LINE_COLOR = 'var(--analyzer-chart-line)';
const ANALYZER_CHART_COLOR_COUNT = 6;
const ANALYZER_TECHNICAL_PREFIXES = new Set(['dim', 'fact', 'mart', 'table', 'tbl', 'view', 'vw']);
const ANALYZER_DOMAIN_PREFIXES = new Set<string>();
const ANALYZER_ACRONYMS = new Set(['adr', 'ai', 'api', 'kpi', 'pos', 'revpar', 'sql', 'vat']);

export type AnalyzerChartType = typeof ANALYZER_CHART_TYPES[number];
export type AnalyzerVisualizationType = 'table' | 'matrix' | AnalyzerChartType;

export interface AnalyzerChartPoint {
  label: string;
  value: number;
}

export interface AnalyzerChartData {
  labelColumn: AnalyzerColumn;
  metricColumn: AnalyzerColumn;
  points: AnalyzerChartPoint[];
}

export interface AnalyzerMatrixSummary {
  rowColumn: AnalyzerColumn;
  columnColumn: AnalyzerColumn | null;
  metricColumn: AnalyzerColumn;
  columnLabels: string[];
  rows: Array<{
    label: string;
    total: number;
    values: Record<string, number>;
  }>;
}

export function analyzerChartColor(index: number): string {
  const normalized = Number.isFinite(index)
    ? ((Math.trunc(index) % ANALYZER_CHART_COLOR_COUNT) + ANALYZER_CHART_COLOR_COUNT) % ANALYZER_CHART_COLOR_COUNT
    : 0;
  return `var(--analyzer-chart-color-${normalized + 1})`;
}

export function readAnalyzerExecutionMetadata(metadata: Record<string, unknown> | undefined): AnalyzerExecution | null {
  const execution = isRecord(metadata?.execution) ? metadata.execution : null;
  const plan = isRecord(metadata?.plan) ? metadata.plan : null;
  const intentDetails = isRecord(plan?.intentDetails) ? plan.intentDetails : null;
  const selectedModel = isRecord(execution?.selectedModel)
    ? execution.selectedModel
    : isRecord(intentDetails?.selectedModel)
      ? intentDetails.selectedModel
      : null;
  const tableConfig = isRecord(metadata?.tableConfig) ? metadata.tableConfig : null;
  const rows = readRows(execution?.rows ?? metadata?.rows);
  const tableName = readString(execution?.tableName) ?? readString(metadata?.tableName) ?? readString(tableConfig?._tableName);
  if (!tableName) return null;

  const rowCount = readNumber(execution?.rowCount ?? metadata?.totalRowCount ?? execution?.totalRows) ?? rows.length;
  const totalRows = readNumber(execution?.totalRows ?? metadata?.totalRowCount) ?? rowCount;
  const fetchedRows = readNumber(execution?.fetchedRows ?? execution?.returnedRows ?? metadata?.fetchedRows) ?? rows.length;
  const result: AnalyzerExecution = {
    tableName,
    fetchedRows,
    rowCount,
    message: '',
    columns: normalizeAnalyzerColumns(execution?.columns ?? tableConfig?.columns, rows),
    rows,
    totalRows
  };
  const dataSourceId = readString(execution?.dataSourceId) ?? readString(tableConfig?.dataSource) ?? readString(tableConfig?._dataSourceId);
  const dataModelId = readString(execution?.dataModelId) ?? readString(selectedModel?.id);
  const dataModelName = readString(execution?.dataModelName) ?? readString(selectedModel?.businessName) ?? readString(selectedModel?.name);
  const sql = readString(execution?.sql) ?? readString(intentDetails?.sql);
  const title = readString(execution?.title) ?? readString(tableConfig?.title) ?? readPlanActionTitle(plan);
  const relatedExecutions = readRelatedAnalyzerExecutions(execution?.relatedExecutions);
  const executionContract = readAnalyzerExecutionContract(execution?.executionContract);
  if (dataSourceId) result.dataSourceId = dataSourceId;
  if (dataModelId) result.dataModelId = dataModelId;
  if (dataModelName) result.dataModelName = dataModelName;
  if (sql) result.sql = sql;
  if (title) result.title = title;
  if (executionContract) result.executionContract = executionContract;
  if (relatedExecutions.length > 0) result.relatedExecutions = relatedExecutions;
  result.title = analyzerResultTitle(result);
  result.message = readString(execution?.message) ?? analyzerExecutionSummary(result, rowCount);
  return result;
}

function readRelatedAnalyzerExecutions(value: unknown): AnalyzerExecution[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const rows = readRows(item.rows);
    const tableName = readString(item.tableName);
    if (!tableName) return [];
    const rowCount = readNumber(item.rowCount ?? item.totalRows) ?? rows.length;
    const totalRows = readNumber(item.totalRows) ?? rowCount;
    const fetchedRows = readNumber(item.fetchedRows ?? item.returnedRows) ?? rows.length;
    const execution: AnalyzerExecution = {
      tableName,
      fetchedRows,
      rowCount,
      message: readString(item.message) ?? '',
      columns: normalizeAnalyzerColumns(item.columns, rows),
      rows,
      totalRows
    };
    const dataSourceId = readString(item.dataSourceId);
    const dataModelId = readString(item.dataModelId);
    const dataModelName = readString(item.dataModelName);
    const sql = readString(item.sql);
    const title = readString(item.title);
    const executionContract = readAnalyzerExecutionContract(item.executionContract);
    if (dataSourceId) execution.dataSourceId = dataSourceId;
    if (dataModelId) execution.dataModelId = dataModelId;
    if (dataModelName) execution.dataModelName = dataModelName;
    if (sql) execution.sql = sql;
    if (title) execution.title = title;
    if (executionContract) execution.executionContract = executionContract;
    execution.title = analyzerResultTitle(execution);
    if (!readString(execution.message)) execution.message = analyzerExecutionSummary(execution, rowCount);
    return [execution];
  });
}

export function analyzerResultTitle(execution: AnalyzerExecution): string {
  const title = readString(execution.title);
  if (title && !isTechnicalAnalyzerLabel(title)) return title;
  return analyzerExecutionModelLabel(execution);
}

export function analyzerExecutionSummary(execution: AnalyzerExecution, rowCount: number): string {
  const totalRows = execution.totalRows ?? execution.rowCount ?? rowCount;
  const fetchedRows = execution.fetchedRows ?? execution.rows?.length ?? Math.min(rowCount, totalRows);
  if (totalRows > fetchedRows) {
    return `Executed using ${analyzerExecutionModelLabel(execution)} with ${fetchedRows} fetched row${fetchedRows === 1 ? '' : 's'} from ${totalRows} matching rows.`;
  }
  return `Executed using ${analyzerExecutionModelLabel(execution)} with ${totalRows} row${totalRows === 1 ? '' : 's'}.`;
}

export function analyzerExecutionModelLabel(execution: AnalyzerExecution): string {
  return toAnalyzerBusinessLabel(execution.dataModelName ?? execution.tableName);
}

export function toAnalyzerBusinessLabel(value: string): string {
  const raw = value.trim();
  if (!raw) return 'Selected Data Model';
  const hasTechnicalSeparator = raw.includes('_') || raw.includes('-');
  const rawParts = raw.split(/[\s_-]+/).filter(Boolean);
  const labelParts = toAnalyzerLabel(raw).split(' ').filter(Boolean);
  while (rawParts.length > 1 && ANALYZER_TECHNICAL_PREFIXES.has(rawParts[0]?.toLowerCase() ?? '')) {
    rawParts.shift();
    labelParts.shift();
  }
  if (hasTechnicalSeparator && rawParts.length > 1 && ANALYZER_DOMAIN_PREFIXES.has(rawParts[0]?.toLowerCase() ?? '')) {
    rawParts.shift();
    labelParts.shift();
  }
  const label = labelParts.map(formatAnalyzerLabelPart).join(' ');
  return label || toAnalyzerLabel(raw);
}

export function normalizeAnalyzerColumns(
  input: unknown,
  rows: Array<Record<string, unknown>>,
  preferredInput?: unknown
): AnalyzerColumn[] {
  const byField = new Map<string, AnalyzerColumn>();
  addColumnItems(byField, preferredInput);
  addColumnItems(byField, input);
  for (const row of rows) {
    for (const field of Object.keys(row)) {
      if (!byField.has(field)) byField.set(field, { field, label: toAnalyzerLabel(field) });
    }
  }
  return Array.from(byField.values());
}

export function buildAnalyzerChartData(
  rows: Array<Record<string, unknown>>,
  columns: AnalyzerColumn[],
  options: { labelField?: string; metricField?: string } = {}
): AnalyzerChartData | null {
  const metricColumn = selectMetricColumn(rows, columns, options.metricField);
  if (!metricColumn) return null;
  const labelColumn = selectDimensionColumn(rows, columns, metricColumn.field, options.labelField);
  if (!labelColumn) return null;

  const grouped = new Map<string, number>();
  rows.forEach((row, index) => {
    const label = formatAnalyzerValue(row[labelColumn.field] ?? `Row ${index + 1}`);
    const value = readNumericValue(row[metricColumn.field]);
    if (value === null) return;
    grouped.set(label, (grouped.get(label) ?? 0) + value);
  });

  return {
    labelColumn,
    metricColumn,
    points: Array.from(grouped.entries()).map(([label, value]) => ({ label, value })).slice(0, 12)
  };
}

export function buildAnalyzerMatrixSummary(
  rows: Array<Record<string, unknown>>,
  columns: AnalyzerColumn[]
): AnalyzerMatrixSummary | null {
  const metricColumn = selectMetricColumn(rows, columns);
  if (!metricColumn) return null;
  const dimensionColumns = columns.filter(column => column.field !== metricColumn.field && !isNumericColumn(rows, column.field));
  const rowColumn = dimensionColumns[0] ?? columns.find(column => column.field !== metricColumn.field);
  if (!rowColumn) return null;
  const columnColumn = dimensionColumns.find(column => column.field !== rowColumn.field) ?? null;
  const grouped = new Map<string, { total: number; values: Record<string, number> }>();
  const columnLabels = new Set<string>();

  rows.forEach((row, index) => {
    const rowLabel = formatAnalyzerValue(row[rowColumn.field] ?? `Row ${index + 1}`);
    const columnLabel = columnColumn ? formatAnalyzerValue(row[columnColumn.field]) : 'Value';
    const value = readNumericValue(row[metricColumn.field]);
    if (value === null) return;
    columnLabels.add(columnLabel);
    const current = grouped.get(rowLabel) ?? { total: 0, values: {} };
    current.total += value;
    current.values[columnLabel] = (current.values[columnLabel] ?? 0) + value;
    grouped.set(rowLabel, current);
  });

  const orderedColumnLabels = Array.from(columnLabels).slice(0, 12);
  return {
    rowColumn,
    columnColumn,
    metricColumn,
    columnLabels: orderedColumnLabels,
    rows: Array.from(grouped.entries())
      .map(([label, value]) => ({ label, total: value.total, values: value.values }))
      .slice(0, ANALYZER_RESULT_PAGE_SIZE)
  };
}

export function canRenderAnalyzerChart(rows: Array<Record<string, unknown>>, columns: AnalyzerColumn[]): boolean {
  return Boolean(buildAnalyzerChartData(rows, columns)?.points.length);
}

export function canRenderAnalyzerMatrix(rows: Array<Record<string, unknown>>, columns: AnalyzerColumn[]): boolean {
  return Boolean(buildAnalyzerMatrixSummary(rows, columns)?.rows.length);
}

export function formatAnalyzerValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function toAnalyzerLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function readNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function analyzerMetricColumns(rows: Array<Record<string, unknown>>, columns: AnalyzerColumn[]): AnalyzerColumn[] {
  return columns.filter(column => isNumericColumn(rows, column.field));
}

export function analyzerLabelColumns(
  rows: Array<Record<string, unknown>>,
  columns: AnalyzerColumn[],
  metricField = ''
): AnalyzerColumn[] {
  const dimensions = columns.filter(column => column.field !== metricField && !isNumericColumn(rows, column.field));
  return dimensions.length ? dimensions : columns.filter(column => column.field !== metricField);
}

function selectMetricColumn(
  rows: Array<Record<string, unknown>>,
  columns: AnalyzerColumn[],
  preferredField?: string
): AnalyzerColumn | null {
  const preferred = preferredField
    ? columns.find(column => column.field === preferredField && isNumericColumn(rows, column.field))
    : undefined;
  if (preferred) return preferred;
  return columns.find(column => column.summarize && column.summarize !== 'none' && isNumericColumn(rows, column.field)) ??
    columns.find(column => isNumericColumn(rows, column.field)) ??
    null;
}

function selectDimensionColumn(
  rows: Array<Record<string, unknown>>,
  columns: AnalyzerColumn[],
  metricField: string,
  preferredField?: string
): AnalyzerColumn | null {
  const preferred = preferredField
    ? columns.find(column => column.field === preferredField && column.field !== metricField)
    : undefined;
  if (preferred) return preferred;
  return columns.find(column => column.field !== metricField && !isNumericColumn(rows, column.field)) ??
    columns.find(column => column.field !== metricField) ??
    null;
}

function isNumericColumn(rows: Array<Record<string, unknown>>, field: string): boolean {
  return rows.some(row => readNumericValue(row[field]) !== null);
}

function addColumnItems(target: Map<string, AnalyzerColumn>, input: unknown): void {
  if (!Array.isArray(input)) return;
  for (const item of input) {
    const column = readColumn(item);
    if (!column) continue;
    const existing = target.get(column.field);
    const merged = analyzerColumn(column.field, column.label || existing?.label || toAnalyzerLabel(column.field));
    const summarize = column.summarize ?? existing?.summarize;
    const type = column.type ?? existing?.type;
    if (summarize) merged.summarize = summarize;
    if (type) merged.type = type;
    target.set(column.field, merged);
  }
}

function readColumn(input: unknown): AnalyzerColumn | null {
  if (typeof input === 'string' && input.trim()) {
    const field = input.trim();
    return { field, label: toAnalyzerLabel(field) };
  }
  if (!isRecord(input)) return null;
  const field = readString(input.field) ?? readString(input.name) ?? readString(input.key);
  if (!field) return null;
  const column = analyzerColumn(field, readString(input.label) ?? readString(input.title) ?? toAnalyzerLabel(field));
  const summarize = readString(input.summarize);
  const type = readString(input.type);
  if (summarize) column.summarize = summarize;
  if (type) column.type = type;
  return column;
}

function analyzerColumn(field: string, label: string): AnalyzerColumn {
  return { field, label };
}

function readRows(input: unknown): Array<Record<string, unknown>> {
  return Array.isArray(input) ? input.filter(isRecord).map(row => ({ ...row })) : [];
}

function readNumber(input: unknown): number | null {
  return typeof input === 'number' && Number.isFinite(input) ? input : null;
}

function readString(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim() : undefined;
}

function readPlanActionTitle(plan: Record<string, unknown> | null): string | undefined {
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  for (const action of actions) {
    if (!isRecord(action) || action.action !== 'create_table' || !isRecord(action.params)) continue;
    const title = readString(action.params.title);
    if (title) return title;
  }
  return undefined;
}

function isTechnicalAnalyzerLabel(value: string): boolean {
  const raw = value.trim().toLowerCase();
  const parts = raw.split(/[\s_-]+/).filter(Boolean);
  return raw.includes('_') || raw.includes('-') || ANALYZER_TECHNICAL_PREFIXES.has(parts[0] ?? '');
}

function formatAnalyzerLabelPart(value: string): string {
  const lower = value.toLowerCase();
  return ANALYZER_ACRONYMS.has(lower) ? lower.toUpperCase() : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
