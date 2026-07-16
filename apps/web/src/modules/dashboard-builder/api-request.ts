import type { ApiResponse } from '@intraq/contracts';

type JsonBody = object;

export async function requestApi<TData>(
  path: string,
  options: { method?: string; body?: JsonBody; signal?: AbortSignal } = {}
): Promise<TData> {
  const payload = await requestRaw(path, options);
  if (!isApiResponse(payload)) throw new Error(`Unexpected response shape from ${path}.`);
  if (!payload.success) throw new Error(payload.error);
  return payload.data as TData;
}

export async function requestRaw(
  path: string,
  options: { method?: string; body?: JsonBody; signal?: AbortSignal } = {}
): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = storedAuthToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.signal) init.signal = options.signal;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  const payload = await parseJson(path, response);
  if (!response.ok) throw new Error(readError(payload, path, response.status));
  return payload;
}

export async function requestOptionalRaw(
  path: string,
  options: { method?: string; body?: JsonBody; signal?: AbortSignal } = {}
): Promise<unknown | null> {
  try {
    return await requestRaw(path, options);
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isPresent<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}

async function parseJson(path: string, response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error(`Response from ${path} was not valid JSON.`);
  }
}

function readError(payload: unknown, path: string, status: number): string {
  if (isApiResponse(payload) && !payload.success) return payload.error;
  if (isRecord(payload) && typeof payload.error === 'string') return payload.error;
  return `Request to ${path} failed with status ${status}.`;
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return isRecord(value) && typeof value.success === 'boolean';
}

function storedAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('auth_token')
    ?? window.localStorage.getItem('token')
    ?? window.localStorage.getItem('accessToken')
    ?? '';
}
