import type {
  ActionPlanMode,
  DashboardComponentType,
  KnowledgeReference,
  VisualizationKind
} from '@intraq/contracts';

export function parseMode(value: unknown): ActionPlanMode | null {
  return value === 'create' || value === 'update' ? value : null;
}

export function parseComponentType(value: unknown): DashboardComponentType | null {
  if (
    value === 'chart'
    || value === 'table'
    || value === 'card'
    || value === 'pie'
    || value === 'matrix'
    || value === 'filter'
    || value === 'text'
  ) {
    return value;
  }
  return null;
}

export function parseVisualizationKind(value: unknown): VisualizationKind | null {
  if (
    value === 'bar'
    || value === 'line'
    || value === 'pie'
    || value === 'table'
    || value === 'card'
    || value === 'matrix'
    || value === 'filter'
    || value === 'text'
  ) {
    return value;
  }
  return null;
}

export function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asNonEmptyString).filter((item): item is string => Boolean(item)).slice(0, 4)
    : [];
}

export function coalesceStringArrays(...values: unknown[]): string[] {
  for (const value of values) {
    const items = asStringArray(value);
    if (items.length > 0) return items;
  }
  return [];
}

export function readCalculatedFieldArgs(value: unknown): Array<{ expression: string; name: string }> {
  return readRecordArray(value).flatMap(item => {
    const name = asNonEmptyString(item.name);
    const expression = asNonEmptyString(item.expression);
    return name && expression ? [{ name, expression }] : [];
  });
}

export function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.flatMap(item => isRecord(item) ? [item] : []) : [];
}

export function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isKnowledgeReferences(value: unknown): value is KnowledgeReference[] {
  return Array.isArray(value) && value.every(item =>
    isRecord(item)
    && typeof item.id === 'string'
    && typeof item.title === 'string'
    && typeof item.domain === 'string'
    && typeof item.summary === 'string'
    && Array.isArray(item.tags)
  );
}
