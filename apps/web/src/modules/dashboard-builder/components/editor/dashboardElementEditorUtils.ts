import { readString } from './dashboardElementEditorConfig';

export function chartUsesSingleValue(chartType: string): boolean {
  return chartType === 'pie' || chartType === 'doughnut' || chartType === 'donut';
}

export function splitSeriesFallback(value: string | undefined, ySeries: string[]): string {
  return value && !ySeries.includes(value) ? value : '';
}

export function aggregationForField(config: Record<string, unknown>, field: string): string | undefined {
  if (!field) return undefined;
  const aggregationConfig = {
    ...readStringRecord(config.ySeriesType ?? config.ySeriesTypes),
    ...readStringRecord(config.ySeriesSummarize),
    ...readStringRecord(config.aggregations)
  };
  return readString(aggregationConfig[field]);
}

export function readStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string' && entry[1].trim().length > 0
  ));
}

export function aggregationRecordFallback(value: unknown): unknown {
  return isAggregationOnlyRecord(value) ? value : undefined;
}

export function seriesTypeRecord(config: Record<string, unknown>): unknown {
  const preferred = config.ySeriesType ?? config.ySeriesTypes ?? config.seriesTypes;
  return isAggregationOnlyRecord(preferred) ? undefined : preferred;
}

export function setOptionalConfig(config: Record<string, unknown>, key: string, value: unknown | undefined): void {
  if (value === undefined) delete config[key];
  else config[key] = value;
}

export function setThemeOptionalColorConfig(config: Record<string, unknown>, key: string, value: string, defaultValue: string): void {
  if (!value.trim() || value.trim().toLowerCase() === defaultValue.toLowerCase()) delete config[key];
  else config[key] = value.trim();
}

export function hasThemeOverride(value: string, defaultValue: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized !== defaultValue.toLowerCase();
}

export function usesNamedThemePreset(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'custom';
}

export function clearConfigKeys(config: Record<string, unknown>, keys: string[]): void {
  keys.forEach(key => delete config[key]);
}

export function setRecordConfig(config: Record<string, unknown>, key: string, value: Record<string, string>): void {
  if (Object.keys(value).length > 0) config[key] = value;
  else delete config[key];
}

export function setNullableNumberConfig(config: Record<string, unknown>, key: string, value: number | null): void {
  if (typeof value === 'number' && Number.isFinite(value)) config[key] = value;
  else delete config[key];
}

export function multiSortFallback(config: Record<string, unknown>): unknown {
  return config.multiRowSorting || config.multiColumnSorting
    ? { columns: config.multiColumnSorting ?? [], rows: config.multiRowSorting ?? [] }
    : undefined;
}

export function setRawStringConfig(config: Record<string, unknown>, key: string, value: string): void {
  if (value) config[key] = value;
  else delete config[key];
}

export function cardLayoutDesignForEditor(config: Record<string, unknown>): string {
  const layoutDesign = [readString(config.designLayout), readString(config.layoutDesign)]
    .find(value => value && value !== 'two-row');
  return layoutDesign ?? 'standard';
}

export function cardTypeForSave(value: string): string {
  return value.trim() || 'standard';
}

export function cardLayoutForSave(type: string, value: string): string {
  const layout = value.trim() || 'single';
  if (type === 'two-row') return 'two-row';
  return layout === 'two-row' ? 'single' : layout;
}

export function cardLayoutDesignForSave(value: string): string {
  const layoutDesign = value.trim() || 'standard';
  return layoutDesign === 'two-row' ? 'standard' : layoutDesign;
}

export function readCardComparisonDisplayMode(value: unknown): 'amount' | 'both' | 'percentage' | 'value' {
  const displayMode = readString(value)?.toLowerCase();
  if (displayMode === 'percentage' || displayMode === 'percent' || displayMode === '%') return 'percentage';
  if (displayMode === 'amount' || displayMode === 'absolute' || displayMode === 'difference' || displayMode === 'delta') return 'amount';
  if (displayMode === 'value' || displayMode === 'comparison' || displayMode === 'comparison-value') return 'value';
  return 'both';
}

export function readCardComparisonDirection(value: unknown): 'higher-is-better' | 'lower-is-better' | 'none' {
  const direction = readString(value)?.toLowerCase();
  if (direction === 'lower-is-better' || direction === 'lower' || direction === 'descending') return 'lower-is-better';
  if (direction === 'none' || direction === 'neutral' || direction === 'off') return 'none';
  return 'higher-is-better';
}

export function formatRowContent(value: unknown, fallback: string): string {
  return Array.isArray(value) ? value.map(String).join(', ') : readString(value) ?? fallback;
}

export function formatRowRatio(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : readString(value) ?? '1:1';
}

export function setRowConfig(config: Record<string, unknown>, key: string, value: string, fallback: string): void {
  const tokens = value.split(',').map(token => token.trim()).filter(Boolean);
  config[key] = tokens.length ? tokens : [fallback];
}

