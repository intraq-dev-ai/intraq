import type {
  DashboardElement,
  DashboardFilter,
  VisualizationFilterIntent,
  VisualizationSpec
} from '../types';
import {
  calculatedFieldDependencyMap,
  calculatedFieldsRequireRawRows,
  ROW_COUNT_FIELD
} from './calculated-field-dependencies';
import {
  dashboardFilterIntentsForVisualization,
  dashboardParameterValuesForVisualization
} from './dashboard-filter-runtime';
import type {
  VisualizationDataRequest,
  VisualizationDataRequestOptions
} from './data-request-types';
import {
  mergeParameterValues,
  parameterValuesPatch
} from './data-utils';
import { readConfiguredVisualizationLimit } from './limit-config';
import { chartOverlayFieldNames } from './chart/overlay';
import { elementFieldNames, labelForField } from './request-field-names';
import { dimensionEncoding, measureEncodings } from './spec';
import { analyzerExecutionReplayRequest } from './analyzer-execution-replay';

export function buildVisualizationDataRequest(
  element: DashboardElement,
  spec: VisualizationSpec,
  dashboardFilters: DashboardFilter[] = [],
  options: VisualizationDataRequestOptions = {}
): VisualizationDataRequest | null {
  const dimension = dimensionEncoding(spec);
  const measures = measureEncodings(spec);
  if (!spec.dataRef?.sourceId || !spec.dataRef.tableName || spec.kind === 'filter') {
    return null;
  }
  const analyzerReplay = dashboardFilters.length === 0
    ? analyzerExecutionReplayRequest(element, spec)
    : undefined;
  if (analyzerReplay === null) return null;
  if (analyzerReplay) return analyzerReplay;
  const hasRenderableFields = spec.kind === 'table'
    ? spec.encodings.length > 0
    : spec.kind === 'card'
      ? measures.length > 0
      : Boolean(dimension) && measures.length > 0;
  if (!hasRenderableFields) return null;
  const knownFields = elementFieldNames(element, spec);
  const requestEncodings = dataRequestEncodings(element, spec, knownFields);
  const requiresCalculatedRawRows = calculatedFieldsRequireRawRows(element, spec);
  const requestKind = requiresCalculatedRawRows ? 'table' : spec.kind;
  const parameterValues = mergedParameterValues(
    element.config?.parameterValues,
    dashboardParameterValuesForVisualization(element, spec, dashboardFilters)
  );
  const limit = requiresCalculatedRawRows && spec.kind !== 'table'
    ? undefined
    : readFirstLimit(
      readConfiguredVisualizationLimit(element.config),
      element.config?.rowLimit,
      options.rowLimit,
      spec.limit
    );
  const componentConfig = requiresCalculatedRawRows
    ? null
    : withTableRequestFields(readComponentConfig(element.config, spec.kind), spec.kind, knownFields);
  return {
    dataSourceId: spec.dataRef.sourceId,
    tableName: spec.dataRef.tableName,
    editMode: shouldRequestRawRows(element, spec),
    ...parameterValuesPatch(parameterValues),
    ...(componentConfig ? { componentConfig } : {}),
    visualization: {
      kind: requestKind,
      encodings: requestEncodings,
      filters: [
        ...specFilterIntents(spec.filters ?? [], knownFields),
        ...dashboardFilterIntentsForVisualization(element, spec, dashboardFilters, knownFields)
      ],
      sort: spec.sort ?? [],
      ...(limit === undefined ? {} : { limit })
    }
  };
}

export function toChartDataApiRequest(
  request: VisualizationDataRequest,
  runtimeParameterValues?: Record<string, unknown>
): Record<string, unknown> {
  const dimension = request.visualization.encodings.find(encoding =>
    encoding.role === 'time' || encoding.role === 'dimension' || encoding.role === 'filter'
  );
  const measures = request.visualization.encodings.filter(encoding => encoding.role === 'measure');
  const visualization = {
    kind: request.visualization.kind,
    encodings: request.visualization.encodings,
    filters: request.visualization.filters,
    sort: request.visualization.sort,
    limit: request.visualization.limit
  };
  const apiRequest: Record<string, unknown> = {
    dataSourceId: request.dataSourceId,
    tableName: request.tableName,
    editMode: request.editMode,
    visualization,
    chartConfig: {
      xField: dimension?.field ?? request.visualization.encodings[0]?.field,
      yFields: measures.map(encoding => encoding.field),
      chartType: request.visualization.kind,
      aggregations: aggregationsFromRequest(measures),
      filters: request.visualization.filters,
      sort: request.visualization.sort,
      limit: request.visualization.limit
    }
  };
  const parameterValues = mergeParameterValues(request.parameterValues, runtimeParameterValues);
  if (Object.keys(parameterValues).length > 0) apiRequest.parameterValues = parameterValues;
  if (request.componentConfig) apiRequest.componentConfig = request.componentConfig;
  return apiRequest;
}

function mergedParameterValues(
  elementValues: unknown,
  dashboardValues: Record<string, unknown>
): Record<string, unknown> {
  const elementPatch = parameterValuesPatch(elementValues).parameterValues ?? {};
  return { ...elementPatch, ...dashboardValues };
}

function specFilterIntents(
  filters: VisualizationFilterIntent[],
  knownFields: Set<string>
): VisualizationFilterIntent[] {
  if (knownFields.size === 0) return filters;
  return filters.filter(filter => knownFields.has(filter.field));
}

