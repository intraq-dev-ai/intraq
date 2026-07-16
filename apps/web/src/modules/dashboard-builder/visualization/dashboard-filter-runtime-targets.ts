import type {
  DashboardElement,
  DashboardFilter,
  VisualizationSpec
} from '../types';
import {
  isRecord,
  readFilterField,
  readString
} from './dashboard-filter-runtime-values';

type FilterTarget = { type: string; values: string[] };
type TargetMatchMode = 'all' | 'any';

export function filterAppliesToVisualization(
  filter: DashboardFilter,
  element: DashboardElement,
  spec: VisualizationSpec
): boolean {
  if (!isFilterActive(filter) || !readFilterField(filter)) return false;
  const targets = collectTargets(filter);
  if (targets.length === 0) return true;
  const matches = (target: FilterTarget) => targetMatchesVisualization(target, element, spec);
  return targetMatchMode(filter) === 'all' ? targets.every(matches) : targets.some(matches);
}

export function collectTargets(filter: DashboardFilter): FilterTarget[] {
  const config = filter.config ?? {};
  const record = filter as unknown as Record<string, unknown>;
  const targets: FilterTarget[] = [
    ...targetEntries(record.targets ?? config.targets ?? config.targeting)
  ];
  const targetType = normalizeTargetType(readString(filter.targetType ?? config.targetType ?? filter.applyTo ?? config.applyTo ?? config.scope) ?? '');
  const directTarget = targetValues(filter.target ?? config.target);
  if (directTarget.length > 0) targets.push({ type: targetType || 'any', values: directTarget });

  addTarget(targets, 'component', filter.targetComponents ?? config.targetComponents);
  addTarget(targets, 'component', filter.targetElementIds ?? config.targetElementIds ?? config.targetElements);
  addTarget(targets, 'table', config.targetTable ?? config.targetTableId ?? config.targetTableName);
  addTarget(targets, 'table', config.targetTables ?? config.targetTableIds ?? config.targetTableNames ?? config.targetDataModels);
  if (!hasSpecificVisualizationTarget(targets)) {
    addTarget(targets, 'dataSource', filter.targetDataSources ?? config.targetDataSources);
    addTarget(targets, 'dataSource', filter.targetDataSourceId ?? config.targetDataSourceId);
  }
  return dedupeTargets(targets);
}

export function hasTableVisualizationTarget(targets: FilterTarget[]): boolean {
  return targets.some(target => target.type === 'table');
}

export function hasExplicitMappedFilterField(filter: DashboardFilter, field: string): boolean {
  const config = filter.config ?? {};
  return mappingContainsField(config.componentFieldMappings, field)
    || mappingContainsField(config.dataSourceFieldMappings, field)
    || enhancedMappingContainsField(config.enhancedFieldMappings, field);
}

function isFilterActive(filter: DashboardFilter): boolean {
  const config = filter.config ?? {};
  return filter.isActive !== false
    && filter.disabled !== true
    && filter.isDisabled !== true
    && filter.enabled !== false
    && config.isActive !== false
    && config.disabled !== true
    && config.isDisabled !== true
    && config.enabled !== false;
}

function hasSpecificVisualizationTarget(targets: FilterTarget[]): boolean {
  return targets.some(target => target.type === 'component' || target.type === 'table');
}

function mappingContainsField(value: unknown, field: string): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).some(mapped => {
    if (readString(mapped) === field) return true;
    if (!isRecord(mapped)) return false;
    return Object.values(mapped).some(nested => readString(nested) === field);
  });
}

function enhancedMappingContainsField(value: unknown, field: string): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).some(mapped => {
    if (!isRecord(mapped)) return false;
    return readString(mapped.field) === field
      || readString(mapped.logicalField) === field
      || Object.values(mapped).some(nested => readString(nested) === field);
  });
}

function addTarget(targets: FilterTarget[], type: string, value: unknown): void {
  const values = targetValues(value);
  if (values.length > 0) targets.push({ type, values });
}

