import { parseList } from './manualSidebarUtils';

export interface MatrixFieldEntry {
  field: string;
  label: string;
  raw?: Record<string, unknown>;
}

export interface MatrixValueEntry extends MatrixFieldEntry {
  agg: string;
  currencySymbol: string;
  decimals: string;
  entryKey?: string;
  format: string;
  hideTitle: boolean;
  prefix: string;
  suffix: string;
  thousandsSeparator: string;
}

export interface MatrixFilterEntry {
  field: string;
  logicOperator: 'AND' | 'OR';
  operator: string;
  value: string;
  valueTo: string;
}

export interface MatrixSortEntry {
  direction: 'ASC' | 'DESC';
  sortBy: string;
  sortOn: string;
}

export const matrixTableFormats: Record<string, {
  borderColor: string;
  headerBg: string;
  headerText: string;
  rowBg: string;
  rowText: string;
  showBorders: boolean;
}> = {
  bordered: { borderColor: '#d1d5db', headerBg: '#f3f4f6', headerText: '#111827', rowBg: '#ffffff', rowText: '#374151', showBorders: true },
  colorful: { borderColor: '#e0e7ff', headerBg: '#667eea', headerText: '#ffffff', rowBg: '#ffffff', rowText: '#374151', showBorders: false },
  compact: { borderColor: '#e2e8f0', headerBg: '#f8fafc', headerText: '#334155', rowBg: '#ffffff', rowText: '#475569', showBorders: true },
  corporate: { borderColor: '#dbeafe', headerBg: '#1e40af', headerText: '#ffffff', rowBg: '#ffffff', rowText: '#1f2937', showBorders: true },
  dark: { borderColor: '#374151', headerBg: '#1f2937', headerText: '#f9fafb', rowBg: '#111827', rowText: '#d1d5db', showBorders: false },
  default: { borderColor: '#e5e7eb', headerBg: '#ffffff', headerText: '#222222', rowBg: '#ffffff', rowText: '#333333', showBorders: false },
  minimal: { borderColor: 'transparent', headerBg: '#ffffff', headerText: '#6b7280', rowBg: '#ffffff', rowText: '#4b5563', showBorders: false },
  modern: { borderColor: '#f3f4f6', headerBg: '#f9fafb', headerText: '#111827', rowBg: '#ffffff', rowText: '#374151', showBorders: false },
  report: { borderColor: '#d1d5db', headerBg: '#ffffff', headerText: '#111827', rowBg: '#ffffff', rowText: '#374151', showBorders: false },
  spacious: { borderColor: '#e0e0e0', headerBg: '#fafafa', headerText: '#212121', rowBg: '#ffffff', rowText: '#424242', showBorders: false },
  striped: { borderColor: '#e2e8f0', headerBg: '#f1f5f9', headerText: '#1e293b', rowBg: '#ffffff', rowText: '#374151', showBorders: false }
};

export function parseMatrixFieldEntries(text: string): MatrixFieldEntry[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.flatMap(matrixFieldEntry);
    } catch {
      return [];
    }
  }
  return parseList(text).map(field => ({ field, label: '' }));
}

export function serializeMatrixFieldEntries(entries: MatrixFieldEntry[]): string {
  const activeEntries = entries.filter(entry => entry.field);
  return activeEntries.some(entry => entry.raw || entry.label)
    ? JSON.stringify(activeEntries.map(entry => ({
        ...(entry.raw ?? {}),
        field: entry.field,
        ...(entry.label ? { label: entry.label, customLabel: entry.label } : {})
      })), null, 2)
    : activeEntries.map(entry => entry.field).join(', ');
}

export function parseMatrixValueEntries(text: string): MatrixValueEntry[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.flatMap((item, index) => matrixValueEntry(item, index));
    } catch {
      return [];
    }
  }
  return parseList(text).map((field, index) => defaultMatrixValueEntry(field, index));
}

