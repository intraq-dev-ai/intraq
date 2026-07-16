import type { DashboardFilter } from '../types';
import type { DateRangeValue } from './date-range-values';

export type PeriodUnit = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'range' | 'custom';

export interface PeriodFilterOption {
  id: string;
  icon?: string;
  label: string;
  unit: PeriodUnit;
  rangeFrequency?: string;
  rangeType?: string | number;
  rangeTypeText?: string;
  showNavigation?: boolean;
  showSummary?: boolean;
  showToolbar?: boolean;
}

export interface PeriodFilterValue {
  endDate: string;
  period: string;
  selectedDate: string;
  startDate: string;
}

export interface PeriodDerivedValues extends PeriodFilterValue {
  endDateExclusive: string;
  endDateExclusiveOnly: string;
  endDateOnly: string;
  periodLabel: string;
  rangeFrequency: string;
  rangeType: string | number;
  rangeTypeText: string;
  selectedDay: string;
  startDateOnly: string;
}

const DEFAULT_DAY_OPTION: PeriodFilterOption = { id: 'day', label: 'Day', unit: 'day', rangeType: 0, rangeTypeText: 'day', rangeFrequency: 'Hourly' };

const DEFAULT_OPTIONS: PeriodFilterOption[] = [
  DEFAULT_DAY_OPTION,
  { id: 'week', label: 'Week', unit: 'week', rangeType: 1, rangeTypeText: 'week', rangeFrequency: 'Daily' },
  { id: 'month', label: 'Month', unit: 'month', rangeType: 2, rangeTypeText: 'month', rangeFrequency: 'Daily' },
  { id: 'range', label: 'Range', unit: 'range', rangeType: 'range', rangeTypeText: 'range', rangeFrequency: 'Daily' }
];

export function periodOptionsFromConfig(config: Record<string, unknown> | undefined): PeriodFilterOption[] {
  const configured = Array.isArray(config?.periodOptions) ? config.periodOptions : [];
  const parsed = configured.flatMap(item => {
    if (!isRecord(item)) return [];
    const id = readString(item.id ?? item.value ?? item.key);
    const label = readString(item.label ?? item.name) ?? id;
    const unit = normalizeUnit(readString(item.unit ?? item.type ?? item.period) ?? id ?? '');
    if (!id || !label || !unit) return [];
    const showToolbar = readBoolean(
      item.showToolbar
      ?? item.showToolbarBody
      ?? item.toolbar
      ?? item.showToolbarContent
      ?? item.showPeriodToolbar
    );
    const showNavigation = readBoolean(
      item.showNavigation
      ?? item.navigation
      ?? item.showPeriodNavigation
      ?? item.showToolbarNavigation
    );
    const showSummary = readBoolean(
      item.showSummary
      ?? item.summary
      ?? item.showToolbarSummary
      ?? item.showPeriodSummary
    );
    return [{
      id,
      ...(readString(item.icon) ? { icon: readString(item.icon) as string } : {}),
      label,
      unit,
      ...(item.rangeType !== undefined ? { rangeType: item.rangeType as string | number } : {}),
      ...(readString(item.rangeTypeText) ? { rangeTypeText: readString(item.rangeTypeText) as string } : {}),
      ...(readString(item.rangeFrequency) ? { rangeFrequency: readString(item.rangeFrequency) as string } : {}),
      ...(showNavigation === undefined ? {} : { showNavigation }),
      ...(showSummary === undefined ? {} : { showSummary }),
      ...(showToolbar === undefined ? {} : { showToolbar })
    }];
  });
  return parsed.length > 0 ? parsed : DEFAULT_OPTIONS;
}

export function defaultPeriodOptions(): PeriodFilterOption[] {
  return DEFAULT_OPTIONS.map(option => ({ ...option }));
}

export function periodFilterValue(filter: DashboardFilter): PeriodFilterValue {
  return periodFilterValueFrom(filter.value ?? filter.config?.value, filter.config);
}

