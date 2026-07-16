<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  createAdminDataSource,
  deleteAdminDataSource,
  deleteAdminDataSourceTable,
  fetchAdminDataSources,
  fetchAdminDataSourceTables,
  refreshAdminDataSourceSchema,
  syncAdminDataSourceTableToCloud,
  testAdminDataSourceConnection,
  updateAdminDataSource,
  updateAdminDataSourceDashboardSettings,
  updateAdminSampleVisibility
} from './api';
import AdminDataSourceDialog from './components/AdminDataSourceDialog.vue';
import AdminDataSourceDeleteDialog from './components/AdminDataSourceDeleteDialog.vue';
import AdminDataSourceDictionaryView from './components/AdminDataSourceDictionaryView.vue';
import AdminDataSourceDrilldown from './components/AdminDataSourceDrilldown.vue';
import AdminDataSourceManagementView from './components/AdminDataSourceManagementView.vue';
import AdminDataSourceWorkflowDialogs from './components/AdminDataSourceWorkflowDialogs.vue';
import { buildAdminConnectionPayload, buildAdminDataSourceSavePayload, DEFAULT_ADMIN_DATA_SOURCE_FORM, formStateFromDataSource, validateAdminDataSourceForm } from './form';
import { ADMIN_DATA_SOURCE_ROUTE_CONFIGS, resolveAdminDataSourceVariantFromPath } from './routes';
import type { AdminDataSource, AdminDataSourceFormState, AdminDataSourceRouteVariant, AdminDataSourceTable } from './types';
import { readError, sortTablesBySourceOrder } from './admin-data-source-page-utils';
import { useAdminDataSourceApiRuntime } from './use-admin-data-source-api-runtime';
import { ADMIN_CONNECTION_TYPES, buildDictionaryTableRows, filterDictionaryTableRows, filterDataSourcesForVariant, filterSourcesByConnectionType, sourceConnectionTypeId, sourceTypeForConnectionType, searchDataSources, type AdminConnectionTypeId, type AdminDictionaryTableRow } from './view-model';
import { patchAdminDataSources } from './workflow-helpers';
import '../admin/admin.css';
import '../admin/admin-base-product.css';
import './admin-data-sources.css';
import './admin-data-sources-base.css';
import './admin-data-sources-management.css';
import './admin-data-source-workflows.css';

const props = defineProps<{ routeVariant?: AdminDataSourceRouteVariant }>();

const route = useRoute();
const sources = ref<AdminDataSource[]>([]);
const tables = ref<AdminDataSourceTable[]>([]);
const selectedConnectionTypeId = ref<AdminConnectionTypeId>('api');
const selectedDictionarySourceId = ref('');
const selectedSourceId = ref('');
const selectedTableId = ref('');
const searchQuery = ref('');
const status = ref('Loading data sources');
const error = ref('');
const isLoadingSources = ref(false);
const isLoadingTables = ref(false);
const isSaving = ref(false);
const isDeleting = ref(false);
const dialogOpen = ref(false);
const detailsDialogOpen = ref(false);
const deleteDialogOpen = ref(false);
const deleteDialogTitle = ref('Delete Data Source');
const deleteDialogName = ref('');
const pendingDelete = ref<{ dataSourceId?: string; tableId?: string } | null>(null);
const dialogMode = ref<'create' | 'edit'>('create');
const dialogConnectionTypeId = ref<AdminConnectionTypeId>('database');
const formState = ref<AdminDataSourceFormState>({ ...DEFAULT_ADMIN_DATA_SOURCE_FORM });
const editingSourceId = ref('');
const testingSourceId = ref('');
const refreshingSchemaSourceId = ref('');
const workflowDialogs = ref<InstanceType<typeof AdminDataSourceWorkflowDialogs> | null>(null);
let tableRequestId = 0;

const routeVariant = computed(() => props.routeVariant ?? resolveAdminDataSourceVariantFromPath(route.path));
const routeConfig = computed(() => ADMIN_DATA_SOURCE_ROUTE_CONFIGS[routeVariant.value]);
const scopedSources = computed(() => filterDataSourcesForVariant(sources.value, routeVariant.value));
const dictionaryRows = computed(() => buildDictionaryTableRows(scopedSources.value).filter(row => row.isDataModel));
const visibleDictionaryRows = computed(() => filterDictionaryTableRows(dictionaryRows.value, searchQuery.value, selectedDictionarySourceId.value));
const visibleManagementSources = computed(() => filterSourcesByConnectionType(scopedSources.value, selectedConnectionTypeId.value, searchQuery.value));
const selectedSource = computed(() => sources.value.find(source => source.id === selectedSourceId.value) ?? null);
const pageTitleId = computed(() => {
  if (routeVariant.value === 'viewer') return 'admin-ds-dictionary-title';
  return 'admin-ds-management-title';
});
const dialogConnectionTypeName = computed(() => ADMIN_CONNECTION_TYPES.find(type => type.id === dialogConnectionTypeId.value)?.name ?? 'Data Source');
const {
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
} = useAdminDataSourceApiRuntime({
  loadSources,
  loadTables,
  selectedSourceId,
  selectedTableId,
  sources,
  status,
  tables
});

