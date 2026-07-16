export type AdminDataSourceRouteVariant = 'management' | 'viewer';

export interface AdminDataSourceField {
  businessName?: string;
  columnType?: string;
  description: string;
  dictionaryDescription: string;
  formatHint?: string;
  isDimension?: boolean;
  isKey?: boolean;
  isMetric?: boolean;
  name: string;
  type: string;
}

export interface AdminDerivedColumn {
  columnType: string;
  description: string;
  formula: string;
  name: string;
  outputFormat: string;
  type: string;
}

export interface AdminValueConcept {
  appliesToMetrics: string[];
  conceptKey: string;
  label: string;
  matchType: 'equals' | 'in';
  matchValues: string[];
  synonyms: string[];
  targetField: string;
}

export interface AdminDataSourceFilterCondition {
  column: string;
  id: string;
  logicOperator: 'AND' | 'OR';
  operator: string;
  value: string;
}

export interface AdminDataSourceTable {
  businessName?: string;
  defaultFilters: AdminDataSourceFilterCondition[];
  description: string;
  dictionaryDescription?: string;
  dashboardCount?: number;
  fields: AdminDataSourceField[];
  id: string;
  isDataModel: boolean;
  isSqlModel?: boolean;
  isSelected: boolean;
  settings: Record<string, unknown>;
  name: string;
  sqlQuery?: string;
  tableType?: string;
}

export interface AdminDataSource {
  baseDataSourceId?: string;
  config: Record<string, unknown>;
  dashboardDefault: boolean;
  dashboardVisible: boolean;
  defaultFilters: AdminDataSourceFilterCondition[];
  description: string;
  dictionary: Record<string, unknown>;
  id: string;
  isGloballyVisible: boolean;
  isSample: boolean;
  name: string;
  query?: string;
  settings: Record<string, unknown>;
  sourceType: string;
  status: string;
  tableCount: number;
  tables: AdminDataSourceTable[];
  type: string;
}

export interface AdminTableDictionaryDetails {
  businessName: string;
  businessPurpose: string;
  businessRules: string;
  commonFilters: string;
  dataLineage: string;
  derivedColumns?: AdminDerivedColumn[];
  description: string;
  fields: AdminDataSourceField[];
  keyMetrics: string;
  performanceNotes: string;
  qualityIssues: string;
  recordCountEstimate?: number;
  relatedTables: string;
  sampleQuestions: string[];
  tableId: string;
  tableName: string;
  updateFrequency: string;
  valueConcepts?: AdminValueConcept[];
}

export interface AdminDataSourceFormState {
  apiUrl: string;
  apiAuthType: string;
  apiAuthValue: string;
  apiAuthVariables: string;
  apiBody: string;
  apiAllowBodyOnGet: boolean;
  apiWorkflowAccess: 'private' | 'public';
  apiClientId: string;
  apiClientSecret: string;
  apiCredentialMode: 'static' | 'lookup';
  apiCredentialLookup: string;
  apiCredentialLookupDataSourceId: string;
  apiCredentialLookupQuery: string;
  apiCredentialLookupTimeoutMs: string;
  apiDataPath: string;
  apiEndpoint: string;
  apiHeaders: string;
  apiMethod: string;
  apiPagination: string;
  apiQueryParams: string;
  apiResponseMapping: string;
  apiResponseShape: string;
  apiRowContextColumns: string;
  apiTokenApplyAs: string;
  apiTokenAllowBodyOnGet: boolean;
  apiTokenBody: string;
  apiTokenBodyFormat: string;
  apiTokenCacheTtlSeconds: string;
  apiTokenEndpoint: string;
  apiTokenExpiresInPath: string;
  apiTokenHeaderName: string;
  apiTokenHeaders: string;
  apiTokenMethod: string;
  apiTokenPath: string;
  apiTokenQueryParam: string;
  apiTokenQueryParams: string;
  apiTokenScheme: string;
  baseUrl: string;
  bucket: string;
  currencySymbol: string;
  dashboardDefault: boolean;
  dashboardVisible: boolean;
  database: string;
  databaseSsl: boolean;
  databaseSslRejectUnauthorized: boolean;
  databricksAccessToken: string;
  databricksCatalog: string;
  databricksHttpPath: string;
  databricksSchema: string;
  databricksServerHostname: string;
  description: string;
  fileFormat: string;
  filePath: string;
  host: string;
  isGloballyVisible: boolean;
  multiConfigDatabase: string;
  multiConfigHost: string;
  multiConfigPassword: string;
  multiConfigPort: string;
  multiConfigQuery: string;
  multiConfigType: string;
  multiConfigUsername: string;
  multiTargetCacheTimeout: string;
  multiTargetDefaultPort: string;
  multiTargetType: string;
  password: string;
  name: string;
  port: string;
  region: string;
  requestTimeoutMs: string;
  secretAccessKey: string;
  sourceType: string;
  type: string;
  useParentConnection: boolean;
  username: string;
}

export interface SaveAdminDataSourcePayload {
  config: Record<string, unknown>;
  dictionary: Record<string, unknown>;
  isGloballyVisible: boolean;
  name: string;
  settings: Record<string, unknown>;
  sourceType: string;
  type: string;
}

export interface AdminDataSourceConnectionResult {
  message: string;
  success: boolean;
  tables: string[];
}

export interface AdminDataSourcePreviewResult {
  rowCount: number;
  sampleData: Array<Record<string, unknown>>;
  schema: Array<{ name: string; type: string }>;
}

export interface AdminDataSourceCloudSyncResult {
  message: string;
  syncedAt: string;
}

export interface AdminApiWorkflowRunLog {
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

export interface AdminDataSourceSchemaRefreshResult {
  dataSourceId: string;
  discoveredTableCount: number;
  registeredTableCount: number;
  savedDataModelCount: number;
}

export interface AdminDataSourceMetric {
  detail: string;
  label: string;
  value: string;
}
