import { ref, type Ref } from 'vue';
import {
  fetchAdminApiWorkflowRuns,
  previewAdminDataSourceTable,
  upsertAdminApiDataSourceTable
} from './api';
import type {
  AdminApiWorkflowRunLog,
  AdminDataSource,
  AdminDataSourcePreviewResult,
  AdminDataSourceTable
} from './types';

export function useAdminDataSourceApiRuntime(options: {
  loadSources: () => Promise<void>;
  loadTables: (sourceId: string) => Promise<void>;
  selectedSourceId: Ref<string>;
  selectedTableId: Ref<string>;
  sources: Ref<AdminDataSource[]>;
  status: Ref<string>;
  tables: Ref<AdminDataSourceTable[]>;
}) {
  const apiPreview = ref<AdminDataSourcePreviewResult | null>(null);
  const apiRunLogs = ref<AdminApiWorkflowRunLog[]>([]);
  const apiPreviewError = ref('');
  const isSavingApiConfig = ref(false);
  const isPreviewingApi = ref(false);
  const isLoadingApiRuns = ref(false);

  function resetApiState(): void {
    apiPreview.value = null;
    apiPreviewError.value = '';
    apiRunLogs.value = [];
  }

  function resetApiPreview(): void {
    apiPreview.value = null;
    apiPreviewError.value = '';
  }

  async function saveSelectedApiRequest(payload: Record<string, unknown>): Promise<void> {
    if (!options.selectedSourceId.value) return;
    isSavingApiConfig.value = true;
    apiPreviewError.value = '';
    try {
      const savedTable = await upsertAdminApiDataSourceTable(options.selectedSourceId.value, payload);
      options.status.value = 'API endpoint request saved successfully';
      await options.loadSources();
      await options.loadTables(options.selectedSourceId.value);
      options.selectedTableId.value = savedTable.id;
      await loadApiRuns(options.selectedSourceId.value, savedTable.name);
    } catch (caught) {
      apiPreviewError.value = readError(caught, 'API endpoint request could not be saved.');
      options.status.value = 'API endpoint request save failed';
    } finally {
      isSavingApiConfig.value = false;
    }
  }

  async function previewSelectedApiRequest(parameterValues: Record<string, unknown>): Promise<void> {
    if (!options.selectedSourceId.value) return;
    const table = options.tables.value.find(item => item.id === options.selectedTableId.value) ?? null;
    if (!table) return;
    isPreviewingApi.value = true;
    apiPreviewError.value = '';
    apiPreview.value = null;
    try {
      apiPreview.value = await previewAdminDataSourceTable(options.selectedSourceId.value, table.name, parameterValues);
      options.status.value = `API preview returned ${apiPreview.value.rowCount} row${apiPreview.value.rowCount === 1 ? '' : 's'}`;
    } catch (caught) {
      apiPreviewError.value = readError(caught, 'API preview failed.');
      options.status.value = 'API preview failed';
    } finally {
      isPreviewingApi.value = false;
      await loadApiRuns(options.selectedSourceId.value, table.name);
    }
  }

  async function loadApiRuns(sourceId = options.selectedSourceId.value, tableName = ''): Promise<void> {
    if (!sourceId) return;
    const source = options.sources.value.find(item => item.id === sourceId);
    if (!source || source.type.toLowerCase() !== 'api') {
      apiRunLogs.value = [];
      return;
    }
    const table = tableName || options.tables.value.find(item => item.id === options.selectedTableId.value)?.name || '';
    isLoadingApiRuns.value = true;
    try {
      apiRunLogs.value = await fetchAdminApiWorkflowRuns(sourceId, table, 25);
    } catch {
      apiRunLogs.value = [];
    } finally {
      isLoadingApiRuns.value = false;
    }
  }

  return {
    apiPreview,
    apiPreviewError,
    apiRunLogs,
    isLoadingApiRuns,
    isPreviewingApi,
    isSavingApiConfig,
    loadApiRuns,
    previewSelectedApiRequest,
    resetApiPreview,
    resetApiState,
    saveSelectedApiRequest
  };
}

function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
