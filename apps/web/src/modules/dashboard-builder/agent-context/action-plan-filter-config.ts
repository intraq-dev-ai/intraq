import type { BuilderActionPlan } from '../types';
import type { FilterDraft } from './element-planner';

export function applyFilterActionConfig(config: Record<string, unknown>, params: Record<string, unknown>): void {
  const field = readFieldParam(params, ['field', 'filterField', 'column']);
  setStringValue(config, 'field', field);
  setStringValue(config, 'xField', field);
  setStringValue(config, 'operator', readString(params.operator) ?? 'equals');
  setStringValue(config, 'inputType', readString(params.inputType) ?? readString(params.type) ?? 'single-select');
  setStringValue(config, 'filterType', readString(params.inputType) ?? readString(params.type) ?? 'single-select');
  const value = params.value ?? params.defaultValue;
  if (value !== undefined) {
    config.value = value;
    config.defaultValue = value;
    config.filterValue = value;
  }
}

export function filterDraftsFromActions(plan: BuilderActionPlan): FilterDraft[] {
  return (plan.actions ?? []).flatMap(action => {
    if (action.action !== 'add_filter' && action.action !== 'create_filter') return [];
    const field = readString(action.params.field) ?? readString(action.params.name);
    if (!field) return [];
    return [{
      name: readString(action.params.label) ?? labelFromField(field),
      field,
      operator: readString(action.params.operator) ?? 'equals',
      value: readString(action.params.value) ?? '',
      type: readString(action.params.type) ?? 'interactive'
    }];
  });
}

function readFieldParam(params: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readString(params[key]);
    if (value) return value;
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function setStringValue(config: Record<string, unknown>, key: string, value: string | undefined): void {
  if (value) config[key] = value;
}

function labelFromField(field: string): string {
  return field.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}
