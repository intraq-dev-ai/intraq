<script setup lang="ts">
import Chart from 'chart.js/auto';
import type { Chart as ChartInstance } from 'chart.js';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { subscribeTheme } from '../../../theme/theme';
import type { DashboardElement, VisualizationData, VisualizationSpec } from '../../types';
import { toChartJsConfig } from '../../visualization/chartjs-adapter';
import { chartCrossFilterSelectionForPoint, type ChartCrossFilterSelection } from '../../visualization/chart-interactions';
import { readBaseOptions } from '../../visualization/chart/options';
import { chartOverlayItems, chartOverlayPlacement } from '../../visualization/chart/overlay';
import { pieLegendItemsPerPage, pieLegendPageCount } from '../../visualization/chart/pie-legend';
import type { ChartVisualTheme } from '../../visualization/chart/theme';
import { chartViewportModel } from '../../visualization/chart/viewport';
import { applySortingAndTopN, normalizeData } from '../../visualization/chart/data';
import {
  chartExportActionsForConfig,
  chartExportFileName,
  exportChartCanvas,
  type ChartExportAction
} from '../dashboard-chart-export';
import {
  chartDataCanRender,
  type DashboardElementRendererState
} from '../dashboard-element-renderer-model';

const props = defineProps<{
  data: VisualizationData | null;
  element: DashboardElement;
  hasElementHeader: boolean;
  hasStateMessage: boolean;
  isLoading: boolean;
  isReady: boolean;
  rendererState: DashboardElementRendererState;
  spec: VisualizationSpec;
  stateDetail: string;
  stateTitle: string;
}>();

const emit = defineEmits<{
  chartCrossFilter: [selection: ChartCrossFilterSelection];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const chartActionMenuRef = ref<HTMLElement | null>(null);
const chartActionMenuOpen = ref(false);
const pieLegendPage = ref(0);
let chart: ChartInstance | null = null;
let unsubscribeTheme: (() => void) | null = null;

const hasRenderableData = computed(() => Boolean(props.data && chartDataCanRender(props.data, props.spec)));
const chartViewport = computed(() => chartViewportModel(props.spec, props.data));
const chartOverlay = computed(() => props.data ? chartOverlayItems(props.element.config, props.data) : []);
const chartOverlayPosition = computed(() => chartOverlayPlacement(props.element.config));
const chartSpacingPreset = computed(() => readBaseOptions(props.spec).chartSpacingPreset);
const chartExportActions = computed(() => chartExportActionsForConfig(props.element.config ?? {}));
const showChartExportMenu = computed(() =>
  props.isReady && hasRenderableData.value && chartExportActions.value.length > 0
);
const pieLegendPager = computed(() => {
  if (props.spec.kind !== 'pie' || !props.data) return null;
  const options = readBaseOptions(props.spec);
  if (!options.showLegend) return null;
  const visibleData = applySortingAndTopN(normalizeData(props.data), options);
  return {
    itemsPerPage: pieLegendItemsPerPage(options),
    totalPages: pieLegendPageCount(visibleData.labels.length, options)
  };
});
const pieLegendPosition = computed(() => {
  if (props.spec.kind !== 'pie') return null;
  return readBaseOptions(props.spec).legendPosition ?? 'top';
});

watch([() => props.data, () => props.spec], () => {
  pieLegendPage.value = 0;
});

watch(pieLegendPager, pager => {
  if (!pager) {
    pieLegendPage.value = 0;
    return;
  }
  const maxPage = Math.max(0, pager.totalPages - 1);
  if (pieLegendPage.value > maxPage) pieLegendPage.value = maxPage;
});

watch([() => props.data, () => props.spec, () => props.rendererState, pieLegendPage], () => {
  rerenderChart();
}, { immediate: true });

watch(showChartExportMenu, visible => {
  if (!visible) chartActionMenuOpen.value = false;
});

onMounted(() => {
  unsubscribeTheme = subscribeTheme(() => rerenderChartForTheme());
  document.addEventListener('pointerdown', closeChartActionMenuOnOutsidePointerDown, true);
  document.addEventListener('keydown', closeChartActionMenuOnEscape);
  rerenderChart();
});

onBeforeUnmount(() => {
  unsubscribeTheme?.();
  unsubscribeTheme = null;
  document.removeEventListener('pointerdown', closeChartActionMenuOnOutsidePointerDown, true);
  document.removeEventListener('keydown', closeChartActionMenuOnEscape);
  clearChart();
});

function closeChartActionMenuOnOutsidePointerDown(event: PointerEvent): void {
  if (!chartActionMenuOpen.value) return;
  const target = event.target instanceof Node ? event.target : null;
  if (target && chartActionMenuRef.value?.contains(target)) return;
  chartActionMenuOpen.value = false;
}

function closeChartActionMenuOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') chartActionMenuOpen.value = false;
}

