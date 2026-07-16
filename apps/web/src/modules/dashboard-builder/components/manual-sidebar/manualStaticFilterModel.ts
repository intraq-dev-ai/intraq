import type { BuilderDataField, BuilderDataSource, DashboardElement, DashboardFilter, DashboardFilterPatch } from '../../types';

export type StaticScope = 'component' | 'dataSource';
export type StaticRuleLogic = 'and' | 'or' | 'not';
export type StaticValueType = 'dynamic' | 'static';
export type StaticTargetFieldType = 'column' | 'parameter';

export interface StaticConditionDraft {
  id: string;
  field: string;
  operator: string;
  value: string;
  valueEnd: string;
  valueType: StaticValueType;
  dynamicDateValue: string;
  dynamicDateOffset: number;
}

export interface StaticFilterPatchInput {
  firstCondition: StaticConditionDraft;
  name: string;
  rules: Record<string, unknown>;
  scope: StaticScope;
  selectedComponentIds: string[];
  selectedDataSourceId: string;
  targetFieldMappings: Record<string, string>;
  targetFieldTypes: Record<string, StaticTargetFieldType>;
}

export const staticOperators = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does Not Contain' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'greater_than_or_equal', label: 'Greater Than Or Equal' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'less_than_or_equal', label: 'Less Than Or Equal' },
  { value: 'between', label: 'Between' },
  { value: 'in', label: 'In List' },
  { value: 'not_in', label: 'Not In List' },
  { value: 'last', label: 'Last Window' },
  { value: 'is_null', label: 'Is Empty' },
  { value: 'is_not_null', label: 'Is Not Empty' }
] as const;