export function periodFilterValueFrom(value: unknown, config: Record<string, unknown> | undefined): PeriodFilterValue {
  const options = periodOptionsFromConfig(config);
  const defaultPeriod = readString(config?.defaultPeriod) ?? options[0]?.id ?? 'day';
  if (isRecord(value)) {
    const period = readString(value.period) ?? defaultPeriod;
    const selectedDate = readDate(value.selectedDate ?? value.date ?? value.startDate ?? value.start) ?? todayDatePart();
    const startDate = readString(value.startDate ?? value.start);
    const endDate = readString(value.endDate ?? value.end);
    if (startDate && endDate) return { period, selectedDate, startDate, endDate };
    return buildPeriodFilterValue(period, selectedDate, config);
  }
  if (Array.isArray(value) && value.length >= 2) {
    const startDate = String(value[0] ?? '');
    const endDate = String(value[1] ?? '');
    return {
      period: defaultPeriod,
      selectedDate: datePart(startDate) || todayDatePart(),
      startDate,
      endDate
    };
  }
  const selectedDate = readDate(config?.selectedDate ?? config?.startDate ?? config?.defaultStartDate) ?? todayDatePart();
  return buildPeriodFilterValue(defaultPeriod, selectedDate, config);
}

export function buildPeriodFilterValue(period: string, selectedDate: string, config: Record<string, unknown> | undefined): PeriodFilterValue {
  const options = periodOptionsFromConfig(config);
  const option = options.find(item => item.id === period) ?? options[0] ?? DEFAULT_DAY_OPTION;
  const selected = parseDate(selectedDate) ?? new Date();
  const includeTime = config?.includeTime !== false;
  const range = periodRange(option.unit, selected, config);
  return {
    period: option.id,
    selectedDate: formatDatePart(selected),
    startDate: formatOutput(range.start, includeTime, 'start'),
    endDate: formatOutput(range.end, includeTime, 'end')
  };
}

export function changePeriod(value: PeriodFilterValue, period: string, config: Record<string, unknown> | undefined): PeriodFilterValue {
  const current = periodFilterValueFrom(value, config);
  const option = periodOptionsFromConfig(config).find(item => item.id === period);
  if (option?.unit === 'range' || option?.unit === 'custom') return { ...current, period };
  return buildPeriodFilterValue(period, current.selectedDate, config);
}

export function changeSelectedDate(value: PeriodFilterValue, selectedDate: string, config: Record<string, unknown> | undefined): PeriodFilterValue {
  const current = periodFilterValueFrom(value, config);
  return buildPeriodFilterValue(current.period, selectedDate, config);
}

export function changeRange(value: PeriodFilterValue, range: DateRangeValue): PeriodFilterValue {
  const current = periodFilterValueFrom(value, {});
  return {
    ...current,
    period: current.period,
    selectedDate: datePart(range.startDate) || current.selectedDate,
    startDate: range.startDate,
    endDate: range.endDate
  };
}

export function shiftPeriodFilterValue(value: PeriodFilterValue, config: Record<string, unknown> | undefined, direction: -1 | 1): PeriodFilterValue {
  const current = periodFilterValueFrom(value, config);
  const option = periodOptionsFromConfig(config).find(item => item.id === current.period) ?? DEFAULT_DAY_OPTION;
  const selected = parseDate(current.selectedDate) ?? new Date();
  const shifted = shiftDate(selected, shiftAmount(option.unit, direction));
  return buildPeriodFilterValue(current.period, formatDatePart(shifted), config);
}