export function serializeMatrixValueEntries(entries: MatrixValueEntry[]): string {
  const activeEntries = entries.filter(entry => entry.field);
  return activeEntries.some(hasExtendedMatrixValueConfig)
    ? JSON.stringify(activeEntries.map((entry, index) => serializedMatrixValueEntry(entry, index)), null, 2)
    : activeEntries.map(entry => entry.field).join(', ');
}

export function parseMatrixFilterEntries(text: string): MatrixFilterEntry[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.flatMap(matrixFilterEntry);
    if (isRecord(parsed)) {
      if (readMatrixValueString(parsed.field ?? parsed.column ?? parsed.key)) return matrixFilterEntry(parsed);
      return Object.entries(parsed).flatMap(([field, value]) => [{ field, logicOperator: 'AND', operator: 'equals', value: String(value ?? ''), valueTo: '' }]);
    }
  } catch {
    return [];
  }
  return [];
}

export function serializeMatrixFilterEntries(entries: MatrixFilterEntry[]): string {
  const activeEntries = entries.filter(entry => entry.field);
  if (!activeEntries.length) return '';
  return JSON.stringify(activeEntries.map((entry, index) => ({
    field: entry.field,
    operator: entry.operator,
    ...(!isMatrixValuelessOperator(entry.operator) ? { value: entry.value } : {}),
    ...(entry.operator === 'between' && entry.valueTo ? { valueTo: entry.valueTo } : {}),
    ...(index < activeEntries.length - 1 ? { logicOperator: entry.logicOperator } : {})
  })), null, 2);
}

export function parseMatrixSortConfig(text: string): { columns: MatrixSortEntry[]; rows: MatrixSortEntry[] } {
  const trimmed = text.trim();
  if (!trimmed) return { columns: [], rows: [] };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) return { columns: [], rows: [] };
    return {
      columns: parseMatrixSortEntries(parsed.columns),
      rows: parseMatrixSortEntries(parsed.rows)
    };
  } catch {
    return { columns: [], rows: [] };
  }
}

export function serializeMatrixSortConfig(config: { columns: MatrixSortEntry[]; rows: MatrixSortEntry[] }): string {
  const columns = config.columns.filter(entry => entry.sortOn);
  const rows = config.rows.filter(entry => entry.sortOn);
  if (!columns.length && !rows.length) return '';
  return JSON.stringify({
    ...(rows.length ? { rows: rows.map(serializeMatrixSortEntry) } : {}),
    ...(columns.length ? { columns: columns.map(serializeMatrixSortEntry) } : {})
  }, null, 2);
}

export function matrixValuePreview(entry: MatrixValueEntry): string {
  const sample = 1234.5678;
  const format = entry.format || 'none';
  const decimalPlaces = format === 'integer'
    ? 0
    : Number.isFinite(Number(entry.decimals))
      ? Number(entry.decimals)
      : 2;
  if (format === 'currency') return `${entry.currencySymbol || '$'}${formatPreviewNumber(sample, decimalPlaces, entry.thousandsSeparator)}`;
  if (format === 'percentage') return `${formatPreviewNumber(sample / 100, decimalPlaces, entry.thousandsSeparator)}%`;
  if (format === 'integer') return formatPreviewNumber(Math.round(sample), 0, entry.thousandsSeparator);
  if (format === 'decimal') return sample.toFixed(decimalPlaces);
  if (format === 'number') return formatPreviewNumber(sample, decimalPlaces, entry.thousandsSeparator);
  if (format === 'text' || format === 'none') return '1234.5678';
  return '1,234.57';
}

function matrixFieldEntry(item: unknown): MatrixFieldEntry[] {
  if (typeof item === 'string') return [{ field: item, label: '' }];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
  const entry = item as Record<string, unknown>;
  const field = typeof entry.field === 'string' ? entry.field : '';
  if (!field) return [];
  return [{
    field,
    label: typeof entry.label === 'string' ? entry.label : typeof entry.customLabel === 'string' ? entry.customLabel : '',
    raw: entry
  }];
}

