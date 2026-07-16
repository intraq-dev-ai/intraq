import type {
  BuilderDataField,
  BuilderDataSource,
  BuilderDataTable,
  Dashboard,
  DashboardElement,
  DashboardFilter,
  VisualizationSpec
} from '../../types';
import { visualizationSpecFromElement } from '../../visualization/spec';
import {
  readDashboardCrossFilterMode,
  readDashboardCrossFilterTargetElementIds
} from '../../visualization/cross-filter-config';
import type { ChartCrossFilterSelection } from '../../visualization/chart-interactions';

const RUNTIME_CROSS_FILTER_PREFIX = '__runtime_cross_filter__';

export interface DashboardRuntimeCrossFilter {
  field: string;
  filter: DashboardFilter;
  label: string;
  sourceElementId: string;
  targetElementIds: string[];
  value: unknown;
}

export function toggleRuntimeCrossFilters(
  existing: DashboardRuntimeCrossFilter[],
  dashboard: Dashboard,
  dataSources: BuilderDataSource[],
  selection: ChartCrossFilterSelection,
  sourceElementId: string
): DashboardRuntimeCrossFilter[] {
  const scopedEntries = selection.entries.filter(entry => readString(entry.field) && !isEmptyValue(entry.value));
  if (scopedEntries.length === 0) return existing;
  const sourceElement = dashboard.elements.find(element => element.id === sourceElementId);
  if (!sourceElement) return existing;

  const scopedKeys = new Set(scopedEntries.map(entry => crossFilterScopeKey(sourceElementId, entry.field)));
  const next = existing.filter(filter => !scopedKeys.has(crossFilterScopeKey(filter.sourceElementId, filter.field)));
  const previousScoped = existing.filter(filter => scopedKeys.has(crossFilterScopeKey(filter.sourceElementId, filter.field)));

  const nextFilters = scopedEntries.flatMap(entry => {
    const targetElementIds = compatibleTargetElementIds(dashboard.elements, dataSources, sourceElement, entry.field);
    if (targetElementIds.length === 0) return [];
    return [runtimeCrossFilter(dashboard, entry, sourceElementId, targetElementIds)];
  });

  if (
    previousScoped.length === nextFilters.length
    && previousScoped.every(previous => nextFilters.some(nextFilter => sameRuntimeCrossFilter(previous, nextFilter)))
  ) {
    return next;
  }
  return [...next, ...nextFilters];
}

export function clearRuntimeCrossFilter(
  filters: DashboardRuntimeCrossFilter[],
  filterId: string
): DashboardRuntimeCrossFilter[] {
  return filters.filter(filter => filter.filter.id !== filterId);
}

function runtimeCrossFilter(
  dashboard: Dashboard,
  entry: ChartCrossFilterSelection['entries'][number],
  sourceElementId: string,
  targetElementIds: string[]
): DashboardRuntimeCrossFilter {
  const field = entry.field.trim();
  const label = readString(entry.label) ?? humanize(field);
  const valueText = readString(entry.displayValueLabel) ?? valueLabel(entry.value);
  return {
    field,
    label,
    sourceElementId,
    targetElementIds,
    value: entry.value,
    filter: {
      id: `${RUNTIME_CROSS_FILTER_PREFIX}:${sourceElementId}:${field}:${valueToken(entry.value)}`,
      dashboardId: dashboard.id,
      name: `${label}: ${valueText}`,
      field,
      operator: entry.operator ?? 'equals',
      value: entry.value,
      placement: 'bar',
      type: 'interactive',
      isActive: true,
      order: Number.MAX_SAFE_INTEGER,
      config: {
        runtimeCrossFilter: true,
        runtimeOnly: true,
        sourceElementId,
        targetComponents: targetElementIds,
        targetElementIds,
        targetType: 'component'
      }
    }
  };
}

function compatibleTargetElementIds(
  elements: DashboardElement[],
  dataSources: BuilderDataSource[],
  sourceElement: DashboardElement,
  field: string
): string[] {
  const sourceSource = resolveElementSource(dataSources, sourceElement);
  const crossFilterMode = readDashboardCrossFilterMode(sourceElement);
  if (crossFilterMode === 'disabled') return [];
  const selectedTargetIds = new Set(readDashboardCrossFilterTargetElementIds(sourceElement));
  return elements.flatMap(element => {
    if (element.id === sourceElement.id || element.type === 'filter') return [];
    if (crossFilterMode === 'selected' && !selectedTargetIds.has(element.id)) return [];
    const supportsField = elementSupportsField(element, dataSources, field, sourceSource?.id);
    return supportsField ? [element.id] : [];
  });
}

