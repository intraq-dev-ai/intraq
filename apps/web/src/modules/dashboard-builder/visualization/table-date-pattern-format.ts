import { reportDateParts, type ReportDateParts } from './report-time-zone';

const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' });
const SHORT_WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });

const TOKEN_VALUES: Record<string, (parts: ReportDateParts) => string> = {
  A: parts => parts.hour >= 12 ? 'PM' : 'AM',
  D: parts => String(parts.day),
  DD: parts => pad(parts.day),
  H: parts => String(parts.hour),
  HH: parts => pad(parts.hour),
  M: parts => String(parts.month),
  MM: parts => pad(parts.month),
  MMM: parts => SHORT_MONTHS[parts.month - 1] ?? '',
  MMMM: parts => LONG_MONTHS[parts.month - 1] ?? '',
  Q: parts => `Q${Math.floor((parts.month - 1) / 3) + 1}`,
  YY: parts => String(parts.year).slice(-2),
  YYYY: parts => String(parts.year),
  a: parts => parts.hour >= 12 ? 'pm' : 'am',
  d: parts => String(parts.day),
  dd: parts => pad(parts.day),
  ddd: parts => SHORT_WEEKDAY.format(dateFromParts(parts)),
  dddd: parts => LONG_WEEKDAY.format(dateFromParts(parts)),
  h: parts => String(twelveHour(parts.hour)),
  hh: parts => pad(twelveHour(parts.hour)),
  m: parts => String(parts.minute),
  mm: parts => pad(parts.minute),
  s: parts => String(parts.second),
  ss: parts => pad(parts.second),
  yy: parts => String(parts.year).slice(-2),
  yyyy: parts => String(parts.year)
};

const TOKENS = Object.keys(TOKEN_VALUES).sort((left, right) => right.length - left.length);

export function formatTableDatePattern(date: Date, pattern: string, timeZone?: string): string {
  return formatTableDatePartsPattern(reportDateParts(date, timeZone), pattern);
}

export function formatTableDatePartsPattern(parts: ReportDateParts, pattern: string): string {
  let output = '';
  let index = 0;
  while (index < pattern.length) {
    if (pattern[index] === '[') {
      const end = pattern.indexOf(']', index + 1);
      if (end < 0) return output + pattern.slice(index + 1);
      output += pattern.slice(index + 1, end);
      index = end + 1;
      continue;
    }
    const token = TOKENS.find(candidate => pattern.startsWith(candidate, index));
    if (!token) {
      output += pattern[index];
      index += 1;
      continue;
    }
    output += TOKEN_VALUES[token](parts);
    index += token.length;
  }
  return output;
}

function dateFromParts(parts: ReportDateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function twelveHour(hours: number): number {
  const normalized = hours % 12;
  return normalized === 0 ? 12 : normalized;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}
