export interface SqlEditorSource {
  id: string;
  name: string;
  type: string;
  status: string;
  tableCount: number;
}

export interface SqlEditorColumn {
  name: string;
  label: string;
  type: string;
  description: string;
}

export interface SqlEditorTable {
  id?: string;
  name: string;
  description: string;
  rowCount: number;
  hasSqlQuery?: boolean;
  isDataModel?: boolean;
  settings?: Record<string, unknown>;
  sqlQuery?: string | null;
  targetType?: 'data_model' | 'raw_table';
  columns: SqlEditorColumn[];
}

export interface SqlEditorSchema {
  id: string;
  name: string;
  type: string;
  status: string;
  tables: SqlEditorTable[];
}

export interface SqlEditorQueryResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionTime: number;
  dataSource: { id: string; name: string; type: string };
  columnTypes: Array<{ name: string; type: string }>;
  query: string;
}

export interface SqlEditorSuggestion {
  title: string;
  query: string;
  description: string;
}

export interface SqlEditorMetadataField {
  name: string;
  type: string;
  description?: string;
  dictionaryDescription?: string;
  columnType?: string;
  role?: string;
  label?: string;
}

export interface SqlEditorMetadataTable {
  id?: string;
  name: string;
  description?: string;
  fields?: SqlEditorMetadataField[];
  dictionary?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  defaultFilters?: unknown;
}

export interface SqlEditorMetadataSource {
  id: string;
  name: string;
  type: string;
  dictionary?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  tables?: SqlEditorMetadataTable[];
}

export interface SqlEditorParameter {
  id: string;
  name: string;
  dataType: 'boolean' | 'date' | 'datetime' | 'number' | 'string';
  required: boolean;
  defaultValue: string;
  description: string;
  dateRole: 'none' | 'start' | 'end' | 'as_of';
}

export interface SqlEditorQueryHistoryItem {
  dataSourceId?: string;
  dataSourceName: string;
  query: string;
  timestamp: number;
}

export type SqlEditorPivotAggregation = 'avg' | 'count' | 'count_distinct' | 'max' | 'min' | 'sum';

export interface SqlEditorPivotValueSpec {
  field: string;
  aggregation: SqlEditorPivotAggregation;
  alias?: string;
}

export interface SqlEditorPivotSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface SqlEditorPivotConfig {
  viewMode: 'pivot' | 'results';
  rows: string[];
  columns: string[];
  filters: string[];
  filterValues: Record<string, string>;
  values: SqlEditorPivotValueSpec[];
  sort: SqlEditorPivotSort | null;
}

export interface SqlEditorTab {
  id: string;
  name: string;
  dataSourceId: string;
  dataSourceName: string;
  query: string;
  parameters: SqlEditorParameter[];
  parameterValues: Record<string, string>;
  customSourceId?: string;
  pivotDimension: string;
  pivotMetric: string;
  pivotConfig: SqlEditorPivotConfig | null;
  currentPage: number;
  result: SqlEditorQueryResult | null;
  error: string;
}

export interface SqlEditorSavedDataModel {
  id: string;
  name: string;
  description?: string;
  baseDataSourceId: string;
  query: string;
  settings?: Record<string, unknown>;
  fields?: Array<{ name: string; type: string; description?: string; dictionaryDescription?: string }>;
  sampleRows?: Array<Record<string, unknown>>;
  sqlQuery: string;
}

export interface SaveCustomQueryPayload {
  name: string;
  description: string;
  baseDataSourceId: string;
  query: string;
  parameters: SqlEditorParameter[];
  fields?: Array<{ name: string; type: string; description: string }>;
  sampleRows?: Array<Record<string, unknown>>;
  settings: { isTemplate: boolean; isDataModel: boolean };
  config: Record<string, unknown>;
}

export interface SavedSqlModelTable {
  id: string;
  name: string;
  description?: string;
  dictionary?: Record<string, unknown>;
  fields?: Array<{ name: string; type: string; description?: string; dictionaryDescription?: string }>;
  sampleRows?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown>;
  sqlQuery?: string | null;
}

export interface SaveSqlModelTableResponse {
  dataSourceId: string;
  table: SavedSqlModelTable;
}

export interface SqlAssistantConversationSnapshot {
  conversation: {
    id: string;
    dataSourceId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    metadata: Record<string, unknown>;
  };
  messages: Array<{
    id: string;
    conversationId: string;
    role: 'assistant' | 'status' | 'user';
    content: string;
    createdAt: string;
  }>;
}
