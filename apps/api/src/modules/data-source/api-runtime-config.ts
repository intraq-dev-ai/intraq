import type { DataSourceRecord, TableDefinition } from './foundation-store.js';
import {
  DEFAULT_PAGE_SIZE,
  MAX_ROWS,
  type ApiRequestConfig,
  type ApiResponseColumnMapping,
  type ApiResponseMappingConfig,
  type ApiResponseShape,
  type ApiRuntimeResult,
  type TokenRequestConfig
} from './api-runtime-types.js';
import {
  boundedNumber,
  compactTemplateValues,
  credentialValue,
  hasCredentialValue,
  normalizeBodyFormat,
  readApiRequestTimeoutMs,
  readBooleanConfig,
  readObjectConfig,
  readRecord,
  readString,
  readText
} from './api-runtime-utils.js';

export function readApiRequestConfig(source: DataSourceRecord, table: TableDefinition): ApiRuntimeResult<ApiRequestConfig> {
  const tableApi = readRecord(table.settings?.api ?? table.settings?.request);
  const config = { ...source.config, ...tableApi };
  const timeoutMs = readApiRequestTimeoutMs(config);
  const baseUrl = readString(config.baseUrl) ?? readString(config.apiUrl) ?? readString(config.url);
  if (!baseUrl) return { ok: false, statusCode: 400, error: 'API data source baseUrl is required' };
  const endpoint = readString(config.endpoint) ?? readString(config.path) ?? readString(config.apiEndpoint) ?? '';
  const method = (readString(config.method) ?? 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH'].includes(method)) {
    return { ok: false, statusCode: 400, error: 'API data source method must be GET, POST, PUT, or PATCH' };
  }
  const tokenRequest = readTokenRequestConfig({
    baseUrl,
    config,
    sourceId: source.id,
    tableId: table.id,
    timeoutMs
  });
  if (!tokenRequest.ok) return tokenRequest;
  const responseMapping = readResponseMappingConfig(config.responseMapping ?? config.rowMapping ?? config.mapping ?? config.transform);
  if (!responseMapping.ok) return responseMapping;
  const responseShape = readApiResponseShape(config.responseShape ?? config.responseMode ?? config.resultShape ?? config.shape)
    ?? (responseMapping.data ? responseMapping.data.type : 'rows');
  const rowContextColumns = readColumnMappings(
    config.rowContextColumns
      ?? config.contextColumns
      ?? config.rootColumns
      ?? config.metadataColumns
      ?? config.rootMetadataColumns
  );
  return {
    ok: true,
    data: {
      allowBodyOnGet: readBooleanConfig(config.allowBodyOnGet ?? config.bodyOnGet ?? config.sendBodyWithGet) === true,
      ...(readString(config.authHeaderName ?? config.authHeader) ? { authHeaderName: readString(config.authHeaderName ?? config.authHeader) as string } : {}),
      ...(readString(config.authQueryParam ?? config.apiKeyParam) ? { authQueryParam: readString(config.authQueryParam ?? config.apiKeyParam) as string } : {}),
      authType: readString(config.authType) ?? 'none',
      ...(readString(config.authValue) ? { authValue: readString(config.authValue) as string } : {}),
      baseUrl,
      body: config.body ?? config.requestBody ?? config.bodyTemplate,
      ...(readString(config.dataPath ?? config.recordsPath ?? config.resultPath) ? { dataPath: readString(config.dataPath ?? config.recordsPath ?? config.resultPath) as string } : {}),
      endpoint,
      headers: readObjectConfig(config.headers),
      method,
      pagination: readRecord(config.pagination),
      queryParams: {
        ...readObjectConfig(config.queryParams),
        ...readObjectConfig(config.params)
      },
      ...(responseMapping.data ? { responseMapping: responseMapping.data } : {}),
      responseShape,
      ...(rowContextColumns.length > 0 ? { rowContextColumns } : {}),
      timeoutMs,
      ...(tokenRequest.data ? { tokenRequest: tokenRequest.data } : {})
    }
  };
}

