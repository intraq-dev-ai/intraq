import type { Chart, LegendItem, Plugin } from 'chart.js';
import type { BaseChartOptions } from './chart/options';
import type { ChartVisualTheme } from './chart/theme';

export function pieLegendBounds(baseOptions: BaseChartOptions): { maxHeight?: number; maxWidth?: number } {
  if (baseOptions.legendPosition === 'left' || baseOptions.legendPosition === 'right') {
    return { maxHeight: 100000, maxWidth: 190 };
  }
  return { maxHeight: 88, maxWidth: 100000 };
}

export function compactPieLegendText(text: string, baseOptions: BaseChartOptions): string {
  if (baseOptions.legendPosition !== 'left' && baseOptions.legendPosition !== 'right') return text;
  const maxLength = baseOptions.valueDisplay === 'legend' || baseOptions.valueDisplay === 'both' ? 24 : 30;
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trimEnd()}...` : text;
}

export function legendMarkerBoxHeight(baseOptions: BaseChartOptions): number {
  if (baseOptions.legendMarkerStyle === 'line-marker' || baseOptions.legendMarkerStyle === 'point') return 8;
  return 3;
}

export function legendMarkerBoxWidth(baseOptions: BaseChartOptions): number {
  if (baseOptions.legendMarkerStyle === 'line-marker') return 24;
  if (baseOptions.legendMarkerStyle === 'point') return 10;
  return 15;
}

export function legendItemPadding(baseOptions: BaseChartOptions): number {
  if (baseOptions.legendMarkerStyle === 'line-marker') {
    return baseOptions.legendPosition === 'bottom' ? 18 : baseOptions.legendPosition === 'top' ? 10 : 12;
  }
  return baseOptions.legendPosition === 'top' ? 8 : baseOptions.legendPosition === 'bottom' ? 15 : 12;
}

export function lineMarkerLegendLabels(chart: Chart, theme: ChartVisualTheme): LegendItem[] {
  const fontColor = legendLabelColor(theme);
  return (chart.data.datasets ?? []).map((dataset, datasetIndex) => {
    const meta = chart.getDatasetMeta(datasetIndex);
    const style = datasetStyle(meta);
    const strokeStyle = colorValue(style.borderColor)
      ?? colorValue(dataset.borderColor)
      ?? colorValue(dataset.backgroundColor)
      ?? '#7cb5ec';
    return {
      text: String(dataset.label ?? ''),
      datasetIndex,
      fillStyle: 'rgba(0, 0, 0, 0)',
      fontColor: meta.visible ? fontColor : theme.mutedColor,
      hidden: !meta.visible,
      lineWidth: 0,
      pointStyle: 'circle',
      strokeStyle
    };
  }).filter(item => item.text.trim().length > 0);
}

function datasetStyle(meta: ReturnType<Chart['getDatasetMeta']>): Record<string, unknown> {
  const controller = meta.controller as unknown as {
    getStyle?: (index: number, active: boolean) => Record<string, unknown>;
  };
  return controller.getStyle?.(0, false) ?? {};
}

function colorValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) return colorValue(value[0]);
  return undefined;
}

export function dashboardLegendLineMarkerPlugin(): Plugin {
  return {
    id: 'dashboardLegendLineMarker',
    afterDraw(chart) {
      const legend = (chart as Chart & {
        legend?: {
          legendHitBoxes?: Array<{ height: number; left?: number; top?: number; width: number; x?: number; y?: number }>;
          legendItems?: LegendItem[];
          options?: { labels?: { boxWidth?: number } };
        };
      }).legend;
      const items = legend?.legendItems ?? [];
      const hitBoxes = legend?.legendHitBoxes ?? [];
      if (items.length === 0 || hitBoxes.length === 0) return;

      const ctx = chart.ctx;
      const symbolWidth = Math.max(16, Math.min(28, Number(legend?.options?.labels?.boxWidth ?? 24)));
      ctx.save();
      items.forEach((item, index) => {
        const hitBox = hitBoxes[index];
        if (!hitBox) return;
        const color = colorValue(item.strokeStyle) ?? colorValue(item.fillStyle) ?? '#7cb5ec';
        const x = hitBox.x ?? hitBox.left ?? 0;
        const y = (hitBox.y ?? hitBox.top ?? 0) + hitBox.height / 2;
        ctx.globalAlpha = item.hidden ? 0.35 : 1;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineCap = 'round';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + symbolWidth, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + symbolWidth / 2, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  };
}

export function legendLabelColor(theme: ChartVisualTheme): string {
  return theme.textColor;
}
