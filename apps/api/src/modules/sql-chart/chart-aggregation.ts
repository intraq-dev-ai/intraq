type ChartAggregation = 'avg' | 'count' | 'countDistinct' | 'max' | 'min' | 'none' | 'sum';

const ROW_COUNT_FIELD = '__row_count';

export function normalizeChartAggregation(value: string | undefined): ChartAggregation {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'avg' || normalized === 'average') return 'avg';
  if (normalized === 'count') return 'count';
  if (normalized === 'countdistinct' || normalized === 'count_distinct') return 'countDistinct';
  if (normalized === 'max') return 'max';
  if (normalized === 'min') return 'min';
  if (normalized === 'none') return 'none';
  return 'sum';
}

export function aggregateChartRows(items: Array<Record<string, unknown>>, field: string, aggregation: string | undefined): number {
  const normalized = normalizeChartAggregation(aggregation);
  if (field === ROW_COUNT_FIELD) return items.length;
  if (normalized === 'count') return items.length;
  if (normalized === 'countDistinct') {
    return new Set(items.map(item => item[field]).filter(value => value !== null && value !== undefined)).size;
  }

  const values = items.map(item => Number(item[field])).filter(Number.isFinite);
  if (values.length === 0) return 0;
  if (normalized === 'none') return values[0] ?? 0;
  if (normalized === 'avg') return values.reduce((total, value) => total + value, 0) / values.length;
  if (normalized === 'min') return Math.min(...values);
  if (normalized === 'max') return Math.max(...values);
  return values.reduce((total, value) => total + value, 0);
}