export function normalizeFilterInputTypeForEditor(value: string | undefined): string {
  const normalized = (value ?? '')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replaceAll('_', '-')
    .toLowerCase();
  if (!normalized) return 'single-select';
  if (normalized === 'period' || normalized === 'periodfilter' || normalized === 'period-filter') return 'period-filter';
  if (normalized === 'daterange' || normalized === 'date-range') return 'date-range';
  if (normalized === 'datepicker' || normalized === 'date-picker') return 'date';
  if (normalized === 'freetext' || normalized === 'free-text' || normalized === 'search') return 'text';
  if (normalized === 'multiselect' || normalized === 'multi-select') return 'multi-select';
  if (normalized === 'singleselect' || normalized === 'single-select') return 'single-select';
  return normalized;
}

export function readPeriodNavigationStyle(value: unknown): 'text' | 'icons' {
  const raw = readString(value)?.toLowerCase() ?? '';
  return raw === 'icon' || raw === 'icons' || raw === 'compact' ? 'icons' : 'text';
}

export function readPeriodDatePickerTheme(value: unknown): 'default' | 'legacy' | 'minimal' {
  const raw = readString(value)?.toLowerCase() ?? '';
  if (raw === 'legacy' || raw === 'classic' || raw === 'report') return 'legacy';
  if (raw === 'minimal' || raw === 'plain' || raw === 'underline') return 'minimal';
  return 'default';
}

export function readDatePickerDisplayMode(value: unknown): 'split-date-time' | 'native' {
  const raw = readString(value)?.toLowerCase() ?? '';
  if (raw === 'split-date-time' || raw === 'separate-date-time' || raw === 'datetime-fields' || raw === 'date-time-fields' || raw === 'kendo') return 'split-date-time';
  return 'native';
}

export function readDateRangeDisplayMode(value: unknown): 'button' | 'datetime-fields' | 'inline' | 'range-picker' {
  const raw = readString(value)?.toLowerCase() ?? '';
  if (raw === 'inline' || raw === 'split-inline') return 'inline';
  if (raw === 'datetime-fields' || raw === 'date-time-fields' || raw === 'split-date-time' || raw === 'datetime') return 'datetime-fields';
  if (raw === 'range-picker' || raw === 'range' || raw === 'split') return 'range-picker';
  return 'button';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readAxisStartMode(value: unknown): 'auto' | 'zero' | undefined {
  return value === 'auto' || value === 'zero' ? value : undefined;
}

export function readTableDataMode(config: Record<string, unknown>): 'raw' | 'series' {
  const raw = readString(config.tableDataMode ?? config.dataMode)?.toLowerCase() ?? '';
  if (raw === 'series' || raw === 'chart' || raw === 'bucketed' || raw === 'period') return 'series';
  if (config.useSeriesRows === true || config.tableUseSeriesRows === true || config.useChartSeriesRows === true || config.useBucketedRows === true) return 'series';
  return 'raw';
}

export function readTableHeightMode(value: unknown): 'auto-content' | 'fixed' {
  const normalized = readString(value)
    ?.trim()
    .replaceAll('_', '-')
    .toLowerCase() ?? '';
  return normalized === 'auto'
    || normalized === 'content'
    || normalized === 'auto-content'
    || normalized === 'auto-fit-content'
    || normalized === 'fit-content'
    || normalized === 'content-aware'
    || normalized === 'auto-height'
    ? 'auto-content'
    : 'fixed';
}

export function readAxisPaddingMode(value: unknown): 'auto' | 'none' | 'zero-centered' {
  const normalized = readString(value)?.toLowerCase() ?? '';
  if (normalized === 'auto') return 'auto';
  if (normalized === 'zero-centered' || normalized === 'zero-centred' || normalized === 'highcharts' || normalized === 'legacy') return 'zero-centered';
  return 'none';
}

export function readLineInterpolation(value: unknown): 'curved' | 'straight' {
  if (value === false) return 'straight';
  const normalized = readString(value)?.toLowerCase() ?? '';
  return normalized === 'straight' || normalized === 'linear' || normalized === 'none' ? 'straight' : 'curved';
}

export function readTimeBucketInterval(value: unknown): 'auto' | 'day' | 'hour' | 'month' | 'week' {
  const normalized = readString(value)?.toLowerCase() ?? '';
  if (normalized === 'hour' || normalized === 'hourly') return 'hour';
  if (normalized === 'day' || normalized === 'daily') return 'day';
  if (normalized === 'week' || normalized === 'weekly') return 'week';
  if (normalized === 'month' || normalized === 'monthly') return 'month';
  return 'auto';
}

export function readHeaderWidthMode(value: unknown, widthValue: unknown): 'auto' | 'fixed' | 'full' {
  if (value === 'auto' || value === 'fixed' || value === 'full') return value;
  return readWidthNumberString(widthValue) ? 'fixed' : 'auto';
}

export function readHeaderWidthValue(config: Record<string, unknown>): unknown {
  return isRecord(config.headerWidths) ? config.headerWidths.column : undefined;
}

export function readWidthNumberString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(Math.floor(value));
  if (typeof value !== 'string') return '';
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
  return match ? match[1] ?? '' : '';
}

export function normalizeWidthPixels(value: string): string {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? `${Math.round(parsed)}px` : '';
}

function isAggregationOnlyRecord(value: unknown): boolean {
  const values = Object.values(readStringRecord(value));
  return values.length > 0 && values.every(item =>
    item === 'sum'
    || item === 'avg'
    || item === 'average'
    || item === 'min'
    || item === 'max'
    || item === 'count'
    || item === 'countDistinct'
    || item === 'count_distinct'
  );
}
