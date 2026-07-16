import {
  normalizeBulkDictionaryUploadResult,
  type BulkDictionaryPayload,
  type BulkDictionaryUploadResult
} from './bulk-dictionary';
import {
  normalizeAdminDataSource,
  normalizeAdminDataSources,
  normalizeAdminDataSourceTables,
  normalizeConnectionResult,
  normalizeTableDictionary
} from './normalizers';
import type {
  AdminApiWorkflowRunLog,
  AdminDataSource,
  AdminDataSourceCloudSyncResult,
  AdminDataSourceConnectionResult,
  AdminDataSourceFilterCondition,
  AdminDataSourcePreviewResult,
  AdminDataSourceSchemaRefreshResult,
  AdminDataSourceTable,
  AdminTableDictionaryDetails,
  SaveAdminDataSourcePayload
} from './types';

const DATA_SOURCES_PATH = '/api/data-sources';

export async function fetchAdminDataSources(): Promise<AdminDataSource[]> {
  return normalizeAdminDataSources(await requestDataSourceApi(DATA_SOURCES_PATH));
}

export async function createAdminDataSource(payload: SaveAdminDataSourcePayload): Promise<AdminDataSource> {
  const source = normalizeAdminDataSource(await requestDataSourceApi(DATA_SOURCES_PATH, {
    method: 'POST',
    body: payload
  }));
  if (!source) throw new Error('Create data source response was missing source details.');
  return source;
}

export async function updateAdminDataSource(
  dataSourceId: string,
  payload: SaveAdminDataSourcePayload
): Promise<AdminDataSource> {
  const source = normalizeAdminDataSource(await requestDataSourceApi(`${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}`, {
    method: 'PUT',
    body: payload
  }));
  if (!source) throw new Error('Update data source response was missing source details.');
  return source;
}

export async function deleteAdminDataSource(dataSourceId: string): Promise<void> {
  await requestDataSourceApi(`${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}`, {
    method: 'DELETE'
  });
}

export async function testAdminDataSourceConnection(
  payload: Record<string, unknown>
): Promise<AdminDataSourceConnectionResult> {
  return normalizeConnectionResult(await requestDataSourceApi(`${DATA_SOURCES_PATH}/test-connection`, {
    method: 'POST',
    body: payload
  }));
}

export async function previewAdminDataSourceQuery(
  dataSourceId: string,
  query: string
): Promise<AdminDataSourcePreviewResult> {
  return normalizePreviewResult(await requestDataSourceApi(`${DATA_SOURCES_PATH}/query-preview`, {
    method: 'POST',
    body: { dataSourceId, query }
  }));
}

export async function fetchAdminDataSourceTables(dataSourceId: string): Promise<AdminDataSourceTable[]> {
  return normalizeAdminDataSourceTables(await requestDataSourceApi(`${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/tables`));
}

export async function fetchAdminApiWorkflowRuns(
  dataSourceId: string,
  tableName = '',
  limit = 25
): Promise<AdminApiWorkflowRunLog[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (tableName.trim()) params.set('table', tableName.trim());
  const payload = await requestDataSourceApi(
    `${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/api-workflow-runs?${params.toString()}`
  );
  const data = isRecord(payload) ? payload : {};
  return Array.isArray(data.runs) ? data.runs.flatMap(normalizeApiWorkflowRunLog) : [];
}

export async function fetchAdminApiWorkflowOpenApi(dataSourceId: string): Promise<Record<string, unknown>> {
  const payload = await requestDataSourceApi(`${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/openapi.json`);
  return isRecord(payload) ? payload : {};
}

export async function refreshAdminDataSourceSchema(dataSourceId: string): Promise<AdminDataSourceSchemaRefreshResult> {
  const payload = await requestDataSourceApi(`${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/refresh-schema`, {
    method: 'POST',
    body: { includeAllTables: true }
  });
  return normalizeSchemaRefreshResult(payload);
}

export async function saveAdminDataSourceTables(
  dataSourceId: string,
  payload: {
    defaultFilters?: Record<string, AdminDataSourceFilterCondition[]>;
    selectedTables: string[];
  }
): Promise<AdminDataSourceTable[]> {
  return normalizeAdminDataSourceTables(await requestDataSourceApi(`${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/tables`, {
    method: 'PUT',
    body: payload
  }));
}

