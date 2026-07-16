import type { AdminApiWorkflowRunLog, AdminDataSourceTable } from '../types';
import { tableDisplayName } from '../view-model';

export interface AdminDataSourceApiDraft {
  allowBodyOnGet: boolean;
  body: string;
  compositeConfig: string;
  dataPath: string;
  defaults: string;
  endpoint: string;
  exportConfig: string;
  headers: string;
  label: string;
  method: string;
  previewParameters: string;
  queryParams: string;
  responseMapping: string;
  responseShape: string;
  rowContextColumns: string;
  tableName: string;
}

export function createEmptyApiDraft(): AdminDataSourceApiDraft {
  return {
    allowBodyOnGet: false,
    body: '',
    compositeConfig: '',
    dataPath: '',
    defaults: '',
    endpoint: '',
    exportConfig: '',
    headers: '',
    label: '',
    method: 'GET',
    previewParameters: defaultPreviewParametersText(),
    queryParams: '',
    responseMapping: '',
    responseShape: 'rows',
    rowContextColumns: '',
    tableName: ''
  };
}

export function createApiDraftFromTable(table: AdminDataSourceTable | null): AdminDataSourceApiDraft {
  const settings = readRecord(table?.settings);
  const api = readRecord(settings.api ?? settings.request);
  return {
    allowBodyOnGet: readBoolean(api.allowBodyOnGet ?? api.bodyOnGet ?? api.sendBodyWithGet) === true,
    body: jsonText(api.body),
    compositeConfig: jsonText(api.composite ?? api.workflow ?? api.dataWorkflow ?? settings.composite ?? settings.workflow ?? settings.dataWorkflow),
    dataPath: readString(api.dataPath) || '',
    defaults: jsonText(settings.defaults),
    endpoint: readString(api.endpoint ?? api.path ?? api.apiEndpoint) || '',
    exportConfig: jsonText(settings.export ?? settings.exports ?? settings.apiExport ?? settings.download ?? api.export),
    headers: jsonText(api.headers),
    label: table ? (table.businessName || tableDisplayName(table)) : '',
    method: readString(api.method) || 'GET',
    previewParameters: defaultPreviewParametersText(),
    queryParams: jsonText(api.queryParams ?? api.params),
    responseMapping: jsonText(api.responseMapping ?? api.mapping),
    responseShape: readString(api.responseShape ?? api.responseMode ?? api.resultShape ?? api.shape) || 'rows',
    rowContextColumns: jsonText(api.rowContextColumns ?? api.contextColumns ?? api.rootColumns ?? api.metadataColumns ?? api.rootMetadataColumns),
    tableName: table?.name ?? ''
  };
}

export function buildCompositeWorkflowSummary(rawWorkflowJson: string): { label: string; segments: number } {
  const parsed = parseJsonObject(rawWorkflowJson, 'Composite Workflow JSON');
  if (!parsed.ok) return { label: 'Invalid workflow JSON', segments: 0 };
  const segments = Array.isArray(parsed.data.segments) ? parsed.data.segments.length : 0;
  return {
    label: segments > 0 ? `${segments} source segment${segments === 1 ? '' : 's'} configured` : 'No composite workflow configured',
    segments
  };
}

export function parsePreviewParameters(value: string): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  return parseJsonObject(value, 'Preview parameters');
}

