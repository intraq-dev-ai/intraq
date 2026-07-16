<script setup lang="ts">
import type {
  DashboardElement,
  DashboardFilter,
  DashboardFilterPatch,
  DashboardSettings
} from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';
import type { ChartCrossFilterSelection } from '../visualization/chart-interactions';
import { usesAutoContentHeight } from './canvas/dashboard-canvas-layout';
import type { DashboardCanvasIndicatorSummary, DashboardCanvasInfoTab } from './canvas/dashboard-canvas-indicators';
import type { ComponentRunState } from './dashboard-canvas-types';
import DashboardCanvasElementActions from './DashboardCanvasElementActions.vue';
import DashboardElementRenderer from './DashboardElementRenderer.vue';

defineProps<{
  canDownloadElement: (element: DashboardElement) => boolean;
  canEditDashboard: boolean;
  canExpandElement: (element: DashboardElement) => boolean;
  canViewElementData: (element: DashboardElement) => boolean;
  componentDensity: (element: DashboardElement) => string | undefined;
  dashboardElements: DashboardElement[];
  dashboardSettings?: DashboardSettings | undefined;
  editActionLabel: (element: DashboardElement) => string;
  editActionTitle: (element: DashboardElement) => string;
  element: DashboardElement;
  elementChartSpacingPreset: (element: DashboardElement) => string | undefined;
  fieldsActionName: (element: DashboardElement) => string;
  fieldsActionTitle: (element: DashboardElement) => string;
  filters: DashboardFilter[];
  indicatorSummary: (element: DashboardElement) => DashboardCanvasIndicatorSummary;
  isChromeNoneElement: (element: DashboardElement) => boolean;
  isDisabledByEditorFocus: (element: DashboardElement) => boolean;
  isFlushKpiCardElement: (element: DashboardElement) => boolean;
  isFocusedElement: (element: DashboardElement) => boolean;
  isTwoRowCardElement: (element: DashboardElement) => boolean;
  matchingParameterFilters: (element: DashboardElement) => DashboardFilter[];
  missingParameterLabels: (element: DashboardElement) => string[];
  rowLimit?: number | undefined;
  runLabel: (element: DashboardElement) => string;
  runState: (elementId: string) => ComponentRunState;
  settingsMenuStyle: (elementId: string) => Record<string, string>;
  showComponentActions: (element: DashboardElement) => boolean;
  showElementHeader: (element: DashboardElement) => boolean;
  showFieldsAction: (element: DashboardElement) => boolean;
  showInlineComponentIndicators: (element: DashboardElement) => boolean;
  showRunAction: (element: DashboardElement) => boolean;
  useCompactComponentActions: (element: DashboardElement) => boolean;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
  containerChildren: (element: DashboardElement) => DashboardElement[];
}>();

const emit = defineEmits<{
  chartCrossFilter: [elementId: string, selection: ChartCrossFilterSelection];
  clone: [elementId: string];
  configureFilter: [elementId: string];
  contentResize: [elementId: string, height: number];
  editFromMenu: [elementId: string];
  expand: [element: DashboardElement];
  filterChange: [filterId: string, patch: DashboardFilterPatch];
  openDownload: [element: DashboardElement];
  openFilterEditor: [request: { elementId: string; filterId?: string }];
  openInfo: [element: DashboardElement, tab: DashboardCanvasInfoTab];
  openInfoFromMenu: [element: DashboardElement, tab: DashboardCanvasInfoTab];
  openViewData: [element: DashboardElement];
  removeFilterElement: [elementId: string];
  removeFromMenu: [elementId: string];
  rendererLoading: [elementId: string];
  rendererSettled: [elementId: string];
  setSettingsButtonRef: [elementId: string, element: unknown];
  setSettingsMenuRef: [elementId: string, element: unknown];
  toggleEdit: [element: DashboardElement];
  toggleRun: [elementId: string];
  toggleSettings: [elementId: string];
}>();
</script>

