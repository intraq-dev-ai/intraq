import type { ChartType, TooltipItem } from 'chart.js';
import type { VisualizationSpec } from '../../types';
import { formatMetric } from '../formatting';
import { primaryNumberFormat } from '../spec';
import type { BaseChartOptions } from './options';

export function tooltipLabel(item: TooltipItem<ChartType>, spec: VisualizationSpec, options: BaseChartOptions): string {
  const label = item.dataset.label ? `${item.dataset.label}: ` : '';
  return `${label}${formatValue(tooltipValue(item, options), spec, options, item.dataset.label)}`;
}

export function dataLabel(
  value: unknown,
  context: { dataset?: { label?: string; data?: unknown[] }; dataIndex?: number },
  labels: string[],
  options: BaseChartOptions,
  spec: VisualizationSpec
): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 1e-12) return '';
  const label = labels[context.dataIndex ?? -1] ?? '';
  if (options.dataLabelFormat === 'label') return label;
  if (options.dataLabelFormat === 'percentage' || options.dataLabelFormat === 'both') {
    const values = Array.isArray(context.dataset?.data) ? context.dataset.data.map(Number) : [];
    const total = values.reduce((sum, item) => Number.isFinite(item) ? sum + item : sum, 0);
    const percentage = total === 0 ? '0.0%' : `${((numeric / total) * 100).toFixed(1)}%`;
    if (options.dataLabelFormat === 'percentage') return percentage;
    return `${formatValue(numeric, spec, options, context.dataset?.label)}\n(${percentage})`;
  }
  return formatValue(numeric, spec, options, context.dataset?.label);
}

export function formatValue(value: unknown, spec: VisualizationSpec, options: BaseChartOptions, datasetLabel?: string): string {
  const numeric = typeof value === 'number' ? value : typeof value === 'object' && value !== null && 'y' in value
    ? Number((value as { y?: unknown }).y)
    : Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? '');
  const label = datasetLabel ?? '';
  const decimals = decimalsForDataset(label, options);
  const formatted = formatMetric(numeric, formatForDataset(label, spec, options), {
    currencySymbol: options.ySeriesCurrencySymbol[label] ?? options.defaultCurrencySymbol,
    maximumFractionDigits: decimals ?? 1,
    minimumFractionDigits: decimals,
    thousandsSeparator: options.ySeriesThousandsSeparator[label] ?? 'comma'
  });
  return `${options.ySeriesPrefix[label] ?? ''}${formatted}${currencySuffix(label, options)}`;
}

function formatForDataset(label: string, spec: VisualizationSpec, options: BaseChartOptions): ReturnType<typeof primaryNumberFormat> {
  const format = options.ySeriesFormat[label];
  if (format === 'currency' || format === 'number' || format === 'percentage' || format === 'date' || format === 'duration') return format;
  return primaryNumberFormat(spec);
}

function decimalsForDataset(label: string, options: BaseChartOptions): number | undefined {
  const configured = Number(options.ySeriesDecimals[label]);
  return Number.isInteger(configured) && configured >= 0 ? configured : undefined;
}

function currencySuffix(label: string, options: BaseChartOptions): string {
  return options.ySeriesCurrencySymbol[label] && options.ySeriesFormat[label] !== 'currency'
    ? options.ySeriesCurrencySymbol[label]
    : '';
}

function tooltipValue(item: TooltipItem<ChartType>, options: BaseChartOptions): unknown {
  const parsed = item.parsed as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return parsed ?? item.raw;
  const record = parsed as { x?: unknown; y?: unknown };
  if (options.chartIntent === 'bar') return record.x ?? record.y ?? item.raw;
  return record.y ?? record.x ?? item.raw;
}
