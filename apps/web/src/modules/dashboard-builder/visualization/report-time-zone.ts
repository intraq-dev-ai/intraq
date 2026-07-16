export const REPORT_LOCALE = 'en-AU';
export const DEFAULT_REPORT_TIME_ZONE = 'Australia/Melbourne';
export const REPORT_TIME_ZONE_LABEL = 'Sydney/Melbourne time';

export interface ReportDateParts {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
}

const NUMERIC_PART_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

export function reportDateParts(date: Date, timeZone?: string): ReportDateParts {
  const parts = numericPartFormatter(timeZone).formatToParts(date);
  return {
    day: readDatePart(parts, 'day'),
    hour: readDatePart(parts, 'hour'),
    minute: readDatePart(parts, 'minute'),
    month: readDatePart(parts, 'month'),
    second: readDatePart(parts, 'second'),
    year: readDatePart(parts, 'year')
  };
}

export function formatReportDate(
  date: Date,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
  timeZone?: string
): string {
  return new Intl.DateTimeFormat(REPORT_LOCALE, { ...options, timeZone: normalizeReportTimeZone(timeZone) }).format(date);
}

export function parseReportDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    const [, year = '0', month = '0', day = '0'] = dateOnly;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readDatePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find(part => part.type === type)?.value ?? 0);
}

export function normalizeReportTimeZone(timeZone: unknown): string {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return DEFAULT_REPORT_TIME_ZONE;
  const candidate = timeZone.trim();
  try {
    new Intl.DateTimeFormat(REPORT_LOCALE, { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return DEFAULT_REPORT_TIME_ZONE;
  }
}

function numericPartFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const normalized = normalizeReportTimeZone(timeZone);
  const existing = NUMERIC_PART_FORMATTERS.get(normalized);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat(REPORT_LOCALE, {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: normalized,
    year: 'numeric'
  });
  NUMERIC_PART_FORMATTERS.set(normalized, formatter);
  return formatter;
}
