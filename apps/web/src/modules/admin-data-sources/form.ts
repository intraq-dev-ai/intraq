import type {
  AdminDataSource,
  AdminDataSourceFormState,
  SaveAdminDataSourcePayload
} from './types';

export const DEFAULT_ADMIN_DATA_SOURCE_FORM: AdminDataSourceFormState = {
  apiUrl: '',
  apiAuthType: 'none',
  apiAuthValue: '',
  apiAuthVariables: '',
  apiBody: '',
  apiAllowBodyOnGet: false,
  apiWorkflowAccess: 'private',
  apiClientId: '',
  apiClientSecret: '',
  apiCredentialMode: 'static',
  apiCredentialLookup: '',
  apiCredentialLookupDataSourceId: '',
  apiCredentialLookupQuery: '',
  apiCredentialLookupTimeoutMs: '',
  apiDataPath: '',
  apiEndpoint: '',
  apiHeaders: '',
  apiMethod: 'GET',
  apiPagination: '',
  apiQueryParams: '',
  apiResponseMapping: '',
  apiResponseShape: 'rows',
  apiRowContextColumns: '',
  apiTokenApplyAs: 'bearer',
  apiTokenAllowBodyOnGet: false,
  apiTokenBody: '',
  apiTokenBodyFormat: 'form',
  apiTokenCacheTtlSeconds: '300',
  apiTokenEndpoint: '',
  apiTokenExpiresInPath: '',
  apiTokenHeaderName: 'Authorization',
  apiTokenHeaders: '',
  apiTokenMethod: 'POST',
  apiTokenPath: '',
  apiTokenQueryParam: 'access_token',
  apiTokenQueryParams: '',
  apiTokenScheme: 'Bearer',
  baseUrl: '',
  bucket: '',
  currencySymbol: '$',
  dashboardDefault: false,
  dashboardVisible: true,
  database: '',
  databaseSsl: false,
  databaseSslRejectUnauthorized: true,
  databricksAccessToken: '',
  databricksCatalog: '',
  databricksHttpPath: '',
  databricksSchema: '',
  databricksServerHostname: '',
  description: '',
  fileFormat: 'csv',
  filePath: '',
  host: '',
  isGloballyVisible: false,
  multiConfigDatabase: '',
  multiConfigHost: '',
  multiConfigPassword: '',
  multiConfigPort: '',
  multiConfigQuery: '',
  multiConfigType: 'postgres',
  multiConfigUsername: '',
  multiTargetCacheTimeout: '300',
  multiTargetDefaultPort: '5432',
  multiTargetType: 'postgres',
  name: '',
  password: '',
  port: '',
  region: '',
  requestTimeoutMs: '15000',
  secretAccessKey: '',
  sourceType: 'source',
  type: 'sample',
  useParentConnection: false,
  username: ''
};

