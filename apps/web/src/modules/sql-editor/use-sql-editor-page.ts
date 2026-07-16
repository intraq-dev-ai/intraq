import { computed, nextTick, onMounted, watch } from 'vue';
import {
  executeSqlEditorQuery,
  fetchSqlEditorSchema,
  fetchSqlEditorSources,
  fetchSqlEditorSuggestions,
  fetchSqlEditorMetadataSources,
  importSqlModelMetadata,
  runSqlAssistantTool,
  saveSqlModelTable
} from './api';
import { buildMetadataInitialValues } from './metadata-flow';
import { createSqlEditorPageActions } from './sql-editor-page-actions';
import { sqlDataModelFromSavedTable } from './sql-editor-page-helpers';
import {
  createSqlEditorPageState,
  type SqlEditorMetadataImportAnswers,
  type SqlEditorSaveDataModelForm
} from './sql-editor-page-state';
import { loadSqlEditorQueryHistory, loadSqlEditorTabs } from './storage';
import type { SqlEditorParameter, SqlEditorSavedDataModel } from './types';
import { useSqlAssistant } from './use-sql-assistant';
import {
  assistantQuickActionPrompt,
  buildSavePayload,
  createSqlTab,
  defaultQuery,
  normalizeParametersForSave,
  replaceParameters,
  validateRequiredDateRoleMapping
} from './workflow';
import type { SqlAssistantQuickAction } from './workflow';
import { preferredSourceId, sortSourcesByPreference } from '../shared/source-preference';

