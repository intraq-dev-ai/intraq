import type {
  DashboardElement,
  DashboardFilter,
  VisualizationFilterIntent,
  VisualizationSpec
} from '../types';
import { periodDerivedValues, periodParameterValue } from '../components/period-filter-values';
import type { FilterEntry } from './dashboard-filter-runtime-values';
import {
  comparePriorityEntries,
  dateRangeFromLastToken,
  entryHasValue,
  filterFamily,
  filterOperator,
  isDateLikeFilter,
  isDatePickerFilter,
  isEmptyFilterValue,
  isPeriodFilter,
  isRecord,
  normalizeFilterValue,
  normalizeRangeValue,
  operatorDoesNotNeedValue,
  priorityEnabled,
  priorityMode,
  readFilterField,
  readNumber,
  readString
} from './dashboard-filter-runtime-values';
import {
  collectTargets,
  filterAppliesToVisualization,
  hasExplicitMappedFilterField,
  hasTableVisualizationTarget
} from './dashboard-filter-runtime-targets';

type ParameterMapping = string | Record<string, string>;

export function dashboardFilterIntentsForVisualization(
  element: DashboardElement,
  spec: VisualizationSpec,
  dashboardFilters: DashboardFilter[],
  knownFields: Set<string>
): VisualizationFilterIntent[] {
  return resolveFilterPrecedence(dashboardFilters
    .map((filter, index) => ({ filter, index, order: readNumber(filter.order ?? filter.config?.order, index) }))
    .filter(entry => filterAppliesToVisualization(entry.filter, element, spec))
    .filter(entry => filterFamily(entry.filter) !== 'parameter')
  ).flatMap(entry => filterIntentFromDashboardFilter(entry.filter, element, spec)
    .filter(intent => shouldKeepDashboardFilterIntent(intent, knownFields, entry.filter)));
}

export function dashboardParameterValuesForVisualization(
  element: DashboardElement,
  spec: VisualizationSpec,
  dashboardFilters: DashboardFilter[]
): Record<string, unknown> {
  return Object.fromEntries(resolveFilterPrecedence(dashboardFilters
    .map((filter, index) => ({ filter, index, order: readNumber(filter.order ?? filter.config?.order, index) }))
    .filter(entry => filterAppliesToVisualization(entry.filter, element, spec))
    .filter(entry => filterFamily(entry.filter) === 'parameter')
    .filter(entryHasValue)
  ).flatMap(entry => {
    return parameterEntriesForFilter(entry.filter, element, spec);
  }));
}

function shouldKeepDashboardFilterIntent(
  intent: VisualizationFilterIntent,
  knownFields: Set<string>,
  filter: DashboardFilter
): boolean {
  if (knownFields.size === 0 || knownFields.has(intent.field)) return true;
  return hasTableVisualizationTarget(collectTargets(filter)) || hasExplicitMappedFilterField(filter, intent.field);
}

function resolveFilterPrecedence(entries: FilterEntry[]): FilterEntry[] {
  const groups = new Map<string, FilterEntry[]>();
  entries.forEach(entry => {
    const key = readFilterField(entry.filter).toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });

  const resolved: FilterEntry[] = [];
  groups.forEach(group => {
    const valueEntries = group.filter(entryHasValue);
    const staticEntries = valueEntries.filter(entry => filterFamily(entry.filter) === 'static');
    const parameterEntries = valueEntries.filter(entry => filterFamily(entry.filter) === 'parameter');
    const interactiveEntries = valueEntries.filter(entry => filterFamily(entry.filter) === 'interactive');
    if (valueEntries.length === 0 || (staticEntries.length === 0 && parameterEntries.length === 0)) {
      resolved.push(...group);
      return;
    }

    const staticOverride = staticEntries
      .filter(entry => priorityEnabled(entry.filter) && priorityMode(entry.filter) === 'override')
      .sort(comparePriorityEntries)[0];
    if (staticOverride) {
      resolved.push(staticOverride);
      return;
    }

    if (parameterEntries.length > 0) {
      resolved.push(...parameterEntries);
      return;
    }

    if (interactiveEntries.length > 0 && (staticEntries.length > 0 || isDateLikeFilter(group[0]?.filter))) {
      resolved.push(...interactiveEntries);
      return;
    }

    resolved.push(...group);
  });

  return resolved.sort((a, b) => a.order - b.order || a.index - b.index);
}

