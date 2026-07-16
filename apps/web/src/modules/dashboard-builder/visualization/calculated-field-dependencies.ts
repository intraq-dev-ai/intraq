import type { DashboardElement, VisualizationSpec } from '../types';
import { readCalculatedFields, type CalculatedField } from './calculated-field-runtime';

export const ROW_COUNT_FIELD = '__row_count';

export function calculatedFieldDependencyMap(value: unknown): Map<string, string[]> {
  const fields = readCalculatedFields(value);
  if (fields.length === 0) return new Map();
  const directDependencies = new Map(fields.map(field => [
    field.name,
    calculatedFieldDependencies(field)
  ]));
  return new Map(fields.map(field => [
    field.name,
    resolveCalculatedFieldDependencies(field.name, directDependencies, new Set())
  ]).filter((entry): entry is [string, string[]] => entry[1].length > 0));
}

export function calculatedFieldNames(value: unknown): Set<string> {
  return new Set(readCalculatedFields(value).map(field => field.name));
}

export function calculatedFieldsRequireRawRows(element: DashboardElement, spec: VisualizationSpec): boolean {
  const fields = readCalculatedFields(element.config?.calculatedFields);
  if (fields.length === 0) return false;
  const calculatedNames = new Set(fields.map(field => field.name));
  const calculatedFieldByName = new Map(fields.map(field => [field.name, field]));
  const calculatedEncodings = spec.encodings.filter(encoding => calculatedNames.has(encoding.field));
  if (calculatedEncodings.length === 0) return true;
  const dependencyMap = calculatedFieldDependencyMap(element.config?.calculatedFields);
  return calculatedEncodings.some(encoding => {
    const calculatedField = calculatedFieldByName.get(encoding.field);
    if (encoding.role === 'measure' && isAggregateExpression(calculatedField?.expression)) return false;
    const dependencies = dependencyMap.get(encoding.field);
    return encoding.role !== 'measure'
      || !dependencies?.length
      || dependencies.some(dependency => dependency !== ROW_COUNT_FIELD);
  });
}

function calculatedFieldDependencies(field: CalculatedField): string[] {
  const dependencies = uniqueStrings([
    ...fieldReferencesFromExpression(field.expression),
    ...fieldReferencesFromExpression(field.filterExpression),
    ...fieldReferencesFromTemplate(field.template),
    ...fieldReferencesFromCaseExpression(field.caseExpression),
    ...(field.conditions?.flatMap(condition => readString(condition.field) ? [readString(condition.field) as string] : []) ?? []),
    field.sourceField,
    field.valueField,
    field.measure,
    field.filterField,
    field.dateField
  ].filter((dependency): dependency is string =>
    typeof dependency === 'string' && dependency.trim().length > 0 && dependency.trim() !== field.name
  ).map(dependency => dependency.trim()));
  if (dependencies.length > 0) return dependencies;
  return isRowCountExpression(field.expression) ? [ROW_COUNT_FIELD] : [];
}

function resolveCalculatedFieldDependencies(
  field: string,
  dependenciesByField: Map<string, string[]>,
  visited: Set<string>
): string[] {
  if (visited.has(field)) return [];
  visited.add(field);
  return uniqueStrings((dependenciesByField.get(field) ?? []).flatMap(dependency =>
    dependenciesByField.has(dependency)
      ? resolveCalculatedFieldDependencies(dependency, dependenciesByField, new Set(visited))
      : [dependency]
  ));
}

function fieldReferencesFromExpression(value: string | undefined): string[] {
  if (!value) return [];
  const explicitReferences = fieldReferencesFromTemplate(value);
  if (explicitReferences.length > 0) return explicitReferences;
  return uniqueStrings(Array.from(value.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g))
    .map(match => match[0])
    .filter(reference => !CALCULATED_EXPRESSION_RESERVED_WORDS.has(reference.toLowerCase())));
}

function fieldReferencesFromTemplate(value: string | undefined): string[] {
  if (!value) return [];
  return uniqueStrings([
    ...Array.from(value.matchAll(/\[([^\]]+)\]/g)).map(match => match[1]?.trim() ?? ''),
    ...Array.from(value.matchAll(/\$\{([^}]+)\}/g)).map(match => match[1]?.trim() ?? '')
  ].filter(Boolean));
}

function fieldReferencesFromCaseExpression(value: string | undefined): string[] {
  if (!value) return [];
  const whenConditions = Array.from(value.matchAll(/when\(([^,]+),/gi)).flatMap(match =>
    fieldReferencesFromExpression(match[1]?.trim())
  );
  return uniqueStrings([...fieldReferencesFromTemplate(value), ...whenConditions]);
}

function isRowCountExpression(value: string | undefined): boolean {
  return value?.trim() === '1';
}

function isAggregateExpression(value: string | undefined): boolean {
  return /\b(avg|count|min|max|sum)\s*\(/i.test(value ?? '');
}

const CALCULATED_EXPRESSION_RESERVED_WORDS = new Set([
  'and',
  'between',
  'contains',
  'false',
  'in',
  'not',
  'null',
  'or',
  'then',
  'true',
  'when'
]);

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
