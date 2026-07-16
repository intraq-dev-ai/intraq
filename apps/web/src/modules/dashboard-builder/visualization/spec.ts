import type { FieldEncoding } from '@intraq/contracts';
import type { DashboardElement, VisualizationKind, VisualizationSpec } from '../types';
import { chartTypeForElement } from '../dashboard-element-normalization';
import { readDashboardCrossFilterMode } from './cross-filter-config';
import { readConfiguredVisualizationLimit } from './limit-config';
import { baseRendererOptionPatch } from './spec-renderer-options';

export function visualizationSpecFromElement(element: DashboardElement): VisualizationSpec {
  const config = element.config ?? {};
  const existing = readVisualization(config.visualization);
  const kind = visualizationKind(element);
  const chartType = chartTypeForElement(element, '');
  const sourceId = readString(element.dataSourceId) ?? readString(config.dataSourceId) ?? existing?.dataRef?.sourceId;
  const tableName = readString(config.tableName) ?? readString(config.dataSource) ?? existing?.dataRef?.tableName;
  const y = readStringArray(config.ySeries ?? config.yFields);
  const configuredValue = readString(config.valueField);
  const value = kind === 'card'
    ? configuredValue ?? readString(config.yField) ?? readString(config.field)
    : configuredValue;
  const firstMetric = value ?? y[0] ?? 'metric_value';
  const cardMetricForAggregation = kind === 'card' ? value ?? y[0] : undefined;
  const aggregationConfig = {
    ...readStringRecord(config.ySeriesType ?? config.ySeriesTypes),
    ...readStringRecord(config.ySeriesSummarize),
    ...readStringRecord(config.aggregations),
    ...(cardMetricForAggregation && readString(config.aggregationType)
      ? { [cardMetricForAggregation]: readString(config.aggregationType) as string }
      : {})
  };
  const fieldRoles = readStringRecord(config.fieldRoles);
  const fieldFormats = readStringRecord(config.fieldFormats);
  const limit = existing?.limit ?? readConfiguredVisualizationLimit(config);
  const configuredEncodings = buildConfiguredEncodings(kind, config, aggregationConfig, fieldRoles, fieldFormats);
  const manualAxisTitlePatch = manualChartAxisTitlePatch(kind, config);
  const encodings = configuredEncodings.length > 0
    ? configuredEncodings
    : fallbackEncodings({
      aggregationConfig,
      existing,
      fieldFormats,
      fieldRoles,
      filterField: readString(config.field ?? config.filterField ?? config.xField),
      firstMetric,
      kind,
      value,
      xField: readString(config.xField),
      yFields: y
    });
  return {
    ...existing,
    id: element.id,
    schemaVersion: 1,
    title: existing?.title ?? readString(config.title) ?? element.name,
    description: existing?.description ?? `${element.name} visualization.`,
    kind: existing?.kind ?? kind,
    dataRef: {
      ...existing?.dataRef,
      ...(sourceId ? { sourceId } : {}),
      ...(tableName ? { tableName } : {})
    },
    encodings,
    ...(limit === undefined ? {} : { limit }),
    filters: existing?.filters ?? [],
    sort: existing?.sort ?? [],
    themeTokens: existing?.themeTokens ?? { palette: 'website-amber-navy', surface: 'canvas', accent: 'amber' },
    interactions: existing?.interactions ?? {
      tooltip: readBoolean(config.showTooltip, true),
      legend: readBoolean(config.showLegend, encodings.filter(encoding => encoding.role === 'measure').length > 1 || kind === 'pie'),
      crossFilter: kind !== 'card' && readDashboardCrossFilterMode(element) !== 'disabled',
      drilldown: false
    },
    accessibility: {
      label: existing?.accessibility?.label ?? `${element.name} ${kind} visualization`,
      summary: existing?.accessibility?.summary ?? `${element.name} uses intraQ visualization schema.`
    },
    rendererHints: existing?.rendererHints ?? {
      requiredCapabilities: capabilitiesForKind(kind),
      fallback: kind === 'filter' ? 'text' : kind === 'card' ? 'card' : 'table'
    },
    ...baseRendererOptionPatch(config),
    ...manualAxisTitlePatch,
    ...(chartType ? { chartType } : {})
  } as VisualizationSpec;
}

