import type { VisualizationData } from '../../types';
import type { BaseChartOptions, TimeBucketInterval } from './options';
import { seriesLabel } from './series';

export interface NormalizedChartData {
  labels: string[];
  datasets: Array<{ label: string; data: number[]; placeholder?: boolean }>;
  runtimeContext?: VisualizationData['runtimeContext'];
}

export function normalizeData(data: VisualizationData): NormalizedChartData {
  return {
    labels: data.labels.map(label => String(label)),
    datasets: data.datasets.map(dataset => ({
      label: dataset.label,
      data: dataset.data.map(value => Number.isFinite(Number(value)) ? Number(value) : 0),
      placeholder: dataset.placeholder
    })),
    runtimeContext: data.runtimeContext
  };
}

export function applySortingAndTopN(data: NormalizedChartData, options: BaseChartOptions): NormalizedChartData {
  const bucketedData = fillMissingTimeBuckets(data, options);
  const rows = bucketedData.labels.map((label, index) => ({
    index,
    label,
    value: sortValueAt(index, bucketedData.datasets, options)
  }));
  const shouldSortPie = !options.sortBy && (options.chartIntent === 'pie' || options.chartIntent === 'doughnut');
  if (options.sortBy || shouldSortPie) {
    rows.sort((a, b) => compareSortValues(a.label, a.value, b.label, b.value, options.sortBy ?? 'value', shouldSortPie ? 'desc' : options.sortDirection));
  }
  const visibleRows = options.topN === undefined ? rows : rows.slice(0, options.topN);
  return {
    labels: visibleRows.map(row => row.label),
    datasets: bucketedData.datasets.map(dataset => ({
      ...dataset,
      data: visibleRows.map(row => dataset.data[row.index] ?? 0)
    }))
  };
}

export function fillMissingTimeBuckets(data: NormalizedChartData, options: BaseChartOptions): NormalizedChartData {
  if (!options.fillMissingTimeBuckets) return data;
  const interval = resolveBucketInterval(options, data);
  if (!interval) return data;
  const range = resolveBucketRange(data, interval);
  if (!range) return data;
  const labels = bucketLabels(range.start, range.end, interval);
  if (labels.length === 0) return data;
  const labelIndex = new Map<string, number>();
  data.labels.forEach((label, index) => {
    const key = bucketKey(parseDateLabel(label), interval) ?? bucketKeyFromLabel(label, interval);
    if (key && !labelIndex.has(key)) labelIndex.set(key, index);
  });
  const datasets = normalizedBucketDatasets(data, labels, labelIndex, options);
  if (datasets.length === 0) return data;
  return { labels, datasets };
}

function sortValueAt(index: number, datasets: NormalizedChartData['datasets'], options: BaseChartOptions): number {
  if (options.sortBy && options.sortBy !== 'value' && options.sortBy !== 'label') {
    const matchingDataset = datasets.find(dataset => dataset.label === options.sortBy || seriesLabel(dataset.label, options) === options.sortBy);
    if (matchingDataset) return matchingDataset.data[index] ?? 0;
  }
  return datasets[0]?.data[index] ?? 0;
}

function normalizedBucketDatasets(
  data: NormalizedChartData,
  labels: string[],
  labelIndex: Map<string, number>,
  options: BaseChartOptions
): NormalizedChartData['datasets'] {
  const sourceDatasets = data.datasets.length > 0
    ? data.datasets
    : options.timeBucketFallbackSeriesLabel
      ? [{ label: options.timeBucketFallbackSeriesLabel, data: [] }]
      : [];
  return sourceDatasets.map(dataset => ({
    ...dataset,
    data: labels.map(label => {
      const sourceIndex = labelIndex.get(label);
      return sourceIndex === undefined ? options.timeBucketFillValue : dataset.data[sourceIndex] ?? options.timeBucketFillValue;
    })
  }));
}

function resolveBucketInterval(options: BaseChartOptions, data: NormalizedChartData): TimeBucketInterval | null {
  if (options.timeBucketInterval !== 'auto') return options.timeBucketInterval;
  const values = readRuntimeParameters(data);
  const rangeType = readStringValue(values, ['rangeType', 'rangetype']);
  if (rangeType === '0') return 'hour';
  if (rangeType === '1' || rangeType === '2') return 'day';
  const frequency = readStringValue(values, ['rangeFrequency', 'rangefrequency'])?.toLowerCase();
  if (frequency === 'hourly') return 'hour';
  if (frequency === 'daily') return 'day';
  if (frequency === 'weekly') return 'week';
  if (frequency === 'monthly') return 'month';
  const period = readStringValue(values, ['period', 'rangeTypeText', 'rangetypetext'])?.toLowerCase();
  if (period === 'day' || period === 'daily') return 'hour';
  if (period === 'week' || period === 'month' || period === 'range') return 'day';
  if (period === 'year') return 'month';
  if (period === 'quarter') return 'week';
  const parsedLabels = data.labels.map(parseDateLabel).filter((value): value is Date => Boolean(value));
  if (parsedLabels.length === 0) return null;
  return parsedLabels.some(date => date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0) ? 'hour' : 'day';
}

