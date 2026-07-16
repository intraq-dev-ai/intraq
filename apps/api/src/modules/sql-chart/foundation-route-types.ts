import type { ComponentConfig } from './component-sql-builder/index.js';
import type {
  SqlEditorDataSource,
  SqlEditorRow,
  SqlEditorTable
} from './sql-editor-data.js';
import type { ApiRuntimeStateOptions } from '../data-source/api-data-source-runtime.js';
import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import type { GeneratedXAxisBucket } from './x-axis-generated-bucket.js';

export type Row = SqlEditorRow;

export const ROW_COUNT_FIELD = '__row_count';
export const ANALYZER_CHART_DATA_SAFE_LIMIT = 100;
export const DEFAULT_EXPORT_LIMIT = 100_000;
export const MAX_EXPORT_LIMIT = 250_000;
export const DEFAULT_API_CHART_ROUTE_TIMEOUT_MS = 15_000;
export const API_CHART_ROUTE_TIMEOUT_BUFFER_MS = 5_000;
export const MAX_API_CHART_ROUTE_TIMEOUT_MS = 300_000;

export interface ChartConfig {
  dimensions: string[];
  xField: string;
  yFields: string[];
  seriesBy?: string;
  chartType: string;
  aggregations: Record<string, string>;
  filters: ChartFilterIntent[];
  limit?: number;
  selectFields: string[];
  sort: ChartSortIntent[];
}

export interface ChartFilterIntent {
  field: string;
  operator: string;
  value?: unknown;
}

export interface ChartSortIntent {
  field: string;
  direction: string;
}

export type ChartDataExportFormat = 'csv' | 'excel' | 'json';

export interface ChartDataExportItem {
  chartDataRequest?: unknown;
  componentId?: string;
  componentTitle?: string;
  componentType?: string;
  request?: unknown;
  workflowId?: string;
  workflowOutput?: unknown;
  workflowTransform?: unknown;
}

export interface WorkflowExportOutput {
  dataSourceId: string;
  tableName: string;
}

export type WorkflowExportResolution =
  | { ok: true; request: unknown; rowTransform?: Record<string, unknown> }
  | { ok: false; statusCode: 400 | 404; error: string };

export type WorkflowExportResolver = (
  item: ChartDataExportItem,
  request: unknown
) => Promise<WorkflowExportResolution>;

export interface ChartDataExportPayload {
  dashboardName?: string;
  format: ChartDataExportFormat;
  items: ChartDataExportItem[];
  limit: number;
}

export interface ChartDataExportSection {
  columns: string[];
  componentId?: string;
  componentTitle: string;
  componentType: string;
  includeSectionHeader?: boolean;
  rows: Row[];
}

export interface ParsedChartRequest {
  dataSourceId: string;
  tableName: string;
  source: SqlEditorDataSource;
  table: SqlEditorTable;
  rows: Row[];
  chartConfig: ChartConfig;
  componentConfig: ComponentConfig | null;
  generatedXAxisBucket: GeneratedXAxisBucket | null;
  editMode: boolean;
  access: DataSourceAccessPolicy;
  parameterValues: Record<string, unknown>;
}

export type ChartRequestParseResult = ParsedChartRequest | { error: string };

export type ChartRequestParseWithTimeoutResult =
  | ChartRequestParseResult
  | { error: string; statusCode: 504 };

export interface LoadChartRowsInput extends ParsedChartRequest {
  apiRuntimeState: ApiRuntimeStateOptions;
}

export type LoadChartRowsResult =
  | {
    rows: Row[];
    filtersAppliedAtSource: boolean;
    rowsAggregatedAtSource: boolean;
    sqlQuery: string;
  }
  | { error: string; statusCode: number };