function filterIntentFromDashboardFilter(
  filter: DashboardFilter,
  element: DashboardElement,
  spec: VisualizationSpec
): VisualizationFilterIntent[] {
  const staticRuleIntents = filterFamily(filter) === 'static'
    ? rulesToFilterIntents(filter.config?.rules, filter, element, spec)
    : [];
  if (staticRuleIntents.length > 0) return staticRuleIntents;
  const field = mappedFilterField(filter, readFilterField(filter), element, spec);
  const value = normalizeFilterValue(filter);
  const operator = isPeriodFilter(filter) ? 'between' : filterOperator(readString(filter.operator ?? filter.config?.operator) ?? '');
  const lastRange = operator === 'last' ? dateRangeFromLastToken(value) : null;
  const effectiveOperator = lastRange ? 'between' : operator;
  const effectiveValue = lastRange ? [lastRange.start, lastRange.end] : value;
  if (!field || (isEmptyFilterValue(effectiveValue) && !operatorDoesNotNeedValue(effectiveOperator))) return [];
  if (operator === 'last' && !lastRange) return [];
  return [{
    field,
    operator: effectiveOperator,
    value: effectiveValue
  }];
}

function rulesToFilterIntents(
  rule: unknown,
  filter: DashboardFilter,
  element: DashboardElement,
  spec: VisualizationSpec
): VisualizationFilterIntent[] {
  if (!isRecord(rule)) return [];
  const ruleType = readString(rule.type)?.toLowerCase() ?? '';
  if (ruleType === 'condition') {
    const intent = conditionToFilterIntent(rule, filter, element, spec);
    return intent ? [intent] : [];
  }
  if (ruleType !== 'group') return [];
  const children = Array.isArray(rule.children) ? rule.children : [];
  const logic = (readString(rule.logic) ?? 'and').toLowerCase();
  if (logic === 'and') return children.flatMap(child => rulesToFilterIntents(child, filter, element, spec));
  if (logic === 'or') return compactOrConditions(children, filter, element, spec);
  if (logic === 'not' && children.length === 1) return rulesToFilterIntents(invertRule(children[0]), filter, element, spec);
  return [];
}

function compactOrConditions(
  children: unknown[],
  filter: DashboardFilter,
  element: DashboardElement,
  spec: VisualizationSpec
): VisualizationFilterIntent[] {
  const intents = children.flatMap(child => rulesToFilterIntents(child, filter, element, spec));
  const [first] = intents;
  if (!first) return [];
  const sameFieldEquals = intents.every(intent => intent.field === first.field && intent.operator === 'equals');
  if (sameFieldEquals) return [{ field: first.field, operator: 'in', value: intents.map(intent => intent.value) }];
  return intents.length === 1 ? intents : [];
}

function invertRule(rule: unknown): unknown {
  if (!isRecord(rule) || readString(rule.type)?.toLowerCase() !== 'condition') return rule;
  const operator = filterOperator(readString(rule.operator) ?? '');
  const inverted: Partial<Record<VisualizationFilterIntent['operator'], VisualizationFilterIntent['operator']>> = {
    contains: 'notContains',
    equals: 'notEquals',
    greaterThan: 'lessThanOrEqual',
    greaterThanOrEqual: 'lessThan',
    in: 'notIn',
    isNotNull: 'isNull',
    isNull: 'isNotNull',
    lessThan: 'greaterThanOrEqual',
    lessThanOrEqual: 'greaterThan',
    notContains: 'contains',
    notEquals: 'equals',
    notIn: 'in'
  };
  return { ...rule, operator: inverted[operator] ?? 'notEquals' };
}

