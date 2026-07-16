import {
  inferTableBooleanPreset,
  inferTableDateFormatPreset,
  type TableBooleanPreset
} from './manualTableColumnFormattingPresets';

export type FieldTypeResolver = (fieldName: string) => string | undefined;

export interface ColumnEntry {
  align: string;
  booleanPreset: TableBooleanPreset;
  cellType: string;
  currencySymbol: string;
  dateFormat: string;
  dateFormatCustom: string;
  decimals: string;
  emptyValue: string;
  falseLabel: string;
  field: string;
  format: string;
  itemCurrencyField: string;
  itemLabelField: string;
  itemLabelValueSeparator: string;
  itemPrecision: string;
  itemSeparator: string;
  itemSkipZeroItems: boolean;
  itemValueField: string;
  label: string;
  linkUnderline: string;
  negativeStyle: string;
  prefix: string;
  raw?: Record<string, unknown>;
  runtimeDateFormat0: string;
  runtimeDateFormat1: string;
  runtimeDateFormat2: string;
  runtimeLabel0: string;
  runtimeLabel1: string;
  runtimeLabel2: string;
  runtimeParameter: string;
  summarize: string;
  suffix: string;
  thousandsSeparator: string;
  timeZone: string;
  totalAggregation: string;
  trueLabel: string;
  type: string;
  width: string;
}

export function parseColumnEntries(text: string, fieldTypeForName: FieldTypeResolver): ColumnEntry[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.flatMap(item => columnEntry(item, fieldTypeForName));
    } catch {
      return [];
    }
  }
  return parseList(text).map(field => defaultColumnEntry(field, fieldTypeForName(field)));
}

export function serializeColumnEntries(columns: ColumnEntry[]): string {
  const entries = columns.filter(column => column.field);
  const hasExtendedConfig = entries.some(hasExtendedColumnConfig);
  if (!hasExtendedConfig) return entries.map(column => column.field).join(', ');
  return JSON.stringify(entries.map(serializedColumnEntry), null, 2);
}

export function defaultColumnEntry(field: string, fieldType: string | undefined): ColumnEntry {
  const type = normalizeFieldType(fieldType);
  return {
    align: '',
    booleanPreset: '',
    cellType: '',
    currencySymbol: '',
    dateFormat: '',
    dateFormatCustom: '',
    decimals: '',
    emptyValue: '',
    falseLabel: '',
    field,
    format: defaultFormatForFieldType(type),
    itemCurrencyField: '',
    itemLabelField: '',
    itemLabelValueSeparator: ': ',
    itemPrecision: '',
    itemSeparator: '\\n',
    itemSkipZeroItems: false,
    itemValueField: '',
    label: '',
    linkUnderline: '',
    negativeStyle: '',
    prefix: '',
    runtimeDateFormat0: '',
    runtimeDateFormat1: '',
    runtimeDateFormat2: '',
    runtimeLabel0: '',
    runtimeLabel1: '',
    runtimeLabel2: '',
    runtimeParameter: '',
    summarize: '',
    suffix: '',
    thousandsSeparator: 'comma',
    timeZone: '',
    totalAggregation: '',
    trueLabel: '',
    type,
    width: ''
  };
}

export function normalizeFieldType(value: string | undefined): string {
  const type = value?.trim().toLowerCase() ?? '';
  if (isNumericFieldType(type)) return 'number';
  if (isDateFieldType(type)) return 'date';
  if (isBooleanFieldType(type)) return 'boolean';
  return type || 'text';
}

export function isNumericFieldType(type: string): boolean {
  return [
    'bigint', 'decimal', 'double', 'double precision', 'float', 'integer', 'int',
    'money', 'number', 'numeric', 'real', 'smallint', 'smallmoney', 'tinyint'
  ].includes(type);
}

export function isDateFieldType(type: string): boolean {
  return type.includes('date') || type.includes('time') || type === 'timestamp';
}

export function isBooleanFieldType(type: string): boolean {
  return type === 'boolean' || type === 'bool';
}

