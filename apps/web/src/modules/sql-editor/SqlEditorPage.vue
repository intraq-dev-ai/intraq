<script setup lang="ts">
import SqlEditorHeaderControls from './components/SqlEditorHeaderControls.vue';
import SqlEditorMetadataImportModal from './components/SqlEditorMetadataImportModal.vue';
import SqlEditorQueryPanel from './components/SqlEditorQueryPanel.vue';
import SqlEditorResultsPanel from './components/SqlEditorResultsPanel.vue';
import SqlEditorSaveDataSourceModal from './components/SqlEditorSaveDataSourceModal.vue';
import SqlEditorSchemaPanel from './components/SqlEditorSchemaPanel.vue';
import SqlEditorTabNavigation from './components/SqlEditorTabNavigation.vue';
import { useSqlEditorPage } from './use-sql-editor-page';
import { formatSql } from './workflow';
import './sql-editor.css';
import './sql-editor-sidepanels.css';

const {
  activeTabId,
  addTab,
  aiAssistantEnabled,
  applyAssistantSql,
  applySuggestion,
  askAssistantExample,
  assistantConversationId,
  assistantError,
  assistantMessages,
  assistantPlaceholder,
  assistantPrompt,
  assistantResponse,
  assistantStatus,
  canApplyAssistantSql,
  canRun,
  canStopAssistant,
  canUpdateModel,
  clearHistory,
  closeMetadataImportModal,
  closeSaveModal,
  closeTab,
  collapseAllTables,
  currentPage,
  dataModelFields,
  dataSources,
  effectiveSuggestions,
  error,
  executeAssistantTool,
  expandAllTables,
  expandedTables,
  expandTables,
  fixQueryWithAi,
  handleImportMetadata,
  handleSaveDataModel,
  insertColumn,
  insertTable,
  isAssistantRunning,
  isImportingMetadata,
  isLoading,
  isRunning,
  isSavingModel,
  metadataImportInitialValues,
  metadataImportTarget,
  nextPage,
  newAssistantChat,
  onQueryInput,
  pageTitle,
  paginatedRows,
  parameterValues,
  parameters,
  pivotConfig,
  prepareCsv,
  previousPage,
  query,
  queryHistory,
  queryPanelStyle,
  redoQuery,
  redoStack,
  removeParameter,
  renameParameter,
  replaceAssistantSql,
  resetAssistantSession,
  resizeByKeyboard,
  result,
  resultColumns,
  resultPanelStyle,
  runAssistantFromUi,
  runAssistantQuickAction,
  runPostQueryAssistant,
  runQuery,
  saveAsTemplate,
  saveDescription,
  saveMode,
  saveModel,
  saveName,
  savedSqlDataModels,
  schema,
  selectCustomSource,
  selectDataSource,
  selectedCustomSourceId,
  selectedDataSourceId,
  selectedSource,
  setQuery,
  showMetadataImportModal,
  showSaveModal,
  splitContainer,
  startResize,
  status,
  stopAssistant,
  switchTab,
  tables,
  tabs,
  toggleTable,
  totalPages,
  undoQuery,
  undoStack,
  updateAssistantPrompt,
  updateModel,
  updateParameterMetadata,
  updateParameterValue,
  updatePivotConfig,
  updateQueryValue,
  useTable
} = useSqlEditorPage();
</script>