function matrixValueEntry(item: unknown, index: number): MatrixValueEntry[] {
  if (typeof item === 'string') return [defaultMatrixValueEntry(item, index)];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
  const entry = item as Record<string, unknown>;
  const field = typeof entry.field === 'string' ? entry.field : '';
  if (!field) return [];
  const format = isRecord(entry.format) ? entry.format : {};
  return [{
    field,
    entryKey: readMatrixValueString(entry.entryKey ?? entry.instanceKey ?? entry.id) ?? buildMatrixValueEntryKey(field, index),
    label: typeof entry.label === 'string' ? entry.label : typeof entry.customLabel === 'string' ? entry.customLabel : '',
    agg: normalizeMatrixAggregation(typeof entry.agg === 'string' ? entry.agg : typeof entry.aggregation === 'string' ? entry.aggregation : typeof entry.summarize === 'string' ? entry.summarize : 'sum'),
    currencySymbol: readMatrixValueString(format.currencySymbol ?? entry.currencySymbol) ?? '',
    decimals: readMatrixValueNumberText(format.maximumFractionDigits ?? format.decimals ?? entry.maximumFractionDigits ?? entry.decimals ?? entry.decimalPlaces),
    format: matrixValueFormatType(entry, format),
    hideTitle: entry.hideTitle === true,
    prefix: readMatrixValueString(format.prefix ?? entry.prefix) ?? '',
    suffix: readMatrixValueString(format.suffix ?? entry.suffix) ?? '',
    thousandsSeparator: readMatrixValueThousandsSeparator(format.thousandsSeparator ?? entry.thousandsSeparator),
    raw: entry
  }];
}

function defaultMatrixValueEntry(field = '', index?: number): MatrixValueEntry {
  return {
    agg: 'sum',
    currencySymbol: '',
    decimals: '',
    ...(index !== undefined ? { entryKey: buildMatrixValueEntryKey(field, index) } : {}),
    field,
    format: '',
    hideTitle: false,
    label: '',
    prefix: '',
    suffix: '',
    thousandsSeparator: 'comma'
  };
}

function hasExtendedMatrixValueConfig(entry: MatrixValueEntry): boolean {
  return Boolean(
    entry.raw
    || entry.label
    || entry.agg !== 'sum'
    || entry.format
    || entry.decimals
    || entry.currencySymbol
    || entry.hideTitle
    || entry.prefix
    || entry.suffix
    || entry.thousandsSeparator !== 'comma'
  );
}

function serializedMatrixValueEntry(entry: MatrixValueEntry, index: number): Record<string, unknown> {
  const decimals = entry.format === 'integer' ? '0' : entry.decimals.trim();
  const parsedDecimals = decimals ? Number(decimals) : NaN;
  return {
    ...omitOwnedMatrixValueKeys(entry.raw ?? {}),
    entryKey: entry.entryKey ?? buildMatrixValueEntryKey(entry.field, index),
    field: entry.field,
    ...(entry.label ? { label: entry.label, customLabel: entry.label } : {}),
    ...(entry.agg ? { agg: entry.agg, aggregation: entry.agg, summarize: entry.agg } : {}),
    ...(entry.format ? { format: entry.format, formatType: entry.format } : {}),
    ...(Number.isFinite(parsedDecimals)
      ? {
          maximumFractionDigits: parsedDecimals,
          minimumFractionDigits: parsedDecimals
        }
      : {}),
    ...(entry.thousandsSeparator !== 'comma' ? { thousandsSeparator: entry.thousandsSeparator } : {}),
    ...(entry.currencySymbol && entry.format === 'currency' ? { currencySymbol: entry.currencySymbol } : {}),
    ...(entry.hideTitle ? { hideTitle: true } : {}),
    ...(entry.prefix ? { prefix: entry.prefix } : {}),
    ...(entry.suffix ? { suffix: entry.suffix } : {})
  };
}

function omitOwnedMatrixValueKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const owned = new Set([
    'agg',
    'aggregation',
    'currencySymbol',
    'customLabel',
    'decimals',
    'entryKey',
    'field',
    'format',
    'formatType',
    'hideTitle',
    'key',
    'label',
    'maximumFractionDigits',
    'minimumFractionDigits',
    'name',
    'prefix',
    'suffix',
    'summarize',
    'thousandsSeparator'
  ]);
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !owned.has(key)));
}

