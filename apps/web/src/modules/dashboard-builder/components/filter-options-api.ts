import type { DashboardFilter } from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';

export interface FilterOptionItem {
  label: string;
  value: string;
}

interface FilterOptionSource {
  dataSourceId: string;
  fieldName: string;
  labelField?: string;
  limit?: number;
  tableName: string;
  valueField?: string;
}

export function hasDynamicFilterOptionSource(filter: DashboardFilter): boolean {
  return dynamicFilterOptionSource(filter) !== null;
}

/**
 * Stable key describing everything that determines a filter's OPTION list:
 * its option source (dynamic table/field or static fallback) and field.
 * Deliberately excludes the filter's selected `value`, so changing a filter's
 * value never invalidates the option cache — only an option-source change or a
 * Preview Scope (runtime parameter) change should trigger a re-fetch.
 */
export function filterOptionSourceKey(filter: DashboardFilter): string {
  const source = dynamicFilterOptionSource(filter);
  if (source) {
    return [
      'dyn',
      source.dataSourceId,
      source.tableName,
      source.fieldName,
      source.valueField ?? '',
      source.labelField ?? '',
      source.limit ?? ''
    ].join('|');
  }
  const config = filter.config ?? {};
  const staticOptions = config.options ?? config.allowedValues ?? config.choices ?? config.values;
  return [
    'static',
    readString(config.dataSourceId) ?? '',
    filter.field || readString(config.dataSourceFieldMapping) || '',
    readString(config.tableName) ?? '',
    Array.isArray(staticOptions) ? JSON.stringify(staticOptions) : ''
  ].join('|');
}

/**
 * Session cache of dynamic filter option lists, keyed by the request that
 * produces them (option source + Preview Scope runtime parameters). Filter
 * option lists are reference data that only change when the source or Preview
 * Scope changes, so we fetch each once and reuse it across re-renders and
 * component remounts. Concurrent callers for the same key share one in-flight
 * request (dedupes the burst that a single value change can trigger).
 */
const dynamicFilterOptionCache = new Map<string, Promise<FilterOptionItem[]>>();

export function clearDynamicFilterOptionCache(): void {
  dynamicFilterOptionCache.clear();
}

export async function fetchDynamicFilterOptionItems(
  filter: DashboardFilter,
  requestContext?: VisualizationDataRequestContext | undefined
): Promise<FilterOptionItem[]> {
  const source = dynamicFilterOptionSource(filter);
  if (!source) return [];
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (requestContext?.token) headers.authorization = `Bearer ${requestContext.token}`;
  if (requestContext?.embedOrigin) headers['x-embed-origin'] = requestContext.embedOrigin;
  const parameterValues = requestContext?.runtimeParameterValues;
  const body = {
    dataSourceId: source.dataSourceId,
    tableName: source.tableName,
    fieldName: source.fieldName,
    ...(source.valueField ? { valueField: source.valueField } : {}),
    ...(source.labelField ? { labelField: source.labelField } : {}),
    ...(source.limit ? { limit: source.limit } : {}),
    ...(parameterValues && Object.keys(parameterValues).length > 0 ? { parameterValues } : {})
  };
  const endpoint = requestContext?.token
    ? '/api/embed/filter-options'
    : `/api/data-sources/${encodeURIComponent(source.dataSourceId)}/filter-options`;
  const cacheKey = `${endpoint}::${JSON.stringify(body)}`;
  const cached = dynamicFilterOptionCache.get(cacheKey);
  if (cached) return cached;
  const request = requestFilterOptions(endpoint, headers, body, () => dynamicFilterOptionCache.delete(cacheKey));
  dynamicFilterOptionCache.set(cacheKey, request);
  return request;
}

async function requestFilterOptions(
  endpoint: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  evict: () => void
): Promise<FilterOptionItem[]> {
  let res: Response;
  try {
    res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    evict();
    return [];
  }
  if (!res.ok) {
    evict();
    return [];
  }
  const payload = await res.json() as {
    data?: { options?: unknown[]; values?: unknown[] };
    options?: unknown[];
    values?: unknown[];
  };
  const options = payload.data?.options ?? payload.options;
  if (Array.isArray(options)) return dedupeOptions(options.flatMap(optionItems));
  const values = payload.data?.values ?? payload.values;
  return Array.isArray(values) ? dedupeOptions(values.flatMap(optionItems)) : [];
}

function dynamicFilterOptionSource(filter: DashboardFilter): FilterOptionSource | null {
  const config = filter.config ?? {};
  const sourceConfig = readRecord(
    config.optionSource
      ?? config.optionsSource
      ?? config.dynamicOptions
      ?? config.optionLookup
      ?? config.lookupOptions
  );
  const hasExplicitSource = Object.keys(sourceConfig).length > 0
    || readString(config.optionDataSourceId ?? config.optionsDataSourceId ?? config.dynamicOptionsDataSourceId) !== undefined
    || readString(config.optionTableName ?? config.optionsTableName ?? config.dynamicOptionsTableName) !== undefined;
  if (!hasExplicitSource) return null;

  const dataSourceId = readString(
    sourceConfig.dataSourceId
      ?? sourceConfig.sourceId
      ?? config.optionDataSourceId
      ?? config.optionsDataSourceId
      ?? config.dynamicOptionsDataSourceId
      ?? config.dataSourceId
  );
  const tableName = readString(
    sourceConfig.tableName
      ?? sourceConfig.table
      ?? sourceConfig.dataModel
      ?? sourceConfig.modelName
      ?? config.optionTableName
      ?? config.optionsTableName
      ?? config.dynamicOptionsTableName
      ?? config.tableName
  );
  const valueField = readString(
    sourceConfig.valueField
      ?? sourceConfig.value
      ?? config.optionValueField
      ?? config.optionsValueField
      ?? config.dynamicOptionsValueField
  );
  const fieldName = readString(
    sourceConfig.fieldName
      ?? sourceConfig.field
      ?? config.optionFieldName
      ?? config.optionsFieldName
      ?? config.dynamicOptionsFieldName
      ?? valueField
      ?? filter.field
  );
  if (!dataSourceId || !tableName || !fieldName) return null;
  const labelField = readString(
    sourceConfig.labelField
      ?? sourceConfig.textField
      ?? sourceConfig.displayField
      ?? sourceConfig.label
      ?? config.optionLabelField
      ?? config.optionsLabelField
      ?? config.dynamicOptionsLabelField
  );
  const limit = readPositiveInteger(
    sourceConfig.limit
      ?? config.optionLimit
      ?? config.optionsLimit
      ?? config.dynamicOptionsLimit
  );
  return {
    dataSourceId,
    fieldName,
    tableName,
    ...(valueField ? { valueField } : {}),
    ...(labelField ? { labelField } : {}),
    ...(limit ? { limit } : {})
  };
}

function optionItems(value: unknown): FilterOptionItem[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [{ label: String(value), value: String(value) }];
  }
  if (!isRecord(value)) return [];
  const rawValue = value.value ?? value.id ?? value.key ?? value.name ?? value.label;
  if (rawValue === undefined || rawValue === null || rawValue === '') return [];
  const rawLabel = value.label ?? value.text ?? value.name ?? rawValue;
  return [{ label: String(rawLabel), value: String(rawValue) }];
}

function dedupeOptions(values: FilterOptionItem[]): FilterOptionItem[] {
  const seen = new Set<string>();
  const items: FilterOptionItem[] = [];
  for (const value of values) {
    if (!value.value || seen.has(value.value)) continue;
    seen.add(value.value);
    items.push(value);
  }
  return items;
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