export function readApiExportConfig(
  source: DataSourceRecord,
  table: TableDefinition,
  format?: string
): Record<string, unknown> | null {
  const request = readApiExportRequestConfig(source, table, format);
  if (!request?.direct) return null;
  return compactTemplateValues({
    ...request.config,
    responseMapping: undefined,
    dataPath: undefined
  });
}

export function readApiExportRowsConfig(
  source: DataSourceRecord,
  table: TableDefinition,
  format?: string
): Record<string, unknown> | null {
  const request = readApiExportRequestConfig(source, table, format);
  if (!request || request.direct) return null;
  return request.config;
}

function readApiExportRequestConfig(
  source: DataSourceRecord,
  table: TableDefinition,
  format?: string
): { config: Record<string, unknown>; direct: boolean } | null {
  const tableSettings = readRecord(table.settings);
  const sourceExport = readExportConfigRecord(source.config.export ?? source.config.exports, format);
  const tableExport = readExportConfigRecord(
    tableSettings.export
      ?? tableSettings.exports
      ?? tableSettings.apiExport
      ?? tableSettings.download
      ?? readRecord(tableSettings.api).export,
    format
  );
  const raw = {
    ...sourceExport,
    ...tableExport
  };
  if (Object.keys(raw).length === 0 || raw.enabled === false || raw.disabled === true) return null;
  const mode = readString(raw.mode ?? raw.strategy ?? raw.type)?.toLowerCase().replace(/[\s_-]+/g, '');
  const directModes = new Set(['direct', 'external', 'passthrough']);
  const direct = mode ? directModes.has(mode) : raw.direct === true || raw.passthrough === true;
  const endpoint = readString(raw.endpoint ?? raw.path ?? raw.url ?? raw.apiEndpoint);
  if (!endpoint) return null;
  const config = compactTemplateValues({
    ...readRecord(tableSettings.api),
    ...raw,
    endpoint,
    method: readString(raw.method) ?? readString(readRecord(tableSettings.api).method) ?? 'GET'
  });
  return { config, direct };
}

function readExportConfigRecord(value: unknown, format?: string): Record<string, unknown> {
  const raw = readRecord(value);
  const normalizedFormat = readString(format)?.toLowerCase();
  if (normalizedFormat && isRecord(raw[normalizedFormat])) {
    return {
      ...raw,
      ...readRecord(raw[normalizedFormat])
    };
  }
  if (normalizedFormat === 'excel' && isRecord(raw.xlsx)) {
    return {
      ...raw,
      ...readRecord(raw.xlsx)
    };
  }
  return raw;
}

