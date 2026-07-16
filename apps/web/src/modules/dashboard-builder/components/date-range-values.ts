export type DateRangeBoundary = 'end' | 'start';

export interface DateRangeValue {
  endDate: string;
  includeTime: boolean;
  startDate: string;
}

const DATE_PART_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatDateRangeInputDate(date: Date, includeTime: boolean, boundary: DateRangeBoundary): string {
  const datePart = formatDatePart(date);
  if (!includeTime) return datePart;
  return `${datePart}T${boundary === 'end' ? '23:59' : '00:00'}`;
}

export function formatDateRangeDisplayDate(value: string): string {
  const datePart = readDatePart(value);
  if (datePart) {
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function normalizeDateRangeInputValue(value: string, includeTime: boolean, boundary: DateRangeBoundary): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const localDateTime = trimmed.match(LOCAL_DATE_TIME_PATTERN);
  if (localDateTime) {
    const datePart = localDateTime[1] ?? '';
    if (!includeTime) return datePart;
    return `${datePart}T${localDateTime[2] ?? '00'}:${localDateTime[3] ?? '00'}`;
  }

  const datePart = readDatePart(trimmed);
  if (datePart) return includeTime ? `${datePart}T${boundaryTime(boundary)}` : datePart;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return includeTime ? formatDateTimePart(parsed) : formatDatePart(parsed);
}

export function toDateRangeOutputValue(value: string, includeTime: boolean, boundary: DateRangeBoundary): string {
  const normalized = normalizeDateRangeInputValue(value, includeTime, boundary);
  if (!includeTime || !normalized) return normalized;

  const localDateTime = normalized.match(LOCAL_DATE_TIME_PATTERN);
  if (!localDateTime) return normalized;
  const seconds = boundary === 'end' ? '59' : '00';
  return `${localDateTime[1]}T${localDateTime[2]}:${localDateTime[3]}:${seconds}`;
}

export function shiftDateRangeValue(range: DateRangeValue, direction: -1 | 1): DateRangeValue {
  const start = parseLocalDateTime(range.startDate, 'start');
  const end = parseLocalDateTime(range.endDate, 'end');
  if (!start || !end || start.date.getTime() > end.date.getTime()) return range;

  const shifted = shiftedDates(start.date, end.date, direction);
  return {
    endDate: formatShiftedOutput(shifted.end, end, range.includeTime, 'end'),
    includeTime: range.includeTime,
    startDate: formatShiftedOutput(shifted.start, start, range.includeTime, 'start')
  };
}

function boundaryTime(boundary: DateRangeBoundary): string {
  return boundary === 'end' ? '23:59' : '00:00';
}

function formatDatePart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTimePart(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDatePart(date)}T${hours}:${minutes}`;
}

function readDatePart(value: string): string {
  return value.match(DATE_PART_PATTERN)?.[0] ?? '';
}

interface ParsedDateTime {
  date: Date;
  hours: string;
  minutes: string;
  seconds: string;
}

function parseLocalDateTime(value: string, boundary: DateRangeBoundary): ParsedDateTime | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const datePart = readDatePart(trimmed);
  if (!datePart) return null;

  const [year = 0, month = 0, day = 0] = datePart.split('-').map(Number);
  if (!year || !month || !day) return null;

  const localDateTime = trimmed.match(LOCAL_DATE_TIME_PATTERN);
  const [defaultHours, defaultMinutes] = boundaryTime(boundary).split(':');
  return {
    date: new Date(year, month - 1, day),
    hours: localDateTime?.[2] ?? defaultHours ?? '00',
    minutes: localDateTime?.[3] ?? defaultMinutes ?? '00',
    seconds: localDateTime?.[4] ?? (boundary === 'end' ? '59' : '00')
  };
}

function shiftedDates(start: Date, end: Date, direction: -1 | 1): { end: Date; start: Date } {
  if (isFullYearRange(start, end)) {
    return {
      end: new Date(end.getFullYear() + direction, 11, 31),
      start: new Date(start.getFullYear() + direction, 0, 1)
    };
  }

  if (isFullMonthRange(start, end)) {
    const nextMonth = start.getMonth() + direction;
    const nextYear = start.getFullYear();
    return {
      end: new Date(nextYear, nextMonth + 1, 0),
      start: new Date(nextYear, nextMonth, 1)
    };
  }

  const spanDays = Math.max(1, Math.round((dateOnly(end).getTime() - dateOnly(start).getTime()) / MS_PER_DAY) + 1);
  return {
    end: addDays(end, spanDays * direction),
    start: addDays(start, spanDays * direction)
  };
}

function isFullYearRange(start: Date, end: Date): boolean {
  return start.getMonth() === 0
    && start.getDate() === 1
    && end.getMonth() === 11
    && end.getDate() === 31
    && start.getFullYear() === end.getFullYear();
}

function isFullMonthRange(start: Date, end: Date): boolean {
  return start.getDate() === 1
    && start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
}

function formatShiftedOutput(date: Date, source: ParsedDateTime, includeTime: boolean, boundary: DateRangeBoundary): string {
  const datePart = formatDatePart(date);
  if (!includeTime) return datePart;
  const seconds = source.seconds || (boundary === 'end' ? '59' : '00');
  return `${datePart}T${source.hours}:${source.minutes}:${seconds}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
