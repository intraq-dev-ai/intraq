import type { VisualizationData, VisualizationSpec } from '../../types';
import { readBaseOptions } from './options';

const MIN_BAR_CATEGORY_SIZE_PX = 35;
export const SCROLLABLE_BAR_CATEGORY_COUNT = 10;

export interface ChartViewportModel {
  canvasStyle: Record<string, string>;
  frameStyle: Record<string, string>;
  scrollable: boolean;
}

export function chartViewportModel(
  spec: VisualizationSpec,
  data: VisualizationData | null
): ChartViewportModel {
  const options = readBaseOptions(spec);
  const rawLabelCount = data?.labels.length ?? 0;
  const labelCount = options.topN === undefined ? rawLabelCount : Math.min(rawLabelCount, options.topN);
  const datasetCount = Math.max(1, data?.datasets.length ?? 1);
  const chartIntent = options.chartIntent;
  const isHorizontalBar = chartIntent === 'bar';
  const isDenseColumn = chartIntent === 'column' || chartIntent === 'stacked';
  const scrollable = labelCount > SCROLLABLE_BAR_CATEGORY_COUNT && (isHorizontalBar || isDenseColumn);

  const baseStyle = { height: '100%', width: '100%' };
  if (!scrollable) {
    return {
      canvasStyle: baseStyle,
      frameStyle: baseStyle,
      scrollable: false
    };
  }

  const scrollSize = `${labelCount * MIN_BAR_CATEGORY_SIZE_PX}px`;
  if (isHorizontalBar) {
    const categorySize = MIN_BAR_CATEGORY_SIZE_PX + ((datasetCount - 1) * 18);
    const scrollSize = `${labelCount * categorySize}px`;
    return {
      canvasStyle: { height: '100%', width: '100%' },
      frameStyle: { height: scrollSize, minHeight: scrollSize, width: '100%' },
      scrollable: true
    };
  }

  return {
    canvasStyle: { height: '100%', width: '100%' },
    frameStyle: { height: '100%', minWidth: scrollSize, width: '100%' },
    scrollable: true
  };
}
