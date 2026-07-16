import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
  type ApiDirectExportResponse,
  type ApiPageRequest,
  type ApiRuntimeResult
} from './api-runtime-types.js';
import { hasHeader, isRecord } from './api-runtime-utils.js';

export async function fetchJson(
  request: ApiPageRequest,
  timeoutMs: number
): Promise<ApiRuntimeResult<unknown>> {
  if (request.method === 'GET' && request.body !== undefined) return fetchJsonWithGetBody(request, timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body !== undefined ? { body: request.body } : {}),
      signal: controller.signal
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status === 401 ? 401 : response.status === 403 ? 403 : 502,
        error: apiResponseErrorMessage(response.status, payload)
      };
    }
    return { ok: true, data: payload };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      statusCode: timedOut ? 504 : 502,
      error: timedOut ? 'API data source request timed out' : 'API data source request failed'
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRaw(
  request: ApiPageRequest,
  timeoutMs: number,
  fallbackFilename?: string
): Promise<ApiRuntimeResult<ApiDirectExportResponse>> {
  if (request.method === 'GET' && request.body !== undefined) return fetchRawWithGetBody(request, timeoutMs, fallbackFilename);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body !== undefined ? { body: request.body } : {}),
      signal: controller.signal
    });
    const body = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      const detail = contentType.includes('json') || contentType.includes('text')
        ? upstreamErrorDetail(body.toString('utf8'))
        : null;
      return {
        ok: false,
        statusCode: response.status === 401 ? 401 : response.status === 403 ? 403 : 502,
        error: detail ? `API data source export failed with status ${response.status}: ${detail}` : `API data source export failed with status ${response.status}`
      };
    }
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    const filename = filenameFromContentDisposition(response.headers.get('content-disposition')) ?? fallbackFilename;
    return {
      ok: true,
      data: {
        body,
        contentType,
        extension: extensionForContentType(contentType, filename),
        ...(filename ? { filename } : {})
      }
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      statusCode: timedOut ? 504 : 502,
      error: timedOut ? 'API data source export timed out' : 'API data source export failed'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithGetBody(
  request: ApiPageRequest,
  timeoutMs: number
): Promise<ApiRuntimeResult<unknown>> {
  const response = await fetchHttpWithBody(request, timeoutMs);
  if (!response.ok) return response;
  const payload = parseHttpBodyPayload(response.data.body, response.data.contentType);
  if (response.data.statusCode < 200 || response.data.statusCode >= 300) {
    return {
      ok: false,
      statusCode: response.data.statusCode === 401 ? 401 : response.data.statusCode === 403 ? 403 : 502,
      error: apiResponseErrorMessage(response.data.statusCode, payload)
    };
  }
  return { ok: true, data: payload };
}

async function fetchRawWithGetBody(
  request: ApiPageRequest,
  timeoutMs: number,
  fallbackFilename?: string
): Promise<ApiRuntimeResult<ApiDirectExportResponse>> {
  const response = await fetchHttpWithBody(request, timeoutMs);
  if (!response.ok) return response;
  if (response.data.statusCode < 200 || response.data.statusCode >= 300) {
    const detail = response.data.contentType.includes('json') || response.data.contentType.includes('text')
      ? upstreamErrorDetail(response.data.body.toString('utf8'))
      : null;
    return {
      ok: false,
      statusCode: response.data.statusCode === 401 ? 401 : response.data.statusCode === 403 ? 403 : 502,
      error: detail ? `API data source export failed with status ${response.data.statusCode}: ${detail}` : `API data source export failed with status ${response.data.statusCode}`
    };
  }
  const filename = filenameFromContentDisposition(response.data.contentDisposition) ?? fallbackFilename;
  return {
    ok: true,
    data: {
      body: response.data.body,
      contentType: response.data.contentType || 'application/octet-stream',
      extension: extensionForContentType(response.data.contentType, filename),
      ...(filename ? { filename } : {})
    }
  };
}

function fetchHttpWithBody(
  request: ApiPageRequest,
  timeoutMs: number
): Promise<ApiRuntimeResult<{ body: Buffer; contentDisposition: string | null; contentType: string; statusCode: number }>> {
  return new Promise(resolve => {
    const transport = request.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = transport(request.url, {
      headers: {
        ...request.headers,
        ...(request.body !== undefined && !hasHeader(request.headers, 'content-length') ? { 'content-length': Buffer.byteLength(request.body) } : {})
      },
      method: request.method
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => {
        clearTimeout(timeout);
        resolve({
          ok: true,
          data: {
            body: Buffer.concat(chunks),
            contentDisposition: response.headers['content-disposition'] ? String(response.headers['content-disposition']) : null,
            contentType: String(response.headers['content-type'] ?? ''),
            statusCode: response.statusCode ?? 502
          }
        });
      });
    });
    const timeout = setTimeout(() => {
      req.destroy(new Error('API data source request timed out'));
    }, timeoutMs);
    req.on('error', error => {
      clearTimeout(timeout);
      const timedOut = error instanceof Error && error.message === 'API data source request timed out';
      resolve({
        ok: false,
        statusCode: timedOut ? 504 : 502,
        error: timedOut ? 'API data source request timed out' : 'API data source request failed'
      });
    });
    if (request.body !== undefined) req.write(request.body);
    req.end();
  });
}

function filenameFromContentDisposition(value: string | null): string | undefined {
  if (!value) return undefined;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="?([^";]+)"?/i.exec(value)?.[1];
}

function extensionForContentType(contentType: string, filename?: string): string {
  const fromName = filename?.split('.').pop()?.trim().toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const normalized = contentType.toLowerCase();
  if (normalized.includes('spreadsheetml')) return 'xlsx';
  if (normalized.includes('ms-excel')) return 'xls';
  if (normalized.includes('csv')) return 'csv';
  if (normalized.includes('json')) return 'json';
  return 'bin';
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') || contentType.includes('+json')) return response.json() as Promise<unknown>;
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { value: text };
  }
}

function parseHttpBodyPayload(body: Buffer, contentType: string): unknown {
  const text = body.toString('utf8');
  if (!text.trim()) return null;
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { value: text };
    }
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { value: text };
  }
}

function apiResponseErrorMessage(status: number, payload: unknown): string {
  const detail = upstreamErrorDetail(payload);
  return detail
    ? `API data source request failed with status ${status}: ${detail}`
    : `API data source request failed with status ${status}`;
}

function upstreamErrorDetail(payload: unknown): string | null {
  const value = upstreamErrorValue(payload);
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : JSON.stringify(value);
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > 300 ? `${normalized.slice(0, 297)}...` : normalized;
}

function upstreamErrorValue(payload: unknown): unknown {
  if (typeof payload === 'string') return payload;
  if (!isRecord(payload)) return null;
  for (const key of ['error', 'message', 'detail', 'title', 'reason', 'value']) {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  const responseStatus = payload.ResponseStatus ?? payload.responseStatus;
  if (isRecord(responseStatus)) {
    for (const key of ['Message', 'message', 'ErrorCode', 'errorCode', 'StackTrace', 'stackTrace']) {
      const value = responseStatus[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  const errors = payload.errors;
  if (Array.isArray(errors) && errors.length > 0) return errors.slice(0, 3);
  if (isRecord(errors)) return Object.fromEntries(Object.entries(errors).slice(0, 3));
  return null;
}
