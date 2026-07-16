<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { FilterDraft } from '../agent-context/planner-filters';
import type {
  BuilderDataSource,
  Dashboard,
  DashboardElement,
  DashboardFilter,
  DashboardFilterCreatePatch,
  DashboardFilterPatch,
  DashboardRunConfiguration,
  DashboardSettings
} from '../types';
import DashboardHomePage from './DashboardHomePage.vue';
import DashboardManualSidebar from './manual-sidebar/DashboardManualSidebar.vue';
import DashboardFilterEditorDialog from './DashboardFilterEditorDialog.vue';
import DashboardWorkspaceHeader from './DashboardWorkspaceHeader.vue';
import DashboardMobileActions from './DashboardMobileActions.vue';
import DashboardWorkspaceCanvasArea from './workspace/DashboardWorkspaceCanvasArea.vue';
import DashboardWorkspaceMobileFilterDialog from './workspace/DashboardWorkspaceMobileFilterDialog.vue';
import DashboardWorkspaceMobileViewerActions from './workspace/DashboardWorkspaceMobileViewerActions.vue';
import {
  autoCreatedParameterFilterPatch,
  buildVisualizationRequest,
  visibleFilterBarFilters
} from './workspace/dashboard-workspace-main-utils';
import type { DashboardVersion } from '../types';
import type { SaveElementPatch } from './editor/useDashboardElementEditor';
import { autoCreateParameterFiltersForElement } from './parameterized-data-sources';

const props = defineProps<{
  aiFeaturesEnabled?: boolean;
  canConfigurePreviewDataScope?: boolean;
  canEditDashboard: boolean;
  canUseDashboard: boolean;
  dashboard: Dashboard | null;
  dashboards: Dashboard[];
  dataSources: BuilderDataSource[];
  editorFocusElementId: string;
  filterCreateRequestKey: number;
  hasUnsavedChanges: boolean;
  filterDraft: FilterDraft;
  isDashboardRunning: boolean;
  isDashboardHome: boolean;
  isSaving: boolean;
  manualMode: boolean;
  pageTitle: string;
  previewDataScope?: Record<string, unknown>;
  recentDashboardIds: string[];
  runConfiguration: DashboardRunConfiguration;
  isAnalyzerOpen: boolean;
  selectedDataSourceId: string;
  selectedElement: DashboardElement | null;
  selectedTableId: string;
  versions: DashboardVersion[];
}>();

const emit = defineEmits<{
  addFilter: [];
  cancelEdit: [];
  cancelRun: [];
  changeFilter: [filterId: string, patch: DashboardFilterPatch];
  clearElementSelection: [];
  cloneElement: [elementId: string];
  configureRun: [
    runtime: string,
    scheduled: boolean,
    editModeRowLimit?: number,
    viewModeRowLimit?: number
  ];
  copyEmbed: [];
  createFilter: [patch: DashboardFilterCreatePatch];
  createManualElement: [type: string, chartType?: string, dropX?: number, dropY?: number];
  'update:manualMode': [value: boolean];
  deleteDashboard: [];
  duplicate: [];
  editElement: [elementId: string];
  emailReport: [];
  exportDashboard: [format: 'json' | 'xml' | 'excel' | 'csv' | 'pdf'];
  exportAdvancedPdf: [];
  importDashboard: [];
  openAnalyzer: [];
  openHistory: [];
  publish: [];
  removeElement: [elementId: string];
  removeFilter: [filterId: string];
  rename: [name: string, category: string, categoryId?: string | null];
  restoreVersion: [versionId: string];
  runDashboard: [];
  selectDataSource: [id: string];
  selectDataTable: [id: string];
  saveDraft: [];
  saveElement: [patch: SaveElementPatch];
  setDashboardFavorite: [dashboardId: string, isFavorite: boolean];
  updatePreviewDataScope: [values: Record<string, unknown>];
  updateElementConfig: [elementId: string, patch: { chartType?: string; config: Record<string, unknown>; name?: string }];
  updateElementLayout: [elementId: string, layout: Record<string, number>];
  updateDashboardSettings: [settings: DashboardSettings];
}>();

const mobileFiltersOpen = ref(false);
const mobileFilterQuery = ref<MediaQueryList | null>(null);
const isMobileViewport = ref(false);
const editingFilter = ref<DashboardFilter | null>(null);
const filterEditorTargetElementId = ref('');
const isCreatingFilter = ref(false);
const editorOpen = computed(() => isCreatingFilter.value || editingFilter.value !== null);
const MOBILE_FILTER_QUERY = '(max-width: 760px)';
const visibleDashboardFilters = computed(() => props.dashboard ? visibleFilterBarFilters(props.dashboard) : []);
const useMobileFilterPanel = computed(() => isMobileViewport.value && visibleDashboardFilters.value.length > 0);
const visualizationRequest = computed(() => buildVisualizationRequest(props.dashboard, props.previewDataScope));