function columnEntry(item: unknown, fieldTypeForName: FieldTypeResolver): ColumnEntry[] {
  if (typeof item === 'string') return [defaultColumnEntry(item, fieldTypeForName(item))];
  if (!isRecord(item)) return [];
  const field = readString(item.field) ?? readString(item.key) ?? readString(item.name) ?? '';
  if (!field) return [];
  const format = isRecord(item.format) ? item.format : {};
  const display = isRecord(item.displayConfig) ? item.displayConfig : {};
  const type = normalizeFieldType(readString(item.type) ?? fieldTypeForName(field));
  const dateFormat = readString(format.dateFormat ?? format.pattern ?? item.dateFormat) ?? '';
  const trueLabel = readString(format.trueLabel ?? item.trueLabel) ?? '';
  const falseLabel = readString(format.falseLabel ?? item.falseLabel) ?? '';
  const runtime = runtimeOverrideRecord(item.runtimeOverrides ?? item.runtime ?? item.dynamicColumn ?? item.dynamic ?? item.parameterOverrides);
  const runtimeLabels = runtimeValueMap(runtime?.labels ?? runtime?.label ?? runtime?.labelByValue ?? runtime?.labelByParameter);
  const runtimeDateFormats = runtimeValueMap(runtime?.dateFormats ?? runtime?.dateFormat ?? runtime?.dateFormatByValue ?? runtime?.dateFormatByParameter);
  return [{
    align: readString(item.align) ?? '',
    booleanPreset: inferTableBooleanPreset(trueLabel, falseLabel),
    cellType: readString(item.cellType) ?? '',
    currencySymbol: readString(format.currencySymbol ?? item.currencySymbol) ?? '',
    dateFormat: inferTableDateFormatPreset(dateFormat),
    dateFormatCustom: inferTableDateFormatPreset(dateFormat) === '__custom__' ? dateFormat : '',
    decimals: readNumberText(format.maximumFractionDigits ?? format.decimals ?? item.maximumFractionDigits ?? item.decimals),
    emptyValue: readString(format.emptyValue ?? item.emptyValue) ?? '',
    falseLabel,
    field,
    format: columnFormatType(item, format, type),
    itemCurrencyField: readString(format.itemCurrencyField ?? display.itemCurrencyField ?? item.itemCurrencyField ?? item.currencyField) ?? '',
    itemLabelField: readString(format.itemLabelField ?? display.itemLabelField ?? item.itemLabelField ?? item.labelField) ?? '',
    itemLabelValueSeparator: displaySeparatorText(readText(format.itemLabelValueSeparator ?? format.labelValueSeparator ?? display.itemLabelValueSeparator ?? display.labelValueSeparator ?? item.itemLabelValueSeparator ?? item.labelValueSeparator) ?? ': '),
    itemPrecision: readNumberText(format.itemPrecision ?? display.itemPrecision ?? item.itemPrecision),
    itemSeparator: displaySeparatorText(readText(format.itemSeparator ?? format.separator ?? display.itemSeparator ?? display.separator ?? item.itemSeparator ?? item.separator) ?? '\\n'),
    itemSkipZeroItems: readBoolean(format.skipZeroItems ?? display.skipZeroItems ?? item.skipZeroItems) ?? false,
    itemValueField: readString(format.itemValueField ?? display.itemValueField ?? item.itemValueField ?? item.valueField) ?? '',
    label: readString(item.label) ?? readString(item.customLabel) ?? '',
    linkUnderline: readLinkUnderlineText(format.linkUnderline ?? item.linkUnderline ?? item.underlineLinks),
    negativeStyle: readString(format.negativeStyle ?? item.negativeStyle) ?? '',
    prefix: readString(format.prefix ?? item.prefix) ?? '',
    raw: item,
    runtimeDateFormat0: readString(runtimeDateFormats?.['0'] ?? runtimeDateFormats?.[0]) ?? '',
    runtimeDateFormat1: readString(runtimeDateFormats?.['1'] ?? runtimeDateFormats?.[1]) ?? '',
    runtimeDateFormat2: readString(runtimeDateFormats?.['2'] ?? runtimeDateFormats?.[2]) ?? '',
    runtimeLabel0: readString(runtimeLabels?.['0'] ?? runtimeLabels?.[0]) ?? '',
    runtimeLabel1: readString(runtimeLabels?.['1'] ?? runtimeLabels?.[1]) ?? '',
    runtimeLabel2: readString(runtimeLabels?.['2'] ?? runtimeLabels?.[2]) ?? '',
    runtimeParameter: readString(runtime?.parameter ?? runtime?.param ?? runtime?.field) ?? '',
    summarize: readString(item.summarize ?? item.aggregation ?? item.aggregationType) ?? '',
    suffix: readString(format.suffix ?? item.suffix) ?? '',
    thousandsSeparator: readString(format.thousandsSeparator ?? item.thousandsSeparator) ?? 'comma',
    timeZone: readString(format.timeZone ?? item.timeZone) ?? '',
    totalAggregation: readString(item.totalAggregation ?? item.summaryType) ?? '',
    trueLabel,
    type,
    width: readString(item.width) ?? ''
  }];
}

