import type { AnalyzerDashboardQueueItem } from './dashboard-queue';
import {
  ANALYZER_RESULT_PAGE_SIZE,
  buildAnalyzerChartData,
  normalizeAnalyzerColumns,
  type AnalyzerVisualizationType
} from './result-data';
import type { AnalyzerExecution } from './types';

interface ApiEnvelope<TData> {
  success: boolean;
  data?: TData;
  error?: string;
}

type JsonBody = Record<string, unknown>;

interface RequestJsonOptions {
  body?: JsonBody;
  method?: string;
}

export interface AnalyzerDashboardSummary {
  category?: string;
  elements?: unknown[];
  id: string;
  layout?: unknown[];
  name: string;
  status?: string;
  updatedAt?: string;
}

export async function fetchAnalyzerDashboards(): Promise<AnalyzerDashboardSummary[]> {
  const dashboards = await requestJson<unknown>('/api/dashboards');
  return Array.isArray(dashboards) ? dashboards.filter(isAnalyzerDashboardSummary) : [];
}

export async function createDashboardFromAnalyzerQueue(body: {
  description?: string;
  items: AnalyzerDashboardQueueItem[];
  name: string;
}): Promise<{ id: string }> {
  if (body.items.length === 0) throw new Error('Dashboard queue is empty.');
  return requestJson<{ id: string }>('/api/dashboards', {
    method: 'POST',
    body: {
      name: body.name,
      category: 'Analyzer',
      description: body.description || 'Created from AI Analyzer dashboard queue.',
      elements: body.items.map(analyzerDashboardElementInput),
      settings: {
        refreshInterval: null,
        theme: 'default'
      }
    }
  });
}

export async function addAnalyzerQueueToDashboard(body: {
  dashboardId: string;
  items: AnalyzerDashboardQueueItem[];
}): Promise<void> {
  if (body.items.length === 0) throw new Error('Dashboard queue is empty.');
  await Promise.all(body.items.map((item, index) => requestJson<unknown>(
    `/api/dashboards/${encodeURIComponent(body.dashboardId)}/elements`,
    {
      method: 'POST',
      body: analyzerDashboardElementInput(item, index)
    }
  )));
}

export function analyzerDashboardElementInput(item: {
  execution: AnalyzerExecution;
  latestPlanTitle: string;
  selectedDataSourceId: string;
  title: string;
  type: AnalyzerVisualizationType;
}, index: number): Record<string, unknown> {
  const dataSourceId = item.execution.dataSourceId || item.selectedDataSourceId;
  if (!dataSourceId) throw new Error('Analyzer result is missing its data source.');
  const elementType = dashboardElementType(item.type);
  const chartType = chartTypeForQueueType(item.type);
  return {
    name: item.title || item.execution.title || item.latestPlanTitle || 'Analyzer Result',
    type: elementType,
    ...(chartType ? { chartType } : {}),
    dataSourceId,
    config: analyzerDashboardElementConfig({
      dataSourceId,
      execution: item.execution,
      tableName: item.execution.tableName,
      title: item.title,
      visualizationType: item.type
    }),
    layout: {
      x: (index % 2) * 6,
      y: Math.floor(index / 2) * 5,
      w: elementType === 'table' || elementType === 'matrix' ? 8 : 6,
      h: elementType === 'table' ? 5 : 6
    }
  };
}

async function requestJson<TData>(
  path: string,
  options: RequestJsonOptions = {}
): Promise<TData> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const init: RequestInit = { method: options.method ?? 'GET', headers };
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

