import type { VisualizationSpec } from '../../types';
import { formatValue } from './formatting';
import type { BaseChartOptions } from './options';
import type { ChartVisualTheme } from './theme';

export function scalesConfig(
  spec: VisualizationSpec,
  options: BaseChartOptions,
  isStacked: boolean,
  hasY2: boolean,
  theme: ChartVisualTheme,
  isHorizontalBar = false,
  scaleHints: Partial<Record<'ySuggestedMax' | 'ySuggestedMin' | 'y2SuggestedMax' | 'y2SuggestedMin', number>> = {},
  labels: unknown[] = []
) {
  const maxLabelLength = labels.reduce<number>((max, l) => Math.max(max, String(l ?? '').length), 0);
  const highchartsSpacing = usesHighchartsSpacing(options);
  const autoRotation = autoXAxisLabelRotation(labels, maxLabelLength, isHorizontalBar, options.xAxisLabelRotation, highchartsSpacing);
  const xAxisLabelMaxRotation = isHorizontalBar ? 0 : (options.xAxisLabelRotation ?? autoRotation.max);
  const xAxisLabelMinRotation = isHorizontalBar ? 0 : (options.xAxisLabelRotation ?? autoRotation.min);
  const xAxisLabelAlignment = options.xAxisLabelAlignment ?? (highchartsSpacing ? 'inner' : 'center');
  const truncateAt = isHorizontalBar ? 25 : 30;

  const valueTicks = (axis: 'y' | 'y2') => ({
    color: theme.mutedColor,
    font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: 600 },
    maxTicksLimit: 7,
    padding: axis === 'y2'
      ? options.y2AxisTickPadding ?? options.yAxisTickPadding ?? defaultYAxisTickPadding(options)
      : options.yAxisTickPadding ?? defaultYAxisTickPadding(options),
    callback: (value: unknown) => formatValue(value, spec, options, seriesForAxis(options, axis))
  });
  const categoryTicks = {
    align: xAxisLabelAlignment,
    autoSkip: true,
    autoSkipPadding: isHorizontalBar ? 8 : 4,
    color: theme.mutedColor,
    font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: 600 },
    maxRotation: xAxisLabelMaxRotation,
    minRotation: xAxisLabelMinRotation,
    padding: 10,
    callback(this: { getLabelForValue?: (value: number) => string }, value: string | number) {
      const label = typeof value === 'number' && typeof this.getLabelForValue === 'function'
        ? this.getLabelForValue(value)
        : String(value);
      return truncateLabel(label, truncateAt);
    }
  };
  const yScale = {
    beginAtZero: axisBeginsAtZero(options.yAxisStartMode, options.yAxisPaddingMode),
    border: { display: !isHorizontalBar, color: theme.gridColor },
    display: options.showYAxis,
    suggestedMin: scaleHints.ySuggestedMin,
    suggestedMax: scaleHints.ySuggestedMax,
    stacked: isStacked,
    title: axisTitle(options.yAxisLabel, theme, titlePadding(options.yAxisTitlePadding, options)),
    ticks: isHorizontalBar ? categoryTicks : valueTicks('y'),
    grid: { color: theme.gridColor, display: options.showGrid, drawTicks: false }
  };
  return {
    x: {
      border: { display: false },
      display: options.showXAxis,
      stacked: isStacked,
      title: axisTitle(options.xAxisLabel, theme, { bottom: 4, top: 6 }),
      ticks: isHorizontalBar ? valueTicks('y') : categoryTicks,
      grid: { color: theme.gridColor, display: options.showGrid && isHorizontalBar, drawTicks: false }
    },
    y: yScale,
    ...(hasY2 ? {
      y2: {
        ...yScale,
        beginAtZero: axisBeginsAtZero(options.y2AxisStartMode, options.y2AxisPaddingMode),
        position: 'right',
        suggestedMin: scaleHints.y2SuggestedMin,
        suggestedMax: scaleHints.y2SuggestedMax,
        stacked: false,
        ticks: valueTicks('y2'),
        title: axisTitle(options.y2AxisLabel, theme, titlePadding(options.y2AxisTitlePadding ?? options.yAxisTitlePadding, options)),
        grid: { display: false }
      }
    } : {})
  };
}

