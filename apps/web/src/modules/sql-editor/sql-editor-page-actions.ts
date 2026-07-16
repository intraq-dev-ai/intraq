import { normalizePivotConfig, resolvePivotSelection } from './pivot';
import { clearSqlEditorQueryHistory, saveSqlEditorQueryHistory, saveSqlEditorTabs } from './storage';
import {
  csvFileNameForBaseName,
  downloadCsvFile,
  escapeRegExp
} from './sql-editor-page-helpers';
import type { SqlEditorPageState } from './sql-editor-page-state';
import type {
  SqlEditorParameter,
  SqlEditorPivotConfig,
  SqlEditorSuggestion,
  SqlEditorTable
} from './types';
import {
  applyRequiredDateDefaults,
  createSqlTab,
  csvFromResult,
  defaultDateTokenForParameter,
  defaultQuery,
  syncSqlParameters
} from './workflow';

export function createSqlEditorPageActions(state: SqlEditorPageState) {
  const {
    activeTabId,
    currentPage,
    currentRunSignature,
    dataSources,
    error,
    expandedTables,
    lastQuerySnapshot,
    lastSuccessfulRunSignature,
    parameterValues,
    parameters,
    pivotConfig,
    pivotDimension,
    pivotMetric,
    query,
    queryHistory,
    redoStack,
    result,
    selectedCustomSource,
    selectedCustomSourceId,
    selectedDataSourceId,
    selectedSource,
    status,
    tables,
    tabs,
    totalPages,
    undoStack
  } = state;

  function addTab(): void {
    saveCurrentTabState();
    const tab = createSqlTab(selectedDataSourceId.value, '', sourceNameFor(selectedDataSourceId.value));
    tabs.value = [...tabs.value, tab];
    switchTab(tab.id);
  }

  function closeTab(tabId: string): void {
    if (tabs.value.length === 1) return;
    saveCurrentTabState();
    const index = tabs.value.findIndex(tab => tab.id === tabId);
    tabs.value = tabs.value.filter(tab => tab.id !== tabId);
    if (activeTabId.value === tabId) switchTab(tabs.value[Math.max(index - 1, 0)]?.id ?? tabs.value[0]?.id ?? '');
    persistTabs();
  }

  function switchTab(tabId: string): void {
    const tab = tabs.value.find(item => item.id === tabId);
    if (!tab) return;
    saveCurrentTabState();
    applyTabState(tab);
    status.value = `Opened ${tab.name}`;
    persistTabs();
  }

  function saveCurrentTabState(): void {
    const tab = tabs.value.find(item => item.id === activeTabId.value);
    if (!tab) return;
    tab.dataSourceId = selectedDataSourceId.value;
    tab.dataSourceName = sourceNameFor(selectedDataSourceId.value);
    tab.query = query.value;
    tab.parameters = parameters.value;
    tab.parameterValues = { ...parameterValues.value };
    tab.customSourceId = selectedCustomSourceId.value;
    tab.pivotDimension = pivotDimension.value;
    tab.pivotMetric = pivotMetric.value;
    tab.pivotConfig = pivotConfig.value;
    tab.currentPage = currentPage.value;
    tab.result = result.value;
    tab.error = error.value;
    persistTabs();
  }

  function applyTabState(tab: typeof tabs.value[number] | undefined): void {
    if (!tab) return;
    activeTabId.value = tab.id;
    selectedDataSourceId.value = tab.dataSourceId;
    if (!tab.dataSourceName && tab.dataSourceId) tab.dataSourceName = sourceNameFor(tab.dataSourceId);
    selectedCustomSourceId.value = tab.customSourceId ?? '';
    query.value = tab.query;
    parameters.value = tab.parameters;
    parameterValues.value = { ...tab.parameterValues };
    pivotDimension.value = tab.pivotDimension;
    pivotMetric.value = tab.pivotMetric;
    pivotConfig.value = tab.pivotConfig;
    currentPage.value = tab.currentPage;
    result.value = tab.result;
    error.value = tab.error;
    lastQuerySnapshot.value = query.value;
    lastSuccessfulRunSignature.value = result.value ? currentRunSignature.value : '';
  }

  function persistTabs(): void {
    saveSqlEditorTabs(tabs.value, activeTabId.value);
  }

  function updateQueryValue(nextQuery: string): void {
    query.value = nextQuery;
  }

  function onQueryInput(): void {
    if (lastQuerySnapshot.value && lastQuerySnapshot.value !== query.value) undoStack.value.push(lastQuerySnapshot.value);
    redoStack.value = [];
    lastQuerySnapshot.value = query.value;
    syncParameters();
    saveCurrentTabState();
  }

  function setQuery(nextQuery: string, trackUndo: boolean): void {
    if (trackUndo && query.value) undoStack.value.push(query.value);
    query.value = nextQuery;
    lastQuerySnapshot.value = nextQuery;
    syncParameters();
    saveCurrentTabState();
  }

  function updateParameterValue(name: string, value: string): void {
    parameterValues.value = { ...parameterValues.value, [name]: value };
    saveCurrentTabState();
  }

  function updateParameterMetadata(name: string, patch: Partial<SqlEditorParameter>): void {
    parameters.value = parameters.value.map(param => {
      if (param.name !== name) return param;
      const next = { ...param, ...patch };
      // Legacy parity: turning on "always require a value" for a blank date parameter seeds a relative-date default.
      const isDate = next.dataType === 'date' || next.dataType === 'datetime';
      if (patch.required === true && isDate && !next.defaultValue.trim()) {
        next.defaultValue = defaultDateTokenForParameter(next);
      }
      return next;
    });
    const updated = parameters.value.find(param => param.name === name);
    if (updated && (typeof patch.defaultValue === 'string' || patch.required === true)) {
      parameterValues.value = { ...parameterValues.value, [name]: updated.defaultValue };
    }
    saveCurrentTabState();
  }

  function removeParameter(name: string): void {
    // Strip the token plus any surrounding optional `[[ ... ]]` wrapper.
    const token = `(?:\\{\\{\\s*${escapeRegExp(name)}\\s*\\}\\}|:${escapeRegExp(name)}\\b)`;
    const optionalPattern = new RegExp(`\\s*\\[\\[[^\\[\\]]*${token}[^\\[\\]]*\\]\\]`, 'g');
    const tokenPattern = new RegExp(`\\s*${token}`, 'g');
    query.value = query.value.replace(optionalPattern, '').replace(tokenPattern, '').replace(/\s+/g, ' ').trim();
    parameters.value = parameters.value.filter(param => param.name !== name);
    const nextValues = { ...parameterValues.value };
    delete nextValues[name];
    parameterValues.value = nextValues;
    saveCurrentTabState();
  }

  function renameParameter(name: string, nextName: string): void {
    const normalized = nextName.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(normalized) || normalized === name) return;
    const tokenPattern = new RegExp(`(\\{\\{\\s*)${escapeRegExp(name)}(\\s*\\}\\})|:${escapeRegExp(name)}\\b`, 'g');
    query.value = query.value.replace(tokenPattern, (match, open, _old, close) => open ? `${open}${normalized}${close}` : `:${normalized}`);
    parameterValues.value = Object.fromEntries(Object.entries(parameterValues.value).map(([key, value]) => [
      key === name ? normalized : key,
      value
    ]));
    parameters.value = parameters.value.map(param => param.name === name
      ? { ...param, id: `parameter-${normalized}`, name: normalized }
      : param);
    syncParameters();
    saveCurrentTabState();
  }

  function syncParameters(): void {
    const synced = syncSqlParameters(query.value, parameters.value, parameterValues.value);
    parameters.value = applyRequiredDateDefaults(synced.parameters);
    parameterValues.value = Object.fromEntries(parameters.value.map(param => {
      const existing = synced.parameterValues[param.name] ?? '';
      return [param.name, existing.trim() ? existing : param.defaultValue];
    }));
  }

  function undoQuery(): void {
    const previous = undoStack.value.pop();
    if (!previous) return;
    redoStack.value.push(query.value);
    setQuery(previous, false);
  }

  function redoQuery(): void {
    const next = redoStack.value.pop();
    if (!next) return;
    undoStack.value.push(query.value);
    setQuery(next, false);
  }

  function prepareCsv(): void {
    if (!result.value) return;
    const baseName = selectedCustomSource.value?.name ?? selectedSource.value?.name ?? 'sql-results';
    downloadCsvFile(csvFromResult(result.value), csvFileNameForBaseName(baseName));
    status.value = 'CSV downloaded';
  }

  function previousPage(): void {
    if (currentPage.value <= 1) return;
    currentPage.value -= 1;
    saveCurrentTabState();
  }

  function nextPage(): void {
    if (currentPage.value >= totalPages.value) return;
    currentPage.value += 1;
    saveCurrentTabState();
  }

  function syncPivotSelection(): void {
    const selection = resolvePivotSelection(result.value, {
      dimension: pivotDimension.value,
      metric: pivotMetric.value
    });
    pivotDimension.value = selection.dimension;
    pivotMetric.value = selection.metric;
    pivotConfig.value = normalizePivotConfig(result.value, pivotConfig.value, selection, pivotConfig.value?.viewMode ?? 'results');
  }

  function updatePivotConfig(nextConfig: SqlEditorPivotConfig): void {
    pivotConfig.value = normalizePivotConfig(result.value, nextConfig, {
      dimension: pivotDimension.value,
      metric: pivotMetric.value
    }, nextConfig.viewMode);
    pivotDimension.value = pivotConfig.value.rows[0] ?? pivotDimension.value;
    pivotMetric.value = pivotConfig.value.values[0]?.field ?? pivotMetric.value;
    saveCurrentTabState();
  }

  function toggleTable(tableName: string): void {
    expandedTables.value = expandedTables.value.includes(tableName)
      ? expandedTables.value.filter(item => item !== tableName)
      : [...expandedTables.value, tableName];
  }

  function useTable(table: SqlEditorTable): void { setQuery(defaultQuery(table), true); }

  function insertTable(table: SqlEditorTable): void {
    const nextQuery = /\bfrom\s+[a-z][a-z0-9_]*/i.test(query.value)
      ? query.value.replace(/\bfrom\s+[a-z][a-z0-9_]*/i, `from ${table.name}`)
      : `${query.value.trim()} ${table.name}`.trim();
    setQuery(nextQuery, true);
  }

  function applySuggestion(suggestion: SqlEditorSuggestion): void { setQuery(suggestion.query, true); }

  function insertColumn(tableName: string, columnName: string): void {
    const columnRef = `${tableName}.${columnName}`;
    setQuery(`${query.value.trim()} ${columnRef}`.trim(), true);
  }

  function expandTables(tableNames: string[]): void {
    expandedTables.value = Array.from(new Set([...expandedTables.value, ...tableNames]));
  }

  function expandAllTables(): void {
    expandedTables.value = tables.value.map(table => table.name);
  }

  function collapseAllTables(): void {
    expandedTables.value = [];
  }

  function clearHistory(): void {
    queryHistory.value = [];
    clearSqlEditorQueryHistory();
  }

  function pushHistory(nextQuery: string): void {
    const item = {
      dataSourceId: selectedDataSourceId.value,
      dataSourceName: selectedSource.value?.name ?? 'No Data Source',
      query: nextQuery,
      timestamp: Date.now()
    };
    queryHistory.value = [item, ...queryHistory.value.filter(history =>
      history.query !== nextQuery || history.dataSourceId !== selectedDataSourceId.value
    )].slice(0, 50);
    saveSqlEditorQueryHistory(queryHistory.value);
  }

  function sourceNameFor(dataSourceId: string): string {
    return dataSources.value.find(source => source.id === dataSourceId)?.name ?? '';
  }

  return {
    addTab,
    applySuggestion,
    applyTabState,
    clearHistory,
    closeTab,
    collapseAllTables,
    expandAllTables,
    expandTables,
    insertColumn,
    insertTable,
    nextPage,
    onQueryInput,
    persistTabs,
    prepareCsv,
    previousPage,
    pushHistory,
    redoQuery,
    removeParameter,
    renameParameter,
    saveCurrentTabState,
    setQuery,
    sourceNameFor,
    switchTab,
    syncParameters,
    syncPivotSelection,
    toggleTable,
    undoQuery,
    updateParameterMetadata,
    updateParameterValue,
    updatePivotConfig,
    updateQueryValue,
    useTable
  };
}

export type SqlEditorPageActions = ReturnType<typeof createSqlEditorPageActions>;