function toggleChartActionMenu(): void {
  chartActionMenuOpen.value = !chartActionMenuOpen.value;
}

function handleChartExportAction(action: ChartExportAction): void {
  chartActionMenuOpen.value = false;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const title = props.element.name || 'Chart';
  const filename = chartExportFileName(props.element.name || props.spec.title || 'chart');
  exportChartCanvas(action, canvas, { filename, title });
}

function rerenderChart(): void {
  void nextTick(() => {
    if (!props.isReady || !props.data || !hasRenderableData.value) {
      clearChart();
      return;
    }
    renderChart(props.data);
  });
}

function renderChart(data: VisualizationData): void {
  if (!canvasRef.value) return;
  clearChart();
  chart = new Chart(canvasRef.value, toChartJsConfig(props.spec, data, readChartTheme(), {
    pieLegendPage: pieLegendPage.value
  }));
  (canvasRef.value as HTMLCanvasElement & { __dashboardChart?: ChartInstance }).__dashboardChart = chart;
}

function clearChart(): void {
  if (canvasRef.value) delete (canvasRef.value as HTMLCanvasElement & { __dashboardChart?: ChartInstance }).__dashboardChart;
  const current = chart;
  if (current) current.destroy();
  chart = null;
}

function onCanvasClick(event: MouseEvent): void {
  if (!chart || !props.data || props.spec.interactions?.crossFilter === false) return;
  const activePoints = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
  const point = activePoints[0] ?? chart.getElementsAtEventForMode(event, 'nearest', { intersect: false }, true)[0];
  if (!point) return;
  const selection = chartCrossFilterSelectionForPoint(props.spec, renderedChartData(), {
    dataIndex: point.index,
    datasetIndex: point.datasetIndex
  });
  if (selection) emit('chartCrossFilter', selection);
}

function renderedChartData(): VisualizationData {
  const labels = (chart?.data.labels ?? []).map(label => String(label ?? ''));
  const datasets = (chart?.data.datasets ?? []).map(dataset => ({
    data: Array.isArray(dataset.data)
      ? dataset.data.map(value => Number.isFinite(Number(value)) ? Number(value) : 0)
      : [],
    label: typeof dataset.label === 'string' ? dataset.label : ''
  }));
  return {
    labels,
    datasets,
    ...(props.data?.rawData ? { rawData: props.data.rawData } : {})
  };
}

function readChartTheme(): Partial<ChartVisualTheme> {
  if (typeof window === 'undefined') return {};
  const scope = canvasRef.value?.closest<HTMLElement>('.dashboard-canvas-area') ?? document.documentElement;
  const style = window.getComputedStyle(scope);
  const colorScheme = style.colorScheme.trim().toLowerCase();
  const uiMode = colorScheme === 'light'
    ? 'light'
    : colorScheme === 'dark'
      ? 'dark'
      : document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const readToken = (tokenName: string, fallback: string): string => {
    const value = style.getPropertyValue(tokenName).trim();
    return value || fallback;
  };
  const chartGrid = readToken('--chart-grid', readToken('--border', '#e2e8f0'));
  const textPrimary = readToken('--text-primary', '#334155');
  return {
    chartAreaBackgroundColor: readToken('--chart-bg', readToken('--surface', '#ffffff')),
    dataLabelBackgroundColor: colorForDataLabelBackground(),
    dataLabelBorderColor: readToken('--border', '#e2e8f0'),
    gridColor: chartGrid,
    inverseTextColor: readToken('--text-inverse', '#ffffff'),
    mutedColor: readToken('--chart-axis', readToken('--text-secondary', '#64748b')),
    pieLabelColor: uiMode === 'dark' ? '#f8fafc' : '#ffffff',
    textColor: textPrimary,
    tooltipBackgroundColor: readToken('--chart-tooltip-bg', '#0f172a'),
    tooltipBorderColor: chartGrid,
    tooltipTextColor: readToken('--chart-tooltip-text', '#f8fafc'),
    uiMode
  };
}

