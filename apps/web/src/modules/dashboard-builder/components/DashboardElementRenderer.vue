<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DashboardElement, DashboardFilter, DashboardFilterPatch, DashboardSettings } from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';
import { visualizationSpecFromElement } from '../visualization/spec';
import {
  type DashboardMatrixModel,
  type DashboardTableModel,
  cardViewModel,
  elementRenderKind,
  matrixViewModel,
  tableViewModel
} from '../visualization/element-view-model';
import type { ChartCrossFilterSelection } from '../visualization/chart-interactions';
import DashboardAiChatbotRenderer from './renderers/DashboardAiChatbotRenderer.vue';
import DashboardChartRenderer from './renderers/DashboardChartRenderer.vue';
import DashboardContainerRenderer from './renderers/DashboardContainerRenderer.vue';
import DashboardExportButtonRenderer from './renderers/DashboardExportButtonRenderer.vue';
import DashboardFilterElementRenderer from './renderers/DashboardFilterElementRenderer.vue';
import DashboardKpiCardRenderer from './renderers/DashboardKpiCardRenderer.vue';
import DashboardMatrixRenderer from './renderers/DashboardMatrixRenderer.vue';
import DashboardNewsViewRenderer from './renderers/DashboardNewsViewRenderer.vue';
import DashboardTableRenderer from './renderers/DashboardTableRenderer.vue';
import DashboardTextRenderer from './renderers/DashboardTextRenderer.vue';
import {
  dashboardDefaultElement,
  dashboardElementKindLabel
} from './dashboard-element-renderer-model';
import { useDashboardElementContentResize } from './useDashboardElementContentResize';
import { useDashboardElementDataRenderer } from './useDashboardElementDataRenderer';

