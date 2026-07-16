import type { VisualizationSpec } from '../../types';
import { formatValue } from './formatting';
import type { BaseChartOptions } from './options';

export interface PieLegendItem {
  fillStyle: string;
  index: number;
  lineWidth: number;
  strokeStyle: string;
  text: string;
}

export function pieLegendItemsPerPage(options: BaseChartOptions): number {
  if (options.legendItemsPerPage === undefined) {
    return options.legendPosition === 'left' || options.legendPosition === 'right' ? 4 : 10;
  }
  if (options.legendItemsPerPage <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor(options.legendItemsPerPage));
}

export function pieShowsChartValues(options: BaseChartOptions): boolean {
  const location = options.valueDisplay ?? 'chart';
  return location === 'chart' || location === 'both';
}

export function pieShowsLegendValues(options: BaseChartOptions): boolean {
  const location = options.valueDisplay ?? 'chart';
  return location === 'legend' || location === 'both';
}

export function pieLegendPageCount(totalItems: number, options: BaseChartOptions): number {
  const itemsPerPage = pieLegendItemsPerPage(options);
  if (!Number.isFinite(itemsPerPage)) return 1;
  return Math.max(1, Math.ceil(totalItems / itemsPerPage));
}

export function pieLegendItemsForPage(
  items: PieLegendItem[],
  options: BaseChartOptions,
  page: number
): PieLegendItem[] {
  const itemsPerPage = pieLegendItemsPerPage(options);
  if (!Number.isFinite(itemsPerPage)) return items;
  const safePage = Math.max(0, page);
  const startIndex = safePage * itemsPerPage;
  return items.slice(startIndex, startIndex + itemsPerPage);
}

export function buildPieLegendItems(
  labels: string[],
  dataset: {
    backgroundColor?: unknown;
    borderColor?: unknown;
    borderWidth?: unknown;
    data?: unknown[];
    label?: string;
  },
  spec: VisualizationSpec,
  options: BaseChartOptions
): PieLegendItem[] {
  const values = Array.isArray(dataset.data) ? dataset.data.map(value => Number(value)) : [];
  const total = values.reduce((sum, value) => Number.isFinite(value) ? sum + value : sum, 0);
  return labels.map((label, index) => {
    const numericValue = Number(values[index] ?? 0);
    return {
      fillStyle: colorAt(dataset.backgroundColor, index, '#3b82f6'),
      index,
      lineWidth: numericBorderWidth(dataset.borderWidth),
      strokeStyle: colorAt(dataset.borderColor, index, '#3b82f6'),
      text: pieLegendText(label, numericValue, total, spec, options, dataset.label)
    };
  });
}

function pieLegendText(
  label: string,
  value: number,
  total: number,
  spec: VisualizationSpec,
  options: BaseChartOptions,
  datasetLabel?: string
): string {
  if (!pieShowsLegendValues(options) || options.dataLabelFormat === 'label') return label;
  const percentage = total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0.0%';
  const formattedValue = formatValue(value, spec, options, datasetLabel);
  switch (options.dataLabelFormat) {
    case 'percentage':
      return `${label} ${percentage}`;
    case 'both':
      return `${label} ${formattedValue} ${percentage}`;
    default:
      return `${label} ${formattedValue}`;
  }
}

function colorAt(value: unknown, index: number, fallback: string): string {
  if (Array.isArray(value)) {
    const item = value[index];
    return typeof item === 'string' && item.trim().length > 0 ? item.trim() : fallback;
  }
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function numericBorderWidth(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    const first = Number(value[0]);
    return Number.isFinite(first) ? first : 1;
  }
  return 1;
}
