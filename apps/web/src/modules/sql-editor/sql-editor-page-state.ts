import { computed, ref } from 'vue';
import { sqlEditorSuggestionsFromMetadata } from './recommendations';
import { useSqlEditorSplitResize } from './split-resize';
import { sqlDataModelsFromSchema } from './sql-editor-page-helpers';
import type {
  SqlEditorParameter,
  SqlEditorPivotConfig,
  SqlEditorQueryHistoryItem,
  SqlEditorQueryResult,
  SqlEditorSchema,
  SqlEditorSource,
  SqlEditorSuggestion,
  SqlEditorTab,
  SqlEditorMetadataSource
} from './types';
import { dataModelFieldsFromResult, replaceParameters } from './workflow';

export interface SqlEditorSaveDataModelForm {
  description: string;
  generateMetadataAfterSave: boolean;
  isTemplate: boolean;
  name: string;
}

export interface SqlEditorMetadataImportAnswers {
  columns: Array<{ name: string; type: string; columnType: string; dictionaryDescription: string }>;
  dataModelDefinition: string;
}

export interface SqlEditorMetadataImportTarget {
  fields: Array<{ name: string; type: string; description?: string; dictionaryDescription?: string }>;
  id: string;
  name: string;
}

export function createSqlEditorPageState() {
  const dataSources = ref<SqlEditorSource[]>([]);
  const metadataSources = ref<SqlEditorMetadataSource[]>([]);
  const tabs = ref<SqlEditorTab[]>([]);
  const activeTabId = ref('');
  const selectedDataSourceId = ref('');
  const selectedCustomSourceId = ref('');
  const schema = ref<SqlEditorSchema | null>(null);
  const expandedTables = ref<string[]>([]);
  const suggestions = ref<SqlEditorSuggestion[]>([]);
  const query = ref('');
  const result = ref<SqlEditorQueryResult | null>(null);
  const parameters = ref<SqlEditorParameter[]>([]);
  const parameterValues = ref<Record<string, string>>({});
  const queryHistory = ref<SqlEditorQueryHistoryItem[]>([]);
  const undoStack = ref<string[]>([]);
  const redoStack = ref<string[]>([]);
  const lastQuerySnapshot = ref('');
  const pivotDimension = ref('');
  const pivotMetric = ref('');
  const pivotConfig = ref<SqlEditorPivotConfig | null>(null);
  const saveName = ref('sql_revenue_data_model');
  const saveDescription = ref('Reusable SQL model for dashboard and analyzer workflows.');
  const saveAsTemplate = ref(false);
  const error = ref('');
  const status = ref('Choose a data source');
  const assistantStatusRevision = ref(0);
  const lastSuccessfulRunSignature = ref('');
  const isLoading = ref(false);
  const isRunning = ref(false);
  const currentPage = ref(1);
  const pageSize = 25;
  const showSaveModal = ref(false);
  const saveMode = ref<'create' | 'update'>('create');
  const isSavingModel = ref(false);
  const showMetadataImportModal = ref(false);
  const isImportingMetadata = ref(false);
  const metadataImportTarget = ref<SqlEditorMetadataImportTarget | null>(null);
  const metadataImportInitialValues = ref<SqlEditorMetadataImportAnswers>({ columns: [], dataModelDefinition: '' });
  const { queryPanelStyle, resizeByKeyboard, resultPanelStyle, splitContainer, startResize } = useSqlEditorSplitResize();

  const pageTitle = 'SQL Query Editor';
  const selectedSource = computed(() => dataSources.value.find(source => source.id === selectedDataSourceId.value) ?? null);
  const selectedMetadataSource = computed(() => metadataSources.value.find(source => source.id === selectedDataSourceId.value) ?? null);
  const savedSqlDataModels = computed(() => sqlDataModelsFromSchema(schema.value, selectedDataSourceId.value));
  const selectedCustomSource = computed(() => savedSqlDataModels.value.find(source => source.id === selectedCustomSourceId.value) ?? null);
  const tables = computed(() => schema.value?.tables ?? []);
  const effectiveSuggestions = computed(() => sqlEditorSuggestionsFromMetadata(schema.value, selectedMetadataSource.value, suggestions.value));
  const resultColumns = computed(() => result.value?.columns ?? []);
  const canRun = computed(() => selectedDataSourceId.value && query.value.trim() && !isRunning.value);
  const currentRunSignature = computed(() => JSON.stringify({
    customSourceId: selectedCustomSourceId.value,
    dataSourceId: selectedDataSourceId.value,
    parameterValues: parameterValues.value,
    query: replaceParameters(query.value, parameterValues.value).trim()
  }));
  const canUpdateModel = computed(() =>
    Boolean(selectedCustomSourceId.value && canRun.value && result.value && lastSuccessfulRunSignature.value === currentRunSignature.value)
  );
  const paginatedRows = computed(() => result.value?.rows.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize) ?? []);
  const totalPages = computed(() => result.value?.rows.length ? Math.ceil(result.value.rows.length / pageSize) : 0);
  const dataModelFields = computed(() => dataModelFieldsFromResult(result.value));
  const aiAssistantEnabled = computed(() => true);

  return {
    activeTabId,
    aiAssistantEnabled,
    assistantStatusRevision,
    canRun,
    canUpdateModel,
    currentPage,
    currentRunSignature,
    dataModelFields,
    dataSources,
    effectiveSuggestions,
    error,
    expandedTables,
    isImportingMetadata,
    isLoading,
    isRunning,
    isSavingModel,
    metadataImportInitialValues,
    metadataImportTarget,
    lastQuerySnapshot,
    lastSuccessfulRunSignature,
    pageTitle,
    paginatedRows,
    parameterValues,
    parameters,
    pivotConfig,
    pivotDimension,
    pivotMetric,
    query,
    queryHistory,
    queryPanelStyle,
    redoStack,
    resizeByKeyboard,
    result,
    resultColumns,
    resultPanelStyle,
    saveAsTemplate,
    saveDescription,
    saveMode,
    saveName,
    savedSqlDataModels,
    schema,
    selectedCustomSource,
    selectedCustomSourceId,
    selectedDataSourceId,
    selectedSource,
    showMetadataImportModal,
    showSaveModal,
    splitContainer,
    startResize,
    status,
    suggestions,
    tables,
    tabs,
    totalPages,
    metadataSources,
    undoStack
  };
}

export type SqlEditorPageState = ReturnType<typeof createSqlEditorPageState>;
