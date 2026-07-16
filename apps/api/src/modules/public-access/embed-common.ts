import type { IncomingMessage, ServerResponse } from 'node:http';
import { readBearerToken as readAuthBearerToken, verifyAccessToken } from '../auth-setup/auth-tokens.js';
import type { RequestSecurityContext } from '../../security/request-context.js';

export const embedExpiryError = 'expiresIn must be a duration like 15m, 24h, 7d, or never';

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

export function sendDownloadText(res: ServerResponse, statusCode: number, body: string, headers: Record<string, string>): void {
  res.writeHead(statusCode, {
    ...headers,
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

export function readDownloadInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(numberValue)) return Math.min(Math.max(fallback, min), max);
  return Math.min(Math.max(numberValue, min), max);
}

export function readManagementContext(req: IncomingMessage): RequestSecurityContext | null {
  const payload = verifyAccessToken(readAuthBearerToken(req.headers.authorization));
  return payload ? { role: payload.role, userId: payload.sub } : null;
}

export function readHeader(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

export function readAllowedDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const domains: string[] = [];
  for (const item of value) {
    if (!isNonEmptyString(item)) continue;
    const normalized = item.trim().replace(/\/+$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    domains.push(normalized);
  }
  return domains;
}

export function readJsonStringArray(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    try {
      return readJsonStringArray(JSON.parse(value) as unknown);
    } catch {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter(isNonEmptyString).map(item => item.trim()).filter(Boolean);
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) if (isNonEmptyString(value)) return value.trim();
  return undefined;
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readDateString(value: unknown): string | undefined {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : undefined;
}

export function readOptionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

export function expiresAtForEmbedExpiry(value: string, now: number): number | null {
  if (value.trim().toLowerCase() === 'never') return Number.MAX_SAFE_INTEGER;
  const durationMs = parseDurationMs(value);
  return durationMs === null ? null : now + durationMs;
}

export function embedExpiresAtResponse(expiresAt: number): { expiresAt: string } | Record<string, never> {
  return Number.isFinite(expiresAt) && expiresAt < Number.MAX_SAFE_INTEGER
    ? { expiresAt: new Date(expiresAt).toISOString() }
    : {};
}

export function readLimit(value: string | null): number | null {
  const parsed = Number(value ?? 1000);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5000 ? parsed : null;
}

export function readPublicBaseUrl(req: IncomingMessage): string {
  const configured = process.env.FRONTEND_URL ?? process.env.PUBLIC_BASE_URL ?? process.env.APP_BASE_URL ?? process.env.WEB_ORIGIN;
  if (isNonEmptyString(configured)) return configured.trim().replace(/\/+$/, '');
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.trim()) return origin.trim().replace(/\/+$/, '');
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = typeof forwardedHost === 'string' && forwardedHost.trim() ? forwardedHost : req.headers.host;
  if (typeof host === 'string' && host.trim()) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = typeof forwardedProto === 'string' && forwardedProto.trim() ? forwardedProto.trim() : 'http';
    return `${protocol}://${host.trim()}`.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

export function currentTenant(): { id: string; name: string } {
  return { id: 'tenant-current', name: 'Current Tenant' };
}

export function currentUser(): { id: string; tenantId: string } {
  return { id: 'user-current', tenantId: 'tenant-current' };
}

export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function parseDurationMs(value: string): number | null {
  const match = /^(\d+)(m|h|d)$/i.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  const unit = match[2]?.toLowerCase();
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}
