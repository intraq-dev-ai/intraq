import type { DashboardElement } from './types';

const chartTypes = new Set([
  'area',
  'bar',
  'column',
  'doughnut',
  'line',
  'pie',
  'scatter',
  'stacked'
]);
const nonChartTypes = new Set(['card', 'chatbot', 'container', 'export', 'filter', 'filter-container', 'matrix', 'news', 'table', 'text']);

export interface DashboardElementShapeInput {
  chartType?: string | undefined;
  config?: Record<string, unknown>;
  type?: string | undefined;
}

export interface NormalizedDashboardElementShape {
  chartType?: string;
  config: Record<string, unknown>;
  type: string;
}

export function normalizeChartType(value: unknown): string | undefined {
  const text = readString(value)?.toLowerCase();
  if (!text) return undefined;
  if (text === 'donut') return 'doughnut';
  return chartTypes.has(text) ? text : undefined;
}

export function chartTypeForElement(
  element: Pick<DashboardElement, 'chartType' | 'config' | 'type'> | null | undefined,
  fallback = 'bar'
): string {
  const type = readString(element?.type)?.toLowerCase();
  const typeChartType = normalizeChartType(type);
  if (type && type !== 'chart' && !typeChartType) return fallback;
  return normalizeChartType(element?.chartType)
    ?? normalizeChartType(element?.config?.chartType)
    ?? typeChartType
    ?? fallback;
}

export function editorTypeForElement(
  element: Pick<DashboardElement, 'chartType' | 'config' | 'type'> | null | undefined
): string {
  const type = readString(element?.type)?.toLowerCase();
  if (!type) return 'chart';
  return type === 'chart' || normalizeChartType(type) ? 'chart' : type;
}

export function dashboardElementUsesDataSource(type: string): boolean {
  return !['container', 'export', 'filter-container', 'text'].includes(type.trim().toLowerCase());
}

export function normalizeDashboardElementShape(
  input: DashboardElementShapeInput,
  fallbackChartType = 'bar'
): NormalizedDashboardElementShape {
  const rawType = readString(input.type)?.toLowerCase() ?? 'chart';
  const config = { ...(input.config ?? {}) };
  const typeChartType = normalizeChartType(rawType);
  const chartType = normalizeChartType(input.chartType)
    ?? normalizeChartType(config.chartType)
    ?? typeChartType;
  if (rawType === 'chart' || typeChartType || (chartType && !nonChartTypes.has(rawType))) {
    const canonicalChartType = chartType ?? fallbackChartType;
    config.chartType = canonicalChartType;
    config.type = canonicalChartType;
    return {
      type: 'chart',
      chartType: canonicalChartType,
      config
    };
  }
  return {
    type: rawType,
    config
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
