import type { BaseChartOptions } from './chart/options';
import { formatTableDatePartsPattern } from './table-date-pattern-format';
import { parseReportDate, reportDateParts } from './report-time-zone';

export function formatXAxisLabels(
  labels: string[],
  options: BaseChartOptions,
  parameterValues: Record<string, unknown> | undefined
): string[] {
  const customPatterns = resolveXAxisDateFormats(options, parameterValues);
  if (!options.xAxisDateLabelMode && !customPatterns.defaultPattern && !customPatterns.midnightPattern) return labels;
  const parsed = labels.map(label => parseDateLabel(label, options.timeZone));
  if (parsed.every(item => !item)) return labels;
  if (customPatterns.defaultPattern || customPatterns.midnightPattern) {
    return labels.map((label, index) => formatDateLabelPattern(parsed[index], label, customPatterns));
  }
  const mode = options.xAxisDateLabelMode === 'auto-period'
    ? inferDateLabelMode(parsed)
    : options.xAxisDateLabelMode;
  return labels.map((label, index) => formatDateLabel(parsed[index], label, mode));
}

function resolveXAxisDateFormats(
  options: BaseChartOptions,
  parameterValues: Record<string, unknown> | undefined
): { defaultPattern: string | undefined; midnightPattern: string | undefined } {
  const parameter = options.xAxisDateFormatParameter;
  if (parameter && parameterValues && (
    Object.keys(options.xAxisDateFormats).length > 0
    || Object.keys(options.xAxisDateMidnightFormats).length > 0
  )) {
    const value = parameterValues[parameter];
    const key = value === undefined || value === null ? '' : String(value);
    return {
      defaultPattern: options.xAxisDateFormats[key] ?? options.xAxisDateFormat,
      midnightPattern: options.xAxisDateMidnightFormats[key] ?? options.xAxisDateMidnightFormat
    };
  }
  return {
    defaultPattern: options.xAxisDateFormat,
    midnightPattern: options.xAxisDateMidnightFormat
  };
}

function inferDateLabelMode(parsed: Array<ParsedDateLabel | null>): 'date' | 'datetime' | 'time' {
  const valid = parsed.filter((item): item is ParsedDateLabel => Boolean(item));
  if (valid.length === 0) return 'datetime';
  const uniqueDates = new Set(valid.map(item => item.dateKey));
  const hasTime = valid.some(item => item.hasTime);
  return uniqueDates.size <= 1 && hasTime ? 'time' : 'date';
}

interface ParsedDateLabel {
  dateKey: string;
  day: number;
  hasTime: boolean;
  hour: number;
  minute: number;
  month: number;
  year: number;
}

function parseDateLabel(label: string, timeZone?: string): ParsedDateLabel | null {
  const trimmed = label.trim();
  if (hasExplicitTimeZone(trimmed)) {
    const date = parseReportDate(trimmed);
    return date ? parsedDateLabelFromReportDate(date, true, timeZone) : null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::(\d{2}))?(?::\d{2})?)?/.exec(trimmed);
  if (!match) return parseFlexibleDateLabel(trimmed, timeZone);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return {
    dateKey: `${match[1]}-${match[2]}-${match[3]}`,
    day,
    hasTime: match[4] !== undefined,
    hour,
    minute,
    month,
    year
  };
}

function parseFlexibleDateLabel(label: string, timeZone?: string): ParsedDateLabel | null {
  if (!looksDateLike(label)) return null;
  const numeric = parseNumericFlexibleDateLabel(label);
  if (numeric) return numeric;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(label)) return null;
  const timestamp = Date.parse(label);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return parsedDateLabelFromReportDate(date, /\d{1,2}:\d{2}/.test(label), timeZone);
}

function parseNumericFlexibleDateLabel(label: string): ParsedDateLabel | null {
  const match = /^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})(?:[ T](\d{1,2})(?::(\d{2}))?)?/.exec(label);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  if (![first, second, third, hour, minute].every(Number.isFinite)) return null;
  let year: number;
  let month: number;
  let day: number;
  if (String(match[1]).length === 4) {
    year = first;
    month = second;
    day = third;
  } else if (String(match[3]).length >= 2) {
    year = third < 100 ? 2000 + third : third;
    if (first > 12) {
      day = first;
      month = second;
    } else if (second > 12) {
      month = first;
      day = second;
    } else {
      return null;
    }
  } else {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return {
    dateKey: `${year}-${pad2(month)}-${pad2(day)}`,
    day,
    hasTime: match[4] !== undefined,
    hour,
    minute,
    month,
    year
  };
}

function looksDateLike(label: string): boolean {
  return /\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(label)
    || /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i.test(label)
    || /^\d{4}\s+\d{1,2}\s+\d{1,2}/.test(label);
}

function formatDateLabel(parsed: ParsedDateLabel | null, fallback: string, mode: 'date' | 'datetime' | 'time'): string {
  if (!parsed) return fallback;
  if (mode === 'time') return `${pad2(parsed.hour)}:${pad2(parsed.minute)}`;
  const date = `${pad2(parsed.day)} ${monthName(parsed.month)} ${parsed.year}`;
  return mode === 'datetime' ? `${date} ${pad2(parsed.hour)}:${pad2(parsed.minute)}` : date;
}

function formatDateLabelPattern(
  parsed: ParsedDateLabel | null,
  fallback: string,
  patterns: { defaultPattern: string | undefined; midnightPattern: string | undefined }
): string {
  if (!parsed) return fallback;
  const pattern = parsed.hour === 0 && parsed.minute === 0
    ? patterns.midnightPattern ?? patterns.defaultPattern
    : patterns.defaultPattern;
  if (!pattern) return fallback;
  return formatTableDatePartsPattern({ ...parsed, second: 0 }, pattern);
}

function hasExplicitTimeZone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function parsedDateLabelFromReportDate(date: Date, hasTime: boolean, timeZone?: string): ParsedDateLabel {
  const parts = reportDateParts(date, timeZone);
  return {
    dateKey: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
    day: parts.day,
    hasTime,
    hour: parts.hour,
    minute: parts.minute,
    month: parts.month,
    year: parts.year
  };
}

function monthName(month: number): string {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1] ?? String(month);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
