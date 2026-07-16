import { fetchEmbedDataSourcePreview } from './api';
import { readString } from './embed-dashboard-utils';
import type {
  EmbedDashboardFilter,
  EmbedDataSource
} from './types';

export async function loadScopedFilterOptions(
  accessToken: string,
  origin: string,
  filters: EmbedDashboardFilter[],
  dataSources: EmbedDataSource[]
): Promise<Record<string, string[]>> {
  const scopedFilters = filters.filter(filter => shouldScopeFilterOptions(filter));
  if (scopedFilters.length === 0 || dataSources.length === 0) return {};

  const previews = await Promise.all(dataSources.map(async source => {
    try {
      return await fetchEmbedDataSourcePreview(source.id, accessToken, 5000, origin);
    } catch {
      return null;
    }
  }));
  const rowsBySourceId = new Map<string, Array<Record<string, unknown>>>();
  previews.forEach((preview, index) => {
    const sourceId = dataSources[index]?.id;
    if (preview && sourceId) rowsBySourceId.set(sourceId, preview.rows);
  });

  const next: Record<string, string[]> = {};
  for (const filter of scopedFilters) {
    const values = scopedValuesForFilter(filter, rowsBySourceId, dataSources);
    if (values.length > 0) next[filter.id] = values;
  }
  return next;
}

function scopedValuesForFilter(
  filter: EmbedDashboardFilter,
  rowsBySourceId: ReadonlyMap<string, Array<Record<string, unknown>>>,
  dataSources: EmbedDataSource[]
): string[] {
  const field = filter.field;
  const sourceIds = sourceIdsForFilter(filter, dataSources);
  const values: string[] = [];
  const seen = new Set<string>();
  for (const sourceId of sourceIds) {
    const rows = rowsBySourceId.get(sourceId) ?? [];
    for (const row of rows) {
      const value = row[field];
      if (value === undefined || value === null || value === '') continue;
      const text = String(value).trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      values.push(text);
      if (values.length >= 80) return values;
    }
  }
  return values;
}

function sourceIdsForFilter(filter: EmbedDashboardFilter, dataSources: EmbedDataSource[]): string[] {
  const configured = readString(filter.config?.dataSourceId)
    ?? readString(filter.config?.sourceId)
    ?? readString(filter.config?.dataSource);
  const sourceIds = configured ? [configured] : dataSources
    .filter(source => source.tables.some(table => table.fields.some(field => field.name === filter.field)))
    .map(source => source.id);
  return Array.from(new Set(sourceIds));
}

function shouldScopeFilterOptions(filter: EmbedDashboardFilter): boolean {
  const inputType = readString(filter.config?.inputType ?? filter.config?.filterType ?? filter.config?.type ?? filter.type)
    ?.replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
  if (['date-range', 'daterange', 'date_range', 'date-picker', 'datepicker', 'date_picker', 'date'].includes(inputType ?? '')) {
    return false;
  }
  return filter.field.trim().length > 0;
}
