import type { DashboardElement, VisualizationSpec } from '../types';
import { calculatedFieldNames } from './calculated-field-dependencies';

export function elementFieldNames(element: DashboardElement, spec: VisualizationSpec): Set<string> {
  const calculated = calculatedFieldNames(element.config?.calculatedFields);
  const fields = new Set<string>();
  addStringFields(fields, element.config?.fields);
  if (fields.size === 0 && (spec.kind === 'table' || spec.kind === 'matrix')) {
    addConfiguredFields(fields, element.config?.columns);
    addConfiguredFields(fields, element.config?.rowFields);
    addConfiguredFields(fields, element.config?.columnFields);
    addConfiguredFields(fields, element.config?.valueFields);
  }
  addRowExpansionFields(fields, element.config?.rowExpansion ?? element.config?.tableRowExpansion ?? element.config?.expansion);
  for (const field of Array.from(fields)) {
    if (calculated.has(field)) fields.delete(field);
  }
  return fields;
}

export function labelForField(field: string): string {
  return field.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function addStringFields(fields: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  value.forEach(item => addField(fields, item));
}

function addConfiguredFields(fields: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === 'string') {
      addField(fields, item);
      continue;
    }
    if (!isRecord(item)) continue;
    addField(fields, item.field ?? item.name ?? item.key);
  }
}

function addRowExpansionFields(fields: Set<string>, value: unknown): void {
  if (!isRecord(value)) return;
  addField(fields, value.rowKeyField ?? value.keyField);
  const levels = Array.isArray(value.levels) ? value.levels : [];
  for (const level of levels) {
    if (!isRecord(level)) continue;
    addField(fields, level.rowKeyField ?? level.keyField);
    addMappedRowFields(fields, level.parameterMappings ?? level.parameterMap ?? level.mappings);
    addMappedRowFields(fields, level.parameterValues ?? level.parameters ?? level.params);
  }
}

function addMappedRowFields(fields: Set<string>, value: unknown): void {
  if (typeof value === 'string') {
    addRowFieldToken(fields, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => addMappedRowFields(fields, item));
    return;
  }
  if (!isRecord(value)) return;
  Object.values(value).forEach(item => addMappedRowFields(fields, item));
}

function addRowFieldToken(fields: Set<string>, value: string): void {
  for (const match of value.matchAll(/(?:\$row\.|row\.)([A-Za-z_][A-Za-z0-9_.]*)/g)) {
    const field = match[1]?.split('.')[0];
    addField(fields, field);
  }
}

function addField(fields: Set<string>, value: unknown): void {
  if (typeof value !== 'string' || !value.trim()) return;
  fields.add(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
