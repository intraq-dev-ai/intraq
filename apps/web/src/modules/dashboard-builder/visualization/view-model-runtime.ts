import type { MetricFormat } from './formatting';
import { isRecord, readString } from './view-model-config';
import type { DashboardDisplayMode, SortDirection } from './view-model-types';

type DashboardTone = 'danger' | 'neutral' | 'success' | 'warning';

export interface RuntimeFilter {
  field: string;
  logicOperator?: string;
  operator: string;
  value?: unknown;
  valueTo?: unknown;
}

export function matchesFilter(value: unknown, filter: RuntimeFilter): boolean {
  const operator = filter.operator.toLowerCase();
  const comparable = comparableValue(value);
  const target = comparableValue(filter.value);
  if (operator === 'contains') return String(value ?? '').toLowerCase().includes(String(filter.value ?? '').toLowerCase());
  if (operator === 'notcontains' || operator === 'not_contains') return !String(value ?? '').toLowerCase().includes(String(filter.value ?? '').toLowerCase());
  if (operator === 'startswith' || operator === 'starts_with') return String(value ?? '').toLowerCase().startsWith(String(filter.value ?? '').toLowerCase());
  if (operator === 'endswith' || operator === 'ends_with') return String(value ?? '').toLowerCase().endsWith(String(filter.value ?? '').toLowerCase());
  if (operator === 'isnull' || operator === 'is_null') return value === null || value === undefined || String(value).trim() === '';
  if (operator === 'isnotnull' || operator === 'is_not_null') return !(value === null || value === undefined || String(value).trim() === '');
  if (operator === 'like') return String(value ?? '').toLowerCase().includes(String(filter.value ?? '').toLowerCase());
  if (operator === 'not like') return !String(value ?? '').toLowerCase().includes(String(filter.value ?? '').toLowerCase());
  if (operator === 'notequals' || operator === 'not_equals' || operator === 'neq' || operator === '!=' || operator === '<>') return comparable !== target;
  if (operator === 'in') return listValues(filter.value).map(comparableValue).includes(comparable);
  if (operator === 'not in' || operator === 'not_in') return !listValues(filter.value).map(comparableValue).includes(comparable);
  if (operator === 'between') {
    const upper = comparableValue(filter.valueTo);
    return typeof comparable === 'number' && typeof target === 'number' && typeof upper === 'number' && comparable >= target && comparable <= upper;
  }
  if (operator === 'greaterthan' || operator === 'gt' || operator === '>') return numericCompare(value, filter.value, (left, right) => left > right);
  if (operator === 'lessthan' || operator === 'lt' || operator === '<') return numericCompare(value, filter.value, (left, right) => left < right);
  if (operator === 'gte' || operator === 'greaterthanorequal' || operator === '>=') return numericCompare(value, filter.value, (left, right) => left >= right);
  if (operator === 'lte' || operator === 'lessthanorequal' || operator === '<=') return numericCompare(value, filter.value, (left, right) => left <= right);
  if (operator === '==' || operator === '=') return comparable === target;
  return comparable === target;
}

export function compareValues(left: unknown, right: unknown, direction: SortDirection): number {
  const multiplier = direction === 'desc' ? -1 : 1;
  const leftNumeric = numericValueOrNull(left);
  const rightNumeric = numericValueOrNull(right);
  if (leftNumeric !== null && rightNumeric !== null) return multiplier * (leftNumeric - rightNumeric);
  return multiplier * String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

export function numericValueOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.replace(/[,$%]/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function readConfiguredFormats(value: unknown): Record<string, MetricFormat> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([field, format]) => {
    const metricFormat = readMetricFormat(format);
    return metricFormat ? [[field, metricFormat]] : [];
  }));
}

export function readCssLength(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return `${value}px`;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^(?:\d+(?:\.\d+)?(?:px|rem|em|ch|%)|minmax\([^)]+\)|clamp\([^)]+\))$/.test(trimmed) ? trimmed : undefined;
}

export function readDisplayMode(value: unknown): DashboardDisplayMode | undefined {
  return value === 'comfortable' || value === 'compact' || value === 'dense' || value === 'heatmap' || value === 'plain'
    ? value
    : undefined;
}

export function readMetricFormat(value: unknown): MetricFormat | undefined {
  return value === 'currency' || value === 'number' || value === 'percentage' || value === 'date' || value === 'duration'
    ? value
    : undefined;
}

export function readWidthRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, width]) => {
    const cssWidth = readCssLength(width);
    return cssWidth ? [[key, cssWidth]] : [];
  }));
}

export function readSortDirection(value: unknown): SortDirection | undefined {
  return value === 'asc' || value === 'desc' ? value : undefined;
}

export function readTone(value: unknown): DashboardTone | undefined {
  return value === 'danger' || value === 'neutral' || value === 'success' || value === 'warning' ? value : undefined;
}

export function readClassList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(readClassList);
  const className = readString(value);
  return className ? [safeClassToken(className)] : [];
}

export function readStyle(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const allowed = new Set(['background', 'backgroundColor', 'borderColor', 'color', 'fontWeight']);
  return Object.fromEntries(Object.entries(value).flatMap(([key, styleValue]) =>
    allowed.has(key) && (typeof styleValue === 'string' || typeof styleValue === 'number')
      ? [[key, String(styleValue)]]
      : []
  ));
}

export function safeClassToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
}

function numericCompare(left: unknown, right: unknown, compare: (left: number, right: number) => boolean): boolean {
  const leftNumeric = numericValueOrNull(left);
  const rightNumeric = numericValueOrNull(right);
  return leftNumeric !== null && rightNumeric !== null && compare(leftNumeric, rightNumeric);
}

function comparableValue(value: unknown): number | string {
  const numeric = numericValueOrNull(value);
  return numeric ?? String(value ?? '').toLowerCase();
}

function listValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  return [];
}
