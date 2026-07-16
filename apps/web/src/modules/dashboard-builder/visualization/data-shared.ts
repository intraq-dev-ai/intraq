import type {
  DashboardElement,
  VisualizationData,
  VisualizationSpec
} from '../types';
import type {
  SharedVisualizationDataGroupItem,
  VisualizationDataRequest
} from './data-request-types';
import {
  isRecord,
  readStringFromRecord,
  runtimeContextPatch,
  stableStringify
} from './data-utils';
import { chartOverlayFieldNames } from './chart/overlay';
import { dimensionEncoding, measureEncodings } from './spec';
import { aggregateRows, readAggregationType, type AggregationType } from './view-model-config';

export function sharedDataGroupId(config: unknown): string | null {
  if (!isRecord(config)) return null;
  const value = config.dataQueryId
    ?? config.sharedDataQueryId
    ?? config.sharedDataGroupId
    ?? config.sharedDataGroup
    ?? config.sharedDataKey;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function sharedRequestSignature(request: VisualizationDataRequest): string {
  return stableStringify({
    dataSourceId: request.dataSourceId,
    filters: request.visualization.filters,
    parameterValues: request.parameterValues ?? {},
    tableName: request.tableName
  });
}

export function sharedSourceFields(group: SharedVisualizationDataGroupItem[]): string[] {
  const fields = new Set<string>();
  for (const item of group) {
    addFields(fields, item.request.visualization.encodings.map(encoding => encoding.field));
    addFields(fields, item.request.visualization.filters.map(filter => filter.field));
    addConfiguredValueFields(fields, item.element.config);
    addFields(fields, chartOverlayFieldNames(item.element.config));
    const seriesBy = readStringFromRecord(item.spec, 'seriesBy') ?? readStringFromRecord(item.element.config, 'seriesBy');
    if (seriesBy) fields.add(seriesBy);
  }
  return Array.from(fields);
}

export function sharedSortForSource(sort: NonNullable<VisualizationSpec['sort']>): NonNullable<VisualizationSpec['sort']> {
  return sort.filter(item => item.direction === 'asc' || item.direction === 'desc');
}

export function sharedLimitPatch(
  group: Array<{ request: VisualizationDataRequest }>
): Pick<VisualizationDataRequest['visualization'], 'limit'> {
  const limits = group.flatMap(item =>
    typeof item.request.visualization.limit === 'number' && Number.isFinite(item.request.visualization.limit)
      ? [item.request.visualization.limit]
      : []
  );
  return limits.length > 0 ? { limit: Math.max(...limits) } : {};
}

export function visualizationDataFromSharedRows(
  request: VisualizationDataRequest,
  spec: VisualizationSpec,
  element: DashboardElement,
  rows: Array<Record<string, unknown>>
): VisualizationData {
  if (spec.kind === 'table' || spec.kind === 'matrix') {
    return {
      labels: rows.map((_, index) => String(index + 1)),
      datasets: [],
      rawData: rows,
      ...runtimeContextPatch(request)
    };
  }
  if (spec.kind === 'card') return cardVisualizationDataFromRows(request, spec, element, rows);
  return chartVisualizationDataFromRows(request, spec, element, rows);
}

function addConfiguredValueFields(fields: Set<string>, config: unknown): void {
  if (!isRecord(config)) return;
  addFields(fields, [
    readStringFromRecord(config, 'field'),
    readStringFromRecord(config, 'filterField'),
    readStringFromRecord(config, 'trendField'),
    readStringFromRecord(config, 'comparisonField'),
    readStringFromRecord(config, 'supportingField'),
    readStringFromRecord(config, 'sparklineField'),
    readStringFromRecord(config, 'valueField'),
    readStringFromRecord(config, 'xField'),
    readStringFromRecord(config, 'yField')
  ]);
  for (const key of ['columns', 'rowFields', 'columnFields', 'valueFields', 'ySeries', 'yFields']) {
    addFields(fields, configuredFieldNames(config[key]));
  }
}

function configuredFieldNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string' && item.trim()) return [item.trim()];
    if (!isRecord(item)) return [];
    const field = readStringFromRecord(item, 'field') ?? readStringFromRecord(item, 'key') ?? readStringFromRecord(item, 'name');
    return field ? [field] : [];
  });
}

function addFields(fields: Set<string>, values: Array<string | undefined>): void {
  for (const value of values) {
    if (value && value.trim()) fields.add(value.trim());
  }
}

