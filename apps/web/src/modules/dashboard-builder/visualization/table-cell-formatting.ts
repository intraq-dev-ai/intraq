import { formatMetric, type MetricFormatOptions, numericMetricValue, type ThousandsSeparatorStyle } from './formatting';
import { isRecord, readString } from './view-model-config';
import { formatTableDatePattern } from './table-date-pattern-format';
import { formatReportDate, parseReportDate, reportDateParts } from './report-time-zone';
import type { DashboardTableCell, DashboardTableColumn, DashboardTableColumnDisplayConfig } from './view-model-types';

interface TableCellDisplayInput {
  column: DashboardTableColumn;
  conditionalDisplayValue?: unknown;
  delta?: DashboardTableCell['delta'];
  formatOptions: MetricFormatOptions;
  raw: unknown;
}

export function displayConfigPatch(column: Record<string, unknown>): Pick<DashboardTableColumn, 'displayConfig'> {
  const format = isRecord(column.format) ? column.format : {};
  const display = isRecord(column.displayConfig) ? column.displayConfig : {};
  const config: DashboardTableColumnDisplayConfig = {
    ...readDisplayTextPatch('currencySymbol', display.currencySymbol ?? format.currencySymbol ?? column.currencySymbol),
    ...readDisplayTextPatch('emptyValue', display.emptyValue ?? display.emptyText ?? display.nullValue ?? display.nullDisplay ?? format.emptyValue ?? format.emptyText ?? column.emptyValue),
    ...readDisplayTextPatch('falseLabel', display.falseLabel ?? format.falseLabel ?? column.falseLabel),
    ...readDisplayTextPatch('trueLabel', display.trueLabel ?? format.trueLabel ?? column.trueLabel),
    ...readDisplayTextPatch('prefix', display.prefix ?? format.prefix ?? column.prefix),
    ...readDisplayTextPatch('suffix', display.suffix ?? format.suffix ?? column.suffix),
    ...readDisplayTextPatch('dateFormat', display.dateFormat ?? format.dateFormat ?? format.pattern ?? column.dateFormat),
    ...readDisplayTextPatch('timeZone', display.timeZone ?? format.timeZone ?? column.timeZone),
    ...formatterPatch(display.formatter ?? format.formatter ?? column.formatter ?? column.valueFormatter ?? column.displayFormatter),
    ...readDisplayTextPatch('itemLabelField', display.itemLabelField ?? display.labelField ?? format.itemLabelField ?? format.labelField ?? column.itemLabelField ?? column.labelField),
    ...readDisplayTextPatch('itemValueField', display.itemValueField ?? display.valueField ?? format.itemValueField ?? format.valueField ?? column.itemValueField ?? column.valueField),
    ...readDisplayTextPatch('itemCurrencyField', display.itemCurrencyField ?? display.currencyField ?? format.itemCurrencyField ?? format.currencyField ?? column.itemCurrencyField ?? column.currencyField),
    ...readDisplayTextPatch('itemLabelValueSeparator', display.itemLabelValueSeparator ?? display.labelValueSeparator ?? format.itemLabelValueSeparator ?? format.labelValueSeparator ?? column.itemLabelValueSeparator ?? column.labelValueSeparator),
    ...readDisplayTextPatch('itemSeparator', display.itemSeparator ?? display.separator ?? format.itemSeparator ?? format.separator ?? column.itemSeparator ?? column.separator),
    ...readBooleanPatch('skipZeroItems', display.skipZeroItems ?? format.skipZeroItems ?? column.skipZeroItems),
    ...linkUnderlinePatch(display.linkUnderline ?? format.linkUnderline ?? column.linkUnderline ?? column.underlineLinks),
    ...readNumberPatch('maximumFractionDigits', display.maximumFractionDigits ?? format.maximumFractionDigits ?? format.decimals ?? column.maximumFractionDigits ?? column.decimals),
    ...readNumberPatch('minimumFractionDigits', display.minimumFractionDigits ?? format.minimumFractionDigits ?? format.minimumDecimals ?? column.minimumFractionDigits),
    ...readNumberPatch('precision', display.precision ?? format.precision ?? column.precision),
    ...readNumberPatch('itemPrecision', display.itemPrecision ?? display.precision ?? format.itemPrecision ?? column.itemPrecision),
    ...thousandsSeparatorPatch(display.thousandsSeparator ?? format.thousandsSeparator ?? column.thousandsSeparator),
    ...negativeStylePatch(display.negativeStyle ?? format.negativeStyle ?? column.negativeStyle)
  };
  return Object.keys(config).length > 0 ? { displayConfig: config } : {};
}