export function formStateFromDataSource(source?: AdminDataSource | null): AdminDataSourceFormState {
  if (!source) return { ...DEFAULT_ADMIN_DATA_SOURCE_FORM };
  const tokenRequest = readRecord(source.config.tokenRequest);
  const tokenApply = readRecord(tokenRequest.apply);
  const credentialLookup = readRecord(source.config.credentialLookup ?? source.config.templateVariableLookup ?? source.config.authVariableLookup);
  const apiWorkflow = readRecord(source.settings.apiWorkflow ?? source.settings.apiAccess ?? source.settings.externalApi);
  return {
    apiUrl: readString(source.config.apiUrl),
    apiAuthType: readString(source.config.authType) || 'none',
    apiAuthValue: readString(source.config.authValue),
    apiAuthVariables: jsonText(source.config.authVariables),
    apiBody: jsonText(source.config.body),
    apiAllowBodyOnGet: readBoolean(source.config.allowBodyOnGet ?? source.config.bodyOnGet ?? source.config.sendBodyWithGet) === true,
    apiWorkflowAccess: readApiWorkflowAccess(apiWorkflow.access ?? apiWorkflow.visibility ?? apiWorkflow.exposure ?? source.settings.apiVisibility),
    apiClientId: readString(source.config.clientId) || readString(readRecord(source.config.defaults).clientId),
    apiClientSecret: '',
    apiCredentialMode: Object.keys(credentialLookup).length > 0 ? 'lookup' : 'static',
    apiCredentialLookup: jsonText(credentialLookup),
    apiCredentialLookupDataSourceId: readString(credentialLookup.dataSourceId ?? credentialLookup.sourceId ?? credentialLookup.lookupDataSourceId),
    apiCredentialLookupQuery: readString(credentialLookup.query ?? credentialLookup.sqlQuery ?? credentialLookup.sql),
    apiCredentialLookupTimeoutMs: readString(credentialLookup.timeoutMs),
    apiDataPath: readString(source.config.dataPath),
    apiEndpoint: readString(source.config.endpoint),
    apiHeaders: jsonText(source.config.headers),
    apiMethod: readString(source.config.method) || 'GET',
    apiPagination: jsonText(source.config.pagination),
    apiQueryParams: jsonText(source.config.queryParams),
    apiResponseMapping: jsonText(source.config.responseMapping),
    apiResponseShape: readString(source.config.responseShape ?? source.config.responseMode ?? source.config.resultShape ?? source.config.shape) || 'rows',
    apiRowContextColumns: jsonText(source.config.rowContextColumns),
    apiTokenApplyAs: readString(tokenApply.as) || readString(tokenApply.type) || readString(tokenRequest.applyAs) || 'bearer',
    apiTokenAllowBodyOnGet: readBoolean(tokenRequest.allowBodyOnGet ?? tokenRequest.bodyOnGet ?? tokenRequest.sendBodyWithGet ?? source.config.tokenAllowBodyOnGet) === true,
    apiTokenBody: jsonText(tokenRequest.body),
    apiTokenBodyFormat: readString(tokenRequest.bodyFormat) || readString(tokenRequest.contentType) || 'form',
    apiTokenCacheTtlSeconds: readString(tokenRequest.cacheTtlSeconds) || '300',
    apiTokenEndpoint: readString(tokenRequest.endpoint) || readString(tokenRequest.path) || readString(tokenRequest.url),
    apiTokenExpiresInPath: readString(tokenRequest.expiresInPath),
    apiTokenHeaderName: readString(tokenApply.headerName) || readString(tokenRequest.headerName) || 'Authorization',
    apiTokenHeaders: jsonText(tokenRequest.headers),
    apiTokenMethod: readString(tokenRequest.method) || 'POST',
    apiTokenPath: readString(tokenRequest.tokenPath) || readString(tokenRequest.accessTokenPath),
    apiTokenQueryParam: readString(tokenApply.queryParam) || readString(tokenRequest.queryParam) || 'access_token',
    apiTokenQueryParams: jsonText(tokenRequest.queryParams),
    apiTokenScheme: readString(tokenApply.scheme) || readString(tokenRequest.scheme) || 'Bearer',
    baseUrl: readString(source.config.baseUrl),
    bucket: readString(source.config.bucket),
    currencySymbol: readString(source.settings.currencySymbol) || '$',
    dashboardDefault: source.dashboardDefault,
    dashboardVisible: source.dashboardVisible,
    database: readString(source.config.database),
    databaseSsl: readBoolean(source.config.ssl) === true,
    databaseSslRejectUnauthorized: readBoolean(source.config.sslRejectUnauthorized) !== false,
    databricksAccessToken: '',
    databricksCatalog: readString(source.config.catalog),
    databricksHttpPath: readString(source.config.httpPath ?? source.config.warehousePath ?? source.config.warehouseId),
    databricksSchema: readString(source.config.schema ?? source.config.database),
    databricksServerHostname: readString(source.config.serverHostname ?? source.config.host),
    description: source.description,
    fileFormat: readString(source.config.format) || 'csv',
    filePath: readString(source.config.path),
    host: readString(source.config.host),
    isGloballyVisible: source.isGloballyVisible,
    multiConfigDatabase: readString(readRecord(readRecord(source.config.configDataSource).connectionConfig).database),
    multiConfigHost: readString(readRecord(readRecord(source.config.configDataSource).connectionConfig).host),
    multiConfigPassword: '',
    multiConfigPort: readString(readRecord(readRecord(source.config.configDataSource).connectionConfig).port),
    multiConfigQuery: readString(readRecord(source.config.configQuery).query),
    multiConfigType: readString(readRecord(source.config.configDataSource).type) || 'postgres',
    multiConfigUsername: readString(readRecord(readRecord(source.config.configDataSource).connectionConfig).username),
    multiTargetCacheTimeout: readString(readRecord(source.config.targetDatabase).cacheTimeout) || '300',
    multiTargetDefaultPort: readString(readRecord(source.config.targetDatabase).defaultPort)
      || defaultDatabasePortForType(readString(readRecord(source.config.targetDatabase).type) || 'postgres'),
    multiTargetType: readString(readRecord(source.config.targetDatabase).type) || 'postgres',
    name: source.name,
    password: '',
    port: readString(source.config.port),
    region: readString(source.config.region),
    requestTimeoutMs: readString(source.config.timeoutMs ?? source.config.queryTimeoutMs ?? source.config.sqlQueryTimeoutMs ?? source.config.requestTimeoutMs) || '15000',
    secretAccessKey: '',
    sourceType: source.sourceType || 'source',
    type: source.type,
    useParentConnection: readRecord(source.config).useParentConnection === true,
    username: readString(source.config.username)
  };
}

