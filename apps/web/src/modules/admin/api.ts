import type { ApiResponse } from '@intraq/contracts';
import type {
  AdminField,
  AdminFieldValue,
  AdminRecord,
  AdminRecordAction,
  AdminResourceSurface
} from './types';

type JsonBody = Record<string, unknown>;

export async function requestAdmin<TData>(
  path: string,
  options: { method?: string; body?: JsonBody } = {}
): Promise<TData> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = storedAuthToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  const payload = await parseResponse(path, response);
  if (isApiResponse(payload)) {
    if (!response.ok || !payload.success) {
      throw new Error(readApiError(payload, path, response.status));
    }
    return payload.data as TData;
  }
  if (!response.ok) {
    throw new Error(readRawError(payload, path, response.status));
  }
  return payload as TData;
}

export async function fetchResource(surface: AdminResourceSurface): Promise<AdminRecord[]> {
  const payload = await requestAdmin<unknown>(surface.path);
  return extractRecords(payload, surface.listKey);
}

export function createResource(surface: AdminResourceSurface, body: JsonBody): Promise<AdminRecord> {
  return requestAdmin<AdminRecord>(surface.path, { method: 'POST', body });
}

export function updateResource(
  surface: AdminResourceSurface,
  record: AdminRecord,
  body: JsonBody
): Promise<AdminRecord> {
  return requestAdmin<AdminRecord>(itemPath(surface, record), { method: 'PUT', body });
}

export function deleteResource(surface: AdminResourceSurface, record: AdminRecord): Promise<unknown> {
  return requestAdmin<unknown>(itemPath(surface, record), { method: 'DELETE' });
}

export function runRecordAction(action: AdminRecordAction, record: AdminRecord): Promise<unknown> {
  const path = typeof action.path === 'function' ? action.path(record) : action.path;
  const payload = typeof action.payload === 'function' ? action.payload(record) : action.payload;
  return payload === undefined
    ? requestAdmin<unknown>(path, { method: action.method })
    : requestAdmin<unknown>(path, { method: action.method, body: payload });
}

export function buildPayload(fields: AdminField[], values: Record<string, AdminFieldValue>): JsonBody {
  const entries: Array<[string, unknown]> = [];
  for (const field of fields) {
    const value = values[field.key];
    if (field.type === 'checkbox') {
      entries.push([field.key, Boolean(value)]);
      continue;
    }
    if (field.type === 'number') {
      if (value === '') continue;
      const numberValue = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(numberValue)) entries.push([field.key, numberValue]);
      continue;
    }
    const text = String(value ?? '').trim();
    if (text || field.required) entries.push([field.key, text]);
  }
  return Object.fromEntries(entries);
}

export function defaultFieldValues(fields: AdminField[], record?: AdminRecord): Record<string, AdminFieldValue> {
  const entries: Array<[string, AdminFieldValue]> = fields.map(field => [field.key, defaultFieldValue(field, record)]);
  return Object.fromEntries(entries);
}

export function recordId(surface: AdminResourceSurface, record: AdminRecord): string {
  const key = surface.idKey ?? 'id';
  const value = record[key] ?? record.id;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function itemPath(surface: AdminResourceSurface, record: AdminRecord): string {
  return `${surface.path}/${encodeURIComponent(recordId(surface, record))}`;
}

function defaultFieldValue(field: AdminField, record?: AdminRecord): AdminFieldValue {
  const value = record?.[field.key];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (field.defaultValue !== undefined) return field.defaultValue;
  return field.type === 'checkbox' ? false : '';
}

async function parseResponse(path: string, response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Response from ${path} was not valid JSON.`);
  }
}

function extractRecords(payload: unknown, listKey?: string): AdminRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  const keyed = listKey ? payload[listKey] : undefined;
  if (Array.isArray(keyed)) return keyed.filter(isRecord);
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return isRecord(value) && typeof value.success === 'boolean';
}

function readApiError(payload: ApiResponse<unknown>, path: string, status: number): string {
  if (!payload.success) return payload.error;
  return `Request to ${path} failed with status ${status}.`;
}

function readRawError(payload: unknown, path: string, status: number): string {
  if (isRecord(payload) && typeof payload.error === 'string') return payload.error;
  return `Request to ${path} failed with status ${status}.`;
}

function storedAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('auth_token')
    ?? window.localStorage.getItem('token')
    ?? window.localStorage.getItem('accessToken')
    ?? '';
}

function isRecord(value: unknown): value is AdminRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
