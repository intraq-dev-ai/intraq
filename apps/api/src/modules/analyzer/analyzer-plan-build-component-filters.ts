import { isRecord } from './analyzer-plan-utils.js';

export function actionFilterRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

export function mergeAnalyzerFilters(value: unknown, filter: Record<string, unknown>): Record<string, unknown>[] {
  return dedupeAnalyzerFilters([...actionFilterRecords(value), filter]);
}

function dedupeAnalyzerFilters(filters: Record<string, unknown>[]): Record<string, unknown>[] {
  const merged: Record<string, unknown>[] = [];
  const indexes = new Map<string, number>();
  for (const filter of filters) {
    const key = analyzerFilterKey(filter);
    if (!key || !indexes.has(key)) {
      if (key) indexes.set(key, merged.length);
      merged.push(filter);
      continue;
    }
    merged[indexes.get(key)!] = filter;
  }
  return merged;
}

function analyzerFilterKey(filter: Record<string, unknown>): string | null {
  const field = typeof filter.field === 'string' ? filter.field : '';
  const operator = typeof filter.operator === 'string' ? filter.operator : '';
  if (!field || !operator) return null;
  const value = Object.prototype.hasOwnProperty.call(filter, 'value')
    ? filter.value
    : Object.prototype.hasOwnProperty.call(filter, 'values')
      ? filter.values
      : undefined;
  return JSON.stringify([field, operator, value]);
}
