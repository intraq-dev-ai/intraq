export type CalendarView = 'day' | 'month' | 'year';

interface CalendarDay {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  label: string;
}

interface MonthOption {
  long: string;
  short: string;
}

interface TimeOption {
  label: string;
  value: string;
}

export const MONTH_OPTIONS: MonthOption[] = [
  { short: 'Jan', long: 'January' },
  { short: 'Feb', long: 'February' },
  { short: 'Mar', long: 'March' },
  { short: 'Apr', long: 'April' },
  { short: 'May', long: 'May' },
  { short: 'Jun', long: 'June' },
  { short: 'Jul', long: 'July' },
  { short: 'Aug', long: 'August' },
  { short: 'Sep', long: 'September' },
  { short: 'Oct', long: 'October' },
  { short: 'Nov', long: 'November' },
  { short: 'Dec', long: 'December' }
];

export function buildCalendarRows(month: Date, selectedValue: string): CalendarDay[][] {
  const todayValue = formatDate(new Date());
  const firstOfMonth = startOfMonth(month);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const cursor = new Date(firstOfMonth);
  cursor.setDate(firstOfMonth.getDate() - mondayOffset);
  return Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => {
    const current = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
    const value = formatDate(current);
    return {
      date: value,
      day: current.getDate(),
      isCurrentMonth: current.getMonth() === month.getMonth(),
      isSelected: Boolean(selectedValue && value === selectedValue),
      isToday: value === todayValue,
      label: current.toLocaleDateString('en-AU', { dateStyle: 'full' })
    };
  }));
}

export function buildTimeOptions(): TimeOption[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const value = `${String(hour).padStart(2, '0')}:00`;
    return { label: formatTimeLabel(value), value };
  });
}

export function composeDateTimeValue(nextDatePart: string, nextTimePart: string, includeTime: boolean): string {
  if (!includeTime) return nextDatePart;
  return `${nextDatePart}T${nextTimePart}`;
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDisplayValue(value: string, includeTime: boolean): string {
  const parsed = parseDatePart(value);
  if (!parsed) return value;
  const date = [
    String(parsed.getDate()).padStart(2, '0'),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getFullYear())
  ].join('/');
  return includeTime ? `${date} ${formatTimeLabel(readTimePart(value))}` : date;
}

export function parseDatePart(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isExactDate(date, Number(match[1]), Number(match[2]), Number(match[3])) ? date : null;
}

export function parseUserDateTime(value: string, includeTime: boolean, fallbackModelValue: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const nativeMatch = /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(trimmed);
  if (nativeMatch) {
    const date = parseDatePart(nativeMatch[1] ?? '');
    if (!date) return null;
    if (!includeTime) return formatDate(date);
    const fallbackTime = readTimePart(fallbackModelValue);
    const hours = String(Number(nativeMatch[2] ?? fallbackTime.slice(0, 2))).padStart(2, '0');
    const minutes = String(Number(nativeMatch[3] ?? fallbackTime.slice(3, 5))).padStart(2, '0');
    return `${formatDate(date)}T${hours}:${minutes}`;
  }

  const displayMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(trimmed);
  if (!displayMatch) return null;
  const day = Number(displayMatch[1]);
  const month = Number(displayMatch[2]);
  const year = Number(displayMatch[3]);
  const date = new Date(year, month - 1, day);
  if (!isExactDate(date, year, month, day)) return null;
  if (!includeTime) return formatDate(date);

  const currentTime = readTimePart(fallbackModelValue);
  const rawHours = displayMatch[4] === undefined ? Number(currentTime.slice(0, 2)) : Number(displayMatch[4]);
  const minutes = displayMatch[5] === undefined ? currentTime.slice(3, 5) : String(Number(displayMatch[5])).padStart(2, '0');
  const suffix = displayMatch[6]?.toUpperCase();
  let hours = rawHours;
  if (suffix === 'PM' && hours < 12) hours += 12;
  if (suffix === 'AM' && hours === 12) hours = 0;
  if (hours < 0 || hours > 23) return null;
  return `${formatDate(date)}T${String(hours).padStart(2, '0')}:${minutes}`;
}

export function readDatePart(value: string): string {
  return value.match(/^(\d{4})-(\d{2})-(\d{2})/)?.[0] ?? '';
}

export function readTimePart(value: string): string {
  const match = value.match(/[T\s](\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;
  return '00:00';
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatTimeLabel(value: string): string {
  const [hourText = '0', minuteText = '00'] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function isExactDate(date: Date, year: number, month: number, day: number): boolean {
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}
