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
const nonChartTypes = new Set([
  'card',
  'chatbot',
  'container',
  'export',
  'filter',
  'filter-container',
  'matrix',
  'news',
  'table',
  'text'
]);

export interface DashboardElementShapeInput {
  chartType?: string | null | undefined;
  config?: Record<string, unknown>;
  type?: string | null | undefined;
}

export interface NormalizedDashboardElementShape {
  chartType?: string;
  config: Record<string, unknown>;
  type: string;
}

export function normalizeChartType(value: unknown): string | undefined {
  const text = optionalString(value)?.toLowerCase();
  if (!text) return undefined;
  if (text === 'donut') return 'doughnut';
  return chartTypes.has(text) ? text : undefined;
}

export function normalizeDashboardElementShape(
  input: DashboardElementShapeInput,
  fallbackChartType = 'bar'
): NormalizedDashboardElementShape {
  const rawType = optionalString(input.type)?.toLowerCase() ?? 'chart';
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

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
