<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { GridItem, GridLayout } from 'vue3-grid-layout';
import type { DashboardElement } from '../types';
import { clearVisualizationQueue } from '../visualization/load-queue';
import { resolveDashboardRunRowLimit } from '../runtime/dashboard-run-limits';
import { shouldShowDashboardElementHeader } from './canvas/dashboard-element-header';
import DashboardCanvasElementCard from './DashboardCanvasElementCard.vue';
import DashboardComponentDataDialog from './DashboardComponentDataDialog.vue';
import DashboardComponentDownloadDialog from './DashboardComponentDownloadDialog.vue';
import DashboardComponentExpandDialog from './DashboardComponentExpandDialog.vue';
import DashboardComponentInfoDialog from './DashboardComponentInfoDialog.vue';
import DashboardRuntimeCrossFilterBar from './DashboardRuntimeCrossFilterBar.vue';
import type { DashboardCanvasEmit, DashboardCanvasProps } from './dashboard-canvas-types';
import { useDashboardCanvasDialogs } from './useDashboardCanvasDialogs';
import { useDashboardCanvasElementMeta } from './useDashboardCanvasElementMeta';
import { useDashboardCanvasFilters } from './useDashboardCanvasFilters';
import { useDashboardCanvasLayout } from './useDashboardCanvasLayout';
import { useDashboardCanvasRunState } from './useDashboardCanvasRunState';

const props = defineProps<DashboardCanvasProps>();
const emit = defineEmits<DashboardCanvasEmit>();

const activeRowLimit = computed(() => resolveDashboardRunRowLimit(props.runConfiguration, props.canEditDashboard));

function showElementHeader(element: DashboardElement): boolean {
  return shouldShowDashboardElementHeader(element);
}

const {
  clearAllRuntimeCrossFilters,
  elementPassesVisibilityRules,
  filtersForElement,
  handleChartCrossFilter,
  handleFilterChange,
  removeRuntimeCrossFilter,
  rendererFiltersForElement,
  runtimeCrossFilters
} = useDashboardCanvasFilters(props, emit);

const {
  canvasElements,
  canvasGridProps,
  canvasPanelRef,
  containerChildren,
  elementLayout,
  gridItemProps,
  gridLayoutKey,
  handleContentResize,
  hasEditorFocus,
  isDragOver,
  isMobileCanvas,
  layoutStyle,
  onCanvasDragLeave,
  onCanvasDragOver,
  onCanvasDrop,
  onGridLayoutUpdated,
  orderedElements,
  requestCanvasResize,
  requestCanvasResizeAfterRender
} = useDashboardCanvasLayout(props, emit, {
  elementPassesVisibilityRules,
  showElementHeader
});

const {
  closeSettingsMenu,
  patchRunState,
  runState,
  setSettingsButtonRef,
  setSettingsMenuRef,
  settingsMenuStyle,
  toggleRun,
  toggleSettings
} = useDashboardCanvasRunState(props);

const {
  canDownloadElement,
  canExpandElement,
  canViewElementData,
  componentDensity,
  componentLabel,
  editActionLabel,
  editActionTitle,
  elementChartSpacingPreset,
  fieldsActionName,
  fieldsActionTitle,
  indicatorSummary,
  isChromeNoneElement,
  isDisabledByEditorFocus,
  isFlushKpiCardElement,
  isFocusedElement,
  isTwoRowCardElement,
  matchingParameterFilters,
  missingParameterLabels,
  runLabel,
  showComponentActions,
  showFieldsAction,
  showInlineComponentIndicators,
  showRunAction,
  useCompactComponentActions
} = useDashboardCanvasElementMeta(props, {
  containerChildren,
  elementLayout,
  filtersForElement,
  hasEditorFocus,
  isMobileCanvas,
  runState,
  showElementHeader
});

const {
  closeDownloadDialog,
  closeExpandedElement,
  closeInfo,
  closeViewData,
  confirmDownload,
  currentDownloadTarget,
  currentInfoElement,
  downloadElement,
  downloadError,
  downloadFormat,
  downloadLoading,
  expandedElement,
  expandElement,
  infoInitialTab,
  infoSummary,
  openDownloadDialog,
  openInfo,
  openInfoFromMenu,
  openViewData,
  previewCellValue,
  saveInfoSettings,
  viewDataElement,
  viewDataError,
  viewDataLoading,
  viewDataPreview
} = useDashboardCanvasDialogs(props, emit, {
  activeRowLimit,
  closeSettingsMenu,
  filtersForElement,
  orderedElements
});

watch(() => props.dashboard.id, () => {
  clearVisualizationQueue();
});

onBeforeUnmount(() => {
  clearVisualizationQueue();
});

function rendererLoading(elementId: string): void {
  patchRunState(elementId, { isLoading: true });
  requestCanvasResize();
}

function rendererSettled(elementId: string): void {
  patchRunState(elementId, { hasRun: true, isLoading: false });
  requestCanvasResizeAfterRender();
}

function cloneElement(elementId: string): void {
  closeSettingsMenu(elementId);
  emit('clone', elementId);
}

function editElementFromMenu(elementId: string): void {
  closeSettingsMenu(elementId);
  emit('edit', elementId);
}

function removeElementFromMenu(elementId: string): void {
  closeSettingsMenu(elementId);
  emit('remove', elementId);
}

function removeFilterElement(elementId: string): void {
  emit('remove', elementId);
}

function toggleElementEdit(element: DashboardElement): void {
  if (isFocusedElement(element)) {
    emit('clearEdit');
    return;
  }
  emit('edit', element.id);
}
</script>