export function tableCellDisplay(input: TableCellDisplayInput): string {
  if (input.conditionalDisplayValue !== undefined) return String(input.conditionalDisplayValue);
  if (input.delta) return deltaDisplay(input.delta, input.column, input.formatOptions);
  if (isEmpty(input.raw)) return input.column.displayConfig?.emptyValue ?? '';
  const structuredDisplay = structuredDisplayValue(input.raw, input.column.displayConfig);
  if (structuredDisplay !== undefined) return withAffixes(structuredDisplay, input.column.displayConfig);
  const booleanDisplay = booleanDisplayValue(input.raw, input.column.displayConfig);
  if (booleanDisplay !== undefined) return withAffixes(booleanDisplay, input.column.displayConfig);
  if (input.column.format === 'date' || input.column.displayConfig?.dateFormat) {
    return withAffixes(formatDate(input.raw, input.column.displayConfig?.dateFormat, input.column.displayConfig?.timeZone), input.column.displayConfig);
  }
  return valueDisplay(input.raw, input.column, input.formatOptions);
}

export function tableFormatOptions(config: Record<string, unknown>): MetricFormatOptions {
  const currencySymbol = readString(config.currencySymbol);
  return currencySymbol ? { currencySymbol } : {};
}

function booleanDisplayValue(value: unknown, config: DashboardTableColumnDisplayConfig | undefined): string | undefined {
  if (typeof value === 'boolean') return value ? config?.trueLabel ?? 'True' : config?.falseLabel ?? 'False';
  if (typeof value !== 'string') return undefined;
  if (/^true$/i.test(value.trim())) return config?.trueLabel ?? 'True';
  if (/^false$/i.test(value.trim())) return config?.falseLabel ?? 'False';
  return undefined;
}

function deltaDisplay(delta: NonNullable<DashboardTableCell['delta']>, column: DashboardTableColumn, formatOptions: MetricFormatOptions): string {
  const absolute = column.format
    ? valueDisplay(delta.absolute, column, formatOptions)
    : signedNumber(delta.absolute, 0);
  const percentage = delta.percentage === null ? '' : `${delta.percentage >= 0 ? '+' : ''}${delta.percentage.toFixed(1)}%`;
  if (column.cellConfig?.deltaDisplayMode === 'absolute') return absolute;
  if (column.cellConfig?.deltaDisplayMode === 'percentage') return percentage || absolute;
  return percentage ? `${absolute} / ${percentage}` : absolute;
}

function formatDate(value: unknown, pattern: string | undefined, timeZone: string | undefined): string {
  const literalDate = !timeZone ? parseTimezoneLessDateString(value) : null;
  const date = literalDate ?? parseReportDate(value);
  if (!date) return '';
  const effectiveTimeZone = literalDate ? 'UTC' : timeZone;
  const parts = reportDateParts(date, effectiveTimeZone);
  if (pattern === 'YYYY-MM-DD') return formatTableDatePattern(date, 'YYYY-MM-DD', effectiveTimeZone);
  if (pattern === 'MM/DD/YYYY') return formatTableDatePattern(date, 'MM/DD/YYYY', effectiveTimeZone);
  if (pattern === 'DD/MM/YYYY') return formatTableDatePattern(date, 'DD/MM/YYYY', effectiveTimeZone);
  if (pattern === 'Month Name') return formatReportDate(date, { month: 'long' }, effectiveTimeZone);
  if (pattern === 'Day of Week') return formatReportDate(date, { weekday: 'long' }, effectiveTimeZone);
  if (pattern === 'Quarter') return `Q${Math.floor((parts.month - 1) / 3) + 1}`;
  if (pattern === 'YYYY') return String(parts.year);
  if (pattern === 'short') return formatReportDate(date, { dateStyle: 'short' }, effectiveTimeZone);
  if (pattern === 'medium') return formatReportDate(date, { dateStyle: 'medium' }, effectiveTimeZone);
  if (pattern === 'long') return formatReportDate(date, { dateStyle: 'long' }, effectiveTimeZone);
  if (typeof pattern === 'string' && pattern.trim().length > 0) return formatTableDatePattern(date, pattern.trim(), effectiveTimeZone);
  return formatReportDate(date, undefined, effectiveTimeZone);
}

