import type { DashboardElement, DashboardSettings, VisualizationData, VisualizationSpec } from '../types';
import { applySortingAndTopN, normalizeData } from '../visualization/chart/data';
import { readBaseOptions } from '../visualization/chart/options';
import type { DashboardElementRenderKind } from '../visualization/view-model-types';

export type DashboardElementRendererState = 'empty' | 'error' | 'loading' | 'ready' | 'stopped';

export const DASHBOARD_ELEMENT_RENDER_LOADING_MESSAGE = 'Loading...';

export function dashboardDefaultElement(
  element: DashboardElement,
  settings: DashboardSettings | undefined
): DashboardElement {
  const currencySymbol = settings?.currencySymbol;
  if (!currencySymbol) return element;
  const config = element.config ?? {};
  return {
    ...element,
    config: {
      ...config,
      ...(typeof config.currencySymbol !== 'string' ? { currencySymbol } : {})
    }
  };
}

export function dashboardElementKindLabel(renderKind: DashboardElementRenderKind): string {
  if (renderKind === 'card') return 'card';
  if (renderKind === 'chatbot') return 'chatbot';
  if (renderKind === 'container') return 'container';
  if (renderKind === 'export') return 'export';
  if (renderKind === 'filter') return 'filter';
  if (renderKind === 'matrix') return 'matrix';
  if (renderKind === 'news') return 'news view';
  if (renderKind === 'table') return 'table';
  if (renderKind === 'text') return 'text';
  return 'chart';
}

export function isStaticDashboardElementRenderKind(renderKind: DashboardElementRenderKind): boolean {
  return renderKind === 'container'
    || renderKind === 'filter'
    || renderKind === 'export'
    || renderKind === 'news'
    || renderKind === 'chatbot'
    || renderKind === 'text';
}

export function dashboardElementHasRenderableData(
  renderKind: DashboardElementRenderKind,
  data: VisualizationData | null,
  spec: VisualizationSpec
): boolean {
  if (!data) return false;
  if (renderKind === 'chart') return chartDataCanRender(data, spec);
  return Boolean(data.labels.length && data.datasets.some(dataset => dataset.data.length > 0));
}

export function chartDataCanRender(data: VisualizationData, visualizationSpec: VisualizationSpec): boolean {
  const options = readBaseOptions(visualizationSpec);
  const visibleData = applySortingAndTopN(normalizeData(data), options);
  return Boolean(visibleData.labels.length && visibleData.datasets.some(dataset => dataset.data.length > 0));
}

export function rendererStateTitle(state: DashboardElementRendererState): string {
  if (state === 'loading') return DASHBOARD_ELEMENT_RENDER_LOADING_MESSAGE;
  if (state === 'error') return 'Component rendering failed';
  if (state === 'stopped') return 'Loading stopped';
  return 'No data available';
}

export function rendererStateDetail(state: DashboardElementRendererState, status: string): string {
  if (state === 'empty') return 'No records match the current filters';
  if (state === 'error') return status;
  if (state === 'stopped') return 'Run the component again to refresh dashboard data';
  return '';
}
