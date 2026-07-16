import type { MetricFormat } from './formatting';
import { isRecord, readAggregationType } from './view-model-config';
import { readCssLength } from './view-model-runtime';
import type { DashboardTableCellConfig, DashboardTableColumn } from './view-model-types';

export function formatPatch(format: MetricFormat | undefined): { format?: MetricFormat } {
  return format ? { format } : {};
}

export function numberPatch(key: 'maxValue' | 'target', value: unknown): { maxValue?: number; target?: number } {
  return typeof value === 'number' && Number.isFinite(value) ? { [key]: value } : {};
}

export function alignPatch(value: unknown): Pick<DashboardTableColumn, 'align'> {
  return value === 'left' || value === 'center' || value === 'right' ? { align: value } : {};
}

export function sortablePatch(value: unknown): Pick<DashboardTableColumn, 'sortable'> {
  return typeof value === 'boolean' ? { sortable: value } : {};
}

export function totalAggregationPatch(value: unknown): Pick<DashboardTableColumn, 'totalAggregation'> {
  const totalAggregation = readAggregationType(value);
  return totalAggregation ? { totalAggregation } : {};
}

export function widthPatch(value: unknown): Pick<DashboardTableColumn, 'width'> {
  const width = readCssLength(value);
  return width ? { width } : {};
}

export function colorPatch(key: 'barColor' | 'progressColor' | 'sparklineColor', value: unknown): Pick<DashboardTableCellConfig, typeof key> {
  const color = readCssColor(value);
  return color ? { [key]: color } : {};
}

export function cssVariable(name: string, value: string | undefined): Record<string, string> {
  return value ? { [name]: value } : {};
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readColumnFormat(value: unknown): MetricFormat | undefined {
  if (value === 'currency' || value === 'number' || value === 'percentage' || value === 'date' || value === 'duration') return value;
  if (!isRecord(value)) return undefined;
  if (value.style === 'currency') return 'currency';
  if (value.style === 'percent' || value.style === 'percentage') return 'percentage';
  if (value.style === 'date') return 'date';
  if (value.style === 'decimal' || value.style === 'number') return 'number';
  return undefined;
}

export function readCssColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const palette: Record<string, string> = {
    blue: '#3b82f6',
    green: '#22c55e',
    indigo: '#6366f1',
    orange: '#f97316',
    pink: '#ec4899',
    purple: '#8b5cf6',
    red: '#ef4444',
    teal: '#14b8a6',
    yellow: '#eab308'
  };
  if (palette[trimmed]) return palette[trimmed];
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) || /^rgba?\([^)]+\)$/.test(trimmed) || /^hsla?\([^)]+\)$/.test(trimmed) ? trimmed : undefined;
}