export async function upsertAdminApiDataSourceTable(
  dataSourceId: string,
  payload: Record<string, unknown>
): Promise<AdminDataSourceTable> {
  const response = await requestDataSourceApi(`${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/tables`, {
    method: 'POST',
    body: payload
  });
  const data = isRecord(response) ? response : {};
  const table = normalizeAdminDataSourceTables([data.table ?? response])[0];
  if (!table) throw new Error('API endpoint save response was missing endpoint details.');
  return table;
}

export async function previewAdminDataSourceTable(
  dataSourceId: string,
  tableName: string,
  parameterValues: Record<string, unknown> = {}
): Promise<AdminDataSourcePreviewResult> {
  const payload = await requestDataSourceApi(`${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/tables/${encodeURIComponent(tableName)}/data`, {
    method: 'POST',
    body: {
      defaultLimit: 25,
      maxLimit: 25,
      parameterValues
    }
  });
  const data = isRecord(payload) ? payload : {};
  const rows = Array.isArray(data.rows)
    ? data.rows.flatMap(item => isRecord(item) ? [{ ...item }] : [])
    : [];
  return {
    rowCount: typeof data.totalRows === 'number' ? data.totalRows : rows.length,
    sampleData: rows,
    schema: Array.isArray(data.columns)
      ? data.columns.flatMap(name => typeof name === 'string' ? [{ name, type: typeof rows[0]?.[name] }] : [])
      : []
  };
}

export async function updateAdminDataSourceDataModels(
  dataSourceId: string,
  dataModelTables: string[]
): Promise<AdminDataSource> {
  const source = normalizeAdminDataSource(await requestDataSourceApi(`${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/data-models`, {
    method: 'PUT',
    body: { dataModelTables }
  }));
  if (!source) throw new Error('Data model update response was missing source details.');
  return source;
}

export async function updateAdminDataSourceDefaultFilters(
  source: AdminDataSource,
  defaultFilters: AdminDataSourceFilterCondition[]
): Promise<AdminDataSource> {
  const nextSettings = { ...source.settings, defaultFilters };
  return updateAdminDataSource(source.id, {
    config: source.config,
    dictionary: source.dictionary,
    isGloballyVisible: source.isGloballyVisible,
    name: source.name,
    settings: nextSettings,
    sourceType: source.sourceType,
    type: source.type
  });
}

export async function updateAdminDataSourceDashboardSettings(
  dataSourceId: string,
  payload: { isDashboardVisible?: boolean; isDefault?: boolean }
): Promise<void> {
  await requestDataSourceApiEnvelope(`${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/dashboard-settings`, {
    method: 'PUT',
    body: payload
  });
}

export async function updateAdminSampleVisibility(
  dataSourceId: string,
  payload: { isGloballyVisible?: boolean }
): Promise<void> {
  await requestDataSourceApiEnvelope(`${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/sample-visibility`, {
    method: 'PUT',
    body: payload
  });
}

export async function syncAdminDataSourceTableToCloud(
  dataSourceId: string,
  tableId: string
): Promise<AdminDataSourceCloudSyncResult> {
  const payload = await requestDataSourceApiEnvelope(
    `${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/tables/${encodeURIComponent(tableId)}/sync-to-cloud`,
    { method: 'POST' }
  );
  return normalizeCloudSyncResult(payload);
}

export async function deleteAdminDataSourceTable(tableId: string): Promise<void> {
  await requestDataSourceApiEnvelope(`${DATA_SOURCES_PATH}/tables/${encodeURIComponent(tableId)}`, {
    method: 'DELETE'
  });
}

export async function fetchAdminTableDictionary(tableId: string): Promise<AdminTableDictionaryDetails> {
  return normalizeTableDictionary(
    await requestDataSourceApi(`${DATA_SOURCES_PATH}/tables/${encodeURIComponent(tableId)}/dictionary`),
    tableId
  );
}

export async function saveAdminTableDictionary(
  tableId: string,
  payload: Record<string, unknown>
): Promise<AdminTableDictionaryDetails> {
  return normalizeTableDictionary(
    await requestDataSourceApi(`${DATA_SOURCES_PATH}/tables/${encodeURIComponent(tableId)}/dictionary`, {
      method: 'PUT',
      body: payload
    }),
    tableId
  );
}

