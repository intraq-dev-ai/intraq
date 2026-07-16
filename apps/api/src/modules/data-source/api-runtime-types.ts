import type { DataSourceRecord, TableDefinition } from './foundation-store.js';

export const DEFAULT_TABLE_NAME = 'api_data';
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_MAX_PAGES = 1;
export const MAX_MAX_PAGES = 25;
export const MAX_ROWS = 5_000;
export const MANAGED_API_TOKEN_CONFIG_KEY = 'managedAccessToken';
export const MAX_API_WORKFLOW_RUN_LOGS = 200;

export type ApiRuntimeResult<T> =
  | { ok: true; data: T }
  | { ok: false; statusCode: 400 | 401 | 403 | 404 | 502 | 504; error: string };

export interface ApiRuntimeStateOptions {
  persistSourceConfig?: (source: DataSourceRecord) => Promise<void>;
}

export interface ApiRowsOptions extends ApiRuntimeStateOptions {
  compositeDepth?: number;
  defaultLimit?: number;
  maxLimit?: number;
  parameterValues?: Record<string, unknown>;
}

export interface ApiDirectExportOptions extends ApiRuntimeStateOptions {
  format?: string;
  parameterValues?: Record<string, unknown>;
}

export interface ApiExportRowsOptions extends ApiRowsOptions {
  format?: string;
}

export interface ApiRequestConfig {
  allowBodyOnGet: boolean;
  authHeaderName?: string;
  authQueryParam?: string;
  authType: string;
  authValue?: string;
  baseUrl: string;
  body?: unknown;
  dataPath?: string;
  endpoint: string;
  headers: Record<string, unknown>;
  method: string;
  pagination: Record<string, unknown>;
  queryParams: Record<string, unknown>;
  responseMapping?: ApiResponseMappingConfig;
  responseShape: ApiResponseShape;
  rowContextColumns?: ApiResponseColumnMapping[];
  timeoutMs: number;
  tokenRequest?: TokenRequestConfig;
}

export type ApiResponseShape = 'rows' | 'kendo' | 'highcharts' | 'matrix';

export interface ApiResponseMappingConfig {
  includeEmptyRows: boolean;
  labelColumn: string;
  labelDateMode?: string;
  labelPath?: string;
  metadataColumns: ApiResponseColumnMapping[];
  rootPath?: string;
  seriesColumn: string;
  seriesPath?: string;
  type: ApiResponseShape;
  valueColumn?: string;
  valueColumns: ApiResponseColumnMapping[];
  valuePath?: string;
}

export interface ApiResponseColumnMapping {
  mode: 'constant' | 'by_index';
  name: string;
  path: string;
  valuePath?: string;
}

export interface TokenRequestConfig {
  allowBodyOnGet: boolean;
  applyAs: string;
  baseUrl: string;
  body?: unknown;
  bodyFormat: string;
  cacheKey: string;
  cacheSkewSeconds: number;
  cacheTtlSeconds: number;
  endpoint: string;
  expiresAtPath?: string;
  expiresInPath?: string;
  headerName: string;
  headers: Record<string, unknown>;
  method: string;
  queryParam: string;
  queryParams: Record<string, unknown>;
  scheme: string;
  timeoutMs: number;
  tokenPath?: string;
  tokenTypePath?: string;
  valuePrefix: string;
}

export interface ApiTemplateVariableLookupConfig {
  dataSourceId: string;
  query: string;
  timeoutMs: number;
}

export interface CompositeApiConfig {
  continueOnError: boolean;
  dedupeBy: string[];
  outputNodeId?: string;
  segments: CompositeApiSegmentConfig[];
  sortBy?: string;
  sortDirection: 'asc' | 'desc';
  steps: CompositeApiStepConfig[];
}

export interface CompositeApiSegmentConfig {
  condition?: string;
  dataSourceId: string;
  fieldMap: Record<string, string>;
  id?: string;
  name?: string;
  parameterValues: Record<string, unknown>;
  query?: string;
  queryFragments: CompositeApiSqlFragmentConfig[];
  sourceLabelField?: string;
  tableName?: string;
  timeoutMs?: number;
  when?: string;
}

export interface CompositeApiSqlFragmentConfig {
  condition?: string;
  id?: string;
  name?: string;
  slot: string;
  sql: string;
}

export type CompositeApiStepConfig = CompositeApiMergeStepConfig | CompositeApiJoinStepConfig | CompositeApiTransformStepConfig;

export interface CompositeApiMergeStepConfig {
  continueOnError: boolean;
  dedupeBy: string[];
  id: string;
  inputIds: string[];
  name?: string;
  sortBy?: string;
  sortDirection: 'asc' | 'desc';
  type: 'merge';
}

export interface CompositeApiJoinConditionConfig {
  leftField: string;
  operator: string;
  rightField: string;
}

export interface CompositeApiJoinStepConfig {
  conditions: CompositeApiJoinConditionConfig[];
  id: string;
  inputIds: string[];
  joinType: 'inner' | 'left' | 'right' | 'full' | 'cross';
  leftNodeId?: string;
  leftPrefix?: string;
  name?: string;
  rightFieldMap: Record<string, string>;
  rightFields: string[];
  rightNodeId?: string;
  rightPrefix?: string;
  selectedLeftFields: string[];
  strategy: string;
  type: 'join';
}

export interface CompositeApiTransformStepConfig {
  addFields: Record<string, unknown>;
  condition?: string;
  fieldMap: Record<string, string>;
  id: string;
  inputId?: string;
  inputIds: string[];
  limit?: number;
  name?: string;
  operation: 'filter' | 'limit' | 'map' | 'project' | 'sort';
  selectedFields: string[];
  sortBy?: string;
  sortDirection: 'asc' | 'desc';
  type: 'transform';
  where?: string;
}

export interface ApiDirectExportResponse {
  body: Buffer;
  contentType: string;
  extension: string;
  filename?: string;
}

export interface ApiPageRequest {
  allowBodyOnGet?: boolean;
  body?: string;
  headers: Record<string, string>;
  method: string;
  url: URL;
}

export interface ApiWorkflowRunLog {
  dataSourceId: string;
  durationMs: number;
  endpoint: string;
  error?: string;
  id: string;
  method: string;
  ok: boolean;
  pageCount: number;
  rowCount: number;
  startedAt: string;
  statusCode?: number;
  tableId: string;
  tableName: string;
}

export interface TokenAuthContext extends ApiRuntimeStateOptions {
  forceRefresh?: boolean;
  source: DataSourceRecord;
}

export interface ManagedApiToken {
  cacheKey: string;
  expiresAt: number;
  fetchedAt: string;
  token: string;
  tokenType?: string;
}

export interface PageState {
  cursor?: unknown;
  offset: number;
  page: number;
}

export type ApiRowsReader = (
  source: DataSourceRecord,
  table: TableDefinition,
  options: ApiRowsOptions
) => Promise<ApiRuntimeResult<{ executionTime: number; rows: Array<Record<string, unknown>> }>>;