export function periodDisplayValue(value: PeriodFilterValue, config: Record<string, unknown> | undefined): string {
  const current = periodFilterValueFrom(value, config);
  const option = periodOptionsFromConfig(config).find(item => item.id === current.period) ?? DEFAULT_DAY_OPTION;
  const start = parseDate(current.startDate);
  const end = parseDate(current.endDate);
  if (!start || !end) return 'Select period';
  if (option.unit === 'day') return displayDate(start);
  if (option.unit === 'week') return `${displayDate(start)} - ${displayDate(end)}`;
  if (option.unit === 'month') return `${displayDate(start)} - ${displayDate(end)}`;
  if (option.unit === 'quarter') return `${option.label} ${quarterNumber(start, config)} ${start.getFullYear()}`;
  if (option.unit === 'year') return String(start.getFullYear());
  return `${displayDate(start)} - ${displayDate(end)}`;
}

export function periodDerivedValues(filter: DashboardFilter): PeriodDerivedValues {
  const value = periodFilterValue(filter);
  const options = periodOptionsFromConfig(filter.config);
  const option = options.find(item => item.id === value.period) ?? options[0] ?? DEFAULT_DAY_OPTION;
  const rangeType = option.rangeType ?? value.period;
  const rangeTypeText = option.rangeTypeText ?? option.id;
  const endDateExclusiveOnly = nextDatePart(value.endDate);
  return {
    ...value,
    endDateExclusive: endDateExclusiveOnly ? `${endDateExclusiveOnly}T00:00:00` : '',
    endDateExclusiveOnly,
    endDateOnly: datePart(value.endDate),
    periodLabel: option.label,
    rangeFrequency: option.rangeFrequency ?? '',
    rangeType,
    rangeTypeText,
    selectedDay: datePart(value.selectedDate) || datePart(value.startDate),
    startDateOnly: datePart(value.startDate)
  };
}

export function periodParameterValue(role: string, derived: PeriodDerivedValues): unknown {
  const normalized = role.trim().replace(/[\s_-]+/g, '').toLowerCase();
  const values: Record<string, unknown> = {
    end: derived.endDate,
    enddate: derived.endDate,
    enddatetime: derived.endDate,
    enddateexclusive: derived.endDateExclusive,
    enddateexclusiveonly: derived.endDateExclusiveOnly,
    enddateonly: derived.endDateOnly,
    endexclusive: derived.endDateExclusive,
    endexclusiveonly: derived.endDateExclusiveOnly,
    from: derived.startDate,
    fromdate: derived.startDate,
    fromdateonly: derived.startDateOnly,
    period: derived.period,
    periodlabel: derived.periodLabel,
    rangefrequency: derived.rangeFrequency,
    rangetype: derived.rangeType,
    rangetypetext: derived.rangeTypeText,
    selected: derived.selectedDate,
    selecteddate: derived.selectedDate,
    selectedday: derived.selectedDay,
    start: derived.startDate,
    startdate: derived.startDate,
    startdatetime: derived.startDate,
    startdateonly: derived.startDateOnly,
    to: derived.endDate,
    todate: derived.endDate,
    todateexclusive: derived.endDateExclusive,
    todateexclusiveonly: derived.endDateExclusiveOnly,
    todateonly: derived.endDateOnly
  };
  return values[normalized];
}

function periodRange(unit: PeriodUnit, selected: Date, config: Record<string, unknown> | undefined): { end: Date; start: Date } {
  if (unit === 'week') return weekRange(selected, readNumber(config?.weekStartsOn, 1));
  if (unit === 'month') return monthRange(selected);
  if (unit === 'quarter') return quarterRange(selected, readNumber(config?.fiscalStartMonth, 1));
  if (unit === 'year') return yearRange(selected, readNumber(config?.fiscalStartMonth, 1));
  return { start: startOfDay(selected), end: endOfDay(selected) };
}

function weekRange(selected: Date, weekStartsOn: number): { end: Date; start: Date } {
  const start = startOfDay(selected);
  const day = start.getDay();
  const offset = (day - Math.max(0, Math.min(6, weekStartsOn)) + 7) % 7;
  start.setDate(start.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end: endOfDay(end) };
}