export async function bulkUploadAdminDictionary(
  dataSourceId: string,
  tables: BulkDictionaryPayload
): Promise<BulkDictionaryUploadResult> {
  return normalizeBulkDictionaryUploadResult(await requestDataSourceApiEnvelope(
    `${DATA_SOURCES_PATH}/${encodeURIComponent(dataSourceId)}/bulk-dictionary`,
    {
      method: 'POST',
      body: { tables }
    }
  ));
}

async function requestDataSourceApi(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  return requestDataSourceApiPayload(path, options, 'data');
}

async function requestDataSourceApiEnvelope(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  return requestDataSourceApiPayload(path, options, 'envelope');
}

async function requestDataSourceApiPayload(
  path: string,
  options: { method?: string; body?: unknown },
  mode: 'data' | 'envelope'
): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  const payload = await parseJson(path, response);
  if (isApiResponse(payload)) {
    if (!response.ok || !payload.success) {
      throw new Error(payload.success ? `Request to ${path} failed with status ${response.status}.` : payload.error);
    }
    return mode === 'envelope' ? payload : payload.data;
  }
  if (!response.ok) {
    throw new Error(readRawError(payload, path, response.status));
  }
  return payload;
}

async function parseJson(path: string, response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error(`Response from ${path} was not valid JSON.`);
  }
}

function readRawError(payload: unknown, path: string, status: number): string {
  if (isRecord(payload)) {
    const error = typeof payload.error === 'string' ? payload.error : null;
    const message = typeof payload.message === 'string' ? payload.message : null;
    if (error || message) return error ?? message ?? '';
  }
  return `Request to ${path} failed with status ${status}.`;
}

function normalizePreviewResult(value: unknown): AdminDataSourcePreviewResult {
  const data = isRecord(value) ? value : {};
  const schema = Array.isArray(data.schema)
    ? data.schema.flatMap(item => isRecord(item) && typeof item.name === 'string'
      ? [{ name: item.name, type: typeof item.type === 'string' ? item.type : 'string' }]
      : [])
    : [];
  const sampleData = Array.isArray(data.sampleData)
    ? data.sampleData.flatMap(item => isRecord(item) ? [{ ...item }] : [])
    : [];
  return {
    rowCount: typeof data.rowCount === 'number' ? data.rowCount : sampleData.length,
    sampleData,
    schema
  };
}

function normalizeApiWorkflowRunLog(value: unknown): AdminApiWorkflowRunLog[] {
  if (!isRecord(value)) return [];
  const id = stringValue(value.id);
  const dataSourceId = stringValue(value.dataSourceId);
  const tableId = stringValue(value.tableId);
  const tableName = stringValue(value.tableName);
  const startedAt = stringValue(value.startedAt);
  if (!id || !dataSourceId || !tableId || !tableName || !startedAt) return [];
  return [{
    dataSourceId,
    durationMs: numericValue(value.durationMs),
    endpoint: stringValue(value.endpoint),
    ...(stringValue(value.error) ? { error: stringValue(value.error) } : {}),
    id,
    method: stringValue(value.method),
    ok: value.ok === true,
    pageCount: numericValue(value.pageCount),
    rowCount: numericValue(value.rowCount),
    startedAt,
    ...(typeof value.statusCode === 'number' ? { statusCode: value.statusCode } : {}),
    tableId,
    tableName
  }];
}

function normalizeSchemaRefreshResult(value: unknown): AdminDataSourceSchemaRefreshResult {
  const data = isRecord(value) ? value : {};
  return {
    dataSourceId: typeof data.dataSourceId === 'string' ? data.dataSourceId : '',
    discoveredTableCount: numericValue(data.discoveredTableCount),
    registeredTableCount: numericValue(data.registeredTableCount),
    savedDataModelCount: numericValue(data.savedDataModelCount)
  };
}

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeCloudSyncResult(value: unknown): AdminDataSourceCloudSyncResult {
  const payload = isApiResponse(value) ? value.data : value;
  const data = isRecord(payload) ? payload : {};
  return {
    message: typeof data.message === 'string' ? data.message : 'Cloud sync completed',
    syncedAt: typeof data.syncedAt === 'string' ? data.syncedAt : ''
  };
}

function isApiResponse(value: unknown): value is { data?: unknown; error: string; success: boolean } {
  return isRecord(value) && typeof value.success === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
