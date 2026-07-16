import type { AdminColumn, AdminRecord, AdminResourceSurface } from './types';

export function recordName(surface: AdminResourceSurface, record: AdminRecord): string {
  const configured = surface.nameKey ? record[surface.nameKey] : undefined;
  const value = configured ?? record.name ?? record.title ?? record.email ?? record.id ?? record.botKey;
  return toDisplayText(value, 'Unnamed record');
}

export function cellValue(record: AdminRecord, column: AdminColumn): string {
  const value = record[column.key];
  if (value === undefined || value === null || value === '') return 'Not set';
  if (column.type === 'boolean') return value ? 'Yes' : 'No';
  if (column.type === 'date') return formatDate(value);
  if (column.type === 'list') return Array.isArray(value) ? value.map(item => toDisplayText(item)).join(', ') : toDisplayText(value);
  if (typeof value === 'object') return summarizeObject(value);
  return toDisplayText(value);
}

export function statusClass(value: unknown): string {
  const status = String(value ?? '').toLowerCase();
  if (['active', 'connected', 'ready', 'sent', 'published', 'key_generated'].includes(status)) {
    return 'admin-badge admin-badge-success';
  }
  if (['draft', 'pending', 'running', 'queued', 'unknown'].includes(status)) {
    return 'admin-badge admin-badge-warning';
  }
  if (['inactive', 'suspended', 'failed', 'rejected'].includes(status)) {
    return 'admin-badge admin-badge-danger';
  }
  return 'admin-badge';
}

export function toDisplayText(value: unknown, fallback = 'Not set'): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(item => toDisplayText(item)).join(', ');
  return summarizeObject(value);
}

export function titleize(value: string): string {
  return value.split(/[-_/ ]+/).filter(Boolean).map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function formatDate(value: unknown): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return toDisplayText(value);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function summarizeObject(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value);
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 3);
  if (!entries.length) return 'Configured';
  return entries.map(([key, entry]) => `${titleize(key)}: ${toDisplayText(entry)}`).join(', ');
}
