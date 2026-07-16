<script setup lang="ts">
import Chart from 'chart.js/auto';
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { ChartConfiguration, ChartType } from 'chart.js';
import type { PublicChartDataset } from './types';

const props = defineProps<{
  chartType: 'bar' | 'line' | 'pie';
  datasets?: PublicChartDataset[];
  labels: string[];
  stacked?: boolean;
  title: string;
  values: number[];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

watch(
  () => [
    props.chartType,
    props.title,
    props.labels.join('|'),
    props.values.join('|'),
    JSON.stringify(props.datasets ?? []),
    String(props.stacked === true)
  ],
  () => {
    void renderChart();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  chart?.destroy();
});

async function renderChart(): Promise<void> {
  await nextTick();
  if (!canvasRef.value) return;
  chart?.destroy();
  chart = new Chart(canvasRef.value, chartConfig());
}

function chartConfig(): ChartConfiguration {
  const chartType = props.chartType as ChartType;
  const colors = themeColors();
  const datasets = normalizedDatasets();
  return {
    type: chartType,
    data: {
      labels: props.labels,
      datasets: datasets.map((dataset, datasetIndex) => {
        const color = dataset.color ?? colors[datasetIndex % colors.length] ?? '#d59a2f';
        return {
          label: dataset.label,
          data: dataset.values,
          backgroundColor: chartType === 'pie'
            ? props.labels.map((_, index) => colors[index % colors.length] ?? color)
            : colorWithAlpha(color, chartType === 'line' ? 0.18 : 0.42),
          borderColor: chartType === 'pie' ? '#ffffff' : color,
          borderRadius: chartType === 'bar' ? 7 : undefined,
          borderWidth: 2,
          maxBarThickness: chartType === 'bar' ? 42 : undefined,
          pointRadius: chartType === 'line' ? 3 : undefined,
          tension: chartType === 'line' ? 0.35 : undefined
        };
      })
    },
    options: {
      animation: false,
      layout: { padding: chartLayoutPadding(chartType) },
      maintainAspectRatio: false,
      normalized: true,
      plugins: {
        legend: { display: chartType === 'pie' || datasets.length > 1, position: 'bottom' },
        title: { display: false }
      },
      responsive: true,
      ...(chartType === 'pie' ? {} : {
        scales: {
          x: {
            border: { display: false },
            grid: { color: colorWithAlpha(readCssVariable('--embed-border', '#e5edf6'), 0.8) },
            stacked: props.stacked === true,
            ticks: { color: readCssVariable('--embed-secondary', '#64748b'), autoSkip: true, autoSkipPadding: 24, maxTicksLimit: 5, maxRotation: 35, minRotation: 0, padding: 10 }
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: colorWithAlpha(readCssVariable('--embed-border', '#e5edf6'), 0.8) },
            stacked: props.stacked === true,
            ticks: { color: readCssVariable('--embed-secondary', '#64748b'), padding: 10 }
          }
        }
      })
    }
  };
}

function chartLayoutPadding(chartType: ChartType): { bottom: number; left: number; right: number; top: number } {
  return chartType === 'pie'
    ? { bottom: 18, left: 22, right: 22, top: 18 }
    : { bottom: 16, left: 18, right: 18, top: 18 };
}

function normalizedDatasets(): PublicChartDataset[] {
  if (props.datasets && props.datasets.length > 0) return props.datasets;
  return [{ label: props.title, values: props.values }];
}

function themeColors(): string[] {
  return [
    readCssVariable('--embed-accent', '#d59a2f'),
    readCssVariable('--embed-primary', '#102033'),
    '#0f766e',
    '#1d4ed8',
    '#be123c',
    '#7c3aed'
  ];
}

function readCssVariable(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
</script>

<template>
  <canvas ref="canvasRef" role="img" :aria-label="`Visualization for ${title}`"></canvas>
</template>
