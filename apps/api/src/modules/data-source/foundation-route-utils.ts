import type { ServerResponse } from 'node:http';
import type { Prisma } from '@intraq/db';

export function sendRawJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

export function sendSensitiveJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    pragma: 'no-cache'
  });
  res.end(body);
}

export function readHeader(req: { headers: Record<string, string | string[] | undefined> }, name: string): string | null {
  const header = req.headers[name.toLowerCase()];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function requestBaseUrl(req: { headers: Record<string, string | string[] | undefined> }): string {
  const host = readHeader(req, 'x-forwarded-host') ?? readHeader(req, 'host') ?? 'localhost';
  const protocol = readHeader(req, 'x-forwarded-proto') ?? 'http';
  return `${protocol}://${host}`;
}

export function readJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(isNonEmptyString).map(item => item.trim());
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return readJsonStringArray(parsed);
    } catch {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
}

export function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString).map(item => item.trim()) : [];
}

export function csvStringArray(value: string | null): string[] {
  return value ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function readString(value: unknown): string | null {
  return isNonEmptyString(value) ? value.trim() : null;
}

export function toApiSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function asPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function asNonNegativeInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function inputJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

function sanitizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (!isRecord(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)]));
}