function fallbackEncodings(input: {
  aggregationConfig: Record<string, string>;
  existing: VisualizationSpec | undefined;
  fieldFormats: Record<string, string>;
  fieldRoles: Record<string, string>;
  filterField: string | undefined;
  firstMetric: string;
  kind: VisualizationKind;
  value: string | undefined;
  xField: string | undefined;
  yFields: string[];
}): FieldEncoding[] {
  if (input.existing?.encodings?.length) return input.existing.encodings;
  if (input.kind === 'filter') return buildFilterEncodings(input.filterField);
  if ((input.kind === 'card' || input.kind === 'table' || input.kind === 'matrix') && !input.value && input.yFields.length === 0 && !input.xField) {
    return [];
  }
  return buildEncodings(
    input.xField,
    input.yFields.length > 0 ? input.yFields : [input.firstMetric],
    input.firstMetric,
    input.aggregationConfig,
    input.fieldRoles,
    input.fieldFormats
  );
}

export function dimensionEncoding(spec: VisualizationSpec): FieldEncoding | undefined {
  return spec.encodings.find(encoding => encoding.role === 'time' || encoding.role === 'dimension' || encoding.role === 'filter');
}

export function measureEncodings(spec: VisualizationSpec): FieldEncoding[] {
  return spec.encodings.filter(encoding => encoding.role === 'measure');
}

export function aggregationsFromSpec(spec: VisualizationSpec): Record<string, string> {
  return Object.fromEntries(measureEncodings(spec).flatMap(encoding =>
    encoding.aggregation ? [[encoding.field, encoding.aggregation]] : []
  ));
}

export function primaryNumberFormat(spec: VisualizationSpec): FieldEncoding['format'] {
  return measureEncodings(spec)[0]?.format ?? 'number';
}

function visualizationKind(element: DashboardElement): VisualizationKind {
  if (element.type === 'filter') return 'filter';
  if (element.type === 'table' || element.type === 'card' || element.type === 'matrix') return element.type;
  const chartType = chartTypeForElement(element, '');
  if (chartType === 'line' || chartType === 'area') return 'line';
  if (chartType === 'pie' || chartType === 'doughnut' || chartType === 'donut') return 'pie';
  if (chartType === 'bar' || chartType === 'column' || chartType === 'stacked') return 'bar';
  return 'bar';
}

function buildEncodings(
  xField: string | undefined,
  yFields: string[],
  valueField: string,
  aggregations: Record<string, string>,
  fieldRoles: Record<string, string>,
  fieldFormats: Record<string, string>
): FieldEncoding[] {
  return [
    ...(xField ? [{
      field: xField,
      label: labelFor(xField),
      role: readDimensionRole(fieldRoles[xField]),
      ...(readDimensionRole(fieldRoles[xField]) === 'time' ? { format: 'date' as const } : {})
    }] : []),
    ...yFields.map(field => ({
      field,
      label: labelFor(field),
      role: 'measure' as const,
      aggregation: readAggregation(aggregations[field]) ?? 'sum' as const,
      format: readFormat(fieldFormats[field]) ?? 'number' as const
    })),
    ...(yFields.includes(valueField) ? [] : [{
      field: valueField,
      label: labelFor(valueField),
      role: 'measure' as const,
      aggregation: readAggregation(aggregations[valueField]) ?? 'sum' as const,
      format: readFormat(fieldFormats[valueField]) ?? 'number' as const
    }])
  ];
}

function buildConfiguredEncodings(
  kind: VisualizationKind,
  config: Record<string, unknown>,
  aggregations: Record<string, string>,
  fieldRoles: Record<string, string>,
  fieldFormats: Record<string, string>
): FieldEncoding[] {
  if (kind === 'table') {
    return configuredFields(config.columns).map(field => tableEncoding(field, aggregations, fieldRoles, fieldFormats));
  }
  if (kind === 'matrix') {
    return dedupeEncodings([
      ...configuredFields(config.rowFields).map(field => dimensionConfiguredEncoding(field, fieldRoles, fieldFormats)),
      ...configuredFields(config.columnFields).map(field => dimensionConfiguredEncoding(field, fieldRoles, fieldFormats)),
      ...configuredFields(config.valueFields).map(field => measureConfiguredEncoding(field, aggregations, fieldFormats))
    ]);
  }
  return [];
}

interface ConfiguredField {
  aggregation?: string;
  field: string;
  format?: string;
  label?: string;
  role?: string;
}

function configuredFields(value: unknown): ConfiguredField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string' && item.trim()) return [{ field: item.trim() }];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const field = readString(record.field ?? record.name ?? record.key);
    if (!field) return [];
    return [{
      aggregation: readString(record.aggregation ?? record.agg ?? record.summarize),
      field,
      format: readString(record.formatType ?? record.format ?? record.cellFormat ?? record.cellType),
      label: readString(record.label ?? record.header ?? record.customLabel ?? record.title),
      role: readString(record.role)
    }];
  });
}

