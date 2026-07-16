import { labelFor, numericMetricValue, type MetricDisplayFormat, type ThousandsSeparatorStyle } from './formatting';

export type AggregationType = 'avg' | 'count' | 'countDistinct' | 'first' | 'last' | 'max' | 'min' | 'sum';

export interface ConfiguredField {
  aggregation?: AggregationType | undefined;
  currencySymbol?: string | undefined;
  dateFormat?: string | undefined;
  entryKey?: string | undefined;
  field: string;
  format?: MetricDisplayFormat | undefined;
  hideTitle?: boolean | undefined;
  label: string;
  maximumFractionDigits?: number | undefined;
  minimumFractionDigits?: number | undefined;
  prefix?: string | undefined;
  suffix?: string | undefined;
  thousandsSeparator?: ThousandsSeparatorStyle | undefined;
}

export function readConfiguredFields(value: unknown): ConfiguredField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (typeof item === 'string' && item.trim()) {
      const field = item.trim();
      return [{ entryKey: `${field}:${index}`, field, label: labelFor(field) }];
    }
    if (!isRecord(item)) return [];
    const field = readString(item.field) ?? readString(item.key) ?? readString(item.name);
    if (!field) return [];
    const aggregation = readConfiguredAggregation(item);
    const formatConfig = isRecord(item.format) ? item.format : {};
    const format = readConfiguredFormat(item.formatType ?? item.format ?? formatConfig.style);
    const maximumFractionDigits = readConfiguredDigits(formatConfig.maximumFractionDigits ?? formatConfig.decimals ?? item.maximumFractionDigits ?? item.decimals ?? item.decimalPlaces);
    const minimumFractionDigits = readConfiguredDigits(formatConfig.minimumFractionDigits ?? item.minimumFractionDigits) ?? maximumFractionDigits;
    const thousandsSeparator = readThousandsSeparator(formatConfig.thousandsSeparator ?? item.thousandsSeparator);
    const currencySymbol = readString(formatConfig.currencySymbol ?? item.currencySymbol);
    return [{
      ...(aggregation ? { aggregation } : {}),
      ...(currencySymbol ? { currencySymbol } : {}),
      ...(readString(formatConfig.dateFormat ?? formatConfig.pattern ?? item.dateFormat ?? item.displayFormat ?? item.datePattern) ? { dateFormat: readString(formatConfig.dateFormat ?? formatConfig.pattern ?? item.dateFormat ?? item.displayFormat ?? item.datePattern) ?? undefined } : {}),
      entryKey: readString(item.entryKey ?? item.instanceKey ?? item.id) ?? `${field}:${index}`,
      field,
      ...(format ? { format } : {}),
      ...(readBoolean(item.hideTitle) !== undefined ? { hideTitle: readBoolean(item.hideTitle) } : {}),
      label: readString(item.customLabel) ?? readString(item.label) ?? labelFor(field),
      ...(maximumFractionDigits !== undefined ? { maximumFractionDigits } : {}),
      ...(minimumFractionDigits !== undefined ? { minimumFractionDigits } : {}),
      ...(readAffix(formatConfig.prefix ?? item.prefix) ? { prefix: readAffix(formatConfig.prefix ?? item.prefix) ?? undefined } : {}),
      ...(readAffix(formatConfig.suffix ?? item.suffix) ? { suffix: readAffix(formatConfig.suffix ?? item.suffix) ?? undefined } : {}),
      ...(thousandsSeparator ? { thousandsSeparator } : {})
    }];
  });
}

export function readFieldNames(value: unknown): string[] {
  return readConfiguredFields(value).map(item => item.field);
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readAffix(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function readAggregationType(value: unknown): AggregationType | undefined {
  return value === 'avg'
    || value === 'average'
    || value === 'count'
    || value === 'countDistinct'
    || value === 'first'
    || value === 'last'
    || value === 'max'
    || value === 'min'
    || value === 'sum'
    ? value === 'average' ? 'avg' : value
    : value === 'count_distinct'
      ? 'countDistinct'
    : undefined;
}

export function aggregateRows(
  rows: Array<Record<string, unknown>>,
  field: string,
  aggregationType: AggregationType = 'sum'
): number {
  if (aggregationType === 'count') {
    return rows.filter(row => hasPresentValue(row[field])).length;
  }
  if (aggregationType === 'countDistinct') {
    return new Set(rows.map(row => row[field]).filter(hasPresentValue).map(value => String(value))).size;
  }

  const values = rows
    .map(row => row[field])
    .filter(hasPresentValue)
    .map(numericMetricValue)
    .filter(value => Number.isFinite(value));

  if (values.length === 0) return 0;
  if (aggregationType === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregationType === 'first') return values[0] ?? 0;
  if (aggregationType === 'last') return values.at(-1) ?? 0;
  if (aggregationType === 'max') return Math.max(...values);
  if (aggregationType === 'min') return Math.min(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

export function aggregateNumbers(values: unknown[], aggregationType: AggregationType = 'sum'): number {
  const rows = values.map(value => ({ value }));
  return aggregateRows(rows, 'value', aggregationType);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasPresentValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

function readConfiguredAggregation(item: Record<string, unknown>): AggregationType | undefined {
  return readAggregationType(item.aggregation ?? item.summarize ?? item.aggregationType);
}

function readConfiguredDigits(value: unknown): number | undefined {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : undefined;
}

function readConfiguredFormat(value: unknown): MetricDisplayFormat | undefined {
  if (value === 'currency') return 'currency';
  if (value === 'number' || value === 'decimal' || value === 'integer') return 'number';
  if (value === 'percentage' || value === 'percent') return 'percentage';
  if (value === 'date') return 'date';
  if (value === 'text') return 'text';
  return undefined;
}

function readThousandsSeparator(value: unknown): ThousandsSeparatorStyle | undefined {
  return value === 'comma' || value === 'none' || value === 'space'
    ? value
    : undefined;
}
