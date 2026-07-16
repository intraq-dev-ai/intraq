<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  fetchAdminDataSourceTables,
  saveAdminDataSourceTables,
  updateAdminDataSourceDataModels,
  updateAdminDataSourceDefaultFilters
} from '../api';
import type {
  AdminDataSource,
  AdminDataSourceFilterCondition,
  AdminDataSourceTable
} from '../types';
import {
  dataModelTableNames,
  filterWorkflowTables,
  mergeAdminDataSourceTables,
  patchTableFilters,
  patchTablesWithDataModels,
  patchTablesWithSelection,
  selectedTableNames,
  tableFieldNames,
  type AdminDataSourceWorkflowPatch
} from '../workflow-helpers';
import AdminDataSourceFilterDialog from './AdminDataSourceFilterDialog.vue';
import AdminDataSourceTableWorkflowDialog from './AdminDataSourceTableWorkflowDialog.vue';

const props = defineProps<{ sources: AdminDataSource[] }>();

const emit = defineEmits<{
  error: [message: string];
  patch: [patch: AdminDataSourceWorkflowPatch];
  status: [message: string];
}>();

const tableDialogMode = ref<'tables' | 'models' | null>(null);
const sourceId = ref('');
const searchQuery = ref('');
const loadedTables = ref<AdminDataSourceTable[]>([]);
const loadedSourceId = ref('');
const selectedNames = ref<string[]>([]);
const isLoadingTables = ref(false);
const isSavingTables = ref(false);
const tableError = ref('');
const filterOpen = ref(false);
const filterScope = ref<'source' | 'table'>('source');
const filterTableName = ref('');
const filterConditions = ref<AdminDataSourceFilterCondition[]>([]);
const filterError = ref('');
const isSavingFilters = ref(false);

const source = computed(() => props.sources.find(candidate => candidate.id === sourceId.value) ?? null);
const isApiSource = computed(() => source.value?.type.toLowerCase() === 'api');
const resourceLabel = computed(() => isApiSource.value ? 'Endpoints' : 'Tables');
const resourceLabelSingular = computed(() => isApiSource.value ? 'Endpoint' : 'Table');
const allTables = computed(() => mergeAdminDataSourceTables(source.value?.tables ?? [], loadedTables.value));
const visibleTables = computed(() => filterWorkflowTables(allTables.value, searchQuery.value));
const selectedTableSet = computed(() => new Set(selectedNames.value));
const tableDialogOpen = computed(() => tableDialogMode.value !== null);
const tableDialogSelectedTables = computed(() => {
  if (tableDialogMode.value === 'models') return visibleTables.value.filter(table => table.isSelected);
  return visibleTables.value.filter(table => selectedTableSet.value.has(table.name));
});
const tableDialogAvailableTables = computed(() =>
  tableDialogMode.value === 'tables'
    ? visibleTables.value.filter(table => !selectedTableSet.value.has(table.name))
    : []
);
const filterTitle = computed(() => {
  if (!source.value) return 'Filters';
  return filterScope.value === 'table' ? `${filterTableName.value} Filters` : `${source.value.name} Filters`;
});
const filterFields = computed(() => {
  if (filterScope.value === 'table') {
    const table = allTables.value.find(candidate => candidate.name === filterTableName.value);
    return table ? tableFieldNames([table]) : [];
  }
  return tableFieldNames(allTables.value.length > 0 ? allTables.value : source.value?.tables ?? []);
});

async function openManageTables(nextSourceId: string): Promise<void> {
  openTableDialog(nextSourceId, 'tables');
  selectedNames.value = source.value ? selectedTableNames(source.value) : [];
  await loadTables();
}

async function openManageDataModels(nextSourceId: string): Promise<void> {
  openTableDialog(nextSourceId, 'models');
  selectedNames.value = source.value ? dataModelTableNames(source.value) : [];
  await loadTables();
}

async function openSourceFilters(nextSourceId: string): Promise<void> {
  sourceId.value = nextSourceId;
  filterScope.value = 'source';
  filterTableName.value = '';
  filterConditions.value = cloneFilters(source.value?.defaultFilters ?? []);
  filterError.value = '';
  filterOpen.value = true;
  if (loadedSourceId.value !== nextSourceId) await loadTables();
}

defineExpose({ openManageDataModels, openManageTables, openSourceFilters });

function closeTableDialog(): void {
  tableDialogMode.value = null;
  searchQuery.value = '';
  tableError.value = '';
}

function openTableDialog(nextSourceId: string, mode: 'tables' | 'models'): void {
  if (sourceId.value !== nextSourceId) {
    loadedTables.value = [];
    loadedSourceId.value = '';
  }
  sourceId.value = nextSourceId;
  tableDialogMode.value = mode;
  searchQuery.value = '';
  tableError.value = '';
}

async function loadTables(): Promise<void> {
  if (!sourceId.value) return;
  isLoadingTables.value = true;
  tableError.value = '';
  try {
    loadedTables.value = await fetchAdminDataSourceTables(sourceId.value);
    loadedSourceId.value = sourceId.value;
  } catch (caught) {
    loadedTables.value = [];
    loadedSourceId.value = '';
    tableError.value = readError(caught, 'Tables could not be loaded.');
  } finally {
    isLoadingTables.value = false;
  }
}