<template>
  <section
    ref="canvasPanelRef"
    class="dashboard-canvas-panel"
    :class="{ 'canvas-drag-active': isDragOver, 'dashboard-canvas-panel--edit': canEditDashboard }"
    aria-label="Dashboard canvas"
    @dragover.prevent="onCanvasDragOver"
    @dragleave="onCanvasDragLeave"
    @drop.prevent="onCanvasDrop"
  >
    <DashboardRuntimeCrossFilterBar
      :filters="runtimeCrossFilters"
      @clear="clearAllRuntimeCrossFilters"
      @remove="removeRuntimeCrossFilter"
    />

    <component
      :is="canEditDashboard ? GridLayout : 'div'"
      :key="gridLayoutKey"
      class="dashboard-canvas-elements"
      :class="{ 'dashboard-canvas-elements--edit': canEditDashboard }"
      role="region"
      aria-label="Dashboard elements"
      v-bind="canvasGridProps"
      @layout-updated="onGridLayoutUpdated"
    >
      <component
        :is="canEditDashboard ? GridItem : 'article'"
        v-for="element in canvasElements"
        :key="element.id"
        class="dashboard-canvas-item"
        :class="{ 'dashboard-canvas-item--edit': canEditDashboard }"
        :style="canEditDashboard ? undefined : layoutStyle(element)"
        v-bind="gridItemProps(element)"
      >
        <DashboardCanvasElementCard
          :can-download-element="canDownloadElement"
          :can-edit-dashboard="canEditDashboard"
          :can-expand-element="canExpandElement"
          :can-view-element-data="canViewElementData"
          :component-density="componentDensity"
          :container-children="containerChildren"
          :dashboard-elements="dashboard.elements"
          :dashboard-settings="dashboardSettings"
          :edit-action-label="editActionLabel"
          :edit-action-title="editActionTitle"
          :element="element"
          :element-chart-spacing-preset="elementChartSpacingPreset"
          :fields-action-name="fieldsActionName"
          :fields-action-title="fieldsActionTitle"
          :filters="rendererFiltersForElement(element)"
          :indicator-summary="indicatorSummary"
          :is-chrome-none-element="isChromeNoneElement"
          :is-disabled-by-editor-focus="isDisabledByEditorFocus"
          :is-flush-kpi-card-element="isFlushKpiCardElement"
          :is-focused-element="isFocusedElement"
          :is-two-row-card-element="isTwoRowCardElement"
          :matching-parameter-filters="matchingParameterFilters"
          :missing-parameter-labels="missingParameterLabels"
          :row-limit="activeRowLimit"
          :run-label="runLabel"
          :run-state="runState"
          :settings-menu-style="settingsMenuStyle"
          :show-component-actions="showComponentActions"
          :show-element-header="showElementHeader"
          :show-fields-action="showFieldsAction"
          :show-inline-component-indicators="showInlineComponentIndicators"
          :show-run-action="showRunAction"
          :use-compact-component-actions="useCompactComponentActions"
          :visualization-request="visualizationRequest"
          @chart-cross-filter="handleChartCrossFilter"
          @clone="cloneElement"
          @configure-filter="elementId => emit('configureFilter', elementId)"
          @content-resize="handleContentResize"
          @edit-from-menu="editElementFromMenu"
          @expand="expandElement"
          @filter-change="handleFilterChange"
          @open-download="openDownloadDialog"
          @open-filter-editor="request => emit('openFilterEditor', request)"
          @open-info="openInfo"
          @open-info-from-menu="openInfoFromMenu"
          @open-view-data="openViewData"
          @remove-filter-element="removeFilterElement"
          @remove-from-menu="removeElementFromMenu"
          @renderer-loading="rendererLoading"
          @renderer-settled="rendererSettled"
          @set-settings-button-ref="setSettingsButtonRef"
          @set-settings-menu-ref="setSettingsMenuRef"
          @toggle-edit="toggleElementEdit"
          @toggle-run="toggleRun"
          @toggle-settings="toggleSettings"
        />
      </component>
    </component>

    <DashboardComponentDataDialog
      v-if="viewDataElement"
      :component-label="componentLabel"
      :element="viewDataElement"
      :error="viewDataError"
      :indicator-summary="indicatorSummary"
      :loading="viewDataLoading"
      :preview="viewDataPreview"
      :preview-cell-value="previewCellValue"
      @close="closeViewData"
    />

    <DashboardComponentExpandDialog
      v-if="expandedElement"
      :can-download-element="canDownloadElement"
      :dashboard-elements="orderedElements"
      :dashboard-settings="dashboardSettings"
      :element="expandedElement"
      :filters="filtersForElement(expandedElement)"
      :row-limit="activeRowLimit"
      :run-state="runState"
      :visualization-request="visualizationRequest"
      @chart-cross-filter="handleChartCrossFilter"
      @close="closeExpandedElement"
      @filter-change="handleFilterChange"
      @open-download="openDownloadDialog"
      @renderer-loading="rendererLoading"
      @renderer-settled="rendererSettled"
    />

    <DashboardComponentDownloadDialog
      v-if="downloadElement"
      v-model:format="downloadFormat"
      :component-label="componentLabel"
      :element="downloadElement"
      :error="downloadError"
      :loading="downloadLoading"
      :target="currentDownloadTarget"
      @close="closeDownloadDialog"
      @confirm="confirmDownload"
    />

    <DashboardComponentInfoDialog
      :dashboard-elements="orderedElements"
      :element="currentInfoElement"
      :initial-tab="infoInitialTab"
      :summary="infoSummary"
      @close="closeInfo"
      @save="saveInfoSettings"
    />
  </section>
</template>