function readTokenRequestConfig(input: {
  baseUrl: string;
  config: Record<string, unknown>;
  sourceId: string;
  tableId: string;
  timeoutMs: number;
}): ApiRuntimeResult<TokenRequestConfig | undefined> {
  const authType = (readString(input.config.authType) ?? '').toLowerCase();
  const raw = readRecord(input.config.tokenRequest ?? input.config.authTokenRequest ?? input.config.token);
  const usesTokenAuth = ['token_request', 'token', 'oauth2_client_credentials', 'client_credentials'].includes(authType);
  if (raw.enabled === false || raw.disabled === true) return { ok: true, data: undefined };
  if (!usesTokenAuth && Object.keys(raw).length === 0) return { ok: true, data: undefined };

  const endpoint = readString(
    raw.endpoint
      ?? raw.path
      ?? raw.url
      ?? raw.tokenUrl
      ?? raw.tokenEndpoint
      ?? input.config.tokenEndpoint
      ?? input.config.tokenUrl
      ?? input.config.tokenPath
  );
  if (!endpoint) return { ok: false, statusCode: 400, error: 'API token request endpoint is required' };
  const method = (readString(raw.method ?? raw.tokenMethod ?? input.config.tokenMethod) ?? 'POST').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH'].includes(method)) {
    return { ok: false, statusCode: 400, error: 'API token request method must be GET, POST, PUT, or PATCH' };
  }
  const apply = readRecord(raw.apply ?? input.config.tokenApply);
  const baseUrl = readString(raw.baseUrl ?? raw.authBaseUrl ?? input.config.tokenBaseUrl) ?? input.baseUrl;
  const configuredBody = raw.body ?? raw.requestBody ?? raw.bodyTemplate ?? input.config.tokenBody;
  const body = configuredBody ?? defaultOAuthClientCredentialsBody(input.config);
  const defaultBodyFormat = configuredBody === undefined && body !== undefined ? 'form' : undefined;
  return {
    ok: true,
    data: {
      allowBodyOnGet: readBooleanConfig(raw.allowBodyOnGet ?? raw.bodyOnGet ?? raw.sendBodyWithGet ?? input.config.tokenAllowBodyOnGet) === true,
      applyAs: readString(apply.as ?? apply.type ?? raw.applyAs ?? input.config.tokenApplyAs) ?? 'bearer',
      baseUrl,
      ...(body !== undefined ? { body } : {}),
      bodyFormat: normalizeBodyFormat(readString(raw.bodyFormat ?? raw.contentType ?? input.config.tokenBodyFormat) ?? defaultBodyFormat),
      cacheKey: `${input.sourceId}:${input.tableId}`,
      cacheSkewSeconds: boundedNumber(raw.cacheSkewSeconds ?? input.config.tokenCacheSkewSeconds, 30, 600),
      cacheTtlSeconds: boundedNumber(raw.cacheTtlSeconds ?? input.config.tokenCacheTtlSeconds, 300, 86_400),
      endpoint,
      ...(readString(raw.expiresAtPath ?? input.config.tokenExpiresAtPath) ? { expiresAtPath: readString(raw.expiresAtPath ?? input.config.tokenExpiresAtPath) as string } : {}),
      ...(readString(raw.expiresInPath ?? input.config.tokenExpiresInPath) ? { expiresInPath: readString(raw.expiresInPath ?? input.config.tokenExpiresInPath) as string } : {}),
      headerName: readString(apply.headerName ?? raw.headerName ?? input.config.tokenHeaderName) ?? 'Authorization',
      headers: {
        ...readObjectConfig(input.config.tokenHeaders),
        ...readObjectConfig(raw.headers)
      },
      method,
      queryParam: readString(apply.queryParam ?? raw.queryParam ?? input.config.tokenQueryParam) ?? 'access_token',
      queryParams: {
        ...readObjectConfig(input.config.tokenQueryParams),
        ...readObjectConfig(raw.queryParams),
        ...readObjectConfig(raw.params)
      },
      scheme: readString(apply.scheme ?? raw.scheme ?? input.config.tokenScheme) ?? 'Bearer',
      timeoutMs: boundedNumber(raw.timeoutMs ?? input.config.tokenTimeoutMs ?? input.timeoutMs, input.timeoutMs, 120_000),
      ...(readString(raw.tokenPath ?? raw.accessTokenPath ?? input.config.tokenResponsePath) ? { tokenPath: readString(raw.tokenPath ?? raw.accessTokenPath ?? input.config.tokenResponsePath) as string } : {}),
      ...(readString(raw.tokenTypePath ?? input.config.tokenTypePath) ? { tokenTypePath: readString(raw.tokenTypePath ?? input.config.tokenTypePath) as string } : {}),
      valuePrefix: readText(apply.valuePrefix ?? raw.valuePrefix ?? input.config.tokenValuePrefix) ?? ''
    }
  };
}