export function buildApiTablePayload(
  draft: AdminDataSourceApiDraft,
  existingTable: AdminDataSourceTable | null,
  isCreatingApiEndpoint: boolean
): { ok: true; payload: Record<string, unknown> } | { ok: false; error?: string } {
  if (!existingTable && !isCreatingApiEndpoint) return { ok: false };
  const label = draft.label.trim() || existingTable?.businessName || (existingTable ? tableDisplayName(existingTable) : '');
  const endpoint = draft.endpoint.trim();
  const tableName = draft.tableName.trim() || modelKeyFromLabel(label || endpoint);
  if (!label) return { ok: false, error: 'Endpoint name is required.' };
  if (!endpoint) return { ok: false, error: 'Endpoint path is required.' };
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
    return { ok: false, error: 'Internal Key must use letters, numbers, and underscores, and start with a letter or underscore.' };
  }
  const headers = parseJsonObject(draft.headers, 'Headers JSON');
  const queryParams = parseJsonObject(draft.queryParams, 'Query Params JSON');
  const body = parseJsonAny(draft.body, 'Body JSON');
  const responseMapping = parseJsonObject(draft.responseMapping, 'Response Mapping JSON');
  const rowContextColumns = parseJsonAny(draft.rowContextColumns, 'Additional Row Fields JSON');
  const defaults = parseJsonObject(draft.defaults, 'Defaults JSON');
  const exportConfig = parseJsonObject(draft.exportConfig, 'Direct Export JSON');
  const compositeConfig = parseJsonObject(draft.compositeConfig, 'Composite Workflow JSON');
  if (!headers.ok) return { ok: false, error: headers.error };
  if (!queryParams.ok) return { ok: false, error: queryParams.error };
  if (!body.ok) return { ok: false, error: body.error };
  if (!responseMapping.ok) return { ok: false, error: responseMapping.error };
  if (!rowContextColumns.ok) return { ok: false, error: rowContextColumns.error };
  if (!defaults.ok) return { ok: false, error: defaults.error };
  if (!exportConfig.ok) return { ok: false, error: exportConfig.error };
  if (!compositeConfig.ok) return { ok: false, error: compositeConfig.error };
  if (draft.method === 'GET' && draft.body.trim() && !draft.allowBodyOnGet) {
    return {
      ok: false,
      error: 'GET requests ignore Body JSON unless "Send body with GET" is enabled. Move values to Query Params JSON or enable the option.'
    };
  }
  if (draft.responseShape === 'matrix' && !hasConfiguredJson(draft.responseMapping, responseMapping.data)) {
    return { ok: false, error: 'Matrix Mapping requires Response Mapping JSON.' };
  }
  return {
    ok: true,
    payload: {
      ...(existingTable ? { id: existingTable.id } : {}),
      name: label,
      tableName,
      description: existingTable?.description,
      fields: existingTable?.fields ?? [],
      isDataModel: existingTable?.isDataModel ?? true,
      defaults: defaults.data,
      ...(hasConfiguredJson(draft.exportConfig, exportConfig.data) ? { settings: { export: exportConfig.data } } : {}),
      api: {
        ...(draft.allowBodyOnGet ? { allowBodyOnGet: true } : {}),
        ...(draft.dataPath.trim() ? { dataPath: draft.dataPath.trim() } : {}),
        ...(headers.data && Object.keys(headers.data).length ? { headers: headers.data } : {}),
        ...(queryParams.data && Object.keys(queryParams.data).length ? { queryParams: queryParams.data } : {}),
        ...(draft.body.trim() ? { body: body.data } : {}),
        ...(hasConfiguredJson(draft.compositeConfig, compositeConfig.data) ? { composite: compositeConfig.data } : {}),
        ...(responseMapping.data && Object.keys(responseMapping.data).length ? { responseMapping: responseMapping.data } : {}),
        ...(draft.responseShape.trim() && draft.responseShape.trim() !== 'rows' ? { responseShape: draft.responseShape.trim() } : {}),
        ...(hasConfiguredJson(draft.rowContextColumns, rowContextColumns.data) ? { rowContextColumns: rowContextColumns.data } : {}),
        endpoint,
        method: draft.method || 'GET'
      }
    }
  };
}

export function formatRunTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export function runStatusLabel(run: AdminApiWorkflowRunLog): string {
  if (run.ok) return 'Success';
  return run.statusCode ? `Failed ${run.statusCode}` : 'Failed';
}

function defaultPreviewParametersText(): string {
  return JSON.stringify({
    fromDate: '2026-05-01T00:00:00',
    locationId: '1',
    rangeFrequency: 'Monthly',
    rangeType: 2,
    toDate: '2026-05-31T23:59:59'
  }, null, 2);
}

function jsonText(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function parseJsonObject(value: string, label: string): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const parsed = parseJsonAny(value, label);
  if (!parsed.ok) return parsed;
  if (parsed.data === undefined) return { ok: true, data: {} };
  return parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
    ? { ok: true, data: parsed.data as Record<string, unknown> }
    : { ok: false, error: `${label} must be a JSON object.` };
}

function parseJsonAny(value: string, label: string): { ok: true; data: unknown } | { ok: false; error: string } {
  if (!value.trim()) return { ok: true, data: undefined };
  try {
    return { ok: true, data: JSON.parse(value) as unknown };
  } catch {
    return { ok: false, error: `${label} is not valid JSON.` };
  }
}

function hasConfiguredJson(raw: string, value: unknown): boolean {
  if (!raw.trim()) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return value !== undefined && value !== null && value !== '';
}

function modelKeyFromLabel(value: string): string {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (!normalized) return 'api_endpoint';
  return /^[A-Za-z_]/.test(normalized) ? normalized : `api_${normalized}`;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