function parseTimezoneLessDateString(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?$/.exec(value.trim());
  if (!match) return null;
  const [, rawYear, rawMonth, rawDay, rawHour = '0', rawMinute = '0', rawSecond = '0', rawMs = '0'] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const second = Number(rawSecond);
  const millisecond = Number(rawMs.padEnd(3, '0'));
  if (![year, month, day, hour, minute, second, millisecond].every(Number.isFinite)) return null;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function negativeStylePatch(value: unknown): Pick<DashboardTableColumnDisplayConfig, 'negativeStyle'> {
  return value === 'absolute' || value === 'minus' || value === 'parentheses' ? { negativeStyle: value } : {};
}

function readDisplayTextPatch(
  key: keyof Omit<DashboardTableColumnDisplayConfig, 'negativeStyle' | 'skipZeroItems'>,
  value: unknown
): Partial<DashboardTableColumnDisplayConfig> {
  const text = readDisplayText(value);
  return text !== undefined ? { [key]: text } : {};
}

function readDisplayText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function signedNumber(value: number, digits: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function readNumberPatch(
  key: 'itemPrecision' | 'maximumFractionDigits' | 'minimumFractionDigits' | 'precision',
  value: unknown
): Partial<DashboardTableColumnDisplayConfig> {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numberValue) && numberValue >= 0 ? { [key]: Math.floor(numberValue) } : {};
}

function readBooleanPatch(
  key: 'skipZeroItems',
  value: unknown
): Partial<DashboardTableColumnDisplayConfig> {
  if (value === true || value === 'true') return { [key]: true };
  if (value === false || value === 'false') return { [key]: false };
  return {};
}

function formatterPatch(value: unknown): Pick<DashboardTableColumnDisplayConfig, 'formatter'> {
  if (value === 'structured-list' || value === 'json-list' || value === 'list') return { formatter: value === 'list' ? 'structured-list' : value };
  return {};
}

function thousandsSeparatorPatch(value: unknown): Pick<DashboardTableColumnDisplayConfig, 'thousandsSeparator'> {
  if (value !== 'comma' && value !== 'none' && value !== 'space') return {};
  const thousandsSeparator: ThousandsSeparatorStyle = value;
  return { thousandsSeparator };
}

function linkUnderlinePatch(value: unknown): Pick<DashboardTableColumnDisplayConfig, 'linkUnderline'> {
  if (value === 'always' || value === true || value === 'true' || value === 'show' || value === 'underline') return { linkUnderline: 'always' };
  if (value === 'never' || value === false || value === 'false' || value === 'hide' || value === 'none') return { linkUnderline: 'never' };
  return {};
}

function valueDisplay(raw: unknown, column: DashboardTableColumn, formatOptions: MetricFormatOptions): string {
  const displayConfig = column.displayConfig;
  const options = {
    ...formatOptions,
    ...(displayConfig?.currencySymbol ? { currencySymbol: displayConfig.currencySymbol } : {}),
    ...(displayConfig?.maximumFractionDigits !== undefined ? { maximumFractionDigits: displayConfig.maximumFractionDigits } : {}),
    ...(displayConfig?.minimumFractionDigits !== undefined ? { minimumFractionDigits: displayConfig.minimumFractionDigits } : {}),
    ...(displayConfig?.precision !== undefined ? { precision: displayConfig.precision } : {}),
    ...(displayConfig?.prefix ? { prefix: displayConfig.prefix } : {}),
    ...(displayConfig?.suffix ? { suffix: displayConfig.suffix } : {}),
    ...(displayConfig?.thousandsSeparator ? { thousandsSeparator: displayConfig.thousandsSeparator } : {})
  };
  const numeric = numericMetricValue(raw);
  const absoluteRaw = displayConfig?.negativeStyle === 'absolute' && numeric < 0 ? Math.abs(numeric) : raw;
  if (displayConfig?.negativeStyle === 'parentheses' && numeric < 0) {
    const formatted = column.format
      ? formatMetric(Math.abs(numeric), column.format, options)
      : withAffixes(String(Math.abs(numeric)), displayConfig);
    return `(${formatted})`;
  }
  if (column.format) return formatMetric(absoluteRaw, column.format, options);
  return withAffixes(String(absoluteRaw ?? ''), displayConfig);
}

function structuredDisplayValue(value: unknown, config: DashboardTableColumnDisplayConfig | undefined): string | undefined {
  if (!config?.formatter) return undefined;
  return jsonListDisplay(value, {
    currencyFields: [config.itemCurrencyField, 'CurrencySymbol', 'currencySymbol', 'Currency', 'currency', 'Symbol', 'symbol'],
    fallbackCurrencySymbol: config.currencySymbol,
    labelFields: [config.itemLabelField, 'Label', 'label', 'Name', 'name', 'Title', 'title', 'RateName', 'rateName'],
    labelValueSeparator: config.itemLabelValueSeparator ?? ': ',
    precision: config.itemPrecision ?? config.precision ?? config.maximumFractionDigits,
    separator: config.itemSeparator ?? '\n',
    skipZero: config.skipZeroItems ?? false,
    valueFields: [config.itemValueField, 'Value', 'value', 'Amount', 'amount', 'Total', 'total']
  });
}

function jsonListDisplay(
  value: unknown,
  options: {
    currencyFields: Array<string | undefined>;
    fallbackCurrencySymbol: string | undefined;
    labelFields: Array<string | undefined>;
    labelValueSeparator: string;
    precision: number | undefined;
    separator: string;
    skipZero: boolean;
    valueFields: Array<string | undefined>;
  }
): string | undefined {
  const items = structuredItems(value);
  if (!items) return undefined;
  const lines = items.flatMap(item => {
    if (!isRecord(item)) return primitiveListValue(item);
    const rawAmount = recordValue(item, options.valueFields);
    if (options.skipZero && isZeroAmount(rawAmount)) return [];
    const label = stringValue(recordValue(item, options.labelFields));
    const currency = stringValue(recordValue(item, options.currencyFields)) ?? options.fallbackCurrencySymbol ?? '';
    const amount = amountDisplay(rawAmount, currency, options.precision);
    if (label && amount) return [`${label}${options.labelValueSeparator}${amount}`];
    if (label) return [label];
    if (amount) return [amount];
    return [];
  });
  return lines.join(options.separator);
}

function structuredItems(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  const parsed = parseStructuredValue(value);
  if (Array.isArray(parsed)) return parsed;
  if (!isRecord(parsed)) return undefined;
  for (const key of ['items', 'Items', 'data', 'Data', 'values', 'Values', 'rows', 'Rows']) {
    const nested = parsed[key];
    if (Array.isArray(nested)) return nested;
  }
  return [parsed];
}

function parseStructuredValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || (text[0] !== '[' && text[0] !== '{')) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function primitiveListValue(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  return [String(value)];
}

function recordValue(record: Record<string, unknown>, keys: Array<string | undefined>): unknown {
  for (const key of keys) {
    if (key && Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  const lowerCaseMap = new Map(Object.keys(record).map(key => [key.toLowerCase(), key]));
  for (const key of keys) {
    const actualKey = key ? lowerCaseMap.get(key.toLowerCase()) : undefined;
    if (actualKey) return record[actualKey];
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isZeroAmount(value: unknown): boolean {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numberValue) && numberValue === 0;
}

function amountDisplay(value: unknown, currencySymbol: string, precision: number | undefined): string {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return stringValue(value) ?? '';
  if (precision === undefined) {
    return `${currencySymbol}${new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 20,
      useGrouping: true
    }).format(numeric)}`;
  }
  const digits = precision ?? 2;
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    useGrouping: true
  }).format(numeric);
  return `${currencySymbol}${formatted}`;
}

function withAffixes(value: string, config: DashboardTableColumnDisplayConfig | undefined): string {
  return `${config?.prefix ?? ''}${value}${config?.suffix ?? ''}`;
}