onMounted(() => void loadSources());

watch([selectedSourceId, detailsDialogOpen], ([sourceId, isOpen]) => {
  if (!sourceId) {
    resetDrilldownState();
    return;
  }
  if (!isOpen) return;
  void loadTables(sourceId);
});

watch(selectedTableId, () => {
  resetApiPreview();
});

watch(routeVariant, () => {
  if (selectedSourceId.value && !scopedSources.value.some(source => source.id === selectedSourceId.value)) {
    detailsDialogOpen.value = false;
    selectedSourceId.value = '';
    resetDrilldownState();
  }
});

async function loadSources(): Promise<void> {
  isLoadingSources.value = true;
  error.value = '';
  status.value = `Loading ${routeConfig.value.title}`;
  try {
    const nextSources = await fetchAdminDataSources();
    sources.value = nextSources;
    const nextScoped = filterDataSourcesForVariant(nextSources, routeVariant.value);
    if (selectedDictionarySourceId.value && !nextScoped.some(source => source.id === selectedDictionarySourceId.value)) {
      selectedDictionarySourceId.value = '';
    }
    const selectedStillVisible = nextScoped.some(source => source.id === selectedSourceId.value);
    if (!selectedStillVisible) {
      detailsDialogOpen.value = false;
      selectedSourceId.value = '';
      resetDrilldownState();
    } else if (detailsDialogOpen.value && selectedSourceId.value) {
      await loadTables(selectedSourceId.value);
    }
    status.value = `${nextScoped.length} data source record${nextScoped.length === 1 ? '' : 's'} loaded`;
  } catch (caught) {
    sources.value = [];
    tables.value = [];
    selectedSourceId.value = '';
    error.value = readError(caught, 'Data sources could not be loaded.');
    status.value = 'Data sources failed to load';
  } finally {
    isLoadingSources.value = false;
  }
}

async function loadTables(sourceId: string): Promise<void> {
  const requestId = ++tableRequestId;
  isLoadingTables.value = true;
  try {
    const nextTables = sortTablesBySourceOrder(
      await fetchAdminDataSourceTables(sourceId),
      sources.value.find(source => source.id === sourceId)?.tables ?? []
    );
    if (requestId !== tableRequestId) return;
    tables.value = nextTables;
    selectedTableId.value = nextTables.some(table => table.id === selectedTableId.value)
      ? selectedTableId.value
      : nextTables[0]?.id ?? '';
  } catch (caught) {
    if (requestId !== tableRequestId) return;
    tables.value = [];
    selectedTableId.value = '';
    error.value = readError(caught, 'Selected tables could not be loaded.');
  } finally {
    if (requestId === tableRequestId) isLoadingTables.value = false;
  }
}

function openCreateDialog(typeId: AdminConnectionTypeId = selectedConnectionTypeId.value): void {
  dialogMode.value = 'create';
  dialogConnectionTypeId.value = typeId;
  editingSourceId.value = '';
  formState.value = {
    ...DEFAULT_ADMIN_DATA_SOURCE_FORM,
    type: sourceTypeForConnectionType(typeId)
  };
  dialogOpen.value = true;
}

function openEditDialog(source: AdminDataSource): void {
  dialogMode.value = 'edit';
  dialogConnectionTypeId.value = sourceConnectionTypeId(source);
  editingSourceId.value = source.id;
  formState.value = formStateFromDataSource(source);
  dialogOpen.value = true;
}

async function submitDialog(): Promise<void> {
  const validationErrors = validateAdminDataSourceForm(formState.value);
  if (validationErrors.length > 0) {
    error.value = validationErrors.join(' ');
    status.value = 'Data source validation failed';
    return;
  }
  const payload = buildAdminDataSourceSavePayload(formState.value);
  isSaving.value = true;
  error.value = '';
  const successStatus = dialogMode.value === 'edit' ? 'Data source updated' : 'Data source created';
  try {
    if (dialogMode.value === 'edit' && editingSourceId.value) {
      await updateAdminDataSource(editingSourceId.value, payload);
    } else {
      const created = await createAdminDataSource(payload);
      selectedSourceId.value = created.id;
    }
    dialogOpen.value = false;
    await loadSources();
    status.value = successStatus;
  } catch (caught) {
    error.value = readError(caught, 'Data source could not be saved.');
    status.value = 'Data source save failed';
  } finally {
    isSaving.value = false;
  }
}

