import type { BaseChartOptions } from './chart/options';

export function chartLayoutPadding(
  baseOptions: BaseChartOptions,
  isPieLike: boolean,
  isHorizontalBar: boolean,
  showPieChartLabels: boolean,
  labels: string[] = []
): { bottom: number; left: number; right: number; top: number } {
  const topLegend = baseOptions.showLegend && baseOptions.legendPosition === 'top';
  if (isPieLike) {
    return {
      bottom: Math.max(baseOptions.legendPosition === 'bottom' ? 18 : 12, showPieChartLabels ? 20 : 12),
      left: 14,
      right: 14,
      top: Math.max(baseOptions.legendPosition === 'top' ? 18 : 12, showPieChartLabels ? 20 : 12)
    };
  }
  const highchartsSpacing = usesHighchartsSpacing(baseOptions);
  const rawXAxisPadding = xAxisLabelEdgePadding(baseOptions, labels, isHorizontalBar);
  const xAxisPadding = highchartsSpacing
    ? { bottom: rawXAxisPadding.bottom, left: 0, right: 0 }
    : rawXAxisPadding;
  const highchartsPadding = highchartsSpacing
    ? { bottom: 15, left: 5, right: 0, top: 10 }
    : { bottom: 0, left: 0, right: 0, top: 0 };

  return {
    bottom: baseOptions.chartPaddingBottom ?? Math.max(baseOptions.legendPosition === 'bottom' ? 5 : 3, xAxisPadding.bottom, highchartsPadding.bottom),
    left: baseOptions.chartPaddingLeft ?? Math.max(highchartsSpacing ? 0 : (isHorizontalBar ? 8 : 3), xAxisPadding.left, highchartsPadding.left),
    right: baseOptions.chartPaddingRight ?? Math.max(baseOptions.enableY2 ? 24 : (highchartsSpacing ? 0 : (isHorizontalBar ? 5 : 3)), xAxisPadding.right, highchartsPadding.right),
    top: baseOptions.chartPaddingTop ?? Math.max(highchartsPadding.top, baseOptions.showDataLabels
      ? topLegend ? 18 : 30
      : topLegend ? 5 : 3)
  };
}

function usesHighchartsSpacing(baseOptions: BaseChartOptions): boolean {
  return baseOptions.chartSpacingPreset === 'highcharts'
    || baseOptions.chartSpacingPreset === 'legacy'
    || baseOptions.chartSpacingPreset === 'report';
}

function xAxisLabelEdgePadding(
  baseOptions: BaseChartOptions,
  labels: string[],
  isHorizontalBar: boolean
): { bottom: number; left: number; right: number } {
  if (isHorizontalBar || baseOptions.showXAxis === false || labels.length <= 1) {
    return { bottom: 0, left: 0, right: 0 };
  }
  const labelLengths = labels.map(label => String(label ?? '').length);
  const maxLabelLength = Math.max(...labelLengths, 0);
  const firstLabelLength = labelLengths[0] ?? 0;
  const lastLabelLength = labelLengths[labelLengths.length - 1] ?? 0;
  const edgeLabelLength = Math.max(firstLabelLength, lastLabelLength);
  const hasExplicitRotation = baseOptions.xAxisLabelRotation !== undefined;
  const rotation = Math.abs(baseOptions.xAxisLabelRotation ?? automaticXAxisMaxRotation(labels, maxLabelLength, usesHighchartsSpacing(baseOptions)));
  const angledLabelRisk = rotation >= 20 && (hasExplicitRotation || labels.length >= 10 || maxLabelLength >= 8);
  const needsEdgeGuard = angledLabelRisk || maxLabelLength >= 12 || edgeLabelLength >= 10;
  if (!needsEdgeGuard) return { bottom: 0, left: 0, right: 0 };

  const sidePadding = (labelLength: number) => {
    const estimatedEdgeLabelWidth = Math.min(180, Math.max(42, labelLength * 7));
    return Math.ceil(Math.min(42, Math.max(14, estimatedEdgeLabelWidth * (rotation >= 20 ? 0.22 : 0.16))));
  };
  const estimatedEdgeLabelWidth = Math.min(180, Math.max(42, edgeLabelLength * 7));
  const bottomPadding = rotation >= 20
    ? Math.ceil(Math.min(38, Math.max(10, estimatedEdgeLabelWidth * 0.18)))
    : 0;
  return { bottom: bottomPadding, left: sidePadding(firstLabelLength), right: sidePadding(lastLabelLength) };
}

function automaticXAxisMaxRotation(labels: string[], maxLabelLength: number, highchartsSpacing = false): number {
  const labelCount = labels.length;
  if (highchartsSpacing && isDenseTimeAxisLabelSet(labels)) return 65;
  if (labelCount <= 8 || maxLabelLength <= 8) return 45;
  if (labelCount > 35) return 65;
  if (labelCount >= 16) return 45;
  if (labelCount >= 10 && maxLabelLength > 14) return 45;
  return 45;
}

function isDenseTimeAxisLabelSet(labels: string[]): boolean {
  if (labels.length < 16) return false;
  const textLabels = labels.map(label => String(label ?? '').trim()).filter(Boolean);
  if (textLabels.length < 16) return false;
  const timeLikeCount = textLabels.filter(isTimeOfDayLabel).length;
  return timeLikeCount >= Math.min(textLabels.length, 12);
}

function isTimeOfDayLabel(label: string): boolean {
  return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(label)
    || /^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(?::\d{2})?$/.test(label);
}