export function crossFilterTargetElementsForAuthoring(
  elements: DashboardElement[],
  dataSources: BuilderDataSource[],
  sourceElement: DashboardElement
): DashboardElement[] {
  const sourceSource = resolveElementSource(dataSources, sourceElement);
  const filterableFields = sourceCrossFilterFields(sourceElement);
  if (filterableFields.length === 0) return [];
  return elements.filter(element => {
    if (element.id === sourceElement.id || element.type === 'filter' || element.isVisible === false) return false;
    return filterableFields.some(field => elementSupportsField(element, dataSources, field, sourceSource?.id));
  });
}

function elementSupportsField(
  element: DashboardElement,
  dataSources: BuilderDataSource[],
  field: string,
  preferredSourceId?: string
): boolean {
  const spec = visualizationSpecFromElement(element);
  if (spec.encodings.some(encoding => encoding.field === field)) return true;
  const configuredFields = Array.isArray(element.config?.fields)
    ? element.config.fields.filter((item): item is string => typeof item === 'string')
    : [];
  if (configuredFields.includes(field)) return true;
  const source = resolveElementSource(dataSources, element, preferredSourceId);
  const table = resolveElementTable(source, element);
  const fields = table?.fields ?? [];
  return fields.some(candidate => fieldMatches(candidate, field));
}

function resolveElementSource(
  dataSources: BuilderDataSource[],
  element: DashboardElement,
  preferredSourceId?: string
): BuilderDataSource | undefined {
  const spec = visualizationSpecFromElement(element);
  const sourceIds = new Set([
    readString(preferredSourceId),
    readString(element.dataSourceId),
    readString(element.config?.dataSourceId),
    readString(element.config?.dataSource),
    readString(spec.dataRef?.sourceId)
  ].filter(Boolean));
  return dataSources.find(source =>
    sourceIds.has(source.id)
    || sourceIds.has(source.name)
    || source.tables.some(table => sourceIds.has(table.id) || sourceIds.has(table.name))
  );
}

function resolveElementTable(
  source: BuilderDataSource | undefined,
  element: DashboardElement
): BuilderDataTable | undefined {
  if (!source) return undefined;
  const spec = visualizationSpecFromElement(element);
  const tableKeys = new Set([
    readString(element.config?.dataSourceTableId),
    readString(element.config?.tableId),
    readString(element.config?.tableName),
    readString(element.config?.dataSource),
    readString(spec.dataRef?.tableId),
    readString(spec.dataRef?.tableName)
  ].filter(Boolean));
  return source.tables.find(table => tableKeys.has(table.id) || tableKeys.has(table.name))
    ?? source.tables.find(table => table.isSelected)
    ?? source.tables[0];
}

function sourceCrossFilterFields(sourceElement: DashboardElement): string[] {
  const spec = visualizationSpecFromElement(sourceElement);
  const dimensionField = spec.encodings.find(encoding =>
    encoding.role === 'time' || encoding.role === 'dimension' || encoding.role === 'filter'
  )?.field;
  const config = sourceElement.config ?? {};
  return dedupeStrings([
    dimensionField,
    readString(config.seriesBy),
    readString((spec as VisualizationSpec & Record<string, unknown>).seriesBy)
  ].filter((value): value is string => Boolean(value)));
}

function fieldMatches(field: BuilderDataField, name: string): boolean {
  return field.name === name
    || (typeof field.label === 'string' && field.label.trim().toLowerCase() === name.trim().toLowerCase())
    || (typeof field.description === 'string' && field.description.trim().toLowerCase() === name.trim().toLowerCase());
}

function sameRuntimeCrossFilter(
  first: DashboardRuntimeCrossFilter,
  second: DashboardRuntimeCrossFilter
): boolean {
  return first.sourceElementId === second.sourceElementId
    && first.field === second.field
    && first.filter.operator === second.filter.operator
    && sameValue(first.value, second.value)
    && sameTargets(first.targetElementIds, second.targetElementIds);
}

function sameTargets(first: string[], second: string[]): boolean {
  if (first.length !== second.length) return false;
  const firstSorted = [...first].sort();
  const secondSorted = [...second].sort();
  return firstSorted.every((value, index) => value === secondSorted[index]);
}

function sameValue(first: unknown, second: unknown): boolean {
  try {
    return JSON.stringify(first) === JSON.stringify(second);
  } catch {
    return String(first) === String(second);
  }
}

function crossFilterScopeKey(sourceElementId: string, field: string): string {
  return `${sourceElementId}:${field.trim().toLowerCase()}`;
}

function valueToken(value: unknown): string {
  return safeToken(valueLabel(value));
}

function valueLabel(value: unknown): string {
  if (Array.isArray(value) && value.length >= 2) return `${String(value[0] ?? 'Any')} to ${String(value[1] ?? 'Any')}`;
  if (value === null || value === undefined) return 'Empty';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function safeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'value';
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function humanize(value: string): string {
  return value.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);
}
