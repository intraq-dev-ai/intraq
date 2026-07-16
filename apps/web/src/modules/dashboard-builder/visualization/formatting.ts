import type { VisualizationSpec } from '../types';

export type MetricFormat = NonNullable<VisualizationSpec['encodings'][number]['format']>;
export type MetricDisplayFormat = MetricFormat | 'date' | 'text';
export type ThousandsSeparatorStyle = 'comma' | 'none' | 'space';

export interface MetricFormatOptions {
  compact?: boolean;
  currencySymbol?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  prefix?: string;
  precision?: number;
  suffix?: string;
  thousandsSeparator?: ThousandsSeparatorStyle;
  unit?: string;
}

const LOCALE = 'en-US';
const CURRENCY = 'USD';

export function formatMetric(
  value: unknown,
  format: MetricDisplayFormat | undefined,
  options: MetricFormatOptions = {}
): string {
  if (format === 'date') return String(value ?? '');
  if (format === 'text') return `${options.prefix ?? ''}${String(value ?? '')}${options.suffix ?? ''}`;

  const numeric = numericMetricValue(value);
  if (!Number.isFinite(numeric)) return '';

  const unitAdjusted = applyUnit(numeric, options.unit);
  const target = unitAdjusted.value;
  if (format === 'currency') {
    return withAffixes(formatCurrency(target, options, unitAdjusted.suffix), options);
  }
  if (format === 'percentage') {
    const normalized = options.precision === undefined && Math.abs(target) <= 1 ? target : target / 100;
    return withAffixes(applyThousandsSeparatorPolicy(new Intl.NumberFormat(LOCALE, {
      maximumFractionDigits: options.precision ?? options.maximumFractionDigits ?? 1,
      minimumFractionDigits: options.minimumFractionDigits ?? options.precision ?? 0,
      style: 'percent'
    }).format(normalized), options.thousandsSeparator) + unitAdjusted.suffix, options);
  }

  return withAffixes(formatNumber(target, options, unitAdjusted.suffix), options);
}

export function numericMetricValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const numeric = Number(value.replace(/[,$%]/g, '').trim());
    return Number.isFinite(numeric) ? numeric : 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function labelFor(value: string): string {
  return value.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function formatCurrency(value: number, options: MetricFormatOptions, unitSuffix = ''): string {
  const compact = shouldCompact(options, unitSuffix) ? compactValue(value) : null;
  const target = compact?.value ?? value;
  if (options.currencySymbol) {
    return `${options.currencySymbol}${formatPlainNumber(target, options)}${compact?.suffix ?? unitSuffix}`;
  }
  const formatted = applyThousandsSeparatorPolicy(new Intl.NumberFormat(LOCALE, {
    currency: CURRENCY,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: options.precision ?? options.maximumFractionDigits ?? (compact ? 2 : 0),
    minimumFractionDigits: options.minimumFractionDigits ?? options.precision ?? 0,
    style: 'currency'
  }).format(target), options.thousandsSeparator);
  return `${formatted}${compact?.suffix ?? unitSuffix}`;
}

function formatNumber(value: number, options: MetricFormatOptions, unitSuffix = ''): string {
  const compact = shouldCompact(options, unitSuffix) ? compactValue(value) : null;
  const target = compact?.value ?? value;
  return `${formatPlainNumber(target, {
    ...options,
    maximumFractionDigits: options.precision ?? options.maximumFractionDigits ?? (compact ? 2 : 2)
  })}${compact?.suffix ?? unitSuffix}`;
}

function formatPlainNumber(value: number, options: MetricFormatOptions): string {
  return applyThousandsSeparatorPolicy(new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: options.precision ?? options.maximumFractionDigits ?? 2,
    minimumFractionDigits: options.minimumFractionDigits ?? options.precision ?? 0
  }).format(value), options.thousandsSeparator);
}

function applyUnit(value: number, unit: string | undefined): { suffix: string; value: number } {
  if (unit === 'thousand') return { suffix: 'K', value: value / 1_000 };
  if (unit === 'million') return { suffix: 'M', value: value / 1_000_000 };
  if (unit === 'billion') return { suffix: 'B', value: value / 1_000_000_000 };
  return { suffix: '', value };
}

function shouldCompact(options: MetricFormatOptions, unitSuffix: string): boolean {
  if (!options.compact || unitSuffix) return false;
  return options.unit === undefined || options.unit === 'auto';
}

function withAffixes(value: string, options: MetricFormatOptions): string {
  return `${options.prefix ?? ''}${value}${options.suffix ?? ''}`;
}

function compactValue(value: number): { suffix: string; value: number } | null {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return { suffix: 'B', value: value / 1_000_000_000 };
  if (absolute >= 1_000_000) return { suffix: 'M', value: value / 1_000_000 };
  if (absolute >= 1_000) return { suffix: 'K', value: value / 1_000 };
  return null;
}

function applyThousandsSeparatorPolicy(
  value: string,
  policy: ThousandsSeparatorStyle | undefined
): string {
  if (policy === 'none') return value.replace(/,/g, '');
  if (policy === 'space') return value.replace(/,/g, ' ');
  return value;
}