function hasExtendedColumnConfig(column: ColumnEntry): boolean {
  return Boolean(
    column.raw
    || column.label
    || column.summarize
    || (column.cellType && column.cellType !== 'text')
    || column.format
    || column.currencySymbol
    || column.decimals
    || column.prefix
    || column.suffix
    || (column.thousandsSeparator && column.thousandsSeparator !== 'comma')
    || column.timeZone
    || effectiveDateFormat(column)
    || column.trueLabel
    || column.falseLabel
    || column.emptyValue
    || column.format === 'structured-list'
    || hasStructuredListConfig(column)
    || column.linkUnderline
    || column.negativeStyle
    || column.align
    || column.width
    || column.totalAggregation
    || hasRuntimeOverrides(column)
  );
}

function serializedColumnEntry(column: ColumnEntry): Record<string, unknown> {
  const raw = omitOwnedColumnKeys(column.raw ?? {});
  const format = columnFormatConfig(column);
  return {
    ...raw,
    field: column.field,
    ...(column.type && column.type !== 'text' ? { type: column.type } : {}),
    ...(column.label ? { label: column.label } : {}),
    ...(column.summarize ? { summarize: column.summarize } : {}),
    ...(column.cellType && column.cellType !== 'text' ? { cellType: column.cellType } : {}),
    ...(format ? { format } : {}),
    ...(column.align ? { align: column.align } : {}),
    ...(column.width ? { width: column.width } : {}),
    ...(column.totalAggregation ? { totalAggregation: column.totalAggregation } : {}),
    ...runtimeOverridesConfigPatch(column)
  };
}

function columnFormatConfig(column: ColumnEntry): Record<string, unknown> | undefined {
  const formatType = effectiveColumnFormat(column);
  const format: Record<string, unknown> = {};
  if (formatType === 'currency') format.style = 'currency';
  else if (formatType === 'percentage') format.style = 'percent';
  else if (formatType === 'number') format.style = 'decimal';
  else if (formatType === 'date') format.style = 'date';
  else if (formatType === 'structured-list') format.formatter = 'structured-list';
  if (column.decimals) {
    const decimals = Number(column.decimals);
    if (Number.isFinite(decimals)) {
      format.maximumFractionDigits = decimals;
      format.minimumFractionDigits = decimals;
    }
  }
  if (column.currencySymbol && formatType === 'currency') format.currencySymbol = column.currencySymbol;
  if (column.prefix) format.prefix = column.prefix;
  if (column.suffix) format.suffix = column.suffix;
  if (column.thousandsSeparator && column.thousandsSeparator !== 'comma') format.thousandsSeparator = column.thousandsSeparator;
  if (effectiveDateFormat(column)) format.dateFormat = effectiveDateFormat(column);
  if (column.timeZone) format.timeZone = column.timeZone;
  if (column.trueLabel) format.trueLabel = column.trueLabel;
  if (column.falseLabel) format.falseLabel = column.falseLabel;
  if (column.emptyValue) format.emptyValue = column.emptyValue;
  if (column.linkUnderline) format.linkUnderline = column.linkUnderline;
  if (column.negativeStyle) format.negativeStyle = column.negativeStyle;
  if (formatType === 'structured-list' || hasStructuredListConfig(column)) {
    format.formatter = 'structured-list';
    if (column.itemLabelField) format.itemLabelField = column.itemLabelField;
    if (column.itemValueField) format.itemValueField = column.itemValueField;
    if (column.itemCurrencyField) format.itemCurrencyField = column.itemCurrencyField;
    if (column.itemPrecision) {
      const itemPrecision = Number(column.itemPrecision);
      if (Number.isFinite(itemPrecision)) format.itemPrecision = itemPrecision;
    }
    if (column.itemSeparator) format.itemSeparator = storedSeparatorText(column.itemSeparator);
    if (column.itemLabelValueSeparator) format.itemLabelValueSeparator = storedSeparatorText(column.itemLabelValueSeparator);
    if (column.itemSkipZeroItems) format.skipZeroItems = true;
  }
  return Object.keys(format).length > 0 ? format : undefined;
}

function effectiveColumnFormat(column: ColumnEntry): string {
  const fieldDefault = defaultFormatForFieldType(column.type);
  if (column.format && column.format !== fieldDefault) return column.format;
  return defaultFormatForTableCellType(column.cellType) || column.format;
}

