import type { Prisma } from '@intraq/db';
import type { RequestSecurityContext } from '../../security/request-context.js';

export interface Item {
  id: string;
  name: string;
  status?: string;
  [key: string]: unknown;
}

export function idFrom(pathname: string, index: number): string {
  return decodeURIComponent(pathname.split('/')[index] ?? '');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function slugFromValue(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'dashboard-theme';
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

export function sanitizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (!isRecord(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)]));
}

export function isInstanceOwnerRole(role: string | undefined): boolean {
  return role === 'SINGLE_TENANT_OWNER' || role === 'SINGLE_TENANT_ADMIN';
}

export function readRecipients(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  return [];
}

export type AdminIntegrationsRequestContext = RequestSecurityContext | undefined;
