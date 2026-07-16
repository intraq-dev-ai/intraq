import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';

type PreflightModel = Record<string, unknown> & { id: string; name: string };

export function supportedMeasuresByModel(models: PreflightModel[]): Record<string, string[]> {
  const entries: Array<[string, string[]]> = [];
  for (const model of models) {
    const measures = uniqueStrings([
      readString(model.supportedMeasure),
      ...readStringArray(model.supportedMeasures)
    ].filter((value): value is string => Boolean(value)));
    if (measures.length === 0) continue;
    entries.push([model.id, measures], [model.name, measures]);
  }
  return Object.fromEntries(entries);
}

export function supportedStringListByModel(
  models: PreflightModel[],
  key: string
): Record<string, string[]> {
  return Object.fromEntries(models.flatMap(model => {
    const values = readStringArray(model[key]);
    return [[model.id, values], [model.name, values]];
  }));
}

export function supportedFiltersByModel(
  models: PreflightModel[]
): Record<string, Array<Record<string, unknown>>> {
  const entries: Array<[string, Array<Record<string, unknown>>]> = [];
  for (const model of models) {
    const filters = Array.isArray(model.supportedFilters)
      ? normalizePreflightSupportedFilters(model.supportedFilters.filter(isRecord))
      : [];
    if (filters.length === 0) continue;
    entries.push([model.id, filters], [model.name, filters]);
  }
  return Object.fromEntries(entries);
}

export function normalizePreflightSupportedFilters(
  filters: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const normalized: Array<Record<string, unknown>> = [];
  for (const filter of filters) {
    const field = readString(filter.field);
    if (!field) {
      normalized.push(filter);
      continue;
    }
    const existingIndex = normalized.findIndex(item => readString(item.field) === field);
    if (existingIndex < 0) {
      normalized.push(filter);
      continue;
    }
    const existing = normalized[existingIndex];
    if (!existing) continue;
    normalized[existingIndex] = conditionFlagField(field)
      ? preferredConditionFlagFilter(existing, filter)
      : mergeEqualityFilters(existing, filter);
  }
  return normalized;
}

function preferredConditionFlagFilter(
  existing: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  return conditionFilterRank(next) > conditionFilterRank(existing) ? next : existing;
}

function conditionFilterRank(filter: Record<string, unknown>): number {
  const operator = readString(filter.operator)?.trim().toLowerCase();
  if (operator !== 'equals' && operator !== 'in') return 0;
  if (!Object.prototype.hasOwnProperty.call(filter, 'value')) return 0;
  const values = Array.isArray(filter.value) ? filter.value : [filter.value];
  if (values.length > 0 && values.every(value => normalizeBooleanLikeValue(value) !== null)) return 2;
  return 1;
}

function mergeEqualityFilters(
  existing: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const existingValues = equalityFilterValues(existing);
  const nextValues = equalityFilterValues(next);
  if (!existingValues || !nextValues) return existing;
  const values = uniqueFilterValues([...existingValues, ...nextValues].flatMap(value =>
    Array.isArray(value) ? value : [value]
  ));
  return {
    ...existing,
    operator: values.length === 1 ? 'equals' : 'in',
    value: values.length === 1 ? values[0] : values
  };
}

function conditionFlagField(fieldName: string): boolean {
  const normalized = fieldName.trim().toLowerCase();
  return normalized.startsWith('has_') || normalized.startsWith('is_');
}

function normalizeBooleanLikeValue(value: unknown): 0 | 1 | null {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 0) return 0;
    if (value === 1) return 1;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === 'yes' || normalized === '1') return 1;
  if (normalized === 'false' || normalized === 'no' || normalized === '0') return 0;
  return null;
}

function equalityFilterValues(filter: Record<string, unknown>): unknown[] | null {
  const operator = readString(filter.operator);
  if (operator !== 'equals' && operator !== 'in') return null;
  if (!Object.prototype.hasOwnProperty.call(filter, 'value')) return null;
  return Array.isArray(filter.value) ? filter.value : [filter.value];
}

function uniqueFilterValues(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
