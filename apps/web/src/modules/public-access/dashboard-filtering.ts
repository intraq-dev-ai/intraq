import type {
  EmbedDashboardFilter,
  EmbedDashboardFilterValue,
  EmbedDataSourcePreview
} from './types';

export type PublicFilterKind = 'datePicker' | 'dateRange' | 'dropdown' | 'freeText';

export function activeDashboardFilters(filters: EmbedDashboardFilter[]): EmbedDashboardFilter[] {
  return filters.filter(filter => filter.isActive !== false && filter.field.trim().length > 0);
}

export function createFilterValues(filters: EmbedDashboardFilter[]): EmbedDashboardFilterValue[] {
  return activeDashboardFilters(filters).map(filter => {
    const kind = filterKind(filter);
    const value = formatFilterScalar(filter.value ?? filter.config.value);
    const filterValue: EmbedDashboardFilterValue = {
      filterId: filter.id,
      field: filter.field,
      type: kind,
      value
    };
    const startDate = readString(filter.startDate) ?? readString(filter.config.startDate);
    const endDate = readString(filter.endDate) ?? readString(filter.config.endDate);
    if (startDate) filterValue.startDate = startDate;
    if (endDate) filterValue.endDate = endDate;
    return filterValue;
  });
}

export function filterKind(filter: EmbedDashboardFilter): PublicFilterKind {
  const rawType = (readString(filter.config.type) ?? filter.type ?? '').toLowerCase();
  if (['date', 'datepicker', 'date_picker'].includes(rawType)) return 'datePicker';
  if (['daterange', 'date_range', 'date-range'].includes(rawType)) return 'dateRange';
  if (['text', 'freetext', 'free_text', 'search'].includes(rawType)) return 'freeText';
  return 'dropdown';
}

export function filterRows(
  rows: Array<Record<string, unknown>>,
  filters: EmbedDashboardFilter[],
  values: EmbedDashboardFilterValue[]
): Array<Record<string, unknown>> {
  const valueByFilterId = new Map(values.map(value => [value.filterId, value]));
  const activeFilters = activeDashboardFilters(filters);
  if (activeFilters.length === 0) return rows;

  return rows.filter(row => activeFilters.every(filter => {
    const filterValue = valueByFilterId.get(filter.id);
    if (!filterValue || isEmptyFilterValue(filterValue)) return true;
    if (!(filter.field in row)) return true;
    return matchesFilter(row[filter.field], filter, filterValue);
  }));
}

export function filterOptions(
  filter: EmbedDashboardFilter,
  previews: EmbedDataSourcePreview[],
  limit = 80
): string[] {
  const values = new Set<string>();
  for (const preview of previews) {
    for (const row of preview.rows) {
      const value = formatFilterScalar(row[filter.field]);
      if (value) values.add(value);
      if (values.size >= limit) return [...values].sort(labelCompare);
    }
  }
  return [...values].sort(labelCompare);
}

export function updateFilterValues(
  values: EmbedDashboardFilterValue[],
  filter: EmbedDashboardFilter,
  patch: Partial<EmbedDashboardFilterValue>
): EmbedDashboardFilterValue[] {
  const existing = values.find(value => value.filterId === filter.id);
  const nextValue: EmbedDashboardFilterValue = {
    filterId: filter.id,
    field: filter.field,
    type: filterKind(filter),
    value: '',
    ...existing,
    ...patch
  };
  const others = values.filter(value => value.filterId !== filter.id);
  return [...others, nextValue];
}

export function formatFilterScalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function matchesFilter(
  rowValue: unknown,
  filter: EmbedDashboardFilter,
  filterValue: EmbedDashboardFilterValue
): boolean {
  const kind = filterKind(filter);
  if (kind === 'dateRange') return matchesDateRange(rowValue, filterValue);
  if (kind === 'datePicker') return normalizedDate(rowValue) === normalizedDate(filterValue.value);

  const rowText = formatFilterScalar(rowValue);
  const target = filterValue.value.trim();
  if (!target || target === 'all') return true;

  const operator = (filter.operator ?? readString(filter.config.operator) ?? '').toLowerCase();
  if (operator === 'last') return matchesLastPeriod(rowValue, target);
  if (operator.includes('not')) return rowText !== target;
  if (operator.includes('contains') || kind === 'freeText') {
    return rowText.toLowerCase().includes(target.toLowerCase());
  }
  if (operator.includes('greater')) return numericValue(rowText) > numericValue(target);
  if (operator.includes('less')) return numericValue(rowText) < numericValue(target);
  return rowText === target;
}

function matchesDateRange(rowValue: unknown, filterValue: EmbedDashboardFilterValue): boolean {
  const rowDate = normalizedDate(rowValue);
  if (!rowDate) return false;
  const start = normalizedDate(filterValue.startDate);
  const end = normalizedDate(filterValue.endDate);
  if (start && rowDate < start) return false;
  if (end && rowDate > end) return false;
  return true;
}

function matchesLastPeriod(rowValue: unknown, target: string): boolean {
  const rowDate = normalizedDate(rowValue);
  if (!rowDate) return false;
  const match = /^(\d+)\s*(day|days|week|weeks|month|months)$/i.exec(target.trim());
  if (!match) return true;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return true;
  const end = new Date();
  const start = new Date(end);
  const unit = match[2]?.toLowerCase() ?? 'days';
  if (unit.startsWith('week')) {
    start.setDate(end.getDate() - amount * 7 + 1);
  } else if (unit.startsWith('month')) {
    start.setMonth(end.getMonth() - amount);
    start.setDate(start.getDate() + 1);
  } else {
    start.setDate(end.getDate() - amount + 1);
  }
  return rowDate >= isoDate(start) && rowDate <= isoDate(end);
}

function isEmptyFilterValue(value: EmbedDashboardFilterValue): boolean {
  if (value.type === 'dateRange') return !value.startDate && !value.endDate;
  return !value.value || value.value === 'all';
}

function normalizedDate(value: unknown): string {
  const text = formatFilterScalar(value);
  if (!text) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function numericValue(value: string): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function labelCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