async function testConnection(source: AdminDataSource): Promise<void> {
  testingSourceId.value = source.id;
  error.value = '';
  try {
    const result = await testAdminDataSourceConnection(buildAdminConnectionPayload(source));
    status.value = result.tables.length > 0
      ? `Test connection completed: ${result.message}: ${result.tables.join(', ')}`
      : `Test connection completed: ${result.message}`;
  } catch (caught) {
    error.value = readError(caught, 'Connection test failed.');
    status.value = 'Connection test failed';
  } finally {
    testingSourceId.value = '';
  }
}

async function refreshSourceSchema(source: AdminDataSource): Promise<void> {
  refreshingSchemaSourceId.value = source.id;
  error.value = '';
  try {
    const result = await refreshAdminDataSourceSchema(source.id);
    await loadSources();
    if (detailsDialogOpen.value && selectedSourceId.value === source.id) {
      await loadTables(source.id);
    }
    status.value = `Registered ${result.registeredTableCount} table targets from ${result.discoveredTableCount} discovered raw tables; preserved ${result.savedDataModelCount} saved data models.`;
  } catch (caught) {
    error.value = readError(caught, 'Schema refresh failed.');
    status.value = 'Schema refresh failed';
  } finally {
    refreshingSchemaSourceId.value = '';
  }
}

function openDeleteSourceDialog(source: AdminDataSource): void {
  deleteDialogTitle.value = 'Delete Data Source';
  deleteDialogName.value = source.name;
  pendingDelete.value = { dataSourceId: source.id };
  deleteDialogOpen.value = true;
}

function openDeleteTableDialog(row: AdminDictionaryTableRow): void {
  deleteDialogTitle.value = 'Delete SQL Data Model';
  deleteDialogName.value = row.name;
  pendingDelete.value = { tableId: row.table.id };
  deleteDialogOpen.value = true;
}

async function confirmDelete(): Promise<void> {
  if (!pendingDelete.value) return;
  isDeleting.value = true;
  error.value = '';
  try {
    if (pendingDelete.value.dataSourceId) await deleteAdminDataSource(pendingDelete.value.dataSourceId);
    if (pendingDelete.value.tableId) await deleteAdminDataSourceTable(pendingDelete.value.tableId);
    deleteDialogOpen.value = false;
    pendingDelete.value = null;
    await loadSources();
    status.value = deleteDialogTitle.value === 'Delete SQL Data Model' ? 'SQL data model deleted' : 'Data source deleted';
  } catch (caught) {
    const message = readError(caught, 'Delete failed.');
    error.value = message;
    status.value = 'Delete failed';
  } finally {
    isDeleting.value = false;
  }
}

async function updateDashboardSettings(source: AdminDataSource, field: 'visible' | 'default', value: boolean): Promise<void> {
  error.value = '';
  try {
    await updateAdminDataSourceDashboardSettings(source.id, field === 'visible' ? { isDashboardVisible: value } : { isDefault: value });
    await loadSources();
    status.value = 'Dashboard settings updated';
  } catch (caught) {
    error.value = readError(caught, 'Dashboard settings could not be updated.');
    status.value = 'Dashboard settings update failed';
  }
}

async function updateSampleVisibility(
  source: AdminDataSource,
  field: 'isGloballyVisible',
  value: boolean
): Promise<void> {
  error.value = '';
  try {
    await updateAdminSampleVisibility(source.id, { [field]: value });
    await loadSources();
    status.value = 'Sample visibility updated';
  } catch (caught) {
    error.value = readError(caught, 'Sample visibility could not be updated.');
    status.value = 'Sample visibility update failed';
  }
}

async function syncTableToCloud(row: AdminDictionaryTableRow): Promise<void> {
  error.value = '';
  try {
    const result = await syncAdminDataSourceTableToCloud(row.dataSourceId, row.table.id);
    await loadSources();
    status.value = result.syncedAt ? `Cloud sync completed at ${result.syncedAt}` : result.message;
  } catch (caught) {
    error.value = readError(caught, 'Cloud sync failed.');
    status.value = 'Cloud sync failed';
  }
}

function openDetailsDialog(source: AdminDataSource): void {
  if (selectedSourceId.value !== source.id) {
    resetDrilldownState();
  }
  selectedSourceId.value = source.id;
  detailsDialogOpen.value = true;
  if (source.type.toLowerCase() === 'api') void loadApiRuns(source.id);
}

function openDetailsForSourceId(sourceId: string, tableId = ''): void {
  const source = sources.value.find(candidate => candidate.id === sourceId);
  if (!source) return;
  openDetailsDialog(source);
  if (tableId) selectedTableId.value = tableId;
}