function conditionToFilterIntent(
  condition: Record<string, unknown>,
  filter: DashboardFilter,
  element: DashboardElement,
  spec: VisualizationSpec
): VisualizationFilterIntent | null {
  const field = mappedFilterField(filter, readString(condition.field) ?? readFilterField(filter), element, spec);
  const operator = filterOperator(readString(condition.operator) ?? readString(filter.operator ?? filter.config?.operator) ?? '');
  const value = conditionValue(condition, operator);
  if (!field || (isEmptyFilterValue(value) && !operatorDoesNotNeedValue(operator))) return null;
  return { field, operator, value };
}

function mappedFilterField(
  filter: DashboardFilter,
  field: string,
  element: DashboardElement,
  spec: VisualizationSpec
): string {
  const config = filter.config ?? {};
  const elementKeys = [element.id, element.name, String(element.config?.id ?? ''), String(spec.id ?? '')].filter(Boolean);
  const sourceKeys = [
    element.dataSourceId,
    element.config?.dataSourceId,
    element.config?.dataSource,
    spec.dataRef?.sourceId
  ].flatMap(value => value ? [String(value)] : []);
  const tableKeys = [
    element.config?.dataModelId,
    element.config?.dataModelName,
    element.config?.dataSourceTableId,
    element.config?.tableId,
    element.config?.tableName,
    spec.dataRef?.tableId,
    spec.dataRef?.tableName
  ].flatMap(value => value ? [String(value)] : []);
  for (const key of [...elementKeys, ...tableKeys, ...sourceKeys]) {
    const direct = readMappingField(config.componentFieldMappings, key)
      ?? readMappingField(config.dataSourceFieldMappings, key);
    if (direct) return direct;
    const enhanced = readEnhancedMappingField(config.enhancedFieldMappings, key, field);
    if (enhanced) return enhanced;
  }
  return field;
}

function parameterEntriesForFilter(
  filter: DashboardFilter,
  element: DashboardElement,
  spec: VisualizationSpec
): Array<[string, unknown]> {
  const config = filter.config ?? {};
  const mapped = mappedParameterMapping(config.parameterMappings, element, spec);
  if (isPeriodFilter(filter) && isObjectParameterMapping(mapped)) return periodParameterEntriesForFilter(filter, mapped);
  if (isRangeParameterMapping(mapped)) return rangeParameterEntriesForFilter(filter, mapped);
  const name = typeof mapped === 'string' ? mapped : fallbackParameterNameForFilter(filter);
  if (!name) return [];
  const value = normalizeFilterValue(filter);
  return [[name, value], ...parameterAliasesForFilter(filter, name).map((alias): [string, unknown] => [alias, value])];
}

function fallbackParameterNameForFilter(filter: DashboardFilter): string {
  const config = filter.config ?? {};
  const parameterConfig = isRecord(config.parameterConfig) ? config.parameterConfig : {};
  return readString(parameterConfig.name) ?? readFilterField(filter);
}

function rangeParameterEntriesForFilter(
  filter: DashboardFilter,
  mapping: { end?: string; start?: string }
): Array<[string, unknown]> {
  const range = parameterRangeValue(filter) ?? singleDateParameterRangeValue(filter);
  if (!range) return [];
  return [
    mapping.start ? [[mapping.start, range.start] as [string, unknown]] : [],
    mapping.end ? [[mapping.end, range.end] as [string, unknown]] : []
  ].flat();
}

function periodParameterEntriesForFilter(
  filter: DashboardFilter,
  mapping: Record<string, string>
): Array<[string, unknown]> {
  const derived = periodDerivedValues(filter);
  return Object.entries(mapping).flatMap(([role, parameterName]) => {
    if (!parameterName) return [];
    const value = periodParameterValue(role, derived);
    return value === undefined || value === '' ? [] : [[parameterName, value] as [string, unknown]];
  });
}

function singleDateParameterRangeValue(
  filter: DashboardFilter
): { end: unknown; start: unknown } | null {
  if (!isDatePickerFilter(filter)) return null;
  const value = normalizeFilterValue(filter);
  if (isEmptyFilterValue(value) || Array.isArray(value) || isRecord(value)) return null;
  return { start: value, end: value };
}