function toggleSelection(tableName: string, selected: boolean): void {
  const next = new Set(selectedNames.value);
  if (selected) next.add(tableName);
  else next.delete(tableName);
  selectedNames.value = [...next];
}

function selectAllVisible(): void {
  const candidates = tableDialogMode.value === 'models'
    ? visibleTables.value.filter(table => table.isSelected)
    : visibleTables.value;
  selectedNames.value = [...new Set([...selectedNames.value, ...candidates.map(table => table.name)])];
}

function deselectAll(): void {
  selectedNames.value = [];
}

async function saveTableDialog(): Promise<void> {
  if (!source.value || !tableDialogMode.value) return;
  isSavingTables.value = true;
  tableError.value = '';
  try {
    if (tableDialogMode.value === 'models') {
      await updateAdminDataSourceDataModels(source.value.id, selectedNames.value);
      emitPatch(patchTablesWithDataModels(allTables.value, selectedNames.value), 'Data models saved');
    } else {
      await saveAdminDataSourceTables(source.value.id, {
        selectedTables: selectedNames.value,
        defaultFilters: defaultFiltersByTableName(allTables.value)
      });
      emitPatch(patchTablesWithSelection(allTables.value, selectedNames.value), 'Table selections saved');
    }
    closeTableDialog();
  } catch (caught) {
    tableError.value = readError(caught, 'Table workflow could not be saved.');
    emit('error', tableError.value);
  } finally {
    isSavingTables.value = false;
  }
}

function openTableFilters(table: AdminDataSourceTable): void {
  filterScope.value = 'table';
  filterTableName.value = table.name;
  filterConditions.value = cloneFilters(table.defaultFilters);
  filterError.value = '';
  filterOpen.value = true;
}

async function saveFilters(): Promise<void> {
  if (!source.value) return;
  const filters = filterConditions.value.filter(condition => condition.column.trim());
  isSavingFilters.value = true;
  filterError.value = '';
  try {
    if (filterScope.value === 'source') {
      await updateAdminDataSourceDefaultFilters(source.value, filters);
      publishPatch({ defaultFilters: filters, sourceId: source.value.id, status: 'Filters saved' });
    } else {
      const nextTables = patchTableFilters(allTables.value, filterTableName.value, filters);
      await saveAdminDataSourceTables(source.value.id, {
        selectedTables: selectedTableNamesForSave(nextTables),
        defaultFilters: defaultFiltersByTableName(nextTables)
      });
      emitPatch(nextTables, 'Filters saved');
    }
    filterOpen.value = false;
  } catch (caught) {
    filterError.value = readError(caught, 'Filters could not be saved.');
    emit('error', filterError.value);
  } finally {
    isSavingFilters.value = false;
  }
}

function emitPatch(tables: AdminDataSourceTable[], status: string): void {
  if (!source.value) return;
  publishPatch({ sourceId: source.value.id, status, tables });
}

function publishPatch(patch: AdminDataSourceWorkflowPatch): void {
  emit('status', patch.status);
  loadedTables.value = patch.tables ?? loadedTables.value;
  emit('patch', patch);
}

function selectedTableNamesForSave(tables: AdminDataSourceTable[]): string[] {
  return tableDialogMode.value === 'tables'
    ? selectedNames.value
    : tables.filter(table => table.isSelected).map(table => table.name);
}

function defaultFiltersByTableName(tables: AdminDataSourceTable[]): Record<string, AdminDataSourceFilterCondition[]> {
  return Object.fromEntries(tables
    .filter(table => table.defaultFilters.length > 0)
    .map(table => [table.name, table.defaultFilters]));
}

function cloneFilters(filters: AdminDataSourceFilterCondition[]): AdminDataSourceFilterCondition[] {
  return filters.map((filter, index) => ({ ...filter, id: filter.id || `filter-${index + 1}` }));
}

function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
</script>

<template>
  <AdminDataSourceTableWorkflowDialog
    :available-tables="tableDialogAvailableTables"
    :error="tableError"
    :is-loading="isLoadingTables"
    :is-saving="isSavingTables"
    :mode="tableDialogMode ?? 'tables'"
    :open="tableDialogOpen"
    :search-query="searchQuery"
    :selected-names="selectedNames"
    :selected-tables="tableDialogSelectedTables"
    :source-name="source?.name ?? 'Data source'"
    :resource-label="resourceLabel"
    :resource-label-singular="resourceLabelSingular"
    @close="closeTableDialog"
    @deselect-all="deselectAll"
    @save="saveTableDialog"
    @select-all="selectAllVisible"
    @table-filters="openTableFilters"
    @toggle="toggleSelection"
    @update:search-query="searchQuery = $event"
  />

  <AdminDataSourceFilterDialog
    v-model="filterConditions"
    :available-fields="filterFields"
    :error="filterError"
    :is-saving="isSavingFilters"
    :open="filterOpen"
    :title="filterTitle"
    @close="filterOpen = false"
    @save="saveFilters"
  />
</template>