export function newStaticCondition(
  field = '',
  operator = 'equals',
  value = '',
  valueEnd = '',
  valueType: StaticValueType = 'static',
  dynamicDateValue = 'last_7_days',
  dynamicDateOffset = 7
): StaticConditionDraft {
  return {
    dynamicDateOffset,
    dynamicDateValue,
    field,
    id: `condition-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    operator,
    value,
    valueEnd,
    valueType
  };
}

export function staticRuleConditions(rule: unknown): StaticConditionDraft[] {
  if (!isRecord(rule)) return [];
  if (readString(rule.type) === 'condition') {
    const value = rule.value;
    return [newStaticCondition(
      readString(rule.field) ?? '',
      legacyStaticOperator(readString(rule.operator) ?? 'equals'),
      Array.isArray(value) ? formatStaticValue(value[0]) : formatStaticValue(value),
      Array.isArray(value) ? formatStaticValue(value[1]) : '',
      readString(rule.valueType) === 'dynamic' ? 'dynamic' : 'static',
      readString(rule.dynamicDateValue) ?? 'last_7_days',
      readNumber(rule.dynamicDateOffset) ?? 7
    )];
  }
  return Array.isArray(rule.children) ? rule.children.flatMap(child => staticRuleConditions(child)) : [];
}

export function simpleStaticRuleFromFilter(filter: DashboardFilter): Record<string, unknown> {
  return {
    children: [{
      field: filter.field,
      id: `${filter.id}-condition`,
      operator: legacyStaticOperator(filter.operator),
      type: 'condition',
      value: filter.value
    }],
    id: 'root',
    logic: 'and',
    type: 'group'
  };
}

export function staticFilterPatchFromDraft(input: StaticFilterPatchInput): DashboardFilterPatch {
  const operator = runtimeStaticOperator(input.firstCondition.operator);
  const value = runtimeStaticValue(input.firstCondition);
  const selectedTargets = input.scope === 'component'
    ? input.selectedComponentIds
    : input.selectedDataSourceId ? [input.selectedDataSourceId] : [];
  const scopedFieldTypes = selectedTargets.reduce<Record<string, StaticTargetFieldType>>((acc, id) => {
    acc[id] = input.targetFieldTypes[id] ?? 'column';
    return acc;
  }, {});
  const scopedMappings = selectedTargets.reduce<Record<string, string>>((acc, id) => {
    const mapped = input.targetFieldMappings[id] || input.firstCondition.field;
    if (mapped) acc[id] = mapped;
    return acc;
  }, {});
  const targetDataSources = input.scope === 'dataSource' ? [input.selectedDataSourceId] : [];
  const targetComponents = input.scope === 'component' ? [...input.selectedComponentIds] : [];
  const dataSourceFieldMappings = input.scope === 'dataSource' ? scopedMappings : {};
  const componentFieldMappings = input.scope === 'component' ? scopedMappings : {};
  const parameterMappings = parameterMappingsFromTargets(scopedFieldTypes, scopedMappings, input.firstCondition.operator);
  const isParameter = Object.keys(parameterMappings).length > 0;
  const primaryMappedField = selectedTargets.flatMap(targetId => scopedMappings[targetId] ? [scopedMappings[targetId]] : [])[0]
    ?? input.firstCondition.field;
  return {
    config: {
      applyTo: input.scope === 'component' ? 'element' : 'datasource',
      componentFieldMappings,
      dataSourceFieldMapping: input.scope === 'dataSource'
        ? scopedMappings[input.selectedDataSourceId] ?? input.firstCondition.field
        : input.firstCondition.field,
      dataSourceFieldMappings,
      enhancedFieldMappings: scopedMappings,
      field: input.firstCondition.field,
      fieldType: isParameter ? 'parameter' : 'column',
      isParameter,
      operator,
      parameterMappings,
      rules: input.rules,
      scope: input.scope,
      static: true,
      targetComponents,
      targetDataSourceId: input.selectedDataSourceId,
      targetDataSources,
      targetElementIds: targetComponents,
      targetFieldTypes: scopedFieldTypes,
      type: 'static',
      value
    },
    field: isParameter ? primaryMappedField : input.firstCondition.field,
    isActive: true,
    name: input.name,
    operator,
    type: 'static',
    value
  };
}

function parameterMappingsFromTargets(
  fieldTypes: Record<string, StaticTargetFieldType>,
  mappings: Record<string, string>,
  operator: string
): Record<string, string | { end: string; start: string }> {
  return Object.fromEntries(Object.entries(mappings).flatMap(([targetId, mappedField]) => {
    if (fieldTypes[targetId] !== 'parameter' || !mappedField) return [];
    const mapping = operator === 'between' ? { start: mappedField, end: mappedField } : mappedField;
    return [[targetId, mapping]];
  }));
}

export function fieldsForStaticElementTarget(
  element: DashboardElement,
  dataSources: BuilderDataSource[],
  fallbackFields: BuilderDataField[]
): BuilderDataField[] {
  const sourceId = readString(element.dataSourceId)
    ?? readString(element.config?.dataSourceId)
    ?? readString(element.config?.dataSource);
  const tableId = readString(element.config?.dataSourceTableId) ?? readString(element.config?.tableName);
  const source = dataSources.find(item => item.id === sourceId);
  return source?.tables.find(table => table.id === tableId || table.name === tableId)?.fields
    ?? source?.tables.find(table => table.isSelected)?.fields
    ?? source?.tables[0]?.fields
    ?? fallbackFields;
}

export function fieldsForStaticDataSourceTarget(
  dataSourceId: string,
  dataSources: BuilderDataSource[],
  selectedTableId: string
): BuilderDataField[] {
  const source = dataSources.find(item => item.id === dataSourceId);
  return source?.tables.find(table => table.id === selectedTableId)?.fields
    ?? source?.tables.find(table => table.isSelected)?.fields
    ?? source?.tables[0]?.fields
    ?? [];
}

export function needsStaticConditionValue(operator: string): boolean {
  return operator !== 'is_null' && operator !== 'is_not_null';
}

export function runtimeStaticOperator(operator: string): string {
  const map: Record<string, string> = {
    ends_with: 'endsWith',
    greater_than: 'greaterThan',
    greater_than_or_equal: 'greaterThanOrEqual',
    is_not_null: 'isNotNull',
    is_null: 'isNull',
    less_than: 'lessThan',
    less_than_or_equal: 'lessThanOrEqual',
    not_contains: 'notContains',
    not_equals: 'notEquals',
    not_in: 'notIn',
    starts_with: 'startsWith'
  };
  return map[operator] ?? operator;
}

export function legacyStaticOperator(operator: string): string {
  const map: Record<string, string> = {
    endsWith: 'ends_with',
    greaterThan: 'greater_than',
    greaterThanOrEqual: 'greater_than_or_equal',
    isNotNull: 'is_not_null',
    isNull: 'is_null',
    lessThan: 'less_than',
    lessThanOrEqual: 'less_than_or_equal',
    notContains: 'not_contains',
    notEquals: 'not_equals',
    notIn: 'not_in',
    startsWith: 'starts_with'
  };
  return map[operator] ?? operator;
}

export function runtimeStaticValue(condition: StaticConditionDraft): unknown {
  if (!needsStaticConditionValue(condition.operator)) return null;
  if (condition.valueType === 'dynamic') {
    return condition.dynamicDateValue === 'last_n_days'
      ? `${condition.dynamicDateOffset} days`
      : condition.dynamicDateValue;
  }
  if (condition.operator === 'between') return [condition.value, condition.valueEnd];
  if (condition.operator === 'in' || condition.operator === 'not_in') {
    return condition.value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return condition.value;
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function readStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string' && entry[1].trim().length > 0
  )));
}

export function readTargetFieldTypes(value: unknown): Record<string, StaticTargetFieldType> {
  return Object.fromEntries(Object.entries(readStringRecord(value)).map(([key, fieldType]) => [
    key,
    fieldType === 'parameter' ? 'parameter' : 'column'
  ]));
}

export function formatStaticValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