function columnFormatType(entry: Record<string, unknown>, format: Record<string, unknown>, type: string): string {
  const raw = readString(entry.formatType) ?? readString(entry.format) ?? readString(format.style);
  if (raw === 'currency') return 'currency';
  if (raw === 'percentage' || raw === 'percent') return 'percentage';
  if (raw === 'date') return 'date';
  if (raw === 'number' || raw === 'decimal') return 'number';
  if (raw === 'structured-list' || raw === 'json-list' || raw === 'list') return 'structured-list';
  if (readString(format.formatter) === 'structured-list' || readString(format.formatter) === 'json-list' || readString(format.formatter) === 'list') return 'structured-list';
  return defaultFormatForFieldType(type);
}

export function defaultFormatForFieldType(type: string): string {
  if (isNumericFieldType(type)) return 'number';
  if (isDateFieldType(type)) return 'date';
  return '';
}

export function defaultFormatForTableCellType(cellType: string): string {
  if (cellType === 'percent-of-total' || cellType === 'yoy-change' || cellType === 'mom-change') return 'percentage';
  return '';
}

function omitOwnedColumnKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const owned = new Set([
    'align', 'booleanPreset', 'cellType', 'currencySymbol', 'customLabel', 'dateFormat', 'decimals',
    'dateFormatCustom', 'emptyValue', 'falseLabel', 'field', 'format', 'formatType', 'key', 'label',
    'itemCurrencyField', 'itemLabelField', 'itemLabelValueSeparator', 'itemPrecision', 'itemSeparator',
    'itemSkipZeroItems', 'itemValueField', 'linkUnderline', 'maximumFractionDigits', 'name',
    'negativeStyle', 'prefix', 'separator', 'skipZeroItems', 'summarize', 'suffix', 'thousandsSeparator',
    'timeZone', 'totalAggregation', 'trueLabel', 'type', 'underlineLinks', 'valueField', 'width'
  ]);
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !owned.has(key)));
}

function hasStructuredListConfig(column: ColumnEntry): boolean {
  return Boolean(
    column.itemCurrencyField
    || column.itemLabelField
    || column.itemValueField
    || column.itemPrecision
    || (column.itemSeparator && column.itemSeparator !== '\\n')
    || (column.itemLabelValueSeparator && column.itemLabelValueSeparator !== ': ')
    || column.itemSkipZeroItems
  );
}

function hasRuntimeOverrides(column: ColumnEntry): boolean {
  return Boolean(
    column.runtimeParameter
    || column.runtimeLabel0
    || column.runtimeLabel1
    || column.runtimeLabel2
    || column.runtimeDateFormat0
    || column.runtimeDateFormat1
    || column.runtimeDateFormat2
  );
}

function runtimeOverridesConfigPatch(column: ColumnEntry): { runtimeOverrides?: Record<string, unknown> } {
  if (!hasRuntimeOverrides(column)) return {};
  const base = runtimeOverrideRecord(column.raw?.runtimeOverrides ?? column.raw?.runtime ?? column.raw?.dynamicColumn ?? column.raw?.dynamic ?? column.raw?.parameterOverrides) ?? {};
  const labels = {
    ...runtimeValueMap(base.labels ?? base.label ?? base.labelByValue ?? base.labelByParameter),
    ...compactRecord({
      0: column.runtimeLabel0,
      1: column.runtimeLabel1,
      2: column.runtimeLabel2
    })
  };
  const dateFormats = {
    ...runtimeValueMap(base.dateFormats ?? base.dateFormat ?? base.dateFormatByValue ?? base.dateFormatByParameter),
    ...compactRecord({
      0: column.runtimeDateFormat0,
      1: column.runtimeDateFormat1,
      2: column.runtimeDateFormat2
    })
  };
  const runtimeOverrides: Record<string, unknown> = {
    ...base,
    ...(column.runtimeParameter ? { parameter: column.runtimeParameter } : {}),
    ...(Object.keys(labels).length > 0 ? { labels } : {}),
    ...(Object.keys(dateFormats).length > 0 ? { dateFormats } : {})
  };
  return Object.keys(runtimeOverrides).length > 0 ? { runtimeOverrides } : {};
}

function runtimeOverrideRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function runtimeValueMap(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function compactRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value.trim().length > 0));
}

function effectiveDateFormat(column: ColumnEntry): string {
  return column.dateFormat === '__custom__'
    ? column.dateFormatCustom.trim()
    : column.dateFormat.trim();
}

function parseList(text: string): string[] {
  return text.split(',').map(field => field.trim()).filter(Boolean);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumberText(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value))) return value.trim();
  return '';
}

function readBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}

function displaySeparatorText(value: string): string {
  return value.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function storedSeparatorText(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

function readLinkUnderlineText(value: unknown): string {
  if (value === 'always' || value === true || value === 'true' || value === 'show' || value === 'underline') return 'always';
  if (value === 'never' || value === false || value === 'false' || value === 'hide' || value === 'none') return 'never';
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