function closeDetailsDialog(): void {
  detailsDialogOpen.value = false;
}

function openEditFromDetails(source: AdminDataSource): void {
  closeDetailsDialog();
  openEditDialog(source);
}

function selectTable(tableId: string): void {
  selectedTableId.value = tableId;
  apiPreview.value = null;
  apiPreviewError.value = '';
  if (selectedSource.value?.type.toLowerCase() === 'api') void loadApiRuns(selectedSource.value.id);
}

function openManageTables(source: AdminDataSource): void { void workflowDialogs.value?.openManageTables(source.id); }
function openManageDataModels(source: AdminDataSource): void { void workflowDialogs.value?.openManageDataModels(source.id); }
function openFilters(source: AdminDataSource): void { void workflowDialogs.value?.openSourceFilters(source.id); }

function resetDrilldownState(): void {
  tables.value = [];
  selectedTableId.value = '';
  resetApiState();
}

function showDictionaryInfo(): void {
  status.value = 'Data Dictionary context helps AI understand tables, columns, metrics, and business use cases.';
}

function applyWorkflowPatch(patch: Parameters<typeof patchAdminDataSources>[1]): void {
  sources.value = patchAdminDataSources(sources.value, patch);
  status.value = patch.status;
}

async function handleBulkDictionaryUploaded(message: string): Promise<void> {
  status.value = message;
  await loadSources();
}

</script>

<template>
  <section class="admin-page admin-data-sources-page" :aria-labelledby="pageTitleId">
    <AdminDataSourceDictionaryView
      v-if="routeVariant === 'viewer'"
      :is-busy="isLoadingSources"
      :rows="visibleDictionaryRows"
      :search-query="searchQuery"
      :selected-source-id="selectedDictionarySourceId"
      :sources="scopedSources"
      :status="status"
      @details="openDetailsForSourceId"
      @delete-table="openDeleteTableDialog"
      @info="showDictionaryInfo"
      @sync-table="syncTableToCloud"
      @uploaded="handleBulkDictionaryUploaded"
      @update:search-query="searchQuery = $event"
      @update:selected-source-id="selectedDictionarySourceId = $event"
    />

    <AdminDataSourceManagementView
      v-else
      :can-manage="routeConfig.canManage"
      :connections="visibleManagementSources"
      :error="error"
      :is-busy="isLoadingSources"
      :search-query="searchQuery"
      :refreshing-schema-source-id="refreshingSchemaSourceId"
      :selected-type-id="selectedConnectionTypeId"
      :sources="scopedSources"
      :status="status"
      :testing-source-id="testingSourceId"
      @add-new="openCreateDialog"
      @dashboard-settings="updateDashboardSettings"
      @details="openDetailsDialog"
      @edit="openEditDialog"
      @filters="openFilters"
      @manage-data-models="openManageDataModels"
      @manage-tables="openManageTables"
      @refresh-schema="refreshSourceSchema"
      @sample-visibility="updateSampleVisibility"
      @test="testConnection"
      @update:search-query="searchQuery = $event"
      @update:selected-type-id="selectedConnectionTypeId = $event"
    />

    <AdminDataSourceDrilldown
      :api-preview="apiPreview"
      :api-preview-error="apiPreviewError"
      :api-run-logs="apiRunLogs"
      :data-sources="sources"
      :open="detailsDialogOpen"
      :is-loading-tables="isLoadingTables"
      :is-loading-api-runs="isLoadingApiRuns"
      :is-previewing-api="isPreviewingApi"
      :is-saving-api-config="isSavingApiConfig"
      :selected-table-id="selectedTableId"
      :source="selectedSource"
      :tables="tables"
      @close="closeDetailsDialog"
      @edit-source="openEditFromDetails"
      @preview-api-request="previewSelectedApiRequest"
      @save-api-request="saveSelectedApiRequest"
      @select-table="selectTable"
    />

    <AdminDataSourceDialog
      v-model="formState"
      :connection-type-name="dialogConnectionTypeName"
      :is-saving="isSaving"
      :mode="dialogMode"
      :open="dialogOpen"
      @close="dialogOpen = false"
      @submit="submitDialog"
    />

    <AdminDataSourceDeleteDialog
      :is-deleting="isDeleting"
      :name="deleteDialogName"
      :open="deleteDialogOpen"
      :title="deleteDialogTitle"
      @close="deleteDialogOpen = false"
      @confirm="confirmDelete"
    />

    <AdminDataSourceWorkflowDialogs
      ref="workflowDialogs"
      :sources="sources"
      @error="error = $event"
      @patch="applyWorkflowPatch"
      @status="status = $event"
    />
  </section>
</template>
