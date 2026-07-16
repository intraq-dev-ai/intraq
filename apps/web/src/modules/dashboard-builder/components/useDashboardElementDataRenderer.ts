import { computed, nextTick, ref, watch, type ComputedRef } from 'vue';
import type { DashboardElement, DashboardFilter, DashboardSettings, VisualizationData, VisualizationSpec } from '../types';
import { dashboardDataCachePolicyFromSettings } from '../dashboard-data-cache-policy';
import { clearVisualizationDataCache, loadVisualizationData, type VisualizationDataRequestContext } from '../visualization/data';
import { enqueueVisualizationLoad } from '../visualization/load-queue';
import type { DashboardElementRenderKind } from '../visualization/view-model-types';
import {
  DASHBOARD_ELEMENT_RENDER_LOADING_MESSAGE,
  chartDataCanRender,
  isStaticDashboardElementRenderKind,
  rendererStateDetail,
  rendererStateTitle,
  type DashboardElementRendererState
} from './dashboard-element-renderer-model';
import {
  clearTokenExpiredReloadMarker,
  isTokenExpiredErrorMessage,
  notifyParentOfEmbedTokenExpiry,
  recordSuppressedRenderError,
  reloadPageOnceForTokenExpiry,
  shouldUseViewerFallbackForEmptyData,
  shouldUseViewerFallbackForRenderError,
  viewerFallbackVisualizationData
} from './dashboard-element-renderer-fallback';

export interface DashboardElementRendererDataProps {
  dashboardElements?: DashboardElement[];
  dashboardSettings?: DashboardSettings | undefined;
  element: DashboardElement;
  filters: DashboardFilter[];
  rowLimit?: number | undefined;
  runToken: number;
  cancelToken: number;
  canEditDashboard: boolean;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}