function resolveBucketRange(data: NormalizedChartData, interval: TimeBucketInterval): { end: Date; start: Date } | null {
  const values = readRuntimeParameters(data);
  const startCandidate = dateFromRuntime(values, ['startDate', 'startdate', 'fromDate', 'fromdate', 'from', 'start', 'selectedDate', 'selecteddate', 'selectedDay', 'selectedday']);
  const endCandidate = dateFromRuntime(values, ['endDate', 'enddate', 'toDate', 'todate', 'to', 'end']);
  const labels = data.labels.map(parseDateLabel).filter((value): value is Date => Boolean(value));
  let start = startCandidate ?? earliestDate(labels);
  let end = endCandidate ?? latestDate(labels);
  const period = readStringValue(values, ['period', 'rangeTypeText', 'rangetypetext'])?.toLowerCase();
  const rangeType = readStringValue(values, ['rangeType', 'rangetype']);
  if (!start && end) start = new Date(end);
  if (start && (!end || interval === 'hour' || period === 'day' || rangeType === '0')) {
    end = interval === 'hour' ? endOfDay(start) : new Date(start);
  }
  if (!start || !end) return null;
  if (interval === 'hour') return { start: startOfDay(start), end: endOfDay(start) };
  return { start: startOfBucket(start, interval), end: startOfBucket(end, interval) };
}

function readRuntimeParameters(data: NormalizedChartData): Record<string, unknown> {
  return data.runtimeContext?.parameterValues ?? {};
}

function dateFromRuntime(values: Record<string, unknown>, keys: string[]): Date | null {
  for (const key of keys) {
    const value = values[key] ?? values[key.toLowerCase()];
    const parsed = parseDateLabel(value);
    if (parsed) return parsed;
  }
  return null;
}

function earliestDate(values: Date[]): Date | null {
  if (values.length === 0) return null;
  return new Date(Math.min(...values.map(value => value.getTime())));
}

function latestDate(values: Date[]): Date | null {
  if (values.length === 0) return null;
  return new Date(Math.max(...values.map(value => value.getTime())));
}

function bucketLabels(start: Date, end: Date, interval: TimeBucketInterval): string[] {
  const labels: string[] = [];
  const current = startOfBucket(start, interval);
  const last = startOfBucket(end, interval);
  const maxBuckets = 400;
  while (current.getTime() <= last.getTime() && labels.length < maxBuckets) {
    labels.push(formatBucketLabel(current, interval));
    incrementBucket(current, interval);
  }
  return labels;
}

function startOfBucket(value: Date, interval: TimeBucketInterval): Date {
  const date = new Date(value);
  if (interval === 'hour') {
    date.setMinutes(0, 0, 0);
    return date;
  }
  date.setHours(0, 0, 0, 0);
  if (interval === 'week') {
    const offset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offset);
  } else if (interval === 'month') {
    date.setDate(1);
  }
  return date;
}

function incrementBucket(date: Date, interval: TimeBucketInterval): void {
  if (interval === 'hour') date.setHours(date.getHours() + 1);
  else if (interval === 'week') date.setDate(date.getDate() + 7);
  else if (interval === 'month') date.setMonth(date.getMonth() + 1);
  else date.setDate(date.getDate() + 1);
}

function formatBucketLabel(date: Date, interval: TimeBucketInterval): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return interval === 'hour' ? `${day} ${pad(date.getHours())}:00:00` : day;
}

function bucketKey(date: Date | null, interval: TimeBucketInterval): string | null {
  return date ? formatBucketLabel(startOfBucket(date, interval), interval) : null;
}

function bucketKeyFromLabel(label: string, interval: TimeBucketInterval): string | null {
  if (interval === 'hour') {
    const time = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(label.trim());
    if (time?.[1]) return `1970-01-01 ${pad(Number(time[1]))}:00:00`;
  }
  return null;
}

function parseDateLabel(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value);
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?/.exec(text);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4] ?? 0);
    const minute = Number(match[5] ?? 0);
    const second = Number(match[6] ?? 0);
    if ([year, month, day, hour, minute, second].every(Number.isFinite)) {
      return new Date(year, month - 1, day, hour, minute, second);
    }
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function readStringValue(values: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = values[key] ?? values[key.toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return undefined;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = startOfDay(date);
  next.setHours(23, 0, 0, 0);
  return next;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function compareSortValues(
  aLabel: string,
  aValue: number,
  bLabel: string,
  bValue: number,
  sortBy: string,
  direction: BaseChartOptions['sortDirection']
): number {
  const multiplier = direction === 'asc' ? 1 : -1;
  if (sortBy === 'label') return multiplier * aLabel.localeCompare(bLabel);
  return multiplier * (aValue - bValue);
}