export function useSqlEditorPage() {
  const page = createSqlEditorPageState();
  const actions = createSqlEditorPageActions(page);
  const assistant = useSqlAssistant({
    currentQuery: page.query,
    dataSourceId: page.selectedDataSourceId,
    dataSourceName: computed(() => page.selectedSource.value?.name ?? ''),
    parameterValues: page.parameterValues,
    setQuery: actions.setQuery,
    setStatus: (nextStatus: string) => {
      page.assistantStatusRevision.value += 1;
      page.status.value = nextStatus;
    }
  });

  onMounted(() => {
    void loadInitialState();
  });

  watch(page.totalPages, pageCount => {
    if (!page.result.value || pageCount === 0) {
      page.currentPage.value = 1;
      return;
    }
    if (page.currentPage.value > pageCount) page.currentPage.value = pageCount;
  });

  async function loadInitialState(): Promise<void> {
    page.isLoading.value = true;
    try {
      const [sources, sourceMetadata] = await Promise.all([
        fetchSqlEditorSources(),
        fetchSqlEditorMetadataSources().catch(() => [])
      ]);
      page.dataSources.value = sortSourcesByPreference(sources);
      page.metadataSources.value = sourceMetadata;
      page.queryHistory.value = loadSqlEditorQueryHistory();
      const restored = loadSqlEditorTabs();
      if (restored) {
        page.tabs.value = restored.tabs;
        page.activeTabId.value = restored.activeTabId;
        actions.applyTabState(page.tabs.value.find(tab => tab.id === restored.activeTabId) ?? page.tabs.value[0]);
        if (page.selectedDataSourceId.value) await loadSchema(page.selectedDataSourceId.value, false);
        page.status.value = 'Restored SQL editor tabs';
        return;
      }
      page.selectedDataSourceId.value = preferredSourceId(page.dataSources.value);
      if (page.selectedDataSourceId.value) await loadSchema(page.selectedDataSourceId.value, true);
      page.status.value = 'Ready';
    } catch (caught) {
      setError(caught, 'SQL editor could not be loaded.');
    } finally {
      page.isLoading.value = false;
    }
  }

  async function loadSchema(dataSourceId: string, resetQuery: boolean, options: {
    activeTabIdBeforeLoad?: string;
    preserveUserQuery?: boolean;
    queryBeforeLoad?: string;
  } = {}): Promise<void> {
    page.schema.value = await fetchSqlEditorSchema(dataSourceId);
    page.expandedTables.value = page.schema.value.tables[0]?.name ? [page.schema.value.tables[0].name] : [];
    if (resetQuery) {
      const queryChangedDuringLoad = options.preserveUserQuery === true &&
        (page.query.value !== options.queryBeforeLoad || page.activeTabId.value !== options.activeTabIdBeforeLoad);
      if (queryChangedDuringLoad) {
        actions.syncParameters();
      } else {
        actions.setQuery(defaultQuery(page.schema.value.tables[0]), false);
      }
    }
    try {
      page.suggestions.value = await fetchSqlEditorSuggestions(dataSourceId);
    } catch {
      page.suggestions.value = [];
    }
    if (page.tabs.value.length === 0) {
      const firstTab = createSqlTab(dataSourceId, page.query.value, actions.sourceNameFor(dataSourceId));
      page.tabs.value = [firstTab];
      page.activeTabId.value = firstTab.id;
    }
    actions.saveCurrentTabState();
  }

  async function onDataSourceChange(): Promise<void> {
    page.error.value = '';
    page.result.value = null;
    page.lastSuccessfulRunSignature.value = '';
    page.currentPage.value = 1;
    page.pivotConfig.value = null;
    page.selectedCustomSourceId.value = '';
    if (!page.selectedDataSourceId.value) return;
    const queryBeforeLoad = page.query.value;
    const activeTabIdBeforeLoad = page.activeTabId.value;
    const assistantStatusRevisionBeforeLoad = page.assistantStatusRevision.value;
    try {
      const requestedDataSourceId = page.selectedDataSourceId.value;
      await loadSchema(requestedDataSourceId, true, {
        activeTabIdBeforeLoad,
        preserveUserQuery: true,
        queryBeforeLoad
      });
      if (page.selectedDataSourceId.value !== requestedDataSourceId) return;
      if (page.assistantStatusRevision.value === assistantStatusRevisionBeforeLoad) {
        page.status.value = `Loaded ${page.selectedSource.value?.name ?? 'data source'}`;
      }
    } catch (caught) {
      setError(caught, 'Schema could not be loaded.');
    }
  }

  async function selectDataSource(dataSourceId: string): Promise<void> {
    page.selectedDataSourceId.value = dataSourceId;
    await onDataSourceChange();
  }

  async function runQuery(): Promise<void> {
    if (!page.canRun.value) {
      page.error.value = 'Choose a data source and enter a SELECT query.';
      return;
    }
    page.isRunning.value = true;
    page.error.value = '';
    page.result.value = null;
    page.currentPage.value = 1;
    try {
      const executableQuery = replaceParameters(page.query.value, page.parameterValues.value);
      page.result.value = await executeSqlEditorQuery(page.selectedDataSourceId.value, executableQuery, page.parameterValues.value);
      actions.syncPivotSelection();
      page.lastSuccessfulRunSignature.value = page.currentRunSignature.value;
      actions.pushHistory(page.query.value);
      page.status.value = `Returned ${page.result.value.rowCount} row${page.result.value.rowCount === 1 ? '' : 's'}`;
      page.assistantStatusRevision.value += 1;
      actions.saveCurrentTabState();
    } catch (caught) {
      setError(caught, 'Query execution failed.');
    } finally {
      page.isRunning.value = false;
    }
  }

  async function executeAssistantTool(): Promise<void> {
    if (!page.aiAssistantEnabled.value) {
      page.status.value = 'SQL assistant is not available in this deployment';
      return;
    }
    try {
      page.result.value = await runSqlAssistantTool(
        page.selectedDataSourceId.value,
        replaceParameters(page.query.value, page.parameterValues.value),
        page.parameterValues.value
      );
      actions.syncPivotSelection();
      page.lastSuccessfulRunSignature.value = page.currentRunSignature.value;
      page.currentPage.value = 1;
      page.status.value = `Assistant tool returned ${page.result.value.rowCount} rows`;
      actions.saveCurrentTabState();
    } catch (caught) {
      setError(caught, 'SQL assistant tool failed.');
    }
  }

  function saveModel(): void {
    page.saveMode.value = 'create';
    page.showSaveModal.value = true;
  }

  function updateModel(): void {
    if (!page.selectedCustomSourceId.value) {
      page.error.value = 'Load a saved SQL data model before updating.';
      return;
    }
    if (!page.canUpdateModel.value) {
      page.error.value = 'Run the current SQL data model query successfully before updating.';
      page.status.value = 'Query must be executed';
      return;
    }
    page.saveMode.value = 'update';
    page.showSaveModal.value = true;
  }

  async function handleSaveDataModel(form: SqlEditorSaveDataModelForm): Promise<void> {
    const normalizedParameters = normalizeParametersForSave(page.parameters.value);
    const dateRoleError = validateRequiredDateRoleMapping(normalizedParameters);
    if (dateRoleError) {
      page.error.value = dateRoleError;
      page.status.value = 'Query error';
      return;
    }
    page.isSavingModel.value = true;
    try {
      const payload = buildSavePayload(
        form.name,
        form.description,
        page.selectedDataSourceId.value,
        page.query.value,
        normalizedParameters,
        form.isTemplate,
        page.result.value
      );
      const saved = await saveSqlModelTable(page.selectedDataSourceId.value, {
        ...payload,
        ...(page.saveMode.value === 'update' && page.selectedCustomSourceId.value ? { id: page.selectedCustomSourceId.value } : {})
      });
      await loadSchema(page.selectedDataSourceId.value, false);
      page.selectedCustomSourceId.value = saved.table.id;
      if (page.result.value) page.lastSuccessfulRunSignature.value = page.currentRunSignature.value;
      page.parameters.value = normalizedParameters;
      page.saveName.value = saved.table.name;
      page.saveDescription.value = form.description;
      page.saveAsTemplate.value = form.isTemplate;
      page.showSaveModal.value = false;
      page.status.value = page.saveMode.value === 'update' ? 'SQL data model updated' : 'SQL data model saved';
      actions.saveCurrentTabState();
      if (form.generateMetadataAfterSave) await openMetadataImportModal(sqlDataModelFromSavedTable(saved.table, page.selectedDataSourceId.value));
    } catch (caught) {
      setError(caught, 'SQL data model could not be saved.');
    } finally {
      page.isSavingModel.value = false;
    }
  }

  async function openMetadataImportModal(model: SqlEditorSavedDataModel): Promise<void> {
    const fields = model.fields?.length ? model.fields : page.dataModelFields.value;
    page.metadataImportTarget.value = { id: model.id, name: model.name, fields };
    page.metadataImportInitialValues.value = await buildMetadataInitialValues(model.id, fields, model.description ?? page.saveDescription.value);
    page.showMetadataImportModal.value = true;
  }

  async function runAssistantQuickAction(action: SqlAssistantQuickAction): Promise<void> {
    if (!page.aiAssistantEnabled.value) {
      page.status.value = 'SQL assistant is not available in this deployment';
      return;
    }
    const currentQuery = page.query.value.trim();
    if (!currentQuery) {
      page.error.value = 'Enter a SQL query before using quick actions.';
      page.status.value = 'SQL assistant needs a query';
      return;
    }
    assistant.prompt.value = assistantQuickActionPrompt(action, currentQuery);
    await nextTick();
    await assistant.run();
  }

  async function askAssistantExample(question: string): Promise<void> {
    if (!page.aiAssistantEnabled.value) return;
    assistant.prompt.value = question;
    await nextTick();
    await assistant.run();
  }

  async function fixQueryWithAi(queryError: string): Promise<void> {
    if (!page.aiAssistantEnabled.value) return;
    const currentQuery = page.query.value.trim();
    if (!currentQuery || !queryError) return;
    assistant.prompt.value = `Fix this SQL error:\n\nError: ${queryError}\n\nSQL:\n${currentQuery}`;
    await nextTick();
    await assistant.run();
  }

  async function runAssistantFromUi(): Promise<void> {
    if (!page.aiAssistantEnabled.value) return;
    await assistant.run();
  }

  async function runPostQueryAssistant(promptText: string): Promise<void> {
    if (!page.aiAssistantEnabled.value) return;
    assistant.prompt.value = promptText;
    await runAssistantFromUi();
  }

  async function handleImportMetadata(answers: SqlEditorMetadataImportAnswers): Promise<void> {
    if (!page.metadataImportTarget.value) return;
    page.isImportingMetadata.value = true;
    try {
      await importSqlModelMetadata(
        page.selectedDataSourceId.value,
        page.metadataImportTarget.value.id,
        answers.dataModelDefinition,
        answers.columns
      );
      if (page.selectedDataSourceId.value) await loadSchema(page.selectedDataSourceId.value, false);
      page.metadataSources.value = await fetchSqlEditorMetadataSources().catch(() => page.metadataSources.value);
      page.showMetadataImportModal.value = false;
      page.status.value = 'AI metadata saved.';
    } catch (caught) {
      setError(caught, 'AI metadata could not be saved.');
    } finally {
      page.isImportingMetadata.value = false;
    }
  }

  async function loadCustomSource(): Promise<void> {
    const source = page.selectedCustomSource.value;
    if (!source) return;
    page.result.value = null;
    page.lastSuccessfulRunSignature.value = '';
    page.currentPage.value = 1;
    page.saveName.value = source.name;
    page.saveDescription.value = String(source.description ?? source.settings?.description ?? page.saveDescription.value);
    page.saveAsTemplate.value = source.settings?.isTemplate === true;
    const nextDataSourceId = source.baseDataSourceId || page.selectedDataSourceId.value;
    if (nextDataSourceId && nextDataSourceId !== page.selectedDataSourceId.value) {
      page.selectedDataSourceId.value = nextDataSourceId;
      await loadSchema(nextDataSourceId, false);
    }
    const nextQuery = source.sqlQuery || source.query;
    const savedParameters = Array.isArray(source.settings?.parameters)
      ? source.settings.parameters as SqlEditorParameter[]
      : null;
    page.query.value = nextQuery;
    if (savedParameters?.length) {
      page.parameters.value = savedParameters;
      page.parameterValues.value = Object.fromEntries(savedParameters.map(param => [param.name, param.defaultValue ?? '']));
    } else {
      actions.syncParameters();
    }
    page.lastQuerySnapshot.value = nextQuery;
    page.status.value = `Loaded saved model ${source.name}`;
    actions.saveCurrentTabState();
  }

  async function selectCustomSource(sourceId: string): Promise<void> {
    page.selectedCustomSourceId.value = sourceId;
    try {
      await loadCustomSource();
    } catch (caught) {
      setError(caught, 'Saved SQL data model could not be loaded.');
    }
  }

  function closeSaveModal(): void {
    page.showSaveModal.value = false;
  }

  function closeMetadataImportModal(): void {
    page.showMetadataImportModal.value = false;
  }

  function updateAssistantPrompt(prompt: string): void {
    assistant.prompt.value = prompt;
  }

  function setError(caught: unknown, fallback: string): void {
    page.error.value = caught instanceof Error && caught.message ? caught.message : fallback;
    page.status.value = 'Query error';
  }

  return {
    ...page,
    ...actions,
    askAssistantExample,
    assistantConversationId: assistant.conversationId,
    assistantError: assistant.error,
    assistantMessages: assistant.messages,
    assistantPlaceholder: assistant.placeholder,
    assistantPrompt: assistant.prompt,
    assistantResponse: assistant.response,
    assistantStatus: assistant.status,
    canApplyAssistantSql: assistant.canApply,
    canStopAssistant: assistant.canStop,
    closeMetadataImportModal,
    closeSaveModal,
    executeAssistantTool,
    fixQueryWithAi,
    handleImportMetadata,
    handleSaveDataModel,
    isAssistantRunning: assistant.isRunning,
    applyAssistantSql: assistant.apply,
    newAssistantChat: assistant.newChat,
    replaceAssistantSql: assistant.replace,
    resetAssistantSession: assistant.resetSession,
    runAssistantFromUi,
    runAssistantQuickAction,
    runPostQueryAssistant,
    runQuery,
    saveModel,
    selectCustomSource,
    selectDataSource,
    stopAssistant: assistant.stop,
    updateAssistantPrompt,
    updateModel
  };
}