function parameterAliasesForFilter(filter: DashboardFilter, name: string): string[] {
  const parameterConfig = isRecord(filter.config?.parameterConfig) ? filter.config.parameterConfig : {};
  const dateRole = readString(parameterConfig.dateRole)?.toLowerCase();
  if (dateRole === 'end' && name !== 'as_of_date') return ['as_of_date'];
  return [];
}

function mappedParameterMapping(
  value: unknown,
  element: DashboardElement,
  spec: VisualizationSpec
): ParameterMapping | undefined {
  if (!isRecord(value)) return undefined;
  const visualization = isRecord(element.config?.visualization) ? element.config.visualization : {};
  const keys = [
    element.id,
    element.name,
    element.dataSourceId,
    element.config?.id,
    element.config?.dbId,
    element.config?.dataSource,
    element.config?.dataSourceId,
    element.config?.dataSourceTableId,
    element.config?.tableId,
    element.config?.tableName,
    spec.id,
    spec.title,
    spec.dataRef?.sourceId,
    spec.dataRef?.tableId,
    spec.dataRef?.tableName,
    visualization.id,
    visualization.title
  ].flatMap(item => item ? [String(item)] : []);
  for (const key of keys) {
    const mapped = readMappingFieldOrRange(value, key);
    if (mapped) return mapped;
  }
  return undefined;
}

function isObjectParameterMapping(value: ParameterMapping | undefined): value is Record<string, string> {
  return isRecord(value);
}

function isRangeParameterMapping(value: ParameterMapping | undefined): value is { end?: string; start?: string } {
  return isRecord(value) && (readString(value.start) !== undefined || readString(value.end) !== undefined);
}

function parameterRangeValue(filter: DashboardFilter): { end: unknown; start: unknown } | null {
  const value = normalizeRangeValue(filter);
  if (Array.isArray(value) && value.length >= 2 && !isEmptyFilterValue(value[0]) && !isEmptyFilterValue(value[1])) {
    return { start: value[0], end: value[1] };
  }
  if (typeof value === 'string') {
    const range = dateRangeFromLastToken(value);
    if (range) return range;
  }
  return null;
}

function readMappingFieldOrRange(value: unknown, key: string): ParameterMapping | undefined {
  if (!isRecord(value)) return undefined;
  const mapping = value[key];
  if (typeof mapping === 'string') return readString(mapping);
  if (!isRecord(mapping)) return undefined;
  const entries = Object.entries(mapping).flatMap(([role, parameterName]) => {
    const normalizedParameter = readString(parameterName);
    return normalizedParameter ? [[role, normalizedParameter] as [string, string]] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function readMappingField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  return readString(value[key]);
}

function readEnhancedMappingField(value: unknown, key: string, field: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const mapping = value[key];
  if (!isRecord(mapping)) return undefined;
  return readString(mapping[field]) ?? readString(mapping.logicalField) ?? readString(mapping.field);
}

function conditionValue(condition: Record<string, unknown>, operator: VisualizationFilterIntent['operator']): unknown {
  if (operatorDoesNotNeedValue(operator)) return null;
  if (condition.valueType === 'dynamic' && readString(condition.dynamicDateValue)) {
    return dynamicDateValue(condition.dynamicDateValue, condition.dynamicDateOffset);
  }
  if (operator === 'between') {
    const value = condition.value;
    if (Array.isArray(value)) return value;
    return [value, condition.valueEnd ?? condition.endValue ?? condition.to];
  }
  if (operator === 'in' || operator === 'notIn') {
    const value = condition.value;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return condition.value;
}

function dynamicDateValue(value: unknown, offset: unknown): string {
  const raw = readString(value)?.toLowerCase() ?? '';
  if (raw === 'last_n_days') {
    const amount = Number(offset);
    return `${Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 7} days`;
  }
  const aliases: Record<string, string> = {
    last_7_days: '7 days',
    last_30_days: '30 days',
    last_year: '365 days',
    this_month: '30 days',
    this_week: '7 days',
    today: '1 days',
    yesterday: '1 days'
  };
  return aliases[raw] ?? raw;
}