function readResponseMappingConfig(value: unknown): ApiRuntimeResult<ApiResponseMappingConfig | undefined> {
  const raw = readRecord(value);
  if (Object.keys(raw).length === 0 || raw.enabled === false || raw.disabled === true) return { ok: true, data: undefined };
  const type = (readString(raw.type ?? raw.kind ?? raw.mode) ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  const valueColumns = readColumnMappings(raw.valueColumns ?? raw.measureColumns ?? raw.measures ?? raw.values ?? raw.columns);
  const hasMatrixShape = Boolean(readString(raw.labelPath ?? raw.labelsPath ?? raw.xLabelsPath ?? raw.xPath ?? raw.categoryPath ?? raw.categoriesPath))
    || Boolean(readString(raw.seriesPath ?? raw.namesPath ?? raw.namePath))
    || valueColumns.length > 0;
  const normalizedType = type || (hasMatrixShape ? 'matrix' : '');
  if (normalizedType === 'highchart' || normalizedType === 'highcharts' || normalizedType === 'highchartsrows') {
    return responseMappingResult(raw, valueColumns, 'highcharts');
  }
  if (normalizedType === 'kendo' || normalizedType === 'kendodatasource' || normalizedType === 'datasourceresult') {
    return responseMappingResult(raw, valueColumns, 'kendo');
  }
  if (normalizedType !== 'matrix' && normalizedType !== 'matrixrows' && normalizedType !== 'matrixrow') {
    return { ok: false, statusCode: 400, error: 'API response mapping type must be matrix, highcharts, or kendo' };
  }
  if (valueColumns.length === 0) {
    return { ok: false, statusCode: 400, error: 'API matrix response mapping requires value columns' };
  }
  return responseMappingResult(raw, valueColumns, 'matrix');
}

function responseMappingResult(
  raw: Record<string, unknown>,
  valueColumns: ApiResponseColumnMapping[],
  type: ApiResponseShape
): ApiRuntimeResult<ApiResponseMappingConfig> {
  return {
    ok: true,
    data: {
      includeEmptyRows: type === 'kendo' || raw.includeEmptyRows === true,
      labelColumn: readString(raw.labelColumn ?? raw.xColumn ?? raw.categoryColumn) ?? 'label',
      ...(readString(raw.labelDateMode ?? raw.dateLabelMode ?? raw.labelNormalization) ? { labelDateMode: readString(raw.labelDateMode ?? raw.dateLabelMode ?? raw.labelNormalization) as string } : {}),
      ...(readString(raw.labelPath ?? raw.labelsPath ?? raw.xLabelsPath ?? raw.xPath ?? raw.categoryPath ?? raw.categoriesPath)
        ? { labelPath: readString(raw.labelPath ?? raw.labelsPath ?? raw.xLabelsPath ?? raw.xPath ?? raw.categoryPath ?? raw.categoriesPath) as string }
        : {}),
      metadataColumns: readColumnMappings(raw.metadataColumns ?? raw.extraColumns ?? raw.contextColumns),
      ...(readString(raw.rootPath ?? raw.sourcePath ?? raw.dataRootPath) ? { rootPath: readString(raw.rootPath ?? raw.sourcePath ?? raw.dataRootPath) as string } : {}),
      seriesColumn: readString(raw.seriesColumn ?? raw.nameColumn ?? raw.groupColumn) ?? 'series',
      ...(readString(raw.seriesPath ?? raw.namesPath ?? raw.namePath) ? { seriesPath: readString(raw.seriesPath ?? raw.namesPath ?? raw.namePath) as string } : {}),
      type,
      ...(type === 'highcharts' ? { valueColumn: readString(raw.valueColumn ?? raw.yColumn ?? raw.measureColumn) ?? valueColumns[0]?.name ?? 'value' } : {}),
      valueColumns,
      ...(readString(raw.valuePath ?? raw.dataPath ?? raw.yPath) ? { valuePath: readString(raw.valuePath ?? raw.dataPath ?? raw.yPath) as string } : {})
    }
  };
}

function readColumnMappings(value: unknown): ApiResponseColumnMapping[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      if (typeof item === 'string' && item.trim()) return [{ mode: 'constant', name: item.trim(), path: item.trim() }];
      if (!isRecord(item)) return [];
      const path = readString(item.path ?? item.sourcePath ?? item.field ?? item.key);
      const name = readString(item.name ?? item.column ?? item.label ?? item.alias) ?? path;
      const valuePath = readString(item.valuePath ?? item.itemPath ?? item.rowPath);
      return path && name ? [{
        mode: readColumnMappingMode(item.mode ?? item.sourceMode ?? item.mappingMode),
        name,
        path,
        ...(valuePath ? { valuePath } : {})
      }] : [];
    });
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([name, item]) => {
    if (typeof item === 'string' && item.trim()) return [{ mode: 'constant', name, path: item.trim() }];
    if (!isRecord(item)) return [];
    const path = readString(item.path ?? item.sourcePath ?? item.field ?? item.key);
    const columnName = readString(item.name ?? item.column ?? item.label ?? item.alias) ?? name;
    const valuePath = readString(item.valuePath ?? item.itemPath ?? item.rowPath);
    return path && columnName ? [{
      mode: readColumnMappingMode(item.mode ?? item.sourceMode ?? item.mappingMode),
      name: columnName,
      path,
      ...(valuePath ? { valuePath } : {})
    }] : [];
  });
}

