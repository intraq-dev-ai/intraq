import type { DashboardFilter } from '../types';
import type { DateRangeValue } from './date-range-values';

export type RangeDisplayMode = 'button' | 'datetime-fields' | 'inline' | 'range-picker';
export type RangeFieldDisplayFormat = 'browser' | 'dmy' | 'iso';

export function parseRangeDisplayMode(value: unknown): RangeDisplayMode {
  const raw = readString(value)?.toLowerCase();
  if (raw === 'inline' || raw === 'inputs' || raw === 'fields') return 'inline';
  if (raw === 'datetime-fields' || raw === 'date-time-fields' || raw === 'split-date-time' || raw === 'datetime') return 'datetime-fields';
  if (raw === 'range-picker' || raw === 'range' || raw === 'split') return 'range-picker';
  return 'button';
}

export function dateRangeDisplayMode(filter: DashboardFilter): RangeDisplayMode {
  return parseRangeDisplayMode(filter.config?.dateRangeDisplayMode ?? filter.config?.rangeDisplayMode ?? filter.config?.dateRangeMode);
}

export function periodRangeDisplayMode(filter: DashboardFilter): RangeDisplayMode {
  return parseRangeDisplayMode(filter.config?.periodRangeDisplayMode ?? filter.config?.rangeDisplayMode ?? filter.config?.dateRangeDisplayMode);
}

export function rangePickerTriggerStyle(mode: RangeDisplayMode): 'button' | 'range-fields' {
  return mode === 'range-picker' ? 'range-fields' : 'button';
}

export function dateRangeFieldDisplayFormat(filter: DashboardFilter): RangeFieldDisplayFormat {
  const raw = readString(filter.config?.dateRangeFieldDisplayFormat ?? filter.config?.rangeFieldDisplayFormat ?? filter.config?.dateRangeDisplayFormat)?.toLowerCase();
  if (raw === 'dmy' || raw === 'dd/mm/yyyy' || raw === 'legacy') return 'dmy';
  if (raw === 'iso' || raw === 'yyyy-mm-dd') return 'iso';
  return 'browser';
}

export function dateRangeStartFieldLabel(filter: DashboardFilter): string {
  return readString(filter.config?.dateRangeStartFieldLabel ?? filter.config?.rangeStartFieldLabel ?? filter.config?.startFieldLabel) ?? 'Start';
}

export function dateRangeEndFieldLabel(filter: DashboardFilter): string {
  return readString(filter.config?.dateRangeEndFieldLabel ?? filter.config?.rangeEndFieldLabel ?? filter.config?.endFieldLabel) ?? 'End';
}

export function dateRangeSeparatorLabel(filter: DashboardFilter): string {
  return readString(filter.config?.dateRangeSeparatorLabel ?? filter.config?.rangeSeparatorLabel) ?? 'to';
}

export function datePickerInputType(filter: DashboardFilter): 'date' | 'datetime-local' {
  return filter.config?.includeTime === true ? 'datetime-local' : 'date';
}

export function datePickerInputValue(filter: DashboardFilter): string {
  const value = String(currentFilterValue(filter) ?? filter.config?.defaultValue ?? '');
  if (!value) return '';
  if (datePickerInputType(filter) === 'date') return value.slice(0, 10);
  return normalizeDateTimeLocalValue(value);
}

export function datePickerDisplayMode(filter: DashboardFilter): 'split-date-time' | 'native' {
  const raw = readString(filter.config?.datePickerDisplayMode ?? filter.config?.datePickerStyle ?? filter.config?.datePickerTheme)?.toLowerCase() ?? '';
  if (raw === 'split-date-time' || raw === 'separate-date-time' || raw === 'datetime-fields' || raw === 'date-time-fields' || raw === 'kendo') return 'split-date-time';
  return 'native';
}

export function normalizeDateTimeLocalValue(value: string): string {
  const normalized = value.trim().replace(' ', 'T').replace(/Z$/i, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `${normalized}T00:00`;
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?/);
  return match?.[1] ?? normalized;
}

export function dateRangeValue(filter: DashboardFilter): DateRangeValue {
  const value = currentFilterValue(filter);
  const config = filter.config ?? {};
  const startFromConfig = readString(config.startDate ?? config.fromDate ?? config.defaultStartDate);
  const endFromConfig = readString(config.endDate ?? config.toDate ?? config.defaultEndDate);
  if (Array.isArray(value) && value.length >= 2) {
    return { endDate: String(value[1] ?? ''), includeTime: config.includeTime === true, startDate: String(value[0] ?? '') };
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const startDate = readString(record.startDate ?? record.start ?? record.from);
    const endDate = readString(record.endDate ?? record.end ?? record.to);
    if (startDate || endDate) return { endDate: endDate ?? '', includeTime: config.includeTime === true, startDate: startDate ?? '' };
  }
  if (startFromConfig || endFromConfig) {
    return { endDate: endFromConfig ?? '', includeTime: config.includeTime === true, startDate: startFromConfig ?? '' };
  }
  return dateRangeFromLastToken(normalizeLastToken(String(value ?? config.defaultValue ?? '30 days')));
}

function currentFilterValue(filter: DashboardFilter): unknown {
  return filter.value ?? filter.config?.value;
}

function dateRangeFromLastToken(value: string): DateRangeValue {
  const days = Number(value.match(/^(\d+)\s+days$/i)?.[1] ?? '30');
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(1, days) + 1);
  return {
    endDate: formatInputDate(end),
    includeTime: false,
    startDate: formatInputDate(start)
  };
}

function formatInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeLastToken(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.toLowerCase().match(/^last[_\s-]*(\d+)(?:[_\s-]*(day|days|d|week|weeks|w|month|months|m|year|years|y))?$/);
  if (!match) return trimmed;
  const amount = Number(match[1] ?? '0');
  const unit = match[2] ?? 'days';
  const days = unit.startsWith('w') ? amount * 7 : unit.startsWith('m') ? amount * 30 : unit.startsWith('y') ? amount * 365 : amount;
  return `${days} days`;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