const props = withDefaults(defineProps<{
  dashboardElements?: DashboardElement[];
  element: DashboardElement;
  filters?: DashboardFilter[];
  dashboardSettings?: DashboardSettings | undefined;
  rowLimit?: number | undefined;
  runToken?: number;
  cancelToken?: number;
  canEditDashboard?: boolean;
  hasElementHeader?: boolean;
  containerChildren?: DashboardElement[];
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>(), {
  filters: () => [],
  containerChildren: () => [],
  runToken: 0,
  cancelToken: 0,
  canEditDashboard: false,
  hasElementHeader: false
});

const emit = defineEmits<{
  chartCrossFilter: [elementId: string, selection: ChartCrossFilterSelection];
  contentResize: [elementId: string, height: number];
  error: [elementId: string, message: string];
  filterChange: [filterId: string, patch: DashboardFilterPatch];
  loaded: [elementId: string];
  loading: [elementId: string];
  configureFilter: [elementId: string];
  removeFilterElement: [elementId: string];
}>();

const rootRef = ref<HTMLElement | null>(null);
const effectiveElement = computed(() => dashboardDefaultElement(props.element, props.dashboardSettings));
const spec = computed(() => visualizationSpecFromElement(effectiveElement.value));
const renderKind = computed(() => elementRenderKind(effectiveElement.value, spec.value));
const kindLabel = computed(() => dashboardElementKindLabel(renderKind.value));
const rendererAriaLabel = computed(() => spec.value.accessibility?.label ?? `${effectiveElement.value.name} ${kindLabel.value}`);

const {
  chartData,
  hasStateMessage,
  isLoading,
  isReady,
  isRefreshing,
  rendererState,
  stateDetail,
  stateTitle,
  status
} = useDashboardElementDataRenderer({
  effectiveElement,
  kindLabel,
  onError: (elementId, message) => emit('error', elementId, message),
  onLoaded: elementId => emit('loaded', elementId),
  onLoading: elementId => emit('loading', elementId),
  props,
  renderKind,
  spec
});

const summaryRows = computed(() => {
  const data = chartData.value;
  if (!data) return [];
  const firstDataset = data.datasets[0];
  return data.labels.map((label, index) => ({
    label,
    value: firstDataset?.data[index] ?? 0
  }));
});
const tableModel = computed<DashboardTableModel>(() => chartData.value
  ? tableViewModel(spec.value, chartData.value, effectiveElement.value)
  : { columns: [], rows: [] });
const cardModel = computed(() => chartData.value ? cardViewModel(spec.value, chartData.value, effectiveElement.value) : null);
const matrixModel = computed<DashboardMatrixModel>(() => chartData.value
  ? matrixViewModel(spec.value, chartData.value, effectiveElement.value)
  : { columns: [], rows: [], showColumnTotals: false, showRowTotals: true });

useDashboardElementContentResize({
  matrixModel,
  onResize: height => emit('contentResize', props.element.id, height),
  renderKind,
  rendererState,
  rootRef,
  tableModel
});
</script>

<template>
  <div ref="rootRef" class="dashboard-element-renderer" :data-kind="renderKind" :aria-label="rendererAriaLabel">
    <div v-if="isRefreshing" class="dashboard-render-refreshing" role="status" aria-label="Refreshing data">
      <span class="dashboard-render-spinner" aria-hidden="true"></span>
    </div>

    <DashboardChartRenderer
      v-if="renderKind === 'chart'"
      :data="chartData"
      :element="effectiveElement"
      :has-element-header="hasElementHeader"
      :has-state-message="hasStateMessage"
      :is-loading="isLoading"
      :is-ready="isReady"
      :renderer-state="rendererState"
      :spec="spec"
      :state-detail="stateDetail"
      :state-title="stateTitle"
      @chart-cross-filter="selection => emit('chartCrossFilter', element.id, selection)"
    />

    <DashboardKpiCardRenderer
      v-else-if="renderKind === 'card'"
      :element-name="element.name"
      :has-state-message="hasStateMessage"
      :is-loading="isLoading"
      :model="cardModel"
      :state-detail="stateDetail"
      :state-title="stateTitle"
    />

    <DashboardFilterElementRenderer
      v-else-if="renderKind === 'filter'"
      :element="element"
      :filters="filters"
      :can-edit-dashboard="canEditDashboard"
      :dashboard-settings="dashboardSettings"
      :visualization-request="visualizationRequest"
      @change="(filterId, patch) => emit('filterChange', filterId, patch)"
      @configure="emit('configureFilter', element.id)"
      @remove="emit('removeFilterElement', element.id)"
    />

    <DashboardContainerRenderer
      v-else-if="renderKind === 'container'"
      :element="element"
      :child-elements="containerChildren"
      :dashboard-elements="dashboardElements"
      :filters="filters"
      :can-edit-dashboard="canEditDashboard"
      :dashboard-settings="dashboardSettings"
      :visualization-request="visualizationRequest"
      @filter-change="(filterId, patch) => emit('filterChange', filterId, patch)"
      @configure-filter="emit('configureFilter', $event)"
      @remove-filter-element="emit('removeFilterElement', $event)"
    />

    <DashboardExportButtonRenderer
      v-else-if="renderKind === 'export'"
      :dashboard-elements="dashboardElements"
      :element="element"
      :filters="filters"
      :visualization-request="visualizationRequest"
    />

    <DashboardNewsViewRenderer
      v-else-if="renderKind === 'news'"
      :element="element"
    />

    <DashboardAiChatbotRenderer
      v-else-if="renderKind === 'chatbot'"
      :element="element"
    />

    <DashboardMatrixRenderer
      v-else-if="renderKind === 'matrix'"
      :element-name="element.name"
      :has-state-message="hasStateMessage"
      :is-loading="isLoading"
      :model="matrixModel"
      :state-detail="stateDetail"
      :state-title="stateTitle"
    />

    <DashboardTextRenderer
      v-else-if="renderKind === 'text'"
      :dashboard-elements="dashboardElements"
      :dashboard-settings="dashboardSettings"
      :element="effectiveElement"
      :filters="filters"
      :generate-ai-content="!canEditDashboard"
      :visualization-request="visualizationRequest"
    />

    <DashboardTableRenderer
      v-else
      :element="element"
      :has-state-message="hasStateMessage"
      :is-loading="isLoading"
      :model="tableModel"
      :runtime-parameter-values="chartData?.runtimeContext?.parameterValues"
      :state-detail="stateDetail"
      :state-title="stateTitle"
      :visualization-request="visualizationRequest"
    />

    <p class="chart-renderer-status" role="status" :aria-label="`Renderer status for ${element.name}`">
      {{ status }}
    </p>

    <table v-if="renderKind === 'chart'" class="chart-fallback-table" :aria-label="`Fallback data for ${element.name}`">
      <thead>
        <tr>
          <th>{{ spec.encodings.find(encoding => encoding.role === 'time' || encoding.role === 'dimension')?.field ?? 'Label' }}</th>
          <th>{{ spec.encodings.find(encoding => encoding.role === 'measure')?.field ?? 'Value' }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in summaryRows" :key="row.label">
          <td>{{ row.label }}</td>
          <td>{{ row.value }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