function cardVisualizationDataFromRows(
  request: VisualizationDataRequest,
  spec: VisualizationSpec,
  element: DashboardElement,
  rows: Array<Record<string, unknown>>
): VisualizationData {
  const measure = measureEncodings(spec)[0];
  const config = element.config ?? {};
  const field = readStringFromRecord(config, 'yField')
    ?? readStringFromRecord(config, 'valueField')
    ?? readStringFromRecord(config, 'field')
    ?? measure?.field
    ?? request.visualization.encodings[0]?.field
    ?? 'value';
  const aggregation = readAggregationType(config.aggregationType)
    ?? readAggregationType(measure?.aggregation)
    ?? 'sum';
  return {
    labels: ['value'],
    datasets: [{
      label: field,
      data: [aggregateRows(rows, field, aggregation)],
      aggregatedData: true
    }],
    rawData: rows,
    ...runtimeContextPatch(request)
  };
}

function chartVisualizationDataFromRows(
  request: VisualizationDataRequest,
  spec: VisualizationSpec,
  element: DashboardElement,
  rows: Array<Record<string, unknown>>
): VisualizationData {
  const dimension = dimensionEncoding(spec);
  const measures = measureEncodings(spec);
  if (!dimension || measures.length === 0) {
    return { labels: rows.map((_, index) => String(index + 1)), datasets: [], rawData: rows, ...runtimeContextPatch(request) };
  }
  const seriesBy = readStringFromRecord(spec, 'seriesBy') ?? readStringFromRecord(element.config, 'seriesBy');
  if (seriesBy) return splitSeriesVisualizationDataFromRows(request, rows, dimension.field, seriesBy, measures);
  const groups = groupRowsByLabel(rows, dimension.field);
  const labels = sortedSharedLabels(groups, request, measures).slice(0, request.visualization.limit ?? groups.size);
  return {
    labels,
    datasets: measures.map(measure => ({
      label: measure.label ?? measure.field,
      data: labels.map(label => aggregateRows(groups.get(label) ?? [], measure.field, aggregationForEncoding(measure.aggregation))),
      aggregatedData: true
    })),
    rawData: rows,
    ...runtimeContextPatch(request)
  };
}

function splitSeriesVisualizationDataFromRows(
  request: VisualizationDataRequest,
  rows: Array<Record<string, unknown>>,
  dimensionField: string,
  seriesField: string,
  measures: VisualizationSpec['encodings']
): VisualizationData {
  const grouped = new Map<string, Map<string, Array<Record<string, unknown>>>>();
  const seriesValues: string[] = [];
  const seenSeries = new Set<string>();
  for (const row of rows) {
    const label = String(row[dimensionField] ?? '');
    const series = String(row[seriesField] ?? '');
    if (!seenSeries.has(series)) {
      seenSeries.add(series);
      seriesValues.push(series);
    }
    const labelGroup = grouped.get(label) ?? new Map<string, Array<Record<string, unknown>>>();
    labelGroup.set(series, [...(labelGroup.get(series) ?? []), row]);
    grouped.set(label, labelGroup);
  }
  const labels = Array.from(grouped.keys()).slice(0, request.visualization.limit ?? grouped.size);
  return {
    labels,
    datasets: measures.flatMap(measure =>
      seriesValues.map(series => ({
        label: measures.length > 1 ? `${measure.label ?? measure.field} - ${series}` : series,
        data: labels.map(label => aggregateRows(grouped.get(label)?.get(series) ?? [], measure.field, aggregationForEncoding(measure.aggregation))),
        aggregatedData: true
      }))
    ),
    rawData: rows,
    ...runtimeContextPatch(request)
  };
}

function groupRowsByLabel(rows: Array<Record<string, unknown>>, field: string): Map<string, Array<Record<string, unknown>>> {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const label = String(row[field] ?? '');
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return groups;
}

function sortedSharedLabels(
  groups: Map<string, Array<Record<string, unknown>>>,
  request: VisualizationDataRequest,
  measures: VisualizationSpec['encodings']
): string[] {
  const labels = Array.from(groups.keys());
  const sort = request.visualization.sort[0];
  if (!sort || (sort.direction !== 'asc' && sort.direction !== 'desc')) return labels;
  const direction = sort.direction === 'asc' ? 1 : -1;
  const measure = measures.find(item => item.field === sort.field);
  return labels.sort((left, right) => {
    if (measure) {
      const leftValue = aggregateRows(groups.get(left) ?? [], measure.field, aggregationForEncoding(measure.aggregation));
      const rightValue = aggregateRows(groups.get(right) ?? [], measure.field, aggregationForEncoding(measure.aggregation));
      return direction * (leftValue - rightValue);
    }
    return direction * left.localeCompare(right);
  });
}

function aggregationForEncoding(value: unknown): AggregationType {
  return readAggregationType(value) ?? 'sum';
}
