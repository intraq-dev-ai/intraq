import type { SqlEditorPivotConfig, SqlEditorQueryHistoryItem, SqlEditorTab } from './types';
import { setNextSqlTabNumber } from './workflow';

const STORAGE_KEY = 'sql-editor-tabs';
const SPLIT_STORAGE_KEY = 'sql-editor-split-state';
const QUERY_HISTORY_STORAGE_KEY = 'sql-query-history';

export interface SqlEditorStoredState {
  activeTabId: string;
  tabs: SqlEditorTab[];
}

export interface SqlEditorSplitState {
  queryPanelHeight: number;
}

export function loadSqlEditorTabs(): SqlEditorStoredState | null {
  const parsed = readJsonRecord(STORAGE_KEY);
  const storedTabs = Array.isArray(parsed?.tabs) ? parsed.tabs.flatMap(normalizeStoredTab) : [];
  if (storedTabs.length === 0) return null;

  const activeTabId = typeof parsed?.activeTabId === 'string' && storedTabs.some(tab => tab.id === parsed.activeTabId)
    ? parsed.activeTabId
    : storedTabs[0]?.id ?? '';
  const nextTabNumber = readNumber(parsed?.nextTabId) ?? nextNumberFromTabs(storedTabs);
  setNextSqlTabNumber(nextTabNumber);
  return { activeTabId, tabs: storedTabs };
}

export function saveSqlEditorTabs(tabs: SqlEditorTab[], activeTabId: string): void {
  const nextTabId = nextNumberFromTabs(tabs);
  writeJson(STORAGE_KEY, {
    activeTabId,
    nextTabId,
    tabs: tabs.map(tab => ({
      id: tab.id,
      name: tab.name,
      dataSourceId: tab.dataSourceId,
      dataSourceName: tab.dataSourceName,
      query: tab.query,
      parameters: tab.parameters,
      parameterValues: tab.parameterValues,
      customSourceId: tab.customSourceId ?? '',
      pivotDimension: tab.pivotDimension,
      pivotMetric: tab.pivotMetric,
      pivotConfig: tab.pivotConfig,
      currentPage: tab.currentPage,
      result: null,
      error: ''
    }))
  });
}

export function loadSqlEditorSplitState(): SqlEditorSplitState | null {
  const parsed = readJsonRecord(SPLIT_STORAGE_KEY);
  const queryPanelHeight = readNumber(parsed?.queryPanelHeight);
  return queryPanelHeight ? { queryPanelHeight } : null;
}

export function saveSqlEditorSplitState(state: SqlEditorSplitState): void {
  writeJson(SPLIT_STORAGE_KEY, state);
}

export function loadSqlEditorQueryHistory(): SqlEditorQueryHistoryItem[] {
  const parsed = readJsonValue(QUERY_HISTORY_STORAGE_KEY);
  return Array.isArray(parsed) ? parsed.flatMap(normalizeQueryHistoryItem).slice(0, 50) : [];
}

export function saveSqlEditorQueryHistory(history: SqlEditorQueryHistoryItem[]): void {
  writeJson(QUERY_HISTORY_STORAGE_KEY, history.slice(0, 50).map(item => ({
    dataSourceId: item.dataSourceId ?? '',
    dataSourceName: item.dataSourceName,
    query: item.query,
    timestamp: item.timestamp
  })));
}

export function clearSqlEditorQueryHistory(): void {
  try {
    window.localStorage.removeItem(QUERY_HISTORY_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in private or consmetadata browser contexts.
  }
}

function normalizeStoredTab(value: unknown): SqlEditorTab[] {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return [];
  return [{
    id: value.id,
    name: value.name,
    dataSourceId: typeof value.dataSourceId === 'string' ? value.dataSourceId : '',
    dataSourceName: typeof value.dataSourceName === 'string' ? value.dataSourceName : '',
    query: typeof value.query === 'string' ? value.query : '',
    parameters: Array.isArray(value.parameters) ? value.parameters as SqlEditorTab['parameters'] : [],
    parameterValues: isRecord(value.parameterValues) ? stringRecord(value.parameterValues) : {},
    customSourceId: typeof value.customSourceId === 'string'
      ? value.customSourceId
      : typeof value.selectedCustomSourceId === 'string' ? value.selectedCustomSourceId : '',
    pivotDimension: typeof value.pivotDimension === 'string' ? value.pivotDimension : '',
    pivotMetric: typeof value.pivotMetric === 'string' ? value.pivotMetric : '',
    pivotConfig: normalizePivotConfig(value.pivotConfig),
    currentPage: Math.max(1, readNumber(value.currentPage) ?? 1),
    result: null,
    error: ''
  }];
}

function normalizePivotConfig(value: unknown): SqlEditorPivotConfig | null {
  if (!isRecord(value)) return null;
  return {
    viewMode: value.viewMode === 'pivot' ? 'pivot' : 'results',
    rows: stringList(value.rows),
    columns: stringList(value.columns),
    filters: stringList(value.filters),
    filterValues: isRecord(value.filterValues) ? stringRecord(value.filterValues) : {},
    values: Array.isArray(value.values)
      ? value.values.flatMap(normalizePivotValue)
      : [],
    sort: normalizePivotSort(value.sort)
  };
}

function normalizePivotValue(value: unknown): SqlEditorPivotConfig['values'] {
  if (!isRecord(value) || typeof value.field !== 'string') return [];
  return [{
    field: value.field,
    aggregation: value.aggregation === 'avg' ||
      value.aggregation === 'count' ||
      value.aggregation === 'count_distinct' ||
      value.aggregation === 'max' ||
      value.aggregation === 'min' ||
      value.aggregation === 'sum'
      ? value.aggregation
      : 'sum',
    alias: typeof value.alias === 'string' ? value.alias : ''
  }];
}

function normalizePivotSort(value: unknown): SqlEditorPivotConfig['sort'] {
  if (!isRecord(value) || typeof value.field !== 'string' || (value.direction !== 'asc' && value.direction !== 'desc')) {
    return null;
  }
  return { field: value.field, direction: value.direction };
}

function normalizeQueryHistoryItem(value: unknown): SqlEditorQueryHistoryItem[] {
  if (!isRecord(value) || typeof value.query !== 'string' || !value.query.trim()) return [];
  const timestamp = readNumber(value.timestamp);
  return [{
    dataSourceId: typeof value.dataSourceId === 'string' ? value.dataSourceId : '',
    dataSourceName: typeof value.dataSourceName === 'string' && value.dataSourceName.trim()
      ? value.dataSourceName
      : 'No Data Source',
    query: value.query.trim(),
    timestamp: timestamp && timestamp > 0 ? timestamp : Date.now()
  }];
}

function nextNumberFromTabs(tabs: Array<{ name: string }>): number {
  const numbers = tabs
    .map(tab => /^Query\s+(\d+)$/i.exec(tab.name)?.[1])
    .flatMap(value => value ? [Number(value)] : []);
  return (numbers.length ? Math.max(...numbers) : tabs.length) + 1;
}

function readJsonRecord(key: string): Record<string, unknown> | null {
  const parsed = readJsonValue(key);
  return isRecord(parsed) ? parsed : null;
}

function readJsonValue(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable in private or consmetadata browser contexts.
  }
}

function stringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? '')]));
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
