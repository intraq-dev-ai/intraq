import type { VisualizationData, VisualizationSpec } from '../types';

export interface ChartCrossFilterEntry {
  displayValueLabel?: string;
  field: string;
  label: string;
  operator?: 'between' | 'equals';
  value: unknown;
}

export interface ChartCrossFilterSelection {
  entries: ChartCrossFilterEntry[];
}

export function chartCrossFilterSelectionForPoint(
  spec: VisualizationSpec,
  data: VisualizationData,
  point: { dataIndex: number; datasetIndex: number }
): ChartCrossFilterSelection | null {
  const dimension = spec.encodings.find(encoding =>
    encoding.role === 'time' || encoding.role === 'dimension' || encoding.role === 'filter'
  );
  const entries: ChartCrossFilterEntry[] = [];
  const labelValue = data.labels[point.dataIndex];
  if (dimension && labelValue !== undefined) {
    const grouping = readString((spec as VisualizationSpec & Record<string, unknown>).xAxisGrouping);
    const bucketRange = dimension.role === 'time' && grouping ? rangeForBucket(labelValue, grouping) : null;
    entries.push({
      ...(bucketRange ? { displayValueLabel: String(labelValue) } : {}),
      field: dimension.field,
      label: dimension.label ?? humanize(dimension.field),
      ...(bucketRange ? { operator: 'between' as const, value: bucketRange } : { operator: 'equals' as const, value: labelValue })
    });
  }

  const seriesBy = readString((spec as VisualizationSpec & Record<string, unknown>).seriesBy);
  const datasetLabel = data.datasets[point.datasetIndex]?.label;
  if (seriesBy && datasetLabel) {
    entries.push({
      field: seriesBy,
      label: humanize(seriesBy),
      operator: 'equals',
      value: datasetLabel
    });
  }

  return entries.length > 0 ? { entries } : null;
}

function rangeForBucket(value: unknown, grouping: string): [string, string] | null {
  const start = parseBucketDate(value);
  if (!start) return null;
  const end = endForGrouping(start, grouping);
  if (!end) return null;
  return [
    formatBucketBoundary(start, grouping, 'start'),
    formatBucketBoundary(end, grouping, 'end')
  ];
}

function parseBucketDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const raw = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endForGrouping(start: Date, grouping: string): Date | null {
  switch (grouping) {
    case 'minute':
      return new Date(start.getTime() + 60_000 - 1);
    case 'hour':
      return new Date(start.getTime() + 3_600_000 - 1);
    case 'day':
      return new Date(start.getTime() + 86_400_000 - 1);
    case 'week':
      return new Date(start.getTime() + (7 * 86_400_000) - 1);
    case 'month':
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) - 1);
    case 'quarter':
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1) - 1);
    case 'year':
      return new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1) - 1);
    default:
      return null;
  }
}

function formatBucketBoundary(date: Date, grouping: string, _bound: 'end' | 'start'): string {
  if (grouping === 'hour' || grouping === 'minute') return date.toISOString();
  return date.toISOString();
}

function humanize(value: string): string {
  return value.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
