<script setup lang="ts">
import { computed } from 'vue';
import type { FilterDraft } from '../../agent-context/planner-filters';
import type {
  BuilderDataSource,
  Dashboard,
  DashboardFilter,
  DashboardFilterCreatePatch,
  DashboardFilterPatch,
  DashboardRunConfiguration
} from '../../types';
import type { VisualizationDataRequestContext } from '../../visualization/data';
import DashboardCanvas from '../DashboardCanvas.vue';
import DashboardFilterBar from '../DashboardFilterBar.vue';

const DEFAULT_CANVAS_BACKGROUND = '#f8fbff';
const DEFAULT_CANVAS_TEXT = '#0f172a';

const props = defineProps<{
  canEditDashboard: boolean;
  dashboard: Dashboard;
  dataSources: BuilderDataSource[];
  editorFocusElementId: string;
  filterDraft: FilterDraft;
  runConfiguration: DashboardRunConfiguration;
  selectedDataSourceId: string;
  selectedTableId: string;
  useMobileFilterPanel: boolean;
  visibleDashboardFilters: DashboardFilter[];
  visualizationRequest?: VisualizationDataRequestContext;
}>();

const emit = defineEmits<{
  changeFilter: [filterId: string, patch: DashboardFilterPatch];
  clearElementSelection: [];
  cloneElement: [elementId: string];
  createFilter: [patch: DashboardFilterCreatePatch];
  createManualElement: [type: string, chartType?: string, dropX?: number, dropY?: number];
  editElement: [elementId: string];
  openFilterEditor: [request: { elementId: string; filterId?: string }];
  removeElement: [elementId: string];
  removeFilter: [filterId: string];
  updateElementConfig: [
    elementId: string,
    patch: { chartType?: string; config: Record<string, unknown>; name?: string }
  ];
  updateElementLayout: [elementId: string, layout: Record<string, number>];
}>();

const canvasStyle = computed(() => {
  return {
    background: DEFAULT_CANVAS_BACKGROUND,
    '--canvas-bg': DEFAULT_CANVAS_BACKGROUND,
    '--canvas-text': DEFAULT_CANVAS_TEXT
  };
});
</script>

<template>
  <section
    class="dashboard-canvas-area"
    aria-labelledby="selected-dashboard-title"
    :style="canvasStyle"
  >
    <span id="selected-dashboard-title" class="sr-only">{{ dashboard.name }}</span>
    <DashboardFilterBar
      v-if="visibleDashboardFilters.length > 0 && !useMobileFilterPanel"
      :can-edit-dashboard="canEditDashboard"
      :create-draft="filterDraft"
      :create-request-key="0"
      :dashboard-elements="dashboard.elements"
      :data-sources="dataSources"
      :filters="visibleDashboardFilters"
      :selected-data-source-id="selectedDataSourceId"
      :selected-table-id="selectedTableId"
      :visualization-request="visualizationRequest"
      @create="emit('createFilter', $event)"
      @update="(filterId, patch) => emit('changeFilter', filterId, patch)"
      @remove="emit('removeFilter', $event)"
    />
    <DashboardCanvas
      :dashboard="dashboard"
      :can-edit-dashboard="canEditDashboard"
      :data-sources="dataSources"
      :dashboard-settings="dashboard.settings"
      :editor-focus-element-id="editorFocusElementId"
      :run-configuration="runConfiguration"
      :visualization-request="visualizationRequest"
      @clear-edit="emit('clearElementSelection')"
      @clone="emit('cloneElement', $event)"
      @edit="emit('editElement', $event)"
      @configure-filter="emit('editElement', $event)"
      @change-filter="(filterId, patch) => emit('changeFilter', filterId, patch)"
      @remove="emit('removeElement', $event)"
      @open-filter-editor="emit('openFilterEditor', $event)"
      @update-config="(elementId, patch) => emit('updateElementConfig', elementId, patch)"
      @update-layout="(elementId, layout) => emit('updateElementLayout', elementId, layout)"
      @drop-component="(type, chartType, gx, gy) => emit('createManualElement', type, chartType, gx, gy)"
    />
  </section>
</template>