<template>
  <section class="sql-editor-layout sql-editor-page" aria-labelledby="sql-editor-title">
    <SqlEditorHeaderControls
      :page-title="pageTitle" :status="status" :is-loading="isLoading" :is-running="isRunning"
      :data-sources="dataSources" :custom-sources="savedSqlDataModels"
      :selected-data-source-id="selectedDataSourceId" :selected-custom-source-id="selectedCustomSourceId"
      :can-run="canRun" :can-update-model="canUpdateModel"
      @run-query="runQuery" @clear-query="setQuery('', true)" @data-source-change="selectDataSource"
      @custom-source-change="selectCustomSource" @save-model="saveModel" @update-model="updateModel"
    />
    <div class="sql-main sql-editor-main">
      <div class="sql-editor-panel sql-editor-left-pane">
        <SqlEditorTabNavigation
          :tabs="tabs"
          :active-tab-id="activeTabId"
          @switch-tab="switchTab"
          @add-tab="addTab"
          @close-tab="closeTab"
        />

        <div ref="splitContainer" class="resizable-split-container sql-editor-split">
          <SqlEditorQueryPanel
            :key="activeTabId"
            :selected-source="selectedSource" :query="query" :parameters="parameters"
            :query-history="queryHistory"
            :parameter-values="parameterValues" :error="error" :can-undo="undoStack.length > 0"
            :style="queryPanelStyle"
            :can-redo="redoStack.length > 0" @update-query="updateQueryValue" @query-input="onQueryInput"
            @undo="undoQuery" @redo="redoQuery" @format-query="setQuery(formatSql(query), true)"
            @execute-query="runQuery"
            @clear-history="clearHistory"
            @load-history-query="setQuery($event, true)"
            @update-parameter-value="updateParameterValue"
          />
          <div
            class="panel-resizer sql-editor-panel-resizer"
            role="separator"
            aria-label="Resize query and results panels"
            aria-orientation="horizontal"
            tabindex="0"
            @keydown="resizeByKeyboard"
            @mousedown="startResize"
          ></div>
          <SqlEditorResultsPanel
            :result="result" :result-columns="resultColumns" :paginated-rows="paginatedRows"
            :current-page="currentPage" :total-pages="totalPages"
            :style="resultPanelStyle"
            :pivot-config="pivotConfig" :error="error" :is-running="isRunning"
            :ai-assistant-enabled="aiAssistantEnabled"
            @execute-assistant-tool="executeAssistantTool" @fix-with-ai="fixQueryWithAi"
            @post-run-action="runPostQueryAssistant"
            @prepare-csv="prepareCsv" @previous-page="previousPage"
            @next-page="nextPage" @update-pivot-config="updatePivotConfig"
          />
        </div>
      </div>

      <SqlEditorSchemaPanel
        :schema="schema" :tables="tables" :expanded-tables="expandedTables" :suggestions="effectiveSuggestions"
        :parameters="parameters" :assistant-prompt="assistantPrompt" :assistant-response="assistantResponse"
        :assistant-conversation-id="assistantConversationId" :assistant-messages="assistantMessages"
        :assistant-error="assistantError" :assistant-status="assistantStatus"
        :assistant-placeholder="assistantPlaceholder" :is-assistant-running="isAssistantRunning"
        :ai-assistant-enabled="aiAssistantEnabled"
        :can-apply-assistant-sql="canApplyAssistantSql" :can-stop-assistant="canStopAssistant"
        :current-query="query" :has-data-source="Boolean(selectedDataSourceId)"
        :assistant-data-source-name="selectedSource?.name ?? ''"
        @toggle-table="toggleTable" @use-table="useTable" @insert-table="insertTable"
        @insert-column="insertColumn"
        @expand-tables="expandTables"
        @expand-all-tables="expandAllTables" @collapse-all-tables="collapseAllTables"
        @apply-suggestion="applySuggestion" @run-assistant="runAssistantFromUi" @apply-assistant-sql="applyAssistantSql"
        @run-assistant-quick-action="runAssistantQuickAction"
        @ask-example="askAssistantExample"
        @replace-assistant-sql="replaceAssistantSql"
        @update-assistant-prompt="updateAssistantPrompt" @update-parameter-metadata="updateParameterMetadata"
        @new-assistant-chat="newAssistantChat" @reset-assistant-session="resetAssistantSession" @stop-assistant="stopAssistant"
        @remove-parameter="removeParameter"
        @rename-parameter="renameParameter"
      />
    </div>
    <SqlEditorSaveDataSourceModal
      :show="showSaveModal"
      :fields="dataModelFields"
      :parameters="parameters"
      :saving="isSavingModel"
      :initial-name="saveName"
      :initial-description="saveDescription"
      :initial-is-template="saveAsTemplate"
      :mode="saveMode"
      @close="closeSaveModal"
      @save="handleSaveDataModel"
    />
    <SqlEditorMetadataImportModal
      :show="showMetadataImportModal"
      :saving="isImportingMetadata"
      :fields="metadataImportTarget?.fields ?? dataModelFields"
      :initial-values="metadataImportInitialValues"
      title="Create AI Metadata"
      :subtitle="metadataImportTarget?.name ?? ''"
      confirm-text="Save AI Metadata"
      @close="closeMetadataImportModal"
      @submit="handleImportMetadata"
    />
  </section>
</template>
