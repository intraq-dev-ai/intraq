import type { CalculatedField, ComponentConfig } from './component-sql-builder/types.js';

export interface GeneratedXAxisBucket {
  field: CalculatedField;
  sourceField: string;
}

type Row = Record<string, unknown>;

export function buildGeneratedXAxisBucket(value: unknown): GeneratedXAxisBucket | null {
  const record = readRecord(value);
  const sourceField = readString(record.xField);
  const grouping = readString(record.xAxisGrouping);
  if (!sourceField || !grouping) return null;

  const fiscalStartMonth = readMonthNumber(record.fiscalStartMonth ?? record.xAxisFiscalStart);
  const weekNumbering = readWeekNumbering(record.weekNumbering);
  const weekStartDay = readWeekStartDay(record.weekStartDay);
  const yearType = readYearType(record.yearType ?? record.xAxisYearType);
  const bucketOptions = {
    ...(fiscalStartMonth === undefined ? {} : { fiscalStartMonth }),
    ...(weekNumbering === undefined ? {} : { weekNumbering }),
    ...(weekStartDay === undefined ? {} : { weekStartDay }),
    ...(yearType === undefined ? {} : { yearType })
  };
  const name = generatedBucketFieldName(sourceField, grouping, bucketOptions);

  return {
    sourceField,
    field: {
      name,
      backgroundName: name,
      type: 'dateBucket',
      sourceField,
      grouping,
      ...bucketOptions,
      hidden: true,
      systemGenerated: true
    }
  };
}

export function withGeneratedXAxisBucket(
  config: ComponentConfig,
  bucket: GeneratedXAxisBucket | null
): ComponentConfig {
  if (!bucket) return config;
  const calculatedFields = Array.isArray(config.calculatedFields)
    ? config.calculatedFields.filter(field => field?.name !== bucket.field.name)
    : [];
  return {
    ...config,
    xField: bucket.field.name,
    calculatedFields: [...calculatedFields, bucket.field]
  };
}

export function applyGeneratedXAxisBucketRows<T extends Row>(
  rows: T[],
  bucket: GeneratedXAxisBucket | null
): T[] {
  if (!bucket) return rows;
  return rows.map(row => {
    if (bucket.field.name in row) return row;
    return {
      ...row,
      [bucket.field.name]: evaluateGeneratedXAxisBucketValue(row[bucket.sourceField], bucket.field)
    } as T;
  });
}

function evaluateGeneratedXAxisBucketValue(value: unknown, field: CalculatedField): string | null {
  const date = dateValue(value);
  if (!date) return null;

  switch (field.grouping) {
    case 'day':
      return formatDateKey(date);
    case 'week':
      return formatDateKey(startOfWeek(date, resolveWeekStartDay(field)));
    case 'month':
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`;
    case 'quarter':
      return `${bucketYear(date, field)}-Q${bucketQuarter(date, field)}`;
    case 'year':
      return String(bucketYear(date, field));
    case 'hour':
      return `${formatDateKey(date)} ${pad(date.getHours())}:00:00`;
    case 'minute':
      return `${formatDateKey(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
    default:
      return typeof value === 'string' && value.trim().length > 0 ? value.trim() : String(value ?? '');
  }
}

function bucketQuarter(date: Date, field: CalculatedField): number {
  if (field.yearType !== 'fiscal') return Math.floor(date.getMonth() / 3) + 1;
  const startMonth = field.fiscalStartMonth ?? 1;
  const shiftedMonth = (date.getMonth() + 1 - startMonth + 12) % 12;
  return Math.floor(shiftedMonth / 3) + 1;
}

function bucketYear(date: Date, field: CalculatedField): number {
  if (field.yearType !== 'fiscal') return date.getFullYear();
  const startMonth = field.fiscalStartMonth ?? 1;
  const month = date.getMonth() + 1;
  return month >= startMonth ? date.getFullYear() : date.getFullYear() - 1;
}

function startOfWeek(date: Date, startDay: 0 | 1 | 6): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const offset = (next.getDay() - startDay + 7) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

function resolveWeekStartDay(field: CalculatedField): 0 | 1 | 6 {
  if (field.weekStartDay === 'monday' || field.weekNumbering === 'iso') return 1;
  if (field.weekStartDay === 'saturday') return 6;
  return 0;
}

function generatedBucketFieldName(
  sourceField: string,
  grouping: string,
  options: {
    fiscalStartMonth?: number;
    weekNumbering?: string;
    weekStartDay?: string;
    yearType?: string;
  }
): string {
  const suffix = [
    sourceField,
    grouping,
    options.yearType === 'fiscal' ? 'fiscal' : null,
    options.yearType === 'fiscal' && options.fiscalStartMonth ? `m${options.fiscalStartMonth}` : null,
    grouping === 'week' ? options.weekNumbering ?? 'default' : null,
    grouping === 'week' ? options.weekStartDay ?? 'default' : null
  ].filter((value): value is string => Boolean(value)).map(toSnake);
  return `__ai_x_bucket_${suffix.join('_')}`;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const parsed = new Date(String(value ?? ''));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function readMonthNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12
    ? value
    : undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readWeekStartDay(value: unknown): 'monday' | 'saturday' | 'sunday' | undefined {
  return value === 'monday' || value === 'saturday' || value === 'sunday'
    ? value
    : undefined;
}

function readWeekNumbering(value: unknown): 'iso' | 'simple' | undefined {
  return value === 'iso' || value === 'simple' ? value : undefined;
}

function readYearType(value: unknown): 'calendar' | 'fiscal' | undefined {
  return value === 'calendar' || value === 'fiscal' ? value : undefined;
}

function toSnake(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}
