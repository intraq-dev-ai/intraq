import type {
  Dashboard,
  DashboardElement,
  DashboardFilter,
  DashboardFilterCreatePatch
} from '../../types';
import type { VisualizationDataRequestContext } from '../../visualization/data';
import type { autoCreateParameterFiltersForElement } from '../parameterized-data-sources';

type ParameterFilterSuggestion = ReturnType<typeof autoCreateParameterFiltersForElement>[number];

export function visibleFilterBarFilters(dashboard: Dashboard): DashboardFilter[] {
  return dashboard.filters.filter(filter => filter.placement !== 'canvas');
}

export function buildVisualizationRequest(
  dashboard: Dashboard | null,
  previewDataScope?: Record<string, unknown>
): VisualizationDataRequestContext | undefined {
  if (!dashboard) return undefined;
  const runtimeParameterValues = safeRuntimeParameters(previewDataScope ?? {});
  if (Object.keys(runtimeParameterValues).length === 0) return undefined;
  return {
    cacheKeyPrefix: `app:${dashboard.id}`,
    runtimeParameterValues
  };
}

export function autoCreatedParameterFilterPatch(
  element: DashboardElement,
  suggestion: ParameterFilterSuggestion,
  selectedDataSourceId: string,
  selectedTableId: string
): DashboardFilterCreatePatch {
  const dataRef = visualizationDataRef(element);
  const sourceId = readStringValue(element.dataSourceId)
    || readStringValue(element.config?.dataSourceId)
    || readStringValue(element.config?.dataSource)
    || readStringValue(dataRef.sourceId)
    || selectedDataSourceId;
  const tableName = readStringValue(element.config?.dataSourceTableId)
    || readStringValue(element.config?.tableId)
    || readStringValue(element.config?.tableName)
    || readStringValue(dataRef.tableId)
    || readStringValue(dataRef.tableName)
    || selectedTableId;
  const filterValue = suggestion.filterType === 'datePicker' ? 'all' : 'all';
  const operator = suggestion.filterType === 'datePicker' ? 'equals' : 'equals';
  return {
    name: suggestion.label,
    field: suggestion.sourceField || suggestion.parameter.name,
    operator,
    placement: 'bar',
    type: suggestion.filterType,
    value: filterValue,
    config: {
      type: suggestion.filterType,
      inputType: suggestion.filterType,
      filterType: suggestion.filterType,
      label: suggestion.label,
      operator,
      value: filterValue,
      defaultValue: filterValue,
      behavior: 'value',
      dataSourceId: sourceId,
      tableName,
      fieldType: 'parameter',
      displayField: '',
      options: [],
      displayMode: 'dropdown',
      selectionMode: 'single',
      placeholder: '',
      minDate: '',
      maxDate: '',
      includeTime: false,
      showRangeNavigation: true,
      showTitle: true,
      dateRangePreset: '',
      defaultStartDate: '',
      defaultEndDate: '',
      defaultDatePreset: '',
      scope: 'component',
      targetElements: [],
      additionalComponents: [],
      targetComponent: '',
      fieldMappings: {},
      dataSourceFieldMapping: suggestion.sourceField || suggestion.parameter.name,
      dataSourceFieldMappings: {},
      componentFieldMappings: { [element.id]: suggestion.parameter.name },
      parameterMappings: { [element.id]: suggestion.parameter.name },
      targetFieldTypes: {},
      componentFieldTypes: { [element.id]: 'parameter' },
      crossFilterDataSources: [],
      targetDataSources: [],
      targetComponents: [element.id],
      enhancedFieldMappings: { [element.id]: suggestion.parameter.name },
      isParameter: true,
      parameterConfig: suggestion.parameter
    }
  };
}

function visualizationDataRef(element: DashboardElement): Record<string, unknown> {
  const visualization = element.config?.visualization;
  if (!visualization || typeof visualization !== 'object' || Array.isArray(visualization)) return {};
  const dataRef = (visualization as Record<string, unknown>).dataRef;
  return dataRef && typeof dataRef === 'object' && !Array.isArray(dataRef)
    ? dataRef as Record<string, unknown>
    : {};
}

function readStringValue(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function safeRuntimeParameters(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).flatMap(([key, value]) => {
    const name = key.trim();
    if (!name) return [];
    return isSafeRuntimeParameterValue(value) ? [[name, value]] : [];
  }));
}

function isSafeRuntimeParameterValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  return Array.isArray(value) && value.length > 0 && value.every(item =>
    item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
  );
}