export function useDashboardElementDataRenderer(options: {
  effectiveElement: ComputedRef<DashboardElement>;
  kindLabel: ComputedRef<string>;
  onError: (elementId: string, message: string) => void;
  onLoaded: (elementId: string) => void;
  onLoading: (elementId: string) => void;
  props: Readonly<DashboardElementRendererDataProps>;
  renderKind: ComputedRef<DashboardElementRenderKind>;
  spec: ComputedRef<VisualizationSpec>;
}) {
  const status = ref(DASHBOARD_ELEMENT_RENDER_LOADING_MESSAGE);
  const rendererState = ref<DashboardElementRendererState>('loading');
  const isRefreshing = ref(false);
  const chartData = ref<VisualizationData | null>(null);
  let requestSequence = 0;
  let lastRunToken = options.props.runToken;
  let lastCancelToken = options.props.cancelToken;

  const isLoading = computed(() => rendererState.value === 'loading');
  const isReady = computed(() => rendererState.value === 'ready');
  const hasStateMessage = computed(() => rendererState.value !== 'ready');
  const stateTitle = computed(() => rendererStateTitle(rendererState.value));
  const stateDetail = computed(() => rendererStateDetail(rendererState.value, status.value));
  const renderKey = computed(() => JSON.stringify({
    cancelToken: options.props.cancelToken,
    chartType: options.props.element.chartType,
    config: options.effectiveElement.value.config,
    dashboardSettings: options.props.dashboardSettings,
    filters: options.props.filters,
    id: options.props.element.id,
    rowLimit: options.props.rowLimit,
    runToken: options.props.runToken,
    type: options.props.element.type,
    visualizationRequest: options.props.visualizationRequest
  }));

  watch(renderKey, () => {
    const refresh = options.props.runToken !== lastRunToken;
    const cancelled = options.props.cancelToken !== lastCancelToken;
    lastRunToken = options.props.runToken;
    lastCancelToken = options.props.cancelToken;
    if (cancelled) {
      stopRender();
      return;
    }
    void renderElement(refresh);
  }, { immediate: true });

  async function renderElement(refresh: boolean): Promise<void> {
    if (isStaticDashboardElementRenderKind(options.renderKind.value)) {
      chartData.value = null;
      rendererState.value = 'ready';
      status.value = `Rendered dashboard ${options.kindLabel.value} component`;
      options.onLoaded(options.props.element.id);
      return;
    }
    const sequence = nextRequest();
    const keepCurrentRender = !refresh && rendererState.value === 'ready' && chartData.value !== null;
    if (keepCurrentRender) {
      isRefreshing.value = true;
    } else {
      rendererState.value = 'loading';
    }
    status.value = DASHBOARD_ELEMENT_RENDER_LOADING_MESSAGE;
    if (!keepCurrentRender) chartData.value = null;
    options.onLoading(options.props.element.id);
    const elementSnapshot = cloneRenderInput(options.effectiveElement.value);
    const specSnapshot = cloneRenderInput(options.spec.value);
    const filtersSnapshot = cloneRenderInput(options.props.filters);
    const dashboardElementsSnapshot = cloneRenderInput(options.props.dashboardElements);
    const dashboardSettingsSnapshot = cloneRenderInput(options.props.dashboardSettings);
    const visualizationRequestSnapshot = cloneRenderInput(options.props.visualizationRequest);
    const rowLimitSnapshot = options.props.rowLimit;
    const orderSnapshot = options.props.element.order ?? 999;
    try {
      const data = await loadElementVisualizationData({
        dashboardElements: dashboardElementsSnapshot,
        dashboardSettings: dashboardSettingsSnapshot,
        element: elementSnapshot,
        filters: filtersSnapshot,
        order: orderSnapshot,
        refresh,
        requestContext: visualizationRequestSnapshot,
        rowLimit: rowLimitSnapshot,
        spec: specSnapshot
      });
      if (sequence !== requestSequence) return;
      await applyLoadedVisualizationData(data);
    } catch (caught) {
      if (sequence !== requestSequence) return;
      const message = caught instanceof Error && caught.message ? caught.message : 'Component rendering failed';
      if (isTokenExpiredErrorMessage(message)) {
        const recovered = await recoverTokenExpiredComponentRender(sequence, {
          dashboardElements: dashboardElementsSnapshot,
          dashboardSettings: dashboardSettingsSnapshot,
          element: elementSnapshot,
          filters: filtersSnapshot,
          order: orderSnapshot,
          requestContext: visualizationRequestSnapshot,
          rowLimit: rowLimitSnapshot,
          spec: specSnapshot
        });
        if (recovered) return;
      }
      if (shouldUseViewerFallbackForRenderError(message, {
        canEditDashboard: options.props.canEditDashboard,
        requestContext: visualizationRequestSnapshot
      })) {
        await applyViewerFallbackForRenderError(message, {
          elementSnapshot,
          filtersSnapshot,
          rowLimitSnapshot,
          specSnapshot,
          visualizationRequestSnapshot
        });
        return;
      }
      setRenderError(message);
    } finally {
      if (sequence === requestSequence) isRefreshing.value = false;
    }
  }

  async function loadElementVisualizationData(loadOptions: {
    dashboardElements: DashboardElement[] | undefined;
    dashboardSettings: DashboardSettings | undefined;
    element: DashboardElement;
    filters: DashboardFilter[];
    order: number;
    refresh: boolean;
    requestContext: VisualizationDataRequestContext | undefined;
    rowLimit: number | undefined;
    spec: VisualizationSpec;
  }): Promise<VisualizationData> {
    return enqueueVisualizationLoad(loadOptions.order, () =>
      loadVisualizationData(loadOptions.element, loadOptions.spec, loadOptions.filters, {
        peerElements: loadOptions.dashboardElements,
        refresh: loadOptions.refresh,
        cachePolicy: dashboardDataCachePolicyFromSettings(loadOptions.dashboardSettings),
        requestContext: loadOptions.requestContext,
        rowLimit: loadOptions.rowLimit
      })
    );
  }

  async function applyLoadedVisualizationData(data: VisualizationData): Promise<void> {
    const renderData = shouldUseViewerFallbackForEmptyData(data, {
      canEditDashboard: options.props.canEditDashboard,
      renderKind: options.renderKind.value,
      spec: options.spec.value
    })
      ? viewerFallbackVisualizationData(
        options.effectiveElement.value,
        options.spec.value,
        options.props.filters,
        options.props.visualizationRequest,
        options.props.rowLimit,
        options.renderKind.value
      )
      : data;
    chartData.value = renderData;
    const hasRawRows = (renderData.rawData?.length ?? 0) > 0;
    const canRenderFilledChart = options.renderKind.value === 'chart' && chartDataCanRender(renderData, options.spec.value);
    if (!hasRawRows && !canRenderFilledChart && (renderData.labels.length === 0 || renderData.datasets.every(dataset => dataset.data.length === 0))) {
      rendererState.value = 'empty';
      status.value = 'No records match the current filters';
      options.onLoaded(options.props.element.id);
      clearTokenExpiredReloadMarker(options.props.element.dashboardId);
      return;
    }

    rendererState.value = 'ready';
    await nextTick();
    status.value = 'Rendered dashboard component';
    options.onLoaded(options.props.element.id);
    clearTokenExpiredReloadMarker(options.props.element.dashboardId);
  }

  async function recoverTokenExpiredComponentRender(
    sequence: number,
    loadOptions: Omit<Parameters<typeof loadElementVisualizationData>[0], 'refresh'>
  ): Promise<boolean> {
    clearVisualizationDataCache();
    rendererState.value = 'loading';
    status.value = DASHBOARD_ELEMENT_RENDER_LOADING_MESSAGE;
    try {
      const data = await loadElementVisualizationData({ ...loadOptions, refresh: true });
      if (sequence !== requestSequence) return true;
      await applyLoadedVisualizationData(data);
      return true;
    } catch (caught) {
      if (sequence !== requestSequence) return true;
      const message = caught instanceof Error && caught.message ? caught.message : 'Component rendering failed';
      if (isTokenExpiredErrorMessage(message)) {
        notifyParentOfEmbedTokenExpiry(message, options.props.element, options.props.visualizationRequest);
        if (reloadPageOnceForTokenExpiry(options.props.element.dashboardId, options.props.canEditDashboard)) {
          status.value = DASHBOARD_ELEMENT_RENDER_LOADING_MESSAGE;
          return true;
        }
      }
      if (shouldUseViewerFallbackForRenderError(message, {
        canEditDashboard: options.props.canEditDashboard,
        requestContext: loadOptions.requestContext
      })) {
        await applyViewerFallbackForRenderError(message, {
          elementSnapshot: loadOptions.element,
          filtersSnapshot: loadOptions.filters,
          rowLimitSnapshot: loadOptions.rowLimit,
          specSnapshot: loadOptions.spec,
          visualizationRequestSnapshot: loadOptions.requestContext
        });
        return true;
      }
      setRenderError(message);
      return true;
    }
  }

  async function applyViewerFallbackForRenderError(
    message: string,
    input: {
      elementSnapshot: DashboardElement;
      filtersSnapshot: DashboardFilter[];
      rowLimitSnapshot: number | undefined;
      specSnapshot: VisualizationSpec;
      visualizationRequestSnapshot: VisualizationDataRequestContext | undefined;
    }
  ): Promise<void> {
    recordSuppressedRenderError(
      message,
      input.elementSnapshot,
      input.specSnapshot,
      input.visualizationRequestSnapshot,
      options.renderKind.value
    );
    await applyLoadedVisualizationData(viewerFallbackVisualizationData(
      input.elementSnapshot,
      input.specSnapshot,
      input.filtersSnapshot,
      input.visualizationRequestSnapshot,
      input.rowLimitSnapshot,
      options.renderKind.value
    ));
  }

  function setRenderError(message: string): void {
    chartData.value = null;
    rendererState.value = 'error';
    status.value = message;
    options.onError(options.props.element.id, message);
  }

  function nextRequest(): number {
    requestSequence += 1;
    return requestSequence;
  }

  function stopRender(): void {
    requestSequence += 1;
    isRefreshing.value = false;
    rendererState.value = 'stopped';
    status.value = 'Loading stopped';
    options.onLoaded(options.props.element.id);
  }

  return {
    chartData,
    hasStateMessage,
    isLoading,
    isReady,
    isRefreshing,
    rendererState,
    stateDetail,
    stateTitle,
    status
  };
}

function cloneRenderInput<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
