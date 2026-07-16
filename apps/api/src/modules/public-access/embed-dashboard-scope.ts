import type { Dashboard } from '../dashboard/foundation-store.js';

export function dashboardDataSourceIds(dashboard: Dashboard): Set<string> {
  const ids = new Set<string>();
  for (const element of dashboard.elements) {
    addString(ids, element.dataSourceId);
    addString(ids, element.config.dataSourceId);
    addString(ids, element.config.sourceId);
    const dataRef = element.config.dataRef;
    if (isRecord(dataRef)) addString(ids, dataRef.sourceId);
    addOptionSourceIds(ids, element.config);
  }
  for (const filter of dashboard.filters) {
    addOptionSourceIds(ids, filter.config);
  }
  return ids;
}

function addOptionSourceIds(values: Set<string>, config: unknown): void {
  if (!isRecord(config)) return;
  for (const key of ['optionSource', 'optionsSource', 'dynamicOptions', 'optionLookup', 'lookupOptions']) {
    const source = config[key];
    if (isRecord(source)) {
      addString(values, source.dataSourceId);
      addString(values, source.sourceId);
    }
  }
  addString(values, config.optionDataSourceId);
  addString(values, config.optionsDataSourceId);
  addString(values, config.dynamicOptionsDataSourceId);
}

function addString(values: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.trim().length > 0) values.add(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