function targetEntries(value: unknown): FilterTarget[] {
  if (Array.isArray(value)) return value.flatMap(targetEntries);
  if (!isRecord(value)) {
    const values = targetValues(value);
    return values.length > 0 ? [{ type: 'any', values }] : [];
  }
  const type = normalizeTargetType(readString(value.type ?? value.targetType ?? value.kind ?? value.scope) ?? '');
  const direct = targetValues(value.values ?? value.ids ?? value.id ?? value.value ?? value.key ?? value.name);
  const entries = direct.length > 0 ? [{ type: type || 'any', values: direct }] : [];
  addTarget(entries, 'component', value.components ?? value.componentIds ?? value.elements ?? value.elementIds);
  addTarget(entries, 'dataSource', value.dataSources ?? value.dataSourceIds ?? value.sources ?? value.sourceIds);
  addTarget(entries, 'table', value.tables ?? value.tableIds ?? value.tableNames ?? value.dataSourceTables);
  return entries;
}

function dedupeTargets(targets: FilterTarget[]): FilterTarget[] {
  const seen = new Set<string>();
  return targets.flatMap(target => {
    const values = target.values.filter(value => {
      const key = `${target.type}:${value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return values.length > 0 ? [{ ...target, values }] : [];
  });
}

function targetMatchesVisualization(
  target: FilterTarget,
  element: DashboardElement,
  spec: VisualizationSpec
): boolean {
  const candidates = targetCandidateValues(target.type, element, spec);
  return target.values.some(value => candidates.has(value));
}

function targetCandidateValues(type: string, element: DashboardElement, spec: VisualizationSpec): Set<string> {
  const normalizedType = normalizeTargetType(type);
  const visualization = isRecord(element.config?.visualization) ? element.config.visualization : {};
  const component = normalizedValues([
    element.id,
    element.name,
    element.type,
    spec.id,
    spec.title,
    element.config?.id,
    element.config?.dbId,
    element.config?.title,
    visualization.id,
    visualization.title,
    element.layout?.i,
    element.layout?.id,
    element.config?.layoutId
  ]);
  const dataSource = normalizedValues([
    element.dataSourceId,
    element.config?.dataSource,
    element.config?.dataSourceId,
    element.config?.dataSourceTableId,
    element.config?.dataSourceName,
    element.config?.tableId,
    spec.dataRef?.sourceId,
    spec.dataRef?.tableId,
    spec.dataRef?.queryId
  ]);
  const table = normalizedValues([
    element.config?.dataModelName,
    element.config?.tableName,
    element.config?.tableId,
    element.config?.dataSourceTableId,
    spec.dataRef?.tableName,
    spec.dataRef?.tableId
  ]);
  if (normalizedType === 'component') return component;
  if (normalizedType === 'dataSource') return dataSource;
  if (normalizedType === 'table') return table;
  return new Set([...component, ...dataSource, ...table]);
}

function normalizeTargetType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (['component', 'componentid', 'element', 'elements', 'targetcomponents', 'visualization', 'widget', 'tile', 'chart'].includes(normalized)) return 'component';
  if (['datasource', 'datasourceid', 'data-source', 'data source', 'source', 'sourceid'].includes(normalized)) return 'dataSource';
  if (['table', 'tableid', 'tablename', 'datasourcetable', 'data-source-table', 'model', 'datamodel'].includes(normalized)) return 'table';
  if (['', 'all', 'any', 'dashboard'].includes(normalized)) return 'any';
  return normalized;
}

function targetMatchMode(filter: DashboardFilter): TargetMatchMode {
  const raw = String(filter.config?.targetMatchMode ?? filter.config?.targetMode ?? filter.config?.matchMode ?? '').trim().toLowerCase();
  return raw === 'all' || raw === 'and' ? 'all' : 'any';
}

function targetValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.flatMap(item => {
    if (item === undefined || item === null || item === '') return [];
    if (isRecord(item)) return targetValues(item.id ?? item.value ?? item.key ?? item.name);
    return [String(item)];
  }).map(value => value.trim().toLowerCase()).filter(Boolean)));
}

function normalizedValues(values: unknown[]): Set<string> {
  return new Set(targetValues(values));
}