function buildMatrixValueEntryKey(field: string, index: number): string {
  return `${field || 'value'}:${index}`;
}

function matrixValueFormatType(
  entry: Record<string, unknown>,
  format: Record<string, unknown>
): string {
  const raw = readMatrixValueString(entry.formatType)
    ?? (typeof entry.format === 'string' ? readMatrixValueString(entry.format) : null)
    ?? readMatrixValueString(format.style)
    ?? '';
  if (raw === 'none') return 'none';
  if (raw === 'currency') return 'currency';
  if (raw === 'percentage' || raw === 'percent') return 'percentage';
  if (raw === 'number') return 'number';
  if (raw === 'integer') return 'integer';
  if (raw === 'decimal') return 'decimal';
  if (raw === 'text') return 'text';
  return '';
}

function readMatrixValueNumberText(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : typeof value === 'string' && value.trim()
      ? value.trim()
      : '';
}

function readMatrixValueString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readMatrixValueThousandsSeparator(value: unknown): string {
  return value === 'none' || value === 'space' ? value : 'comma';
}

function normalizeMatrixAggregation(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  if (normalized === 'average') return 'avg';
  if (normalized === 'countdistinct') return 'countDistinct';
  if (normalized === 'count_distinct') return 'countDistinct';
  if (normalized === 'sum' || normalized === 'avg' || normalized === 'count' || normalized === 'min' || normalized === 'max') {
    return normalized;
  }
  return 'sum';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matrixFilterEntry(item: unknown): MatrixFilterEntry[] {
  if (!isRecord(item)) return [];
  const field = readMatrixValueString(item.field ?? item.column ?? item.key);
  if (!field) return [];
  return [{
    field,
    logicOperator: readLogicOperator(item.logicOperator),
    operator: normalizeMatrixFilterOperator(readMatrixValueString(item.operator) ?? 'equals'),
    value: stringifyMatrixFilterValue(item.value),
    valueTo: stringifyMatrixFilterValue(item.valueTo ?? item.max)
  }];
}

function parseMatrixSortEntries(value: unknown): MatrixSortEntry[] {
  return Array.isArray(value) ? value.flatMap(matrixSortEntry) : [];
}

function matrixSortEntry(item: unknown): MatrixSortEntry[] {
  if (!isRecord(item)) return [];
  const sortOn = readMatrixValueString(item.sortOn ?? item.field ?? item.key);
  if (!sortOn) return [];
  return [{
    direction: readSortDirection(item.direction),
    sortBy: readMatrixValueString(item.sortBy) ?? '',
    sortOn
  }];
}

function serializeMatrixSortEntry(entry: MatrixSortEntry): Record<string, unknown> {
  return {
    sortOn: entry.sortOn,
    ...(entry.sortBy ? { sortBy: entry.sortBy } : {}),
    direction: entry.direction
  };
}

function readLogicOperator(value: unknown): 'AND' | 'OR' {
  return value === 'OR' ? 'OR' : 'AND';
}

function readSortDirection(value: unknown): 'ASC' | 'DESC' {
  return String(value ?? '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function normalizeMatrixFilterOperator(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'equals';
  if (normalized === '=') return 'equals';
  if (normalized === '!=') return 'not_equals';
  if (normalized === 'like') return 'contains';
  if (normalized === 'not like') return 'not_contains';
  if (normalized === 'is null') return 'is_null';
  if (normalized === 'is not null') return 'is_not_null';
  return normalized;
}

function isMatrixValuelessOperator(operator: string): boolean {
  return operator === 'is_null' || operator === 'is_not_null';
}

function stringifyMatrixFilterValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function formatPreviewNumber(value: number, decimalPlaces: number, thousandsSeparator: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  }).format(value);
  if (thousandsSeparator === 'none') return formatted.replace(/,/g, '');
  if (thousandsSeparator === 'space') return formatted.replace(/,/g, ' ');
  return formatted;
}