function isAnalyzerDashboardSummary(value: unknown): value is AnalyzerDashboardSummary {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function analyzerDashboardElementConfig(body: {
  dataSourceId: string;
  execution?: AnalyzerExecution;
  tableName: string;
  title: string;
  visualizationType: AnalyzerVisualizationType;
}): Record<string, unknown> {
  const executionContract = body.execution?.executionContract;
  const executionRequest = isRecord(executionContract?.request) ? executionContract.request : {};
  const requestVisualization = isRecord(executionRequest.visualization) ? executionRequest.visualization : {};
  const componentConfig = isRecord(executionRequest.componentConfig) ? executionRequest.componentConfig : {};
  const requestChartConfig = isRecord(executionRequest.chartConfig) ? executionRequest.chartConfig : {};
  const parameterValues = isRecord(executionRequest.parameterValues) ? executionRequest.parameterValues : {};
  const rows = body.execution?.rows ?? [];
  const columns = normalizeAnalyzerColumns(body.execution?.columns, rows);
  const requestColumns = Array.isArray(componentConfig.columns)
    ? componentConfig.columns.filter(isRecord).map(column => ({ ...column }))
    : [];
  const persistedColumns = requestColumns.length > 0 ? requestColumns : columns;
  const chartData = buildAnalyzerChartData(rows, columns);
  const chartType = chartTypeForQueueType(body.visualizationType);
  const totalRows = body.execution?.totalRows ?? body.execution?.rowCount ?? body.execution?.rows?.length ?? 0;
  const fieldRoles = chartData ? {
    [chartData.labelColumn.field]: readDashboardFieldRole(chartData.labelColumn),
    [chartData.metricColumn.field]: 'measure'
  } : {};
  const aggregations = isRecord(requestChartConfig.aggregations)
    ? requestChartConfig.aggregations
    : chartData ? { [chartData.metricColumn.field]: chartData.metricColumn.summarize || 'sum' } : {};
  const fieldFormats = chartData ? { [chartData.metricColumn.field]: 'number' } : {};
  return {
    title: body.title,
    tableName: body.tableName,
    _tableName: body.tableName,
    dataSource: body.dataSourceId,
    dataSourceId: body.dataSourceId,
    ...(body.execution?.dataModelId ? {
      dataModelId: body.execution.dataModelId,
      dataSourceTableId: body.execution.dataModelId
    } : {}),
    ...(body.execution?.dataModelName ? { dataModelName: body.execution.dataModelName } : {}),
    ...componentConfig,
    ...(Object.keys(parameterValues).length > 0 ? { parameterValues } : {}),
    columns: persistedColumns,
    dataColumns: persistedColumns.map(column => ({
      field: column.field,
      summarize: column.summarize,
      type: column.type
    })),
    ...(chartData ? {
      aggregations,
      component: 'BaseChart',
      fieldFormats,
      fieldRoles,
      valueField: chartData.metricColumn.field,
      xField: chartData.labelColumn.field,
      ySeries: [{
        field: chartData.metricColumn.field,
        label: chartData.metricColumn.label,
        summarize: chartData.metricColumn.summarize || 'sum'
      }],
      yFields: [chartData.metricColumn.field]
    } : {}),
    ...(chartType ? { chartType } : {}),
    visualization: analyzerVisualizationConfig({
      chartData,
      dataSourceId: body.dataSourceId,
      ...(body.execution?.dataModelId ? { dataModelId: body.execution.dataModelId } : {}),
      ...(executionContract ? { executionContract } : {}),
      requestVisualization,
      tableName: body.tableName,
      title: body.title,
      type: body.visualizationType
    }),
    analyzer: {
      ...(executionContract ? { executionContract } : {}),
      rowCount: body.execution?.rowCount ?? totalRows,
      source: 'ai-analyzer',
      totalRows
    }
  };
}

function analyzerVisualizationConfig(body: {
  chartData: ReturnType<typeof buildAnalyzerChartData>;
  dataSourceId: string;
  dataModelId?: string;
  executionContract?: AnalyzerExecution['executionContract'];
  requestVisualization: Record<string, unknown>;
  tableName: string;
  title: string;
  type: AnalyzerVisualizationType;
}): Record<string, unknown> {
  const kind = visualizationKindForQueueType(body.type);
  const requestEncodings = Array.isArray(body.requestVisualization.encodings)
    ? body.requestVisualization.encodings.filter(isRecord).map(item => ({ ...item }))
    : [];
  const fallbackEncodings = body.chartData ? [
    {
      field: body.chartData.labelColumn.field,
      label: body.chartData.labelColumn.label,
      role: readDashboardFieldRole(body.chartData.labelColumn)
    },
    {
      aggregation: body.chartData.metricColumn.summarize || 'sum',
      field: body.chartData.metricColumn.field,
      format: 'number',
      label: body.chartData.metricColumn.label,
      role: 'measure'
    }
  ] : [];
  const encodings = requestEncodings.length > 0 ? requestEncodings : fallbackEncodings;
  const filters = Array.isArray(body.requestVisualization.filters)
    ? body.requestVisualization.filters.filter(isRecord).map(item => ({ ...item }))
    : [];
  const sort = Array.isArray(body.requestVisualization.sort)
    ? body.requestVisualization.sort.filter(isRecord).map(item => ({ ...item }))
    : [];
  const requestLimit = readPositiveNumber(body.requestVisualization.limit);
  const visualizationId = body.executionContract?.executionId
    ?? `analyzer-${body.executionContract?.requestFingerprint ?? body.tableName}`;
  return {
    id: visualizationId,
    schemaVersion: 1,
    title: body.title,
    description: `${body.title} preserved from an AI Analyzer execution.`,
    kind,
    dataRef: {
      sourceId: body.dataSourceId,
      tableName: body.tableName,
      ...(body.dataModelId ? { tableId: body.dataModelId } : {})
    },
    encodings,
    limit: requestLimit ?? ANALYZER_RESULT_PAGE_SIZE,
    filters,
    sort,
    interactions: {
      crossFilter: kind !== 'table',
      drilldown: false,
      legend: kind === 'pie',
      tooltip: true
    },
    accessibility: {
      label: `${body.title} ${kind} visualization`,
      summary: `${body.title} was created from an AI Analyzer queue result.`
    },
    rendererHints: {
      fallback: kind === 'table' || kind === 'matrix' ? 'table' : 'chart',
      requiredCapabilities: kind === 'table' || kind === 'matrix' ? ['tabular'] : ['chart']
    }
  };
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function dashboardElementType(type: AnalyzerVisualizationType): string {
  return type === 'table' || type === 'matrix' ? type : 'chart';
}

function chartTypeForQueueType(type: AnalyzerVisualizationType): string | undefined {
  return type === 'table' || type === 'matrix' ? undefined : type;
}

function visualizationKindForQueueType(type: AnalyzerVisualizationType): string {
  if (type === 'table' || type === 'matrix' || type === 'pie') return type;
  if (type === 'line' || type === 'area') return 'line';
  return 'bar';
}

function readDashboardFieldRole(column: { field: string; type?: string }): string {
  const source = `${column.field} ${column.type ?? ''}`.toLowerCase();
  return source.includes('date') || source.includes('day') || source.includes('time') ? 'time' : 'dimension';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
