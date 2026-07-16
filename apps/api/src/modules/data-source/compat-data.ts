import {
  dataSources,
  findTableWithSource,
  toLabel,
  type DataSourceRecord,
  type TableDefinition
} from './foundation-store.js';
import { asString } from './compat-http.js';

export type Aggregation = 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
export type TimePeriod = 'daily' | 'weekly' | 'monthly';

export function resolveDownloadTable(id: string): { source: DataSourceRecord; table: TableDefinition } | undefined {
  const tableLookup = findTableWithSource(id);
  if (tableLookup) return { source: tableLookup.source, table: tableLookup.table };
  const source = dataSources.find(item => item.id === id);
  const table = source?.tables[0];
  return source && table ? { source, table } : undefined;
}

export function hasField(table: TableDefinition, fieldName: string): boolean {
  return table.fields.some(field => field.name === fieldName);
}

export function normalizeAggregation(value: unknown): Aggregation | null {
  const normalized = (asString(value) ?? 'SUM').toUpperCase();
  return normalized === 'SUM' || normalized === 'AVG' || normalized === 'COUNT' ||
    normalized === 'MIN' || normalized === 'MAX'
    ? normalized
    : null;
}

export function normalizeTimePeriod(value: unknown): TimePeriod | null {
  const normalized = (asString(value) ?? 'monthly').toLowerCase();
  return normalized === 'daily' || normalized === 'weekly' || normalized === 'monthly' ? normalized : null;
}

export function buildYearOverYearRows(
  rows: Array<Record<string, unknown>>,
  dateField: string,
  valueField: string,
  aggregation: Aggregation,
  timePeriod: TimePeriod,
  label: string
): Array<Record<string, string | number>> {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const rawDate = row[dateField];
    const rawValue = row[valueField];
    if (typeof rawDate !== 'string') continue;
    if (aggregation !== 'COUNT' && typeof rawValue !== 'number') continue;
    const key = periodKey(rawDate, timePeriod);
    const values = groups.get(key) ?? [];
    values.push(typeof rawValue === 'number' ? rawValue : 1);
    groups.set(key, values);
  }

  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([period, values]) => {
    const currentValue = aggregate(values, aggregation);
    return { [label]: period, 'This Year': currentValue, 'Last Year': 0, 'Growth %': 100 };
  });
}

export function toCsv(table: TableDefinition, data: Array<Record<string, unknown>>): string {
  const headers = table.fields.map(field => field.name);
  const labels = table.fields.map(field => toLabel(field.name));
  const bodyRows = data.map(row => headers.map(header => csvCell(row[header])).join(','));
  return [labels.join(','), ...bodyRows].join('\n');
}

export function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '') || 'data';
}

function periodKey(value: string, timePeriod: TimePeriod): string {
  if (timePeriod === 'daily') return value.slice(0, 10);
  if (timePeriod === 'weekly') return `${value.slice(0, 4)}-${value.slice(5, 7)}-week`;
  return value.slice(0, 7);
}

function aggregate(values: number[], aggregation: Aggregation): number {
  if (values.length === 0) return 0;
  if (aggregation === 'COUNT') return values.length;
  if (aggregation === 'AVG') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregation === 'MIN') return Math.min(...values);
  if (aggregation === 'MAX') return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

function csvCell(value: unknown): string {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}