function readColumnMappingMode(value: unknown): ApiResponseColumnMapping['mode'] {
  const raw = readString(value)?.toLowerCase().replace(/[\s_-]+/g, '');
  return raw === 'byindex' || raw === 'index' || raw === 'indexed' || raw === 'perrow' || raw === 'rowindex'
    ? 'by_index'
    : 'constant';
}

function readApiResponseShape(value: unknown): ApiResponseShape | undefined {
  const raw = readString(value)?.toLowerCase().replace(/[\s_-]+/g, '');
  if (!raw) return undefined;
  if (['row', 'rows', 'json', 'raw', 'default'].includes(raw)) return 'rows';
  if (['kendo', 'kendodatasource', 'datasourceresult'].includes(raw)) return 'kendo';
  if (['highchart', 'highcharts', 'highchartsrows', 'chartseries'].includes(raw)) return 'highcharts';
  if (['matrix', 'matrixrows', 'matrixrow'].includes(raw)) return 'matrix';
  return undefined;
}

function defaultOAuthClientCredentialsBody(config: Record<string, unknown>): unknown {
  const authType = (readString(config.authType) ?? '').toLowerCase();
  const authVariables = readAuthVariables(config);
  const hasConfiguredClientCredentials = hasCredentialValue(config.clientId)
    || hasCredentialValue(config.clientSecret)
    || hasCredentialValue(authVariables.clientId)
    || hasCredentialValue(authVariables.clientSecret);
  if (authType !== 'oauth2_client_credentials' && authType !== 'client_credentials' && !(authType === 'token_request' && hasConfiguredClientCredentials)) return undefined;
  const defaults = readRecord(config.defaults);
  return {
    grant_type: 'client_credentials',
    client_id: credentialValue(config.clientId ?? authVariables.clientId ?? defaults.clientId, '{{clientId}}'),
    client_secret: credentialValue(config.clientSecret ?? authVariables.clientSecret ?? defaults.clientSecret, '{{clientSecret}}'),
    ...(readString(config.scope) ? { scope: readString(config.scope) } : {}),
    ...(readString(config.audience) ? { audience: readString(config.audience) } : {})
  };
}

function readAuthVariables(config: Record<string, unknown>): Record<string, unknown> {
  return {
    ...readRecord(config.credentials),
    ...readRecord(config.secrets),
    ...readRecord(config.authVariables)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function defaultPaginationPageSize(): number {
  return DEFAULT_PAGE_SIZE;
}

export function maxApiRows(): number {
  return MAX_ROWS;
}