function tableEncoding(
  field: ConfiguredField,
  aggregations: Record<string, string>,
  fieldRoles: Record<string, string>,
  fieldFormats: Record<string, string>
): FieldEncoding {
  const aggregation = readAggregation(field.aggregation ?? aggregations[field.field]);
  return aggregation
    ? measureConfiguredEncoding(field, aggregations, fieldFormats)
    : dimensionConfiguredEncoding(field, fieldRoles, fieldFormats);
}

function dimensionConfiguredEncoding(
  field: ConfiguredField,
  fieldRoles: Record<string, string>,
  fieldFormats: Record<string, string>
): FieldEncoding {
  const role = readDimensionRole(field.role ?? fieldRoles[field.field]);
  return {
    field: field.field,
    label: field.label ?? labelFor(field.field),
    role,
    ...(role === 'time' ? { format: 'date' as const } : optionalEncodingFormat(field, fieldFormats))
  };
}

function measureConfiguredEncoding(
  field: ConfiguredField,
  aggregations: Record<string, string>,
  fieldFormats: Record<string, string>
): FieldEncoding {
  return {
    field: field.field,
    label: field.label ?? labelFor(field.field),
    role: 'measure',
    aggregation: readAggregation(field.aggregation ?? aggregations[field.field]) ?? 'sum',
    format: readFormat(field.format ?? fieldFormats[field.field]) ?? 'number'
  };
}

function optionalEncodingFormat(
  field: ConfiguredField,
  fieldFormats: Record<string, string>
): Pick<FieldEncoding, 'format'> {
  const format = readFormat(field.format ?? fieldFormats[field.field]);
  return format ? { format } : {};
}

function dedupeEncodings(encodings: FieldEncoding[]): FieldEncoding[] {
  const seen = new Set<string>();
  return encodings.filter(encoding => {
    const key = `${encoding.role}:${encoding.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFilterEncodings(field: string | undefined): FieldEncoding[] {
  return field ? [{
    field,
    label: labelFor(field),
    role: 'filter' as const
  }] : [];
}

function capabilitiesForKind(kind: VisualizationKind): NonNullable<VisualizationSpec['rendererHints']>['requiredCapabilities'] {
  if (kind === 'filter') return ['cross-filter'];
  if (kind === 'table' || kind === 'matrix') return ['tabular'];
  if (kind === 'card') return ['single-value'];
  if (kind === 'pie') return ['categorical', 'legend', 'tooltip'];
  return ['cartesian', 'tooltip'];
}

function readVisualization(value: unknown): VisualizationSpec | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Partial<VisualizationSpec>;
  if (typeof record.id !== 'string' || typeof record.kind !== 'string' || !Array.isArray(record.encodings)) return undefined;
  const neutralSpec = { ...record } as Record<string, unknown>;
  delete neutralSpec.plugins;
  delete neutralSpec.scales;
  return neutralSpec as unknown as VisualizationSpec;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return readString(value) ? [readString(value) as string] : [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
}

function readStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
  );
}

function readAggregation(value: unknown): FieldEncoding['aggregation'] | undefined {
  if (value === 'sum' || value === 'avg' || value === 'min' || value === 'max' || value === 'count' || value === 'countDistinct' || value === 'none') return value;
  if (value === 'average') return 'avg';
  if (value === 'count_distinct') return 'countDistinct';
  return undefined;
}

function readDimensionRole(value: unknown): 'dimension' | 'time' {
  return value === 'time' ? 'time' : 'dimension';
}

function readFormat(value: unknown): FieldEncoding['format'] | undefined {
  return value === 'currency' || value === 'number' || value === 'percentage' || value === 'date'
    ? value
    : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function manualChartAxisTitlePatch(
  kind: VisualizationKind,
  config: Record<string, unknown>
): Record<string, unknown> {
  if (kind !== 'bar' && kind !== 'line') return {};
  if (!hasManualChartBinding(config)) return {};
  return Object.fromEntries(
    ['xAxisLabel', 'yAxisLabel', 'y2AxisLabel']
      .filter(key => !(key in config))
      .map(key => [key, undefined])
  );
}

function hasManualChartBinding(config: Record<string, unknown>): boolean {
  return Boolean(
    readString(config.xField)
    || readString(config.yField)
    || readString(config.valueField)
    || readString(config.ySeries)
    || readString(config.yFields)
    || (Array.isArray(config.ySeries) && config.ySeries.length > 0)
    || (Array.isArray(config.yFields) && config.yFields.length > 0)
  );
}

function labelFor(value: string): string {
  return value.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}
