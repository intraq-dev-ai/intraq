import type { ServerResponse } from 'node:http';
import { SqlOperationTimeoutError } from './sql-operation-timeout.js';

export function sendRawJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

export function sendRawText(
  res: ServerResponse,
  statusCode: number,
  body: string,
  headers: Record<string, string>
): void {
  res.writeHead(statusCode, {
    ...headers,
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

export function sendRawBuffer(
  res: ServerResponse,
  statusCode: number,
  body: Buffer,
  headers: Record<string, string>
): void {
  res.writeHead(statusCode, {
    ...headers,
    'content-length': body.byteLength
  });
  res.end(body);
}

export function sendSqlTimeout(res: ServerResponse, error: unknown): boolean {
  if (!(error instanceof SqlOperationTimeoutError)) return false;
  sendRawJson(res, 504, { success: false, error: error.message });
  return true;
}

export function sendEventStream(res: ServerResponse, events: Array<Record<string, unknown>>): void {
  const body = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  res.end(body);
}

export function completeEventContent(events: Array<Record<string, unknown>>): string | null {
  const complete = [...events].reverse().find(event => event.type === 'complete');
  return asString(complete?.fullContent);
}

export function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

export function stringMap(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string')) as Record<string, string>;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString).map(item => item.trim()) : [];
}

export function asString(value: unknown): string | null {
  return isNonEmptyString(value) ? value.trim() : null;
}

export function readParameterValues(value: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(value.parameterValues)) return value.parameterValues;
  if (isRecord(value.parameters)) return value.parameters;
  return {};
}

export function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isSqlChartRoutePath(pathname: string): boolean {
  return pathname.startsWith('/api/sql-editor') ||
    pathname.startsWith('/api/ai-sql-assistant') ||
    pathname.startsWith('/api/chart-data') ||
    pathname === '/api/chart-summary';
}
