import type {
  DashboardFilter,
  VisualizationFilterIntent
} from '../types';
import { periodDerivedValues } from '../components/period-filter-values';

export interface FilterEntry {
  filter: DashboardFilter;
  index: number;
  order: number;
}

export type FilterFamily = 'interactive' | 'parameter' | 'static';

export function dateRangeFromLastToken(value: unknown): { end: string; start: string } | null {
  const normalized = normalizeLastDateToken(value);
  if (typeof normalized !== 'string') return null;
  const days = Number(normalized.match(/^(\d+)\s+days$/i)?.[1] ?? '');
  if (!Number.isFinite(days) || days <= 0) return null;
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - Math.floor(days) + 1);
  return { start: formatInputDate(start), end: formatInputDate(end) };
}

export function normalizeFilterValue(filter: DashboardFilter): unknown {
  const operator = filterOperator(readString(filter.operator ?? filter.config?.operator) ?? '');
  if (isPeriodFilter(filter)) {
    const derived = periodDerivedValues(filter);
    return [derived.startDate, derived.endDate];
  }
  if (operator === 'between') return normalizeRangeValue(filter);
  if (operator === 'last') return normalizeLastDateToken(filter.value ?? filter.config?.value);
  return filter.value ?? filter.config?.value;
}

export function normalizeRangeValue(filter: DashboardFilter): unknown {
  const value = filter.value ?? filter.config?.value;
  const startDate = filter.config?.startDate ?? filter.config?.fromDate;
  const endDate = filter.config?.endDate ?? filter.config?.toDate;
  if (Array.isArray(value)) return value.length >= 2 ? [value[0], value[1]] : value;
  if (isRecord(value)) {
    const range = isRecord(value.range) ? value.range : value;
    const start = range.start ?? range.from ?? range.startDate ?? range.fromDate ?? range.min;
    const end = range.end ?? range.to ?? range.endDate ?? range.toDate ?? range.max;
    if (start !== undefined || end !== undefined) return [start, end];
  }
  if (startDate !== undefined || endDate !== undefined) return [startDate, endDate];
  return value;
}

export function filterOperator(value: string): VisualizationFilterIntent['operator'] {
  const raw = value.trim().toLowerCase();
  const aliases: Record<string, VisualizationFilterIntent['operator']> = {
    '=': 'equals',
    '==': 'equals',
    '!=': 'notEquals',
    '<>': 'notEquals',
    '>=': 'greaterThanOrEqual',
    '<=': 'lessThanOrEqual',
    isnot: 'notEquals',
    isblank: 'isNull',
    isempty: 'isNull',
    isnotblank: 'isNotNull',
    isnotempty: 'isNotNull',
    notequal: 'notEquals',
    notequals: 'notEquals',
    notcontains: 'notContains',
    notin: 'notIn',
    startswith: 'startsWith',
    endswith: 'endsWith',
    gte: 'greaterThanOrEqual',
    gt: 'greaterThan',
    lte: 'lessThanOrEqual',
    lt: 'lessThan',
    after: 'greaterThan',
    before: 'lessThan'
  };
  const aliased = aliases[raw.replace(/\s+/g, '')];
  if (aliased) return aliased;
  const normalized = raw.replace(/[\s_-]+(.)/g, (_, letter: string) => letter.toUpperCase());
  if (
    normalized === 'equals'
    || normalized === 'notEquals'
    || normalized === 'contains'
    || normalized === 'notContains'
    || normalized === 'startsWith'
    || normalized === 'endsWith'
    || normalized === 'between'
    || normalized === 'in'
    || normalized === 'notIn'
    || normalized === 'isNull'
    || normalized === 'isNotNull'
    || normalized === 'last'
    || normalized === 'greaterThan'
    || normalized === 'greaterThanOrEqual'
    || normalized === 'lessThan'
    || normalized === 'lessThanOrEqual'
  ) {
    return normalized;
  }
  return 'equals';
}

export function operatorDoesNotNeedValue(operator: VisualizationFilterIntent['operator']): boolean {
  return operator === 'isNull' || operator === 'isNotNull';
}

export function isEmptyFilterValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized.length === 0 || normalized === 'all' || normalized === 'any' || normalized === '__all__';
  }
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyFilterValue);
  return false;
}

