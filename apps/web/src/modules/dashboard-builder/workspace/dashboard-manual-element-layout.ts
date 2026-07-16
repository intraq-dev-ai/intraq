import {
  findNextAvailableLayout,
  minHeightForType,
  minWidthForType,
  resolvedLayout
} from '../components/canvas/dashboard-canvas-layout';
import type { Dashboard } from '../types';

export function manualElementName(type: string, chartType: string | undefined, index: number): string {
  if (type === 'chart') {
    if (chartType === 'line') return `Line Chart ${index}`;
    if (chartType === 'pie') return `Pie Chart ${index}`;
    if (chartType === 'doughnut') return `Doughnut Chart ${index}`;
    if (chartType === 'area') return `Area Chart ${index}`;
    if (chartType === 'stacked') return `Stacked Chart ${index}`;
    if (chartType === 'scatter') return `Scatter Chart ${index}`;
    return `Bar Chart ${index}`;
  }
  if (type === 'table') return `Table ${index}`;
  if (type === 'card') return `KPI Card ${index}`;
  if (type === 'container' || type === 'filter-container') return `Container ${index}`;
  if (type === 'matrix') return `Matrix ${index}`;
  if (type === 'news') return `News View ${index}`;
  if (type === 'chatbot') return `AI Chat Bot ${index}`;
  if (type === 'filter') return `Filter ${index}`;
  if (type === 'text') return `Insight ${index}`;
  if (type === 'export') return `Export Button ${index}`;
  return `Component ${index}`;
}

export function nextManualElementLayout(
  dashboard: Dashboard,
  type: string,
  dropX?: number,
  dropY?: number
): Record<string, number> {
  const base = manualElementLayout(type, dashboard.elements.length);
  const requestedLayout = {
    height: Math.max(minHeightForType(type), base.h),
    width: Math.max(minWidthForType(type), base.w),
    x: dropX ?? base.x,
    y: dropY ?? base.y
  };
  const placedLayout = findNextAvailableLayout(
    dashboard.elements.map(element => resolvedLayout(element)),
    requestedLayout
  );
  return {
    h: placedLayout.height,
    w: placedLayout.width,
    x: placedLayout.x,
    y: placedLayout.y
  };
}

interface ManualElementLayout {
  h: number;
  w: number;
  x: number;
  y: number;
}

function manualElementLayout(type: string, count: number): ManualElementLayout {
  const y = count * 5;
  if (type === 'card') return { x: 0, y, w: 6, h: 4 };
  if (type === 'container' || type === 'filter-container') return { x: 0, y, w: 12, h: 3 };
  if (type === 'filter') return { x: 0, y, w: 4, h: 2 };
  if (type === 'text') return { x: 0, y, w: 12, h: 2 };
  if (type === 'export') return { x: 9, y, w: 3, h: 1 };
  if (type === 'news') return { x: 0, y, w: 6, h: 6 };
  if (type === 'chatbot') return { x: 0, y, w: 6, h: 6 };
  return { x: 0, y, w: 6, h: 5 };
}