export function buildAdminDataSourceSavePayload(form: AdminDataSourceFormState): SaveAdminDataSourcePayload {
  const config = buildConfig(form);
  return {
    name: form.name.trim(),
    type: form.type,
    sourceType: form.sourceType || (form.type === 'custom_query' ? 'custom_query' : 'source'),
    config,
    dictionary: compactRecord({ description: form.description }),
    settings: {
      dashboard: {
        visible: form.dashboardVisible,
        isDefault: form.dashboardVisible && form.dashboardDefault
      },
      ...(form.type === 'api'
        ? {
          apiWorkflow: {
            access: form.apiWorkflowAccess,
            visibility: form.apiWorkflowAccess
          }
        }
        : {}),
      currencySymbol: form.currencySymbol || undefined
    },
    isGloballyVisible: form.isGloballyVisible
  };
}

export function validateAdminDataSourceForm(form: AdminDataSourceFormState): string[] {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push('Connection Name is required.');
  if (form.type === 'api') {
    const baseUrl = (form.baseUrl || form.apiUrl).trim();
    if (!baseUrl) errors.push('Base URL is required for API workflows.');
    else {
      try {
        const url = new URL(baseUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          errors.push('Base URL must start with http:// or https://.');
        }
      } catch {
        errors.push('Base URL must be a valid URL.');
      }
    }
    if (form.apiAuthType === 'token_request' && !form.apiTokenEndpoint.trim()) {
      errors.push('Token Endpoint is required when Authentication is Token Request.');
    }
    if (form.apiCredentialMode === 'lookup') {
      if (!form.apiCredentialLookupDataSourceId.trim() && !form.apiCredentialLookup.trim()) {
        errors.push('Credential lookup requires a Lookup Data Source ID or Advanced Lookup JSON.');
      }
      if (!form.apiCredentialLookupQuery.trim() && !form.apiCredentialLookup.trim()) {
        errors.push('Credential lookup requires Lookup SQL or Advanced Lookup JSON.');
      }
    }
    if (!isPositiveIntegerText(form.requestTimeoutMs)) errors.push('Request Timeout must be a positive number of milliseconds.');
    for (const field of apiJsonFields(form)) {
      if (!field.value.trim()) continue;
      try {
        JSON.parse(field.value);
      } catch {
        errors.push(`${field.label} must be valid JSON.`);
      }
    }
  }
  return errors;
}

export function buildAdminConnectionPayload(source: AdminDataSource): Record<string, unknown> {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    config: source.config
  };
}

function compactRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value !== 'string' || value.trim().length > 0)
  );
}

