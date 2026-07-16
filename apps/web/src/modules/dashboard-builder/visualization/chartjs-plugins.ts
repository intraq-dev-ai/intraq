import type { Chart, ChartConfiguration, Plugin } from 'chart.js';
import type { VisualizationSpec } from '../types';
import { dataLabel } from './chart/formatting';
import type { BaseChartOptions } from './chart/options';
import type { ChartVisualTheme } from './chart/theme';
import { hasMixedBarAndLineDatasets } from './chartjs-axis-hints';

export function hidePlaceholderChartChrome(chartConfig: ChartConfiguration): void {
  const scales = chartConfig.options?.scales as Record<string, Record<string, unknown>> | undefined;
  if (!scales) return;
  for (const scale of Object.values(scales)) {
    scale.display = false;
    if (typeof scale.grid === 'object' && scale.grid !== null) {
      (scale.grid as Record<string, unknown>).display = false;
      (scale.grid as Record<string, unknown>).drawTicks = false;
    }
    if (typeof scale.ticks === 'object' && scale.ticks !== null) {
      (scale.ticks as Record<string, unknown>).display = false;
    }
    if (typeof scale.title === 'object' && scale.title !== null) {
      (scale.title as Record<string, unknown>).display = false;
    }
  }
}

export function dashboardChartAreaBackgroundPlugin(theme: ChartVisualTheme): Plugin {
  return {
    id: 'dashboard-chart-area-background',
    beforeDraw(chart) {
      const { chartArea, ctx, width, height } = chart;
      ctx.save();
      ctx.fillStyle = theme.chartAreaBackgroundColor;
      // Fill entire canvas so the legend area gets the correct background too
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      if (!chartArea) return;
    }
  };
}

export function dashboardDataLabelsPlugin(
  labels: string[],
  options: BaseChartOptions,
  spec: VisualizationSpec,
  theme: ChartVisualTheme,
  isPieLike: boolean,
  isHorizontalBar: boolean
): Plugin {
  return {
    id: 'dashboard-data-labels',
    afterDatasetsDraw(chart) {
      const datasets = chart.data.datasets ?? [];
      const chartType = chart.config?.type;
      const mixedBarAndLine = hasMixedBarAndLineDatasets(datasets, chartType);
      datasets.forEach((dataset, datasetIndex) => {
        if (!chart.isDatasetVisible(datasetIndex)) return;
        const meta = chart.getDatasetMeta(datasetIndex);
        meta.data.forEach((element, dataIndex) => {
          const rawValue = Array.isArray(dataset.data) ? dataset.data[dataIndex] : undefined;
          const context: { dataIndex: number; dataset: { data: unknown[]; label?: string } } = {
            dataIndex,
            dataset: {
              data: Array.isArray(dataset.data) ? dataset.data : []
            }
          };
          if (typeof dataset.label === 'string') context.dataset.label = dataset.label;
          const label = dataLabel(rawValue, context, labels, options, spec);
          if (!label || !shouldDisplayDataLabel(chart, datasetIndex, dataIndex, Number(rawValue), isPieLike)) return;
          const datasetType = typeof dataset.type === 'string' ? dataset.type : chartType;
          drawDataLabel(
            chart,
            element,
            label,
            theme,
            isPieLike,
            isHorizontalBar,
            options.dataLabelPosition,
            datasetType,
            mixedBarAndLine
          );
        });
      });
    }
  };
}

function shouldDisplayDataLabel(
  chart: Chart,
  datasetIndex: number,
  dataIndex: number,
  value: number,
  isPieLike: boolean
): boolean {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-12) return false;
  if (isPieLike) return true;
  const dataset = chart.data.datasets[datasetIndex];
  if (!dataset) return false;
  const totalPoints = Array.isArray(dataset?.data) ? dataset.data.length : 0;
  if (totalPoints <= 2) return true;
  const chartArea = chart.chartArea;
  const chartWidth = Math.max(0, chartArea.right - chartArea.left);
  const datasetCount = chart.data.datasets.filter((_, index) => chart.isDatasetVisible(index)).length || 1;
  const minGapPx = dataset.type === 'line' ? 44 : 36;
  const maxLabelsPerSeries = chartWidth > 0 ? Math.max(2, Math.floor(chartWidth / minGapPx)) : 8;
  let step = totalPoints > maxLabelsPerSeries ? Math.ceil(totalPoints / maxLabelsPerSeries) : 1;
  if (datasetCount > 1 && step === 1 && totalPoints > Math.max(6, Math.floor(maxLabelsPerSeries * 0.7))) step = 2;
  if (dataIndex === 0 || dataIndex === totalPoints - 1) return true;
  return step <= 1 || dataIndex % step === 0;
}

interface DataLabelElement {
  base?: number;
  tooltipPosition(useFinalPosition?: boolean): { x: number | null; y: number | null };
  x?: number;
  y?: number;
}