function handleMobileFilterQueryChange(event: MediaQueryListEvent): void {
  isMobileViewport.value = event.matches;
}

onMounted(() => {
  if (typeof window === 'undefined') return;
  const query = window.matchMedia(MOBILE_FILTER_QUERY);
  mobileFilterQuery.value = query;
  isMobileViewport.value = query.matches;
  query.addEventListener('change', handleMobileFilterQueryChange);
});

onBeforeUnmount(() => {
  mobileFilterQuery.value?.removeEventListener('change', handleMobileFilterQueryChange);
});

watch(useMobileFilterPanel, enabled => {
  if (!enabled) mobileFiltersOpen.value = false;
});

function emitRename(name: string, category: string, categoryId?: string | null): void {
  emit('rename', name, category, categoryId);
}

function emitConfigureRun(
  runtime: string,
  scheduled: boolean,
  editModeRowLimit?: number,
  viewModeRowLimit?: number
): void {
  emit('configureRun', runtime, scheduled, editModeRowLimit, viewModeRowLimit);
}

function openMobileFilters(): void {
  mobileFiltersOpen.value = true;
}

function closeMobileFilters(): void {
  mobileFiltersOpen.value = false;
}

function closeFilterEditor(): void {
  editingFilter.value = null;
  filterEditorTargetElementId.value = '';
  isCreatingFilter.value = false;
}

function openCanvasFilterEditor(request: { elementId: string; filterId?: string }): void {
  if (!props.dashboard) return;
  filterEditorTargetElementId.value = request.elementId;
  if (request.filterId) {
    editingFilter.value = props.dashboard.filters.find(filter => filter.id === request.filterId) ?? null;
    isCreatingFilter.value = editingFilter.value === null;
    if (isCreatingFilter.value) emit('addFilter');
    return;
  }
  const element = props.dashboard.elements.find(item => item.id === request.elementId);
  if (element) {
    const suggestions = autoCreateParameterFiltersForElement(element, props.dataSources, props.dashboard.filters);
    if (suggestions.length > 1) {
      for (const suggestion of suggestions) {
        emit(
          'createFilter',
          autoCreatedParameterFilterPatch(element, suggestion, props.selectedDataSourceId, props.selectedTableId)
        );
      }
      closeFilterEditor();
      return;
    }
  }
  editingFilter.value = null;
  isCreatingFilter.value = true;
  emit('addFilter');
}
</script>