export function filterFamily(filter: DashboardFilter): FilterFamily {
  const config = filter.config ?? {};
  const raw = String(filter.type ?? config.type ?? '').trim().toLowerCase();
  if (raw === 'static' || raw === 'system' || config.static === true || config.isStatic === true) return 'static';
  if (raw.includes('parameter') || config.parameterName || config.isParameter === true) return 'parameter';
  return 'interactive';
}

export function entryHasValue(entry: FilterEntry): boolean {
  const operator = filterOperator(readString(entry.filter.operator ?? entry.filter.config?.operator) ?? '');
  return operatorDoesNotNeedValue(operator) || !isEmptyFilterValue(normalizeFilterValue(entry.filter));
}

export function readFilterField(filter: DashboardFilter): string {
  return readString(filter.field ?? filter.config?.field) ?? '';
}

export function priorityEnabled(filter: DashboardFilter): boolean {
  return filter.priorityEnabled === true || filter.config?.priorityEnabled === true;
}

export function priorityMode(filter: DashboardFilter): string {
  return String(filter.priorityMode ?? filter.config?.priorityMode ?? 'combine').trim().toLowerCase();
}

export function comparePriorityEntries(a: FilterEntry, b: FilterEntry): number {
  return readNumber(b.filter.priority ?? b.filter.config?.priority, 0)
    - readNumber(a.filter.priority ?? a.filter.config?.priority, 0)
    || a.order - b.order
    || a.index - b.index;
}

export function isDateLikeFilter(filter: DashboardFilter | undefined): boolean {
  if (!filter) return false;
  const field = readFilterField(filter).toLowerCase();
  const visualType = readString(filter.config?.type ?? filter.config?.filterType)?.toLowerCase() ?? '';
  const fieldType = readString(filter.config?.fieldType)?.toLowerCase() ?? '';
  const operator = readString(filter.operator ?? filter.config?.operator)?.toLowerCase() ?? '';
  return ['date', 'daterange', 'datepicker', 'datetime', 'timestamp'].includes(visualType)
    || fieldType.includes('date')
    || fieldType.includes('time')
    || operator === 'between'
    || /(date|time|timestamp|datetime|_dt$|_at$)/.test(field);
}

export function isDatePickerFilter(filter: DashboardFilter | undefined): boolean {
  if (!filter) return false;
  const rawType = readString(filter.config?.inputType)
    ?? readString(filter.config?.filterType)
    ?? readString(filter.config?.type)
    ?? readString(filter.type)
    ?? '';
  const normalized = rawType.trim().replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  return ['date', 'datepicker', 'date-picker', 'date_picker'].includes(normalized);
}

export function isPeriodFilter(filter: DashboardFilter | undefined): boolean {
  if (!filter) return false;
  const rawType = readString(filter.config?.inputType)
    ?? readString(filter.config?.filterType)
    ?? readString(filter.config?.type)
    ?? readString(filter.type)
    ?? '';
  const normalized = rawType.trim().replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  return ['period', 'periodfilter', 'period-filter', 'period_filter'].includes(normalized)
    || readString(filter.operator ?? filter.config?.operator)?.toLowerCase() === 'period';
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLastDateToken(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  const aliases: Record<string, string> = { lastweek: '7 days', lastmonth: '30 days', lastquarter: '90 days', lastyear: '365 days' };
  const alias = aliases[normalized.replace(/[\s_-]+/g, '')];
  if (alias) return alias;
  const match = normalized.match(/^last[_\s-]*(\d+)(?:[_\s-]*(day|days|d|week|weeks|w|month|months|m|year|years|y))?$/)
    ?? normalized.match(/^(\d+)[_\s-]*(day|days|d|week|weeks|w|month|months|m|year|years|y)$/);
  if (match) return `${daysForLastToken(Number(match[1] ?? '0'), match[2])} days`;
  return trimmed;
}

function daysForLastToken(amount: number, unit = 'days'): number {
  if (unit.startsWith('w')) return amount * 7;
  if (unit.startsWith('m')) return amount * 30;
  if (unit.startsWith('y')) return amount * 365;
  return amount;
}

function formatInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