function drawDataLabel(
  chart: Chart,
  element: DataLabelElement,
  label: string,
  theme: ChartVisualTheme,
  isPieLike: boolean,
  isHorizontalBar: boolean,
  labelPosition: string | undefined,
  datasetType: string | undefined,
  mixedBarAndLine: boolean
): void {
  const ctx = chart.ctx;
  const anchor = element.tooltipPosition(true);
  if (anchor.x === null || anchor.y === null) return;
  const font = '700 11px Inter, system-ui, sans-serif';
  const lines = label.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return;
  ctx.save();
  ctx.font = font;
  const metrics = lines.map(line => ctx.measureText(line));
  const paddingX = 5;
  const paddingY = 2;
  const lineHeight = 12;
  const width = Math.max(...metrics.map(item => item.width)) + paddingX * 2;
  const height = (lines.length * lineHeight) + paddingY * 2;
  const chartArea = chart.chartArea;
  const origin = labelOrigin(
    element,
    labelPosition,
    width,
    height,
    isPieLike,
    isHorizontalBar,
    datasetType,
    mixedBarAndLine
  );
  const x = clamp(origin.x, chartArea.left + 2, chartArea.right - width - 2);
  const y = clamp(origin.y, chartArea.top + 2, chartArea.bottom - height - 2);
  ctx.fillStyle = isPieLike ? 'rgba(15, 23, 42, 0.5)' : theme.dataLabelBackgroundColor;
  roundedRect(ctx, x, y, width, height, 6);
  ctx.fill();
  ctx.strokeStyle = isPieLike ? 'rgba(255, 255, 255, 0.2)' : theme.dataLabelBorderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = isPieLike ? theme.pieLabelColor : theme.textColor;
  ctx.textAlign = 'center';
  if (lines.length === 1) {
    ctx.textBaseline = 'middle';
    ctx.fillText(lines[0] ?? '', x + width / 2, y + height / 2 + 0.5);
  } else {
    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, lineIndex) => {
      const lineY = y + paddingY + ((lineIndex + 1) * lineHeight) - 1;
      ctx.fillText(line, x + width / 2, lineY);
    });
  }
  ctx.restore();
}

function labelOrigin(
  element: DataLabelElement,
  position: string | undefined,
  width: number,
  height: number,
  isPieLike: boolean,
  isHorizontalBar: boolean,
  datasetType: string | undefined,
  mixedBarAndLine: boolean
): { x: number; y: number } {
  const point = element.tooltipPosition(true);
  const x = point.x ?? 0;
  const y = point.y ?? 0;
  if (isPieLike || !position || position === 'auto') {
    if (autoLabelPlacementMode(datasetType, mixedBarAndLine, isPieLike, isHorizontalBar) === 'inside-center'
      && typeof element.base === 'number'
      && typeof element.x === 'number'
      && typeof element.y === 'number') {
      return verticalLabelOrigin(element, 'inside-center', width, height);
    }
    return {
      x: x + (isPieLike ? -width / 2 : isHorizontalBar ? 8 : -width / 2),
      y: y + (isPieLike ? -height / 2 : isHorizontalBar ? -height / 2 : -height - 4)
    };
  }
  if (typeof element.base === 'number' && typeof element.x === 'number' && typeof element.y === 'number') {
    return isHorizontalBar
      ? horizontalLabelOrigin(element, position, width, height)
      : verticalLabelOrigin(element, position, width, height);
  }
  if (position === 'inside-center') return { x: x - width / 2, y: y - height / 2 };
  if (position === 'inside-start') return { x: x - width / 2, y: y + 6 };
  if (position === 'inside-end') return { x: x - width / 2, y: y - height - 2 };
  return { x: x - width / 2, y: y - height - 6 };
}

export function autoLabelPlacementMode(
  datasetType: string | undefined,
  mixedBarAndLine: boolean,
  isPieLike: boolean,
  isHorizontalBar: boolean
): 'above' | 'inside-center' {
  if (!isPieLike && !isHorizontalBar && mixedBarAndLine && datasetType === 'line') {
    return 'inside-center';
  }
  return 'above';
}

function horizontalLabelOrigin(
  element: { base?: number; x?: number; y?: number },
  position: string,
  width: number,
  height: number
): { x: number; y: number } {
  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const base = element.base ?? x;
  const start = Math.min(base, x);
  const end = Math.max(base, x);
  const center = start + ((end - start) / 2);
  if (position === 'inside-center') return { x: center - width / 2, y: y - height / 2 };
  if (position === 'inside-start') return { x: start + 6, y: y - height / 2 };
  if (position === 'inside-end') return { x: end - width - 6, y: y - height / 2 };
  return { x: end + 8, y: y - height / 2 };
}

function verticalLabelOrigin(
  element: { base?: number; x?: number; y?: number },
  position: string,
  width: number,
  height: number
): { x: number; y: number } {
  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const base = element.base ?? y;
  const top = Math.min(base, y);
  const bottom = Math.max(base, y);
  const center = top + ((bottom - top) / 2);
  if (position === 'inside-center') return { x: x - width / 2, y: center - height / 2 };
  if (position === 'inside-start') return { x: x - width / 2, y: bottom - height - 6 };
  if (position === 'inside-end') return { x: x - width / 2, y: top + 6 };
  return { x: x - width / 2, y: top - height - 6 };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
