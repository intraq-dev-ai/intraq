<script setup lang="ts">
import Chart from 'chart.js/auto';
import type { Chart as ChartInstance } from 'chart.js';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { toChartJsConfig } from '../dashboard-builder/visualization/chartjs-adapter';
import type { ChartVisualTheme } from '../dashboard-builder/visualization/chart/theme';
import type { VisualizationData, VisualizationKind, VisualizationSpec } from '../dashboard-builder/types';
import { subscribeTheme } from '../theme/theme';
import type { AnalyzerChartData, AnalyzerChartType } from './result-data';

const props = defineProps<{
  chartData: AnalyzerChartData;
  chartType: AnalyzerChartType;
  showDataLabels: boolean;
  showGrid: boolean;
  showLegend: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
  title: string;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: ChartInstance | null = null;
let unsubscribeTheme: (() => void) | null = null;

const visualizationData = computed<VisualizationData>(() => ({
  labels: props.chartData.points.map(point => point.label),
  datasets: [{
    label: props.chartData.metricColumn.label,
    data: props.chartData.points.map(point => point.value)
  }]
}));

const visualizationSpec = computed<VisualizationSpec>(() => ({
  id: `analyzer-${props.chartType}-${props.chartData.labelColumn.field}-${props.chartData.metricColumn.field}`,
  schemaVersion: 1,
  kind: chartKind(props.chartType),
  title: props.title,
  description: `${props.title} analyzer visualization.`,
  encodings: [
    {
      field: props.chartData.labelColumn.field,
      label: props.chartData.labelColumn.label,
      role: isTimeField(props.chartData.labelColumn.field, props.chartData.labelColumn.type) ? 'time' : 'dimension'
    },
    {
      field: props.chartData.metricColumn.field,
      label: props.chartData.metricColumn.label,
      role: 'measure',
      aggregation: 'sum',
      format: 'number'
    }
  ],
  interactions: {
    crossFilter: false,
    drilldown: false,
    legend: props.showLegend,
    tooltip: true
  },
  accessibility: {
    label: `${toChartLabel(props.chartType)} chart for ${props.title}`,
    summary: `${props.chartData.metricColumn.label} by ${props.chartData.labelColumn.label}.`
  },
  rendererHints: {
    fallback: 'table',
    requiredCapabilities: props.chartType === 'pie'
      ? ['categorical', 'legend', 'tooltip']
      : ['cartesian', 'categorical', 'legend', 'tooltip']
  },
  chartType: props.chartType,
  legendPosition: 'top',
  showDataLabels: props.showDataLabels,
  showGrid: props.showGrid,
  showLegend: props.showLegend,
  showXAxis: props.showXAxis,
  showYAxis: props.showYAxis,
  xAxisLabel: props.chartData.labelColumn.label,
  yAxisLabel: props.chartData.metricColumn.label
} as VisualizationSpec));

const renderKey = computed(() => JSON.stringify({
  chartType: props.chartType,
  data: visualizationData.value,
  showDataLabels: props.showDataLabels,
  showGrid: props.showGrid,
  showLegend: props.showLegend,
  showXAxis: props.showXAxis,
  showYAxis: props.showYAxis,
  spec: visualizationSpec.value
}));

const frameStyle = computed(() => {
  const pointCount = props.chartData.points.length;
  if (props.chartType === 'bar') return { minHeight: `${Math.max(280, pointCount * 34)}px` };
  if (props.chartType === 'column' && pointCount > 8) return { minWidth: `${pointCount * 54}px` };
  return {};
});

watch(renderKey, () => { void renderChart(); });

onMounted(() => {
  unsubscribeTheme = subscribeTheme(() => { void renderChart(); });
  void renderChart();
});

onBeforeUnmount(() => {
  unsubscribeTheme?.();
  clearChart();
});

async function renderChart(): Promise<void> {
  await nextTick();
  if (!canvasRef.value) return;
  clearChart();
  chart = new Chart(canvasRef.value, toChartJsConfig(visualizationSpec.value, visualizationData.value, readChartTheme()));
}

function clearChart(): void {
  chart?.destroy();
  chart = null;
}

function chartKind(type: AnalyzerChartType): VisualizationKind {
  if (type === 'pie') return 'pie';
  if (type === 'line' || type === 'area') return 'line';
  return 'bar';
}

function toChartLabel(type: AnalyzerChartType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function isTimeField(field: string, type?: string): boolean {
  const normalized = `${field} ${type ?? ''}`.toLowerCase();
  return normalized.includes('date') || normalized.includes('time') || normalized.includes('timestamp');
}

function readChartTheme(): Partial<ChartVisualTheme> {
  if (typeof window === 'undefined') return {};
  const style = window.getComputedStyle(document.documentElement);
  const readToken = (tokenName: string, fallback: string): string => {
    const value = style.getPropertyValue(tokenName).trim();
    return value || fallback;
  };
  const chartGrid = readToken('--chart-grid', readToken('--border', '#e2e8f0'));
  return {
    chartAreaBackgroundColor: readToken('--chart-bg', readToken('--surface', '#ffffff')),
    dataLabelBackgroundColor: document.documentElement.dataset.theme === 'dark'
      ? 'rgba(15, 23, 42, 0.72)'
      : 'rgba(255, 255, 255, 0.72)',
    dataLabelBorderColor: readToken('--border', '#e2e8f0'),
    gridColor: chartGrid,
    inverseTextColor: readToken('--text-inverse', '#ffffff'),
    mutedColor: readToken('--chart-axis', readToken('--text-secondary', '#64748b')),
    textColor: readToken('--text-primary', '#334155'),
    tooltipBackgroundColor: readToken('--chart-tooltip-bg', '#0f172a'),
    tooltipBorderColor: chartGrid,
    tooltipTextColor: readToken('--chart-tooltip-text', '#f8fafc')
  };
}
</script>

<template>
  <div class="analyzer-chart-canvas-frame" :style="frameStyle">
    <canvas
      ref="canvasRef"
      role="img"
      :aria-label="`${toChartLabel(chartType)} chart for ${title}`"
    ></canvas>
  </div>
</template>