function dataRequestEncodings(
  element: DashboardElement,
  spec: VisualizationSpec,
  knownFields: Set<string>
): VisualizationSpec['encodings'] {
  const requestEncodings = sourceEncodingsForCalculatedFields(
    spec.encodings,
    calculatedFieldDependencyMap(element.config?.calculatedFields)
  );
  const overlayEncodings = chartOverlayFieldNames(element.config)
    .filter(field => !requestEncodings.some(encoding => encoding.field === field))
    .map(field => ({
      field,
      label: labelForField(field),
      role: 'dimension' as const
    }));
  if (element.type !== 'table' || knownFields.size === 0) return [...requestEncodings, ...overlayEncodings];
  const sourceEncodings = requestEncodings.filter(encoding => knownFields.has(encoding.field));
  const encodedFields = new Set(sourceEncodings.map(encoding => encoding.field));
  const missingSourceEncodings = Array.from(knownFields)
    .filter(field => !encodedFields.has(field))
    .map(field => ({
      field,
      label: labelForField(field),
      role: 'dimension' as const
    }));
  return [...sourceEncodings, ...missingSourceEncodings, ...overlayEncodings];
}

function sourceEncodingsForCalculatedFields(
  encodings: VisualizationSpec['encodings'],
  dependencyMap: Map<string, string[]>
): VisualizationSpec['encodings'] {
  if (dependencyMap.size === 0) return encodings;
  const seen = new Set<string>();
  const sourceEncodings = encodings.flatMap(encoding => {
    const dependencies = dependencyMap.get(encoding.field);
    if (!dependencies?.length) return [encoding];
    if (dependencies.every(field => field === ROW_COUNT_FIELD) && encoding.role !== 'measure') return [];
    return dependencies.map(field => ({
      ...encoding,
      field,
      label: labelForField(field)
    }));
  });
  return sourceEncodings.filter(encoding => {
    const key = `${encoding.role}:${encoding.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shouldRequestRawRows(element: DashboardElement, spec: VisualizationSpec): boolean {
  return element.type === 'table'
    || element.type === 'matrix'
    || chartOverlayFieldNames(element.config).length > 0
    || calculatedFieldsRequireRawRows(element, spec)
    || spec.kind === 'table'
    || spec.kind === 'matrix';
}

function aggregationsFromRequest(
  measures: VisualizationSpec['encodings']
): Record<string, string> {
  return Object.fromEntries(measures.flatMap(encoding =>
    encoding.aggregation ? [[encoding.field, encoding.aggregation]] : []
  ));
}

function readLimit(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function readFirstLimit(...values: unknown[]): number | undefined {
  for (const value of values) {
    const limit = readLimit(value);
    if (limit !== undefined) return limit;
  }
  return undefined;
}

const COMPONENT_CONFIG_KEYS = new Set([
  'component', 'xField', 'ySeries', 'ySeriesSummarize', 'aggregations', 'series', 'seriesBy', 'columns',
  'rowFields', 'columnFields', 'valueFields', 'field', 'fields', 'aggregationType',
  'sparklineField', 'sparklineXField', 'sparklineAggregation',
  'trendField', 'trendAggregation', 'comparisonField', 'comparisonAggregation',
  'supportingField', 'supportingAggregation',
  'groupByFields', 'calculatedFields',
  'ranking', 'xAxisGrouping', 'xAxisSortOrder', 'weekNumbering',
  'weekStartDay', 'fiscalStartMonth', 'xAxisFiscalStart', 'yearType',
  'xAxisYearType', 'rowGrouping', 'layout'
]);

function readComponentConfig(
  config: unknown,
  kind: VisualizationSpec['kind']
): Record<string, unknown> | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const entries = Object.entries(config as Record<string, unknown>)
    .filter(([key]) => COMPONENT_CONFIG_KEYS.has(key));
  if (entries.length === 0) return null;
  const componentConfig = Object.fromEntries(entries);
  if (kind === 'bar' || kind === 'line' || kind === 'pie') {
    delete componentConfig.columns;
    delete componentConfig.rowFields;
    delete componentConfig.columnFields;
    delete componentConfig.valueFields;
  }
  if (typeof componentConfig.xAxisFiscalStart === 'number' && componentConfig.fiscalStartMonth === undefined) {
    componentConfig.fiscalStartMonth = componentConfig.xAxisFiscalStart;
  }
  if (typeof componentConfig.xAxisYearType === 'string' && componentConfig.yearType === undefined) {
    componentConfig.yearType = componentConfig.xAxisYearType;
  }
  return componentConfig;
}

function withTableRequestFields(
  componentConfig: Record<string, unknown> | null,
  kind: VisualizationSpec['kind'],
  knownFields: Set<string>
): Record<string, unknown> | null {
  if (!componentConfig || kind !== 'table' || knownFields.size === 0) return componentConfig;
  const fields = new Set<string>();
  if (Array.isArray(componentConfig.fields)) {
    for (const field of componentConfig.fields) {
      if (typeof field === 'string' && field.trim()) fields.add(field.trim());
    }
  }
  for (const field of knownFields) fields.add(field);
  return fields.size > 0
    ? { ...componentConfig, fields: Array.from(fields) }
    : componentConfig;
}
