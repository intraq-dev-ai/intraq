import type { ChartType } from 'chart.js';
import { labelFor } from '../formatting';
import type { BaseChartOptions } from './options';
import type { ChartVisualTheme } from './theme';
import { SCROLLABLE_BAR_CATEGORY_COUNT } from './viewport';

export const palette = ['#3b82f6', '#f59e42', '#10b981', '#f87171', '#a78bfa', '#fbbf24', '#ef4444', '#14b8a6'];
const STACK_KEY = 'stacked-bars';
const chartThemePalettes: Record<string, string[]> = {
  corporate: ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#1f2937', '#4b5563', '#9ca3af'],
  default: ['#3b82f6', '#f59e42', '#10b981', '#f87171', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'],
  earth: ['#78350f', '#92400e', '#a16207', '#65a30d', '#166534', '#065f46', '#064e3b', '#713f12'],
  forest: ['#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0'],
  'operations-light': ['#244092', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#16a34a', '#64748b'],
  'operational-health': ['#2d86d4', '#2d948c', '#ca8617', '#6e62b6', '#d64d4d', '#5d9f40', '#4c7899', '#8a6f3d'],
  monochrome: ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb'],
  ocean: ['#0c4a6e', '#075985', '#0369a1', '#0284c7', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9'],
  pastel: ['#93c5fd', '#fbbf24', '#6ee7b7', '#fca5a5', '#c4b5fd', '#f9a8d4', '#5eead4', '#fdba74'],
  rainbow: ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6'],
  sunset: ['#7c2d12', '#9a3412', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa'],
  vibrant: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
};

export function buildDataset(
  dataset: { label: string; data: number[]; placeholder?: boolean },
  index: number,
  labels: string[],
  chartType: ChartType,
  options: BaseChartOptions,
  theme: ChartVisualTheme,
  isHorizontalBar = false
) : Record<string, unknown> {
  const field = dataset.label;
  const isPieLike = chartType === 'pie' || chartType === 'doughnut';
  const datasetType = datasetChartJsType(field, chartType, options);
  const isLineLike = datasetType === 'line';
  const isArea = isAreaSeries(field, options);
  const isPlaceholder = dataset.placeholder === true;
  const color = seriesColor(field, index, options);
  const backgroundColor = isPieLike
    ? labels.map((label, itemIndex) => {
      const sliceColor = xValueColor(label, itemIndex, options) ?? paletteColor(itemIndex, options);
      return isPlaceholder ? colorWithAlpha(sliceColor, 0.14) : sliceColor;
    })
    : barPointColors(labels, field, color, options) ?? colorWithAlpha(color, placeholderFillAlpha(isPlaceholder, isArea));
  const borderColor = isPieLike
    ? theme.chartAreaBackgroundColor
    : isPlaceholder ? colorWithAlpha(color, isLineLike ? 0.3 : 0.22) : color;

  const chartDataset: Record<string, unknown> = {
    label: isPlaceholder ? '' : seriesLabel(field, options),
    data: dataset.data,
    borderColor,
    backgroundColor,
    borderWidth: isPieLike ? 1 : (isPlaceholder ? 1.5 : 2.25),
    hoverBorderWidth: isPlaceholder ? 1.5 : 3,
    order: isLineLike ? 1 : 2
  };

  if (datasetType !== chartType) chartDataset.type = datasetType;
  if (isPieLike) {
    chartDataset.borderColor = theme.chartAreaBackgroundColor;
    chartDataset.hoverOffset = 6;
    chartDataset.spacing = 1;
  }
  if (chartType === 'bar' && !isLineLike) {
    const scrollable = isHorizontalBar && labels.length > SCROLLABLE_BAR_CATEGORY_COUNT;
    const barSizing = chartBarSizing(isHorizontalBar, scrollable);
    chartDataset.barPercentage = barSizing.barPercentage;
    chartDataset.borderRadius = 0;
    chartDataset.borderSkipped = false;
    chartDataset.categoryPercentage = barSizing.categoryPercentage;
    if (barSizing.barThickness !== undefined) chartDataset.barThickness = barSizing.barThickness;
    if (barSizing.maxBarThickness !== undefined) chartDataset.maxBarThickness = barSizing.maxBarThickness;
  }
  if (isLineLike) {
    const tension = lineTension(options);
    if (tension > 0) chartDataset.cubicInterpolationMode = 'monotone';
    chartDataset.pointBackgroundColor = isPlaceholder
      ? colorWithAlpha(theme.chartAreaBackgroundColor, 0.92)
      : theme.chartAreaBackgroundColor;
    chartDataset.pointBorderColor = borderColor;
    chartDataset.pointBorderWidth = isPlaceholder ? 1.25 : 2;
    chartDataset.pointHitRadius = isPlaceholder ? 0 : 10;
    chartDataset.pointHoverBackgroundColor = isPlaceholder ? borderColor : color;
    chartDataset.pointHoverBorderColor = isPlaceholder
      ? colorWithAlpha(theme.chartAreaBackgroundColor, 0.92)
      : theme.chartAreaBackgroundColor;
    chartDataset.pointHoverRadius = isPlaceholder ? 0 : 5;
    chartDataset.pointRadius = isPlaceholder ? 1.5 : 2.5;
    chartDataset.tension = tension;
  }
  if (isArea) chartDataset.fill = 'origin';
  if (options.stackBars && chartType === 'bar' && !isLineLike) chartDataset.stack = STACK_KEY;
  if (!isPieLike) chartDataset.yAxisID = axisForDataset(field, options);
  return chartDataset;
}

export function chartBarSizing(
  isHorizontalBar: boolean,
  scrollable = false
): { barPercentage: number; barThickness?: number; categoryPercentage: number; maxBarThickness?: number } {
  if (!isHorizontalBar) return { barPercentage: 0.85, categoryPercentage: 0.9 };
  // Horizontal bars need denser category slots when there are only a few rows; otherwise store
  // breakdown charts look sparse. Keep the stricter cap only once the chart scrolls.
  return scrollable
    ? { barPercentage: 0.62, barThickness: 18, categoryPercentage: 0.5, maxBarThickness: 22 }
    : { barPercentage: 0.74, categoryPercentage: 0.84 };
}

export function chartJsType(intent: BaseChartOptions['chartIntent']): ChartType {
  if (intent === 'area') return 'line';
  if (intent === 'line' || intent === 'pie' || intent === 'doughnut') return intent;
  return 'bar';
}

export function axisForDataset(field: string, options: BaseChartOptions): 'y' | 'y2' {
  return options.ySeriesAxis[field] === 'y2' ? 'y2' : 'y';
}

export function seriesLabel(field: string, options: BaseChartOptions): string {
  return options.ySeriesLabels[field] ?? labelFor(field);
}

export function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (!/^[\da-f]{6}$/i.test(normalized)) return hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function placeholderFillAlpha(isPlaceholder: boolean, isArea: boolean): number {
  if (!isPlaceholder) return isArea ? 0.24 : 0.82;
  return isArea ? 0.1 : 0.16;
}

function datasetChartJsType(field: string, chartType: ChartType, options: BaseChartOptions): 'bar' | 'line' | undefined {
  const seriesType = options.ySeriesType[field];
  if (seriesType === 'line' || seriesType === 'area') return 'line';
  if (seriesType === 'column' || seriesType === 'bar') return 'bar';
  if (options.chartIntent === 'area') return 'line';
  return chartType === 'line' || chartType === 'bar' ? chartType : undefined;
}

function isAreaSeries(field: string, options: BaseChartOptions): boolean {
  return options.chartIntent === 'area' || options.ySeriesType[field] === 'area';
}

function lineTension(options: BaseChartOptions): number {
  if (options.lineInterpolation === 'straight') return 0;
  return options.lineTension ?? 0.35;
}

function seriesColor(field: string, index: number, options: BaseChartOptions): string {
  return options.ySeriesColors[field] ?? paletteColor(index, options);
}

function xValueColor(label: string, index: number, options: BaseChartOptions): string | undefined {
  return options.xValueColors[label] ?? options.xValueColors[String(index)];
}

function barPointColors(labels: string[], field: string, color: string, options: BaseChartOptions): string[] | undefined {
  const hasValueColors = Object.keys(options.xValueColors).length > 0;
  if (!hasValueColors) return undefined;
  return labels.map((label, index) => {
    const explicit = xValueColor(label, index, options);
    if (explicit) return explicit;
    return colorWithAlpha(color, 0.36);
  });
}

function paletteColor(index: number, options: BaseChartOptions): string {
  return chartPaletteColor(index, options.colorTheme);
}

export function chartPaletteColor(index: number, colorTheme?: string): string {
  const themePalette = colorTheme ? chartThemePalettes[colorTheme] : undefined;
  const source = themePalette?.length ? themePalette : palette;
  return source[index % source.length] ?? '#3b82f6';
}
