import type { BuilderDataField } from '../../types';
import { normalizeFieldType } from './manualTableColumnEntries';

type CalculatedFieldRecord = Record<string, unknown>;

const numericAnalyticsFunctions = new Set([
  'custom_expression',
  'difference_from_previous_row',
  'moving_average',
  'percent_change',
  'percent_change_from_previous_row',
  'percent_of_column',
  'percent_of_max',
  'percent_of_previous_row',
  'percent_of_total',
  'rank',
  'rank_of_column',
  'running_average',
  'running_column_total',
  'running_total',
  'year_over_year'
]);

export function tableFieldsWithCalculatedFields(
  sourceFields: BuilderDataField[],
  fieldsText: string
): BuilderDataField[] {
  const sourceNames = new Set(sourceFields.map(field => field.name));
  const calculatedFields = readCalculatedFieldOptions(fieldsText, sourceFields)
    .filter(field => !sourceNames.has(field.name));
  return [...sourceFields, ...calculatedFields];
}

export function readCalculatedFieldOptions(
  fieldsText: string,
  sourceFields: BuilderDataField[]
): BuilderDataField[] {
  const trimmed = fieldsText.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(item => calculatedFieldOption(item, sourceFields));
  } catch {
    return [];
  }
}

function calculatedFieldOption(
  item: unknown,
  sourceFields: BuilderDataField[]
): BuilderDataField[] {
  if (!isRecord(item)) return [];
  const name = readString(item.name) ?? readString(item.field) ?? readString(item.key) ?? readString(item.id);
  if (!name) return [];
  return [{
    name,
    description: 'Calculated field',
    label: readString(item.label) ?? name,
    type: calculatedFieldType(item, sourceFields),
    role: 'calculated',
    semanticRole: 'calculated'
  }];
}

function calculatedFieldType(
  field: CalculatedFieldRecord,
  sourceFields: BuilderDataField[]
): string {
  const fieldType = inferredFieldType(field);
  const format = readString(field.format)?.toLowerCase() ?? '';
  if (format === 'number' || format === 'currency' || format === 'percent' || format === 'percentage') return 'number';
  if (fieldType === 'datetimeformat' || fieldType === 'date_time_format' || fieldType === 'dategrouping' || fieldType === 'date_grouping') return 'text';
  if (fieldType === 'analytics') {
    const analyticsFunction = readString(field.analyticsFunction ?? field.function ?? field.operation)?.toLowerCase();
    if (analyticsFunction && numericAnalyticsFunctions.has(analyticsFunction)) return 'number';
    return sourceFieldType(field.sourceField, sourceFields) ?? 'number';
  }
  if (fieldType === 'expression') return 'number';
  if (fieldType === 'time_filter') return sourceFieldType(field.valueField ?? field.sourceField, sourceFields) ?? 'number';
  if (fieldType === 'parameter_period_comparison') return 'number';
  if (fieldType === 'filter') return sourceFieldType(field.sourceField ?? field.filterField, sourceFields) ?? 'text';
  return 'text';
}

function inferredFieldType(field: CalculatedFieldRecord): string {
  const explicitType = readString(field.type)?.toLowerCase();
  if (explicitType) return explicitType;
  if (readString(field.expression) || readString(field.formula) || readString(field.calculation)) return 'expression';
  return 'conditional';
}

function sourceFieldType(value: unknown, sourceFields: BuilderDataField[]): string | undefined {
  const fieldName = readString(value);
  if (!fieldName) return undefined;
  const source = sourceFields.find(field => field.name === fieldName);
  return source ? normalizeFieldType(source.type) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is CalculatedFieldRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