function colorForDataLabelBackground(): string {
  if (typeof document === 'undefined') return 'rgba(255, 255, 255, 0.72)';
  return document.documentElement.dataset.theme === 'dark'
    ? 'rgba(15, 23, 42, 0.72)'
    : 'rgba(255, 255, 255, 0.72)';
}

function rerenderChartForTheme(): void {
  if (!props.isReady || !props.data) return;
  rerenderChart();
}

function nextPieLegendPage(): void {
  const pager = pieLegendPager.value;
  if (!pager || pieLegendPage.value >= pager.totalPages - 1) return;
  pieLegendPage.value += 1;
}

function previousPieLegendPage(): void {
  if (pieLegendPage.value <= 0) return;
  pieLegendPage.value -= 1;
}
</script>

<template>
  <div
    class="dashboard-chart-renderer"
    data-renderer="dashboard-visualization"
    :data-has-title="hasElementHeader"
    :data-scrollable="chartViewport.scrollable"
    :data-chart-spacing-preset="chartSpacingPreset"
    :data-state="rendererState"
  >
    <div v-if="hasStateMessage" class="dashboard-render-state">
      <span v-if="isLoading" class="dashboard-render-spinner" aria-hidden="true"></span>
      <p class="dashboard-render-state-title">{{ stateTitle }}</p>
      <p v-if="stateDetail" class="dashboard-render-state-detail">{{ stateDetail }}</p>
    </div>
    <div
      v-if="showChartExportMenu && isReady && hasRenderableData"
      ref="chartActionMenuRef"
      class="dashboard-chart-action-menu"
      @click.stop
    >
      <button
        type="button"
        class="dashboard-chart-action-trigger"
        :aria-expanded="chartActionMenuOpen"
        :aria-label="`Chart context menu for ${element.name}`"
        title="Chart context menu"
        @click="toggleChartActionMenu"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 6h12M4 10h12M4 14h12" />
        </svg>
      </button>
      <div
        v-if="chartActionMenuOpen"
        class="dashboard-chart-action-list"
        role="menu"
        :aria-label="`Chart actions for ${element.name}`"
      >
        <button
          v-for="item in chartExportActions"
          :key="item.action"
          type="button"
          role="menuitem"
          class="dashboard-chart-action-item"
          @click="handleChartExportAction(item.action)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
    <div
      v-show="isReady && hasRenderableData"
      class="dashboard-chart-frame"
      :style="chartViewport.frameStyle"
    >
      <div
        v-if="chartOverlay.length > 0"
        class="dashboard-chart-overlay-strip"
        :data-placement="chartOverlayPosition"
        aria-label="Chart overlay values"
      >
        <span
          v-for="item in chartOverlay"
          :key="item.key"
          class="dashboard-chart-overlay-item"
          :title="item.title"
        >
          <span v-if="item.marker" class="dashboard-chart-overlay-marker">{{ item.marker }}</span>
          <span v-if="item.label" class="dashboard-chart-overlay-label">{{ item.label }}</span>
          <span v-if="item.value" class="dashboard-chart-overlay-value">{{ item.value }}</span>
        </span>
      </div>
      <canvas
        ref="canvasRef"
        role="img"
        :aria-label="`Visualization for ${element.name}`"
        :style="chartViewport.canvasStyle"
        @click="onCanvasClick"
      ></canvas>
    </div>
    <div
      v-if="isReady && hasRenderableData && pieLegendPager && pieLegendPager.totalPages > 1"
      class="dashboard-pie-legend-pager"
      :data-legend-position="pieLegendPosition ?? 'top'"
    >
      <button
        type="button"
        class="dashboard-pie-legend-pager__button"
        aria-label="Previous"
        title="Previous"
        :disabled="pieLegendPage === 0"
        @click="previousPieLegendPage"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M11.5 5.5 7 10l4.5 4.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
        </svg>
      </button>
      <span class="dashboard-pie-legend-pager__status">
        {{ pieLegendPage + 1 }} / {{ pieLegendPager.totalPages }}
      </span>
      <button
        type="button"
        class="dashboard-pie-legend-pager__button"
        aria-label="Next"
        title="Next"
        :disabled="pieLegendPage >= pieLegendPager.totalPages - 1"
        @click="nextPieLegendPage"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M8.5 5.5 13 10l-4.5 4.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
        </svg>
      </button>
    </div>
  </div>
</template>