<template>
  <main class="dashboard-main" aria-label="Dashboard workspace">
    <DashboardWorkspaceHeader
      v-if="dashboard"
      :dashboard="dashboard"
      :can-edit-dashboard="canEditDashboard"
      :can-configure-preview-data-scope="canConfigurePreviewDataScope"
      :manual-mode="manualMode"
      :page-title="pageTitle"
      :can-use-dashboard="canUseDashboard"
      :ai-features-enabled="aiFeaturesEnabled"
      :has-unsaved-changes="hasUnsavedChanges"
      :is-dashboard-running="isDashboardRunning"
      :is-analyzer-open="isAnalyzerOpen"
      :is-saving="isSaving"
      :preview-data-scope="previewDataScope"
      :run-configuration="runConfiguration"
      @cancel-edit="emit('cancelEdit')"
      @save-draft="emit('saveDraft')"
      @publish="emit('publish')"
      @duplicate="emit('duplicate')"
      @add-filter="isCreatingFilter = true; emit('addFilter')"
      @rename="emitRename"
      @delete-dashboard="emit('deleteDashboard')"
      @run-dashboard="emit('runDashboard')"
      @cancel-run="emit('cancelRun')"
      @configure-run="emitConfigureRun"
      @update-preview-data-scope="emit('updatePreviewDataScope', $event)"
      @email-report="emit('emailReport')"
      @import-dashboard="emit('importDashboard')"
      @open-analyzer="emit('openAnalyzer')"
      @open-history="emit('openHistory')"
      @copy-embed="emit('copyEmbed')"
      @export-dashboard="emit('exportDashboard', $event)"
      @export-advanced-pdf="emit('exportAdvancedPdf')"
      @set-dashboard-favorite="emit('setDashboardFavorite', $event.dashboardId, $event.isFavorite)"
      @update:manual-mode="$emit('update:manualMode', $event)"
    />

    <DashboardFilterEditorDialog
      v-if="dashboard && editorOpen"
      :create-draft="filterDraft"
      :dashboard-elements="dashboard.elements"
      :data-sources="dataSources"
      :editing-filter="editingFilter"
      :filters-count="dashboard.filters.length"
      :selected-data-source-id="selectedDataSourceId"
      :selected-table-id="selectedTableId"
      :suggested-target-element-id="filterEditorTargetElementId"
      @close="closeFilterEditor"
      @create="(patch) => { emit('createFilter', patch); closeFilterEditor(); }"
      @update="(filterId, patch) => { emit('changeFilter', filterId, patch); closeFilterEditor(); }"
    />

    <div class="dashboard-content">
      <DashboardWorkspaceCanvasArea
        v-if="dashboard"
        :dashboard="dashboard"
        :can-edit-dashboard="canEditDashboard"
        :data-sources="dataSources"
        :editor-focus-element-id="editorFocusElementId"
        :filter-draft="filterDraft"
        :run-configuration="runConfiguration"
        :selected-data-source-id="selectedDataSourceId"
        :selected-table-id="selectedTableId"
        :use-mobile-filter-panel="useMobileFilterPanel"
        :visible-dashboard-filters="visibleDashboardFilters"
        :visualization-request="visualizationRequest"
        @change-filter="(filterId, patch) => emit('changeFilter', filterId, patch)"
        @clear-element-selection="emit('clearElementSelection')"
        @clone-element="emit('cloneElement', $event)"
        @create-filter="emit('createFilter', $event)"
        @create-manual-element="(type, chartType, gx, gy) => emit('createManualElement', type, chartType, gx, gy)"
        @edit-element="emit('editElement', $event)"
        @open-filter-editor="openCanvasFilterEditor"
        @remove-element="emit('removeElement', $event)"
        @remove-filter="emit('removeFilter', $event)"
        @update-element-config="(elementId, patch) => emit('updateElementConfig', elementId, patch)"
        @update-element-layout="(elementId, layout) => emit('updateElementLayout', elementId, layout)"
      />

      <section v-else-if="isDashboardHome" class="dashboard-home-area" aria-labelledby="dashboard-home-title">
        <DashboardHomePage
          :dashboards="dashboards"
          :is-saving="isSaving"
          :recent-dashboard-ids="recentDashboardIds"
          @import-dashboard="emit('importDashboard')"
          @set-dashboard-favorite="emit('setDashboardFavorite', $event.dashboardId, $event.isFavorite)"
        />
      </section>

      <section v-else class="dashboard-canvas-area" aria-labelledby="empty-dashboard-title">
        <div class="dashboard-canvas-card dashboard-empty-state">
          <h2 id="empty-dashboard-title">No dashboard selected</h2>
        </div>
      </section>

      <DashboardManualSidebar
        v-if="canEditDashboard && manualMode"
        :can-edit-dashboard="canEditDashboard"
        :dashboard="dashboard"
        :data-sources="dataSources"
        :is-saving="isSaving"
        :selected-data-source-id="selectedDataSourceId"
        :selected-element="selectedElement"
        :selected-table-id="selectedTableId"
        :versions="versions"
        @change-filter="(filterId, patch) => emit('changeFilter', filterId, patch)"
        @clear-element-selection="emit('clearElementSelection')"
        @create-filter="emit('createFilter', $event)"
        @create-manual-element="(type, chartType) => emit('createManualElement', type, chartType)"
        @remove-filter="emit('removeFilter', $event)"
        @restore-version="emit('restoreVersion', $event)"
        @save-element="emit('saveElement', $event)"
        @select-data-source="$emit('selectDataSource', $event)"
        @select-data-table="$emit('selectDataTable', $event)"
        @update-dashboard-settings="emit('updateDashboardSettings', $event)"
        @update-element-layout="(elementId, layout) => emit('updateElementLayout', elementId, layout)"
      />
    </div>

    <DashboardMobileActions
      v-if="dashboard && canEditDashboard"
      :show-analyzer="aiFeaturesEnabled !== false"
      :show-filters="useMobileFilterPanel"
      @analyzer="emit('openAnalyzer')"
      @export="emit('exportDashboard', 'json')"
      @email="emit('emailReport')"
      @filters="openMobileFilters"
      @info="emit('openHistory')"
    />

    <DashboardWorkspaceMobileViewerActions
      v-if="dashboard && !canEditDashboard"
      :ai-features-enabled="aiFeaturesEnabled"
      :dashboard-id="dashboard.id"
      :is-analyzer-open="isAnalyzerOpen"
      :mobile-filters-open="mobileFiltersOpen"
      :show-filters="useMobileFilterPanel"
      @email-report="emit('emailReport')"
      @export-dashboard="emit('exportDashboard', $event)"
      @open-analyzer="emit('openAnalyzer')"
      @open-filters="openMobileFilters"
      @open-history="emit('openHistory')"
    />

    <DashboardWorkspaceMobileFilterDialog
      v-if="dashboard && useMobileFilterPanel && mobileFiltersOpen"
      :dashboard="dashboard"
      :can-edit-dashboard="canEditDashboard"
      :data-sources="dataSources"
      :filter-draft="filterDraft"
      :filters="visibleDashboardFilters"
      :selected-data-source-id="selectedDataSourceId"
      :selected-table-id="selectedTableId"
      :visualization-request="visualizationRequest"
      @close="closeMobileFilters"
      @create="emit('createFilter', $event)"
      @remove="emit('removeFilter', $event)"
      @update="(filterId, patch) => emit('changeFilter', filterId, patch)"
    />
  </main>
</template>