function seriesForAxis(options: BaseChartOptions, axis: 'y' | 'y2'): string | undefined {
  const candidates = [
    ...Object.keys(options.ySeriesFormat),
    ...Object.keys(options.ySeriesCurrencySymbol),
    ...Object.keys(options.ySeriesDecimals),
    ...Object.keys(options.ySeriesThousandsSeparator),
    ...Object.keys(options.ySeriesPrefix),
    ...Object.keys(options.ySeriesColors),
    ...Object.keys(options.ySeriesAxis)
  ];
  for (const series of candidates) {
    const seriesAxis = options.ySeriesAxis[series] === 'y2' ? 'y2' : 'y';
    if (seriesAxis === axis) return series;
  }
  return undefined;
}

function autoXAxisLabelRotation(
  labels: unknown[],
  maxLabelLength: number,
  isHorizontalBar: boolean,
  explicitRotation: number | undefined,
  highchartsSpacing: boolean
): { max: number; min: number } {
  if (isHorizontalBar || explicitRotation !== undefined) return { max: 0, min: 0 };

  const labelCount = labels.length;
  if (highchartsSpacing && isDenseTimeAxisLabelSet(labels)) return { max: 65, min: 65 };
  if (labelCount <= 8 || maxLabelLength <= 8) return { max: 45, min: 0 };

  if (labelCount > 35) return { max: 65, min: 0 };
  if (labelCount >= 16) return { max: 45, min: 0 };
  if (labelCount >= 10 && maxLabelLength > 14) return { max: 45, min: 0 };

  return { max: 45, min: 0 };
}

function isDenseTimeAxisLabelSet(labels: unknown[]): boolean {
  if (labels.length < 16) return false;
  const textLabels = labels.map(label => String(label ?? '').trim()).filter(Boolean);
  if (textLabels.length < 16) return false;
  const timeLikeCount = textLabels.filter(isTimeOfDayLabel).length;
  return timeLikeCount >= Math.min(textLabels.length, 12);
}

function isTimeOfDayLabel(label: string): boolean {
  return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(label)
    || /^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(?::\d{2})?$/.test(label);
}

function axisBeginsAtZero(startMode: BaseChartOptions['yAxisStartMode'], paddingMode: BaseChartOptions['yAxisPaddingMode']): boolean {
  return paddingMode === 'none' && startMode === 'zero';
}

function defaultYAxisTickPadding(options: BaseChartOptions): number {
  if (!usesHighchartsSpacing(options)) return 4;
  return 5;
}

function titlePadding(
  value: number | undefined,
  options: BaseChartOptions
): number | { bottom: number; top: number } | undefined {
  if (value !== undefined) return value;
  return usesHighchartsSpacing(options) ? 10 : undefined;
}

function usesHighchartsSpacing(options: BaseChartOptions): boolean {
  return options.chartSpacingPreset === 'highcharts' || options.chartSpacingPreset === 'legacy' || options.chartSpacingPreset === 'report';
}

function axisTitle(label: string | undefined, theme: ChartVisualTheme, padding?: number | { bottom: number; top: number }) {
  const resolvedPadding = typeof padding === 'number'
    ? { bottom: padding, top: padding }
    : padding ?? { bottom: 2, top: 2 };
  return {
    color: theme.textColor,
    display: Boolean(label),
    font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: 700 },
    padding: resolvedPadding,
    text: label
  };
}

function truncateLabel(label: string, maxLength: number): string {
  return label.length <= maxLength ? label : `${label.slice(0, maxLength - 3)}...`;
}
