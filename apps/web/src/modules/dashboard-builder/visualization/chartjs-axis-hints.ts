import type { BaseChartOptions } from './chart/options';

type AxisScaleHintKey = 'ySuggestedMax' | 'ySuggestedMin' | 'y2SuggestedMax' | 'y2SuggestedMin';

export function dualAxisScaleHints(
  datasets: ReadonlyArray<Record<string, unknown>>,
  chartType: string,
  primaryHeadroomRatio = 0.6
): Partial<Record<AxisScaleHintKey, number>> {
  const hasBarAndLine = hasMixedBarAndLineDatasets(datasets, chartType);
  if (!hasBarAndLine) return {};

  let hasY = false;
  let hasY2 = false;
  let primaryMax = 0;

  for (const dataset of datasets) {
    const axisId = dataset.yAxisID === 'y2' ? 'y2' : 'y';
    const values = Array.isArray(dataset.data)
      ? dataset.data
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value >= 0)
      : [];
    const datasetMax = values.length > 0 ? Math.max(...values) : 0;

    if (axisId === 'y') {
      hasY = true;
      primaryMax = Math.max(primaryMax, datasetMax);
    } else {
      hasY2 = true;
    }
  }

  if (!hasY || !hasY2 || primaryMax <= 0) return {};
  const ratio = Number.isFinite(primaryHeadroomRatio) ? Math.max(0, primaryHeadroomRatio) : 0.6;
  return { ySuggestedMax: roundAxisMax(primaryMax * (1 + ratio)) };
}

export function autoAxisScaleHints(
  datasets: ReadonlyArray<Record<string, unknown>>,
  options: BaseChartOptions,
  chartType: string
): Partial<Record<AxisScaleHintKey, number>> {
  const ranges = axisRanges(datasets, chartType);
  const hints: Partial<Record<AxisScaleHintKey, number>> = {};
  Object.assign(hints, axisScaleHints('y', ranges.y, options.yAxisStartMode, options.yAxisPaddingMode, options.yAxisPaddingRatio));
  if (options.enableY2) {
    Object.assign(hints, axisScaleHints('y2', ranges.y2, options.y2AxisStartMode, options.y2AxisPaddingMode, options.y2AxisPaddingRatio));
  }
  return hints;
}

function axisScaleHints(
  axis: 'y' | 'y2',
  range: { min: number; max: number } | undefined,
  startMode: BaseChartOptions['yAxisStartMode'],
  paddingMode: BaseChartOptions['yAxisPaddingMode'],
  paddingRatio: number | undefined
): Partial<Record<AxisScaleHintKey, number>> {
  if (!range) return {};
  const minKey = axis === 'y2' ? 'y2SuggestedMin' : 'ySuggestedMin';
  const maxKey = axis === 'y2' ? 'y2SuggestedMax' : 'ySuggestedMax';
  if (paddingMode === 'zero-centered') {
    const ratio = paddingRatio ?? 0.5;
    const baseMin = Math.min(0, range.min);
    const baseMax = Math.max(0, range.max);
    const extent = Math.max(Math.abs(baseMin), Math.abs(baseMax), 1);
    return {
      [minKey]: roundAxisMin(baseMin - extent * ratio),
      [maxKey]: roundAxisMax(baseMax + extent * ratio)
    };
  }
  if (paddingMode === 'auto') {
    const ratio = paddingRatio ?? 0.15;
    const axisRange = range.max - range.min;
    const padding = axisRange <= 0
      ? Math.max(Math.abs(range.max), Math.abs(range.min), 1) * ratio
      : axisRange * ratio;
    return {
      [minKey]: roundAxisMin(range.min - padding),
      [maxKey]: roundAxisMax(range.max + padding)
    };
  }
  if (startMode === 'auto') {
    return { [minKey]: suggestedAxisMin(range.min, range.max) };
  }
  return {};
}

function axisRanges(
  datasets: ReadonlyArray<Record<string, unknown>>,
  chartType: string
): Partial<Record<'y' | 'y2', { min: number; max: number }>> {
  const ranges: Partial<Record<'y' | 'y2', { min: number; max: number }>> = {};
  for (const dataset of datasets) {
    const type = typeof dataset.type === 'string' ? dataset.type : chartType;
    if (type === 'pie' || type === 'doughnut') continue;
    const axisId = dataset.yAxisID === 'y2' ? 'y2' : 'y';
    const values = Array.isArray(dataset.data)
      ? dataset.data
        .map(value => Number(value))
        .filter(value => Number.isFinite(value))
      : [];
    if (values.length === 0) continue;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const current = ranges[axisId];
    if (!current) {
      ranges[axisId] = { min, max };
      continue;
    }
    current.min = Math.min(current.min, min);
    current.max = Math.max(current.max, max);
  }
  return ranges;
}

function suggestedAxisMin(min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return min;
  const range = max - min;
  if (range <= 0) {
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    return min > 0 ? Math.max(0, min - padding) : min - padding;
  }
  const padded = min - range * 0.15;
  return min > 0 ? Math.max(0, padded) : padded;
}

function roundAxisMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return value;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const increment = magnitude / 2;
  return Math.ceil(value / increment) * increment;
}

function roundAxisMin(value: number): number {
  if (!Number.isFinite(value) || value >= 0) return value;
  return -roundAxisMax(Math.abs(value));
}

export function hasMixedBarAndLineDatasets(
  datasets: ReadonlyArray<{ type?: unknown }>,
  chartType: unknown
): boolean {
  let hasBar = false;
  let hasLine = false;
  for (const dataset of datasets) {
    const type = typeof dataset.type === 'string' ? dataset.type : chartType;
    if (type === 'bar') hasBar = true;
    if (type === 'line') hasLine = true;
  }
  return hasBar && hasLine;
}