function monthRange(selected: Date): { end: Date; start: Date } {
  return {
    start: new Date(selected.getFullYear(), selected.getMonth(), 1),
    end: endOfDay(new Date(selected.getFullYear(), selected.getMonth() + 1, 0))
  };
}

function quarterRange(selected: Date, fiscalStartMonth: number): { end: Date; start: Date } {
  const fiscalStart = Math.max(1, Math.min(12, fiscalStartMonth)) - 1;
  const offset = (selected.getMonth() - fiscalStart + 12) % 12;
  const quarterStartMonth = selected.getMonth() - (offset % 3);
  return {
    start: new Date(selected.getFullYear(), quarterStartMonth, 1),
    end: endOfDay(new Date(selected.getFullYear(), quarterStartMonth + 3, 0))
  };
}

function yearRange(selected: Date, fiscalStartMonth: number): { end: Date; start: Date } {
  const fiscalStart = Math.max(1, Math.min(12, fiscalStartMonth)) - 1;
  const year = selected.getMonth() >= fiscalStart ? selected.getFullYear() : selected.getFullYear() - 1;
  return {
    start: new Date(year, fiscalStart, 1),
    end: endOfDay(new Date(year + 1, fiscalStart, 0))
  };
}

function shiftAmount(unit: PeriodUnit, direction: -1 | 1): { amount: number; unit: 'day' | 'month' | 'year' } {
  if (unit === 'week') return { unit: 'day', amount: direction * 7 };
  if (unit === 'month') return { unit: 'month', amount: direction };
  if (unit === 'quarter') return { unit: 'month', amount: direction * 3 };
  if (unit === 'year') return { unit: 'year', amount: direction };
  return { unit: 'day', amount: direction };
}

function shiftDate(date: Date, shift: { amount: number; unit: 'day' | 'month' | 'year' }): Date {
  const next = new Date(date);
  if (shift.unit === 'day') next.setDate(next.getDate() + shift.amount);
  if (shift.unit === 'month') next.setMonth(next.getMonth() + shift.amount);
  if (shift.unit === 'year') next.setFullYear(next.getFullYear() + shift.amount);
  return next;
}

function normalizeUnit(value: string): PeriodUnit | null {
  const normalized = value.trim().replace(/[\s_-]+/g, '').toLowerCase();
  if (normalized === 'day' || normalized === 'daily') return 'day';
  if (normalized === 'week' || normalized === 'weekly') return 'week';
  if (normalized === 'month' || normalized === 'monthly') return 'month';
  if (normalized === 'quarter' || normalized === 'quarterly') return 'quarter';
  if (normalized === 'year' || normalized === 'yearly' || normalized === 'financialyear' || normalized === 'fiscalyear') return 'year';
  if (normalized === 'range') return 'range';
  if (normalized === 'custom') return 'custom';
  return null;
}

function quarterNumber(date: Date, config: Record<string, unknown> | undefined): number {
  const fiscalStart = readNumber(config?.fiscalStartMonth, 1) - 1;
  return Math.floor(((date.getMonth() - fiscalStart + 12) % 12) / 3) + 1;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
}

function formatOutput(date: Date, includeTime: boolean, boundary: 'end' | 'start'): string {
  const part = formatDatePart(date);
  if (!includeTime) return part;
  return `${part}T${boundary === 'end' ? '23:59:59' : '00:00:00'}`;
}

function formatDatePart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function readDate(value: unknown): string | undefined {
  return readString(value)?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
}

function datePart(value: string): string {
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
}

function nextDatePart(value: string): string {
  const date = parseDate(value);
  if (!date) return '';
  date.setDate(date.getDate() + 1);
  return formatDatePart(date);
}

function parseDate(value: string): Date | null {
  const part = datePart(value);
  if (!part) return null;
  const [year, month, day] = part.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function todayDatePart(): string {
  return formatDatePart(new Date());
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (value === true || value === false) return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
