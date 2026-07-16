import type { TableDefinition } from '../data-source/foundation-store.js';
import {
  analyzerParameterDefinitionsForTable,
  type AnalyzerParameterDefinition
} from './analyzer-plan-parameter-values.js';

export function analyzerParameterValuesCompatibleWithTable(
  table: TableDefinition,
  values: Record<string, unknown>
): Record<string, unknown> {
  const definitions = new Map(analyzerParameterDefinitionsForTable(table).map(definition => [definition.name, definition]));
  return Object.fromEntries(Object.entries(values).filter(([name, value]) =>
    parameterValueCompatible(definitions.get(name), value)
  ));
}

function parameterValueCompatible(
  definition: AnalyzerParameterDefinition | undefined,
  value: unknown
): boolean {
  if (!definition) return true;
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.every(item => parameterValueCompatible(definition, item));
  const dataType = String(definition.dataType ?? '').trim().toLowerCase();
  if (numericParameterType(dataType)) return numericParameterValue(value);
  if (dateParameterType(dataType)) return dateParameterValue(value);
  if (booleanParameterType(dataType)) return booleanParameterValue(value);
  return true;
}

function numericParameterType(value: string): boolean {
  return ['bigint', 'decimal', 'double', 'float', 'int', 'integer', 'number', 'numeric', 'real']
    .some(type => value.includes(type));
}

function numericParameterValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

function dateParameterType(value: string): boolean {
  return value.includes('date') || value.includes('time');
}

function dateParameterValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
}

function booleanParameterType(value: string): boolean {
  return value.includes('bool');
}

function booleanParameterValue(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return value === 0 || value === 1;
  if (typeof value !== 'string') return false;
  return ['0', '1', 'false', 'no', 'true', 'yes'].includes(value.trim().toLowerCase());
}
