import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail } from '@intraq/contracts';
import { readJsonBody } from '../../http.js';

export function sendCompatJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

export function sendCompatFailure(res: ServerResponse, statusCode: number, message: string): void {
  sendCompatJson(res, statusCode, fail(message));
}

export function sendCompatText(
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

export async function readCompatRecord(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const body = await readJsonBody(req);
  return isRecord(body) ? body : null;
}

export function decodePart(value: string): string {
  return decodeURIComponent(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function asString(value: unknown): string | null {
  return isNonEmptyString(value) ? value.trim() : null;
}

export function parseInteger(value: unknown, fallback: number, options: { min: number; max: number }): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(options.max, Math.max(options.min, parsed));
}