function buildConfig(form: AdminDataSourceFormState): Record<string, unknown> {
  if (form.type === 's3') {
    return compactRecord({
      accessKeyId: form.apiAuthValue,
      bucket: form.bucket,
      region: form.region,
      secretAccessKey: form.secretAccessKey
    });
  }
  if (form.type === 'api') {
    const tokenRequest = buildTokenRequestConfig(form);
    return compactRecord({
      authType: form.apiAuthType,
      authVariables: parseJsonConfig(form.apiAuthVariables),
      authValue: form.apiAuthType === 'token_request' ? '' : form.apiAuthValue,
      allowBodyOnGet: form.apiAllowBodyOnGet ? true : undefined,
      baseUrl: form.baseUrl || form.apiUrl,
      body: parseJsonConfig(form.apiBody),
      clientId: form.apiClientId,
      clientSecret: form.apiClientSecret,
      credentialLookup: credentialLookupConfig(form),
      dataPath: form.apiDataPath,
      endpoint: form.apiEndpoint,
      headers: parseJsonConfig(form.apiHeaders),
      method: form.apiMethod || 'GET',
      pagination: parseJsonConfig(form.apiPagination),
      queryParams: parseJsonConfig(form.apiQueryParams),
      responseMapping: parseJsonConfig(form.apiResponseMapping),
      responseShape: form.apiResponseShape === 'rows' ? '' : form.apiResponseShape,
      rowContextColumns: parseJsonConfig(form.apiRowContextColumns),
      timeoutMs: positiveIntegerString(form.requestTimeoutMs),
      ...(tokenRequest ? { tokenRequest } : {})
    });
  }
  if (form.type === 'file' || form.type === 'flatfile') {
    return compactRecord({
      format: form.fileFormat,
      path: form.filePath
    });
  }
  if (form.type === 'databricks') {
    return compactRecord({
      accessToken: form.databricksAccessToken,
      catalog: form.databricksCatalog,
      httpPath: form.databricksHttpPath,
      queryTimeoutMs: positiveIntegerString(form.requestTimeoutMs),
      schema: form.databricksSchema,
      serverHostname: form.databricksServerHostname,
      timeoutMs: positiveIntegerString(form.requestTimeoutMs)
    });
  }
  return compactRecord({
    apiUrl: form.apiUrl,
    database: form.database,
    host: form.host,
    password: form.password,
    port: form.port,
    queryTimeoutMs: positiveIntegerString(form.requestTimeoutMs),
    ssl: form.databaseSsl ? true : undefined,
    sslRejectUnauthorized: form.databaseSsl ? form.databaseSslRejectUnauthorized : undefined,
    timeoutMs: positiveIntegerString(form.requestTimeoutMs),
    username: form.username
  });
}

function credentialLookupConfig(form: AdminDataSourceFormState): unknown {
  if (form.apiCredentialMode !== 'lookup') return '';
  const structured = compactRecord({
    dataSourceId: form.apiCredentialLookupDataSourceId,
    query: form.apiCredentialLookupQuery,
    timeoutMs: positiveIntegerString(form.apiCredentialLookupTimeoutMs)
  });
  if (Object.keys(structured).length > 0) return structured;
  return parseJsonConfig(form.apiCredentialLookup);
}

function buildTokenRequestConfig(form: AdminDataSourceFormState): Record<string, unknown> | null {
  if (form.apiAuthType !== 'token_request' && !form.apiTokenEndpoint.trim()) return null;
  return compactRecord({
    apply: compactRecord({
      as: form.apiTokenApplyAs,
      headerName: form.apiTokenHeaderName,
      queryParam: form.apiTokenQueryParam,
      scheme: form.apiTokenScheme
    }),
    body: parseJsonConfig(form.apiTokenBody),
    allowBodyOnGet: form.apiTokenAllowBodyOnGet ? true : undefined,
    bodyFormat: form.apiTokenBodyFormat,
    cacheTtlSeconds: form.apiTokenCacheTtlSeconds,
    endpoint: form.apiTokenEndpoint,
    expiresInPath: form.apiTokenExpiresInPath,
    headers: parseJsonConfig(form.apiTokenHeaders),
    method: form.apiTokenMethod || 'POST',
    queryParams: parseJsonConfig(form.apiTokenQueryParams),
    tokenPath: form.apiTokenPath
  });
}

export function defaultDatabasePortForType(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'sqlserver' || normalized === 'mssql' || normalized === 'sql_server') return '1433';
  if (normalized === 'mysql' || normalized === 'mariadb') return '3306';
  if (normalized === 'databricks' || normalized === 'spark') return '443';
  return '5432';
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value : '';
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function readApiWorkflowAccess(value: unknown): 'private' | 'public' {
  return typeof value === 'string' && value.trim().toLowerCase() === 'public' ? 'public' : 'private';
}

function jsonText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function parseJsonConfig(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function apiJsonFields(form: AdminDataSourceFormState): Array<{ label: string; value: string }> {
  return [
    { label: 'Auth Variables JSON', value: form.apiAuthVariables },
    { label: 'Advanced Lookup JSON', value: form.apiCredentialLookup },
    { label: 'Query Params JSON', value: form.apiQueryParams },
    { label: 'Body JSON', value: form.apiBody },
    { label: 'Headers JSON', value: form.apiHeaders },
    { label: 'Pagination JSON', value: form.apiPagination },
    { label: 'Response Mapping JSON', value: form.apiResponseMapping },
    { label: 'Additional Row Fields JSON', value: form.apiRowContextColumns },
    { label: 'Custom Token Body', value: form.apiTokenBody },
    { label: 'Token Headers JSON', value: form.apiTokenHeaders },
    { label: 'Token Query Params JSON', value: form.apiTokenQueryParams }
  ];
}

function isPositiveIntegerText(value: string): boolean {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function positiveIntegerString(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
