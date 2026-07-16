<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type {
  DashboardElement,
  DashboardFilter,
  DashboardFilterPatch,
  DashboardSettings
} from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';
import type { ChartCrossFilterSelection } from '../visualization/chart-interactions';
import type { ComponentRunState } from './dashboard-canvas-types';
import DashboardElementRenderer from './DashboardElementRenderer.vue';

defineProps<{
  canDownloadElement: (element: DashboardElement) => boolean;
  dashboardElements: DashboardElement[];
  dashboardSettings?: DashboardSettings | undefined;
  element: DashboardElement;
  filters: DashboardFilter[];
  rowLimit?: number | undefined;
  runState: (elementId: string) => ComponentRunState;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>();

const emit = defineEmits<{
  chartCrossFilter: [elementId: string, selection: ChartCrossFilterSelection];
  close: [];
  filterChange: [filterId: string, patch: DashboardFilterPatch];
  openDownload: [element: DashboardElement];
  rendererLoading: [elementId: string];
  rendererSettled: [elementId: string];
}>();

const dialogEl = ref<HTMLElement | null>(null);

onMounted(() => {
  dialogEl.value?.focus();
});
</script>

<template>
  <div class="dashboard-modal-overlay component-panel-overlay" @click="emit('close')">
    <section
      ref="dialogEl"
      class="component-expand-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="element.name"
      tabindex="-1"
      @click.stop
      @keydown.esc="emit('close')"
    >
      <header class="component-expand-header">
        <h2>{{ element.name }}</h2>
        <div class="component-expand-actions">
          <button
            v-if="canDownloadElement(element)"
            class="wrapper-action-btn download-btn"
            type="button"
            :aria-label="`Download data for ${element.name}`"
            title="Download data"
            @click="emit('openDownload', element)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v9m0 0l-4-4m4 4 4-4m3 8H5a2 2 0 0 1-2-2v-1m18 1a2 2 0 0 1-2 2" />
            </svg>
          </button>
          <button
            class="component-download-close"
            type="button"
            :aria-label="`Close ${element.name}`"
            title="Close"
            @click="emit('close')"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>
      <div class="component-expand-body">
        <DashboardElementRenderer
          :dashboard-elements="dashboardElements"
          :element="element"
          :filters="filters"
          :dashboard-settings="dashboardSettings"
          :row-limit="rowLimit"
          :run-token="runState(element.id).runToken"
          :cancel-token="runState(element.id).cancelToken"
          :can-edit-dashboard="false"
          :visualization-request="visualizationRequest"
          @loading="event => emit('rendererLoading', event)"
          @loaded="event => emit('rendererSettled', event)"
          @error="event => emit('rendererSettled', event)"
          @chart-cross-filter="(elementId, selection) => emit('chartCrossFilter', elementId, selection)"
          @filter-change="(filterId, patch) => emit('filterChange', filterId, patch)"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.component-expand-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1180px, calc(100vw - 32px));
  height: min(820px, calc(100vh - 32px));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-primary);
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.3);
}

.component-expand-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-primary) 88%, var(--bg-secondary));
}

.component-expand-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 800;
}

.component-expand-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.component-expand-body {
  min-height: 0;
  min-width: 0;
  padding: 16px;
}

.component-expand-body :deep(.dashboard-element-renderer),
.component-expand-body :deep(.dashboard-chart-renderer),
.component-expand-body :deep(.dashboard-table-component),
.component-expand-body :deep(.dashboard-matrix-component),
.component-expand-body :deep(.dashboard-kpi-card) {
  height: 100%;
  min-height: 0;
}

.component-download-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.component-download-close:hover {
  background: var(--surface);
  color: var(--text-primary);
}

.component-download-close svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  fill: none;
}

.download-btn {
  color: color-mix(in srgb, var(--color-primary) 82%, var(--text-primary));
}
</style>
