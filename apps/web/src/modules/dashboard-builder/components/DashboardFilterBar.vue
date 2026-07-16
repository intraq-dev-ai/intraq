<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import type { FilterDraft } from '../agent-context/planner-filters';
import type {
  BuilderDataSource,
  DashboardElement,
  DashboardFilter,
  DashboardFilterCreatePatch,
  DashboardFilterPatch
} from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';
import DashboardFilterEditorDialog from './DashboardFilterEditorDialog.vue';
import DashboardFilterBarItem from './DashboardFilterBarItem.vue';
import { useDashboardFilterDynamicOptions } from './useDashboardFilterDynamicOptions';

const props = defineProps<{
  canEditDashboard: boolean;
  createDraft: FilterDraft;
  createRequestKey: number;
  dashboardElements: DashboardElement[];
  dataSources: BuilderDataSource[];
  filters: DashboardFilter[];
  selectedDataSourceId: string;
  selectedTableId: string;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>();

const emit = defineEmits<{
  create: [patch: DashboardFilterCreatePatch];
  update: [filterId: string, patch: DashboardFilterPatch];
  remove: [filterId: string];
}>();

const editingFilterId = ref('');
const openFilterMenuId = ref('');
const isCreatingFilter = ref(false);
const filtersRef = toRef(props, 'filters');
const visualizationRequestRef = toRef(props, 'visualizationRequest');
const {
  fetchedOptionsByFilter,
  fetchedOptionsLoadedByFilter
} = useDashboardFilterDynamicOptions(filtersRef, visualizationRequestRef);

const editingFilter = computed(() => props.filters.find(filter => filter.id === editingFilterId.value) ?? null);
const editorOpen = computed(() => isCreatingFilter.value || editingFilter.value !== null);

watch(() => props.createRequestKey, (next, previous) => {
  if (next > 0 && next !== previous) openCreateEditor();
});

function openEditor(filter: DashboardFilter): void {
  openFilterMenuId.value = '';
  isCreatingFilter.value = false;
  editingFilterId.value = filter.id;
}

function toggleFilterMenu(filter: DashboardFilter): void {
  openFilterMenuId.value = openFilterMenuId.value === filter.id ? '' : filter.id;
}

function removeFilter(filter: DashboardFilter): void {
  openFilterMenuId.value = '';
  emit('remove', filter.id);
}

function openCreateEditor(): void {
  editingFilterId.value = '';
  isCreatingFilter.value = true;
}

function closeEditor(): void {
  editingFilterId.value = '';
  isCreatingFilter.value = false;
}

function handleFilterUpdate(filterId: string, patch: DashboardFilterPatch): void {
  emit('update', filterId, patch);
}

defineExpose({ openEditor });
</script>

<template>
  <section class="dashboard-filter-bar" aria-label="Dashboard filters">
    <DashboardFilterBarItem
      v-for="filter in filters"
      :key="filter.id"
      :actions-open="openFilterMenuId === filter.id"
      :can-edit-dashboard="canEditDashboard"
      :fetched-options-by-filter="fetchedOptionsByFilter"
      :fetched-options-loaded-by-filter="fetchedOptionsLoadedByFilter"
      :filter="filter"
      @edit="openEditor"
      @remove="removeFilter"
      @toggle-actions="toggleFilterMenu"
      @update="handleFilterUpdate"
    />
    <div v-if="filters.length === 0" class="empty-filters">
      <span aria-hidden="true">Filter</span>
      <p>{{ canEditDashboard ? 'No filters added yet' : 'No active filters' }}</p>
    </div>

    <DashboardFilterEditorDialog
      v-if="editorOpen"
      :create-draft="createDraft"
      :dashboard-elements="dashboardElements"
      :data-sources="dataSources"
      :editing-filter="editingFilter"
      :filters-count="filters.length"
      :selected-data-source-id="selectedDataSourceId"
      :selected-table-id="selectedTableId"
      suggested-target-element-id=""
      @close="closeEditor"
      @create="(patch) => { emit('create', patch); closeEditor(); }"
      @update="(filterId, patch) => { emit('update', filterId, patch); closeEditor(); }"
    />
  </section>
</template>
