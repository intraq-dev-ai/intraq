import { formatTableDatePattern } from './table-date-pattern-format';

export function formatDatePattern(date: Date, pattern: string, timeZone?: string): string {
  return formatTableDatePattern(date, pattern, timeZone);
}