<template>
  <article
    class="dashboard-canvas-card dashboard-card"
    :class="{
      'dashboard-canvas-card--editable': canEditDashboard,
      'dashboard-canvas-card--view': !canEditDashboard,
      'dashboard-canvas-card--editor-focused': isFocusedElement(element),
      'dashboard-canvas-card--editor-disabled': isDisabledByEditorFocus(element),
      'dashboard-canvas-card--chrome-none': isChromeNoneElement(element),
      'dashboard-canvas-card--flush-kpi': isFlushKpiCardElement(element),
      'dashboard-canvas-card--headerless': !showElementHeader(element),
      'dashboard-canvas-card--auto-content-height': !canEditDashboard && usesAutoContentHeight(element),
      'dashboard-canvas-card--two-row-card': isTwoRowCardElement(element)
    }"
    :data-component-kind="element.type"
    :data-component-density="componentDensity(element)"
    :data-chart-spacing-preset="elementChartSpacingPreset(element)"
    :aria-label="`${element.name} component`"
    :aria-disabled="isDisabledByEditorFocus(element)"
    :inert="isDisabledByEditorFocus(element)"
  >
    <DashboardCanvasElementActions
      :can-download-element="canDownloadElement"
      :can-edit-dashboard="canEditDashboard"
      :can-expand-element="canExpandElement"
      :can-view-element-data="canViewElementData"
      :edit-action-label="editActionLabel"
      :edit-action-title="editActionTitle"
      :element="element"
      :fields-action-name="fieldsActionName"
      :fields-action-title="fieldsActionTitle"
      :indicator-summary="indicatorSummary"
      :is-focused-element="isFocusedElement"
      :run-label="runLabel"
      :run-state="runState"
      :settings-menu-style="settingsMenuStyle"
      :show-component-actions="showComponentActions"
      :show-fields-action="showFieldsAction"
      :show-inline-component-indicators="showInlineComponentIndicators"
      :show-run-action="showRunAction"
      :use-compact-component-actions="useCompactComponentActions"
      @clone="event => emit('clone', event)"
      @edit-from-menu="event => emit('editFromMenu', event)"
      @expand="event => emit('expand', event)"
      @open-download="event => emit('openDownload', event)"
      @open-info="(target, tab) => emit('openInfo', target, tab)"
      @open-info-from-menu="(target, tab) => emit('openInfoFromMenu', target, tab)"
      @open-view-data="event => emit('openViewData', event)"
      @remove-from-menu="event => emit('removeFromMenu', event)"
      @set-settings-button-ref="(elementId, node) => emit('setSettingsButtonRef', elementId, node)"
      @set-settings-menu-ref="(elementId, node) => emit('setSettingsMenuRef', elementId, node)"
      @toggle-edit="event => emit('toggleEdit', event)"
      @toggle-run="event => emit('toggleRun', event)"
      @toggle-settings="event => emit('toggleSettings', event)"
    />

    <header v-if="showElementHeader(element)" class="dashboard-element-header">
      <div class="dashboard-element-title">
        <h3>{{ element.name }}</h3>
      </div>
    </header>
    <div
      v-if="canEditDashboard && missingParameterLabels(element).length > 0"
      class="dashboard-parameter-warning"
      role="status"
    >
      <p class="dashboard-render-state-title">Map parameters to view this component</p>
      <p class="dashboard-render-state-detail">Missing parameters: {{ missingParameterLabels(element).join(', ') }}</p>
      <div class="dashboard-parameter-warning-actions">
        <button
          type="button"
          class="dashboard-parameter-warning-button"
          @click="emit('openFilterEditor', { elementId: element.id })"
        >
          Create Parameter Filter
        </button>
        <button
          v-for="filter in matchingParameterFilters(element)"
          :key="filter.id"
          type="button"
          class="dashboard-parameter-warning-button dashboard-parameter-warning-button--secondary"
          :title="`Reuse ${filter.name}`"
          @click="emit('openFilterEditor', { elementId: element.id, filterId: filter.id })"
        >
          Use Existing Filter: {{ filter.name }}
        </button>
      </div>
    </div>
    <DashboardElementRenderer
      v-else
      :dashboard-elements="dashboardElements"
      :container-children="containerChildren(element)"
      :element="element"
      :filters="filters"
      :dashboard-settings="dashboardSettings"
      :row-limit="rowLimit"
      :run-token="runState(element.id).runToken"
      :cancel-token="runState(element.id).cancelToken"
      :can-edit-dashboard="canEditDashboard"
      :has-element-header="showElementHeader(element)"
      :visualization-request="visualizationRequest"
      @loading="event => emit('rendererLoading', event)"
      @loaded="event => emit('rendererSettled', event)"
      @error="event => emit('rendererSettled', event)"
      @content-resize="(elementId, height) => emit('contentResize', elementId, height)"
      @chart-cross-filter="(elementId, selection) => emit('chartCrossFilter', elementId, selection)"
      @filter-change="(filterId, patch) => emit('filterChange', filterId, patch)"
      @configure-filter="event => emit('configureFilter', event)"
      @remove-filter-element="event => emit('removeFilterElement', event)"
    />
  </article>
</template>
