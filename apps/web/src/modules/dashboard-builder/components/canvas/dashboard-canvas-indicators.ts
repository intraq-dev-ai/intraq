import type { DashboardElement, DashboardFilter } from '../../types';

export interface DashboardCanvasIndicatorSummary {
  additionalSettings: Record<string, string | boolean | number>;
  additionalSettingsCount: number;
  conditionalFormattingCount: number;
  fields: string[];
  filterCount: number;
  filters: DashboardFilter[];
  layoutSettings: Record<string, string | boolean | number>;
  layoutSettingsCount: number;
  sortingSettings: Record<string, string>;
  sortingSettingsCount: number;
}

export type DashboardCanvasInfoTab = 'additional' | 'formatting' | 'fields' | 'filters' | 'layout' | 'sorting';

export function buildDashboardCanvasIndicatorSummary(
  element: DashboardElement,
  filters: DashboardFilter[]
): DashboardCanvasIndicatorSummary {
  const fields = configuredFields(element);
  const matchingFilters = appliedFilters(element, filters, fields);
  const sortingSettings = componentSortingSettings(element);
  const layoutSettings = componentLayoutSettings(element);
  const additionalSettings = componentAdditionalSettings(element);
  return {
    additionalSettings,
    additionalSettingsCount: Object.keys(additionalSettings).length,
    conditionalFormattingCount: conditionalFormattingCount(element),
    fields,
    filterCount: matchingFilters.length,
    filters: matchingFilters,
    layoutSettings,
    layoutSettingsCount: Object.keys(layoutSettings).length,
    sortingSettings,
    sortingSettingsCount: Object.keys(sortingSettings).length
  };
}

function configuredFields(element: DashboardElement): string[] {
  const config = element.config ?? {};
  const fields = [
    ...readStringArray(config.fields),
    ...readFieldArray(config.columns),
    ...readStringArray(config.ySeries),
    ...readStringArray(config.valueFields),
    ...readCalculatedFields(config.calculatedFields),
    ...readStringArray(config.rowFields),
    ...readStringArray(config.columnFields),
    readString(config.xField),
    readString(config.valueField),
    readString(config.field)
  ].filter((field): field is string => Boolean(field));
  return Array.from(new Set(fields));
}

function readCalculatedFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const record = item as { field?: unknown; id?: unknown; key?: unknown; name?: unknown };
    const field = readString(record.name) ?? readString(record.field) ?? readString(record.key) ?? readString(record.id);
    return field ? [field] : [];
  });
}

function appliedFilters(element: DashboardElement, filters: DashboardFilter[], fields: string[]): DashboardFilter[] {
  const fieldSet = new Set(fields);
  if (fieldSet.size === 0) return filters;
  return filters.filter(filter => fieldSet.has(filter.field));
}

function conditionalFormattingCount(element: DashboardElement): number {
  const rules = element.config?.conditionalFormatting ?? element.config?.conditionalFormats;
  return Array.isArray(rules) ? rules.length : 0;
}

function componentSortingSettings(element: DashboardElement): Record<string, string> {
  const config = element.config ?? {};
  const settings: Record<string, string> = {};
  const sortBy = readString(config.sortBy) ?? readString(config.xAxisSortField);
  const direction = readString(config.sortDirection) ?? readString(config.xAxisSortOrder);
  if (sortBy) settings['Sort by'] = sortBy;
  if (sortBy && direction) settings.Direction = direction;
  if (Array.isArray(config.multiSort) && config.multiSort.length > 0) settings['Multi sort'] = `${config.multiSort.length} rule(s)`;
  if (Array.isArray(config.multiRowSorting) && config.multiRowSorting.length > 0) settings['Row sorting'] = `${config.multiRowSorting.length} rule(s)`;
  if (Array.isArray(config.multiColumnSorting) && config.multiColumnSorting.length > 0) settings['Column sorting'] = `${config.multiColumnSorting.length} rule(s)`;
  return settings;
}

function componentLayoutSettings(element: DashboardElement): Record<string, string | boolean | number> {
  const config = element.config ?? {};
  const settings: Record<string, string | boolean | number> = {};
  settings['Table format'] = readString(config.tableFormat) ?? 'default';
  settings['Show borders'] = typeof config.showBorders === 'boolean' ? config.showBorders : true;
  setPresent(settings, 'Display mode', config.displayMode ?? config.rowDataDisplayMode ?? config.columnDataDisplayMode);
  setPresent(settings, 'Card layout', config.layout ?? config.layoutMode ?? config.layoutPreset);
  setPresent(settings, 'Header background', config.headerBg);
  setPresent(settings, 'Row background', config.rowBg);
  setPresent(settings, 'Grid columns', config.gridColumns);
  setPresent(settings, 'Legend position', config.legendPosition);
  setPresent(settings, 'Title position', config.titlePosition ?? config.wrapperTitlePosition);
  return settings;
}

function componentAdditionalSettings(element: DashboardElement): Record<string, string | boolean | number> {
  const config = element.config ?? {};
  const settings: Record<string, string | boolean | number> = {
    Title: readString(config.title) ?? '',
    Search: config.enableSearch !== false,
    Filters: config.enableFilters !== false,
    Sorting: config.enableSorting !== false,
    Export: config.enableExport !== false,
    'Download action': config.showDownloadAction !== false,
    'Expand action': config.showExpandAction !== false,
    'Row selection': Boolean(config.enableRowSelection),
    Pagination: Boolean(config.enablePagination),
    'Rows per page': readNumber(config.rowsPerPage) ?? 25,
    'Show total': Boolean(config.showTotal)
  };
  setPresent(settings, 'Data labels', config.showDataLabels);
  setPresent(settings, 'Legend', config.showLegend);
  setPresent(settings, 'Grid', config.showGrid);
  setPresent(settings, 'Stack bars', config.stackBars);
  setPresent(settings, 'Secondary axis', config.enableY2);
  setPresent(settings, 'Top N', config.topN);
  return settings;
}

function setPresent(target: Record<string, string | boolean | number>, label: string, value: unknown): void {
  if (typeof value === 'string' && value.trim()) target[label] = value.trim();
  else if (typeof value === 'boolean' || typeof value === 'number') target[label] = value;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  const single = readString(value);
  return single ? [single] : [];
}

function readFieldArray(value: unknown): string[] {
  if (!Array.isArray(value)) return readStringArray(value);
  return value.flatMap(item => {
    if (typeof item === 'string' && item.trim()) return [item.trim()];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const record = item as { field?: unknown; key?: unknown; name?: unknown };
    const field = record.field ?? record.key ?? record.name;
    return typeof field === 'string' && field.trim() ? [field.trim()] : [];
  });
}
