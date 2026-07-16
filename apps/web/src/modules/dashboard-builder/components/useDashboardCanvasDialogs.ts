import { computed, ref, type ComputedRef } from 'vue';
import type { DashboardElement, DashboardFilter } from '../types';
import { loadVisualizationData } from '../visualization/data';
import { visualizationSpecFromElement } from '../visualization/spec';
import { dashboardDataCachePolicyFromSettings } from '../dashboard-data-cache-policy';
import { buildDashboardDataExportPayload } from '../dashboard-export';
import { buildDashboardCanvasIndicatorSummary, type DashboardCanvasInfoTab } from './canvas/dashboard-canvas-indicators';
import {
  buildDashboardComponentDownloadPayload,
  resolveDashboardComponentDownloadTarget,
  type DashboardComponentDownloadFormat
} from './canvas/component-download';
import type { ComponentDataPreview, DashboardCanvasEmit, DashboardCanvasProps } from './dashboard-canvas-types';

export function useDashboardCanvasDialogs(
  props: DashboardCanvasProps,
  emit: DashboardCanvasEmit,
  options: {
    activeRowLimit: ComputedRef<number | undefined>;
    closeSettingsMenu: (elementId: string) => void;
    filtersForElement: (element: DashboardElement) => DashboardFilter[];
    orderedElements: ComputedRef<DashboardElement[]>;
  }
) {
  const viewDataElement = ref<DashboardElement | null>(null);
  const viewDataError = ref('');
  const viewDataLoading = ref(false);
  const viewDataPreview = ref<ComponentDataPreview | null>(null);
  const downloadElement = ref<DashboardElement | null>(null);
  const downloadError = ref('');
  const downloadFormat = ref<DashboardComponentDownloadFormat>('csv');
  const downloadLoading = ref(false);
  const expandedElement = ref<DashboardElement | null>(null);
  const infoElement = ref<DashboardElement | null>(null);
  const infoInitialTab = ref<DashboardCanvasInfoTab>('filters');

  const currentDownloadTarget = computed(() => downloadElement.value
    ? resolveDashboardComponentDownloadTarget(props.dataSources, downloadElement.value)
    : null);
  const currentInfoElement = computed(() => infoElement.value
    ? props.dashboard.elements.find(element => element.id === infoElement.value?.id) ?? infoElement.value
    : null);
  const infoSummary = computed(() => currentInfoElement.value
    ? buildDashboardCanvasIndicatorSummary(currentInfoElement.value, props.dashboard.filters)
    : null);

  async function openViewData(element: DashboardElement): Promise<void> {
    options.closeSettingsMenu(element.id);
    viewDataElement.value = element;
    viewDataError.value = '';
    viewDataLoading.value = true;
    viewDataPreview.value = null;
    try {
      const data = await loadVisualizationData(element, visualizationSpecFromElement(element), options.filtersForElement(element), {
        cachePolicy: dashboardDataCachePolicyFromSettings(props.dashboardSettings),
        peerElements: options.orderedElements.value,
        requestContext: props.visualizationRequest,
        rowLimit: options.activeRowLimit.value
      });
      viewDataPreview.value = componentDataPreview(data);
    } catch (caught) {
      viewDataError.value = caught instanceof Error && caught.message ? caught.message : 'Component data could not be loaded.';
    } finally {
      viewDataLoading.value = false;
    }
  }

  function openInfo(element: DashboardElement, tab: DashboardCanvasInfoTab): void {
    infoElement.value = element;
    infoInitialTab.value = tab;
  }

  function openInfoFromMenu(element: DashboardElement, tab: DashboardCanvasInfoTab): void {
    options.closeSettingsMenu(element.id);
    openInfo(element, tab);
  }

  function closeInfo(): void {
    infoElement.value = null;
  }

  function saveInfoSettings(
    elementId: string,
    patch: { chartType?: string; config: Record<string, unknown>; name?: string }
  ): void {
    emit('updateConfig', elementId, patch);
  }

  async function openDownloadDialog(element: DashboardElement): Promise<void> {
    options.closeSettingsMenu(element.id);
    downloadElement.value = element;
    downloadError.value = '';
    downloadFormat.value = 'csv';
  }

  async function expandElement(element: DashboardElement): Promise<void> {
    options.closeSettingsMenu(element.id);
    expandedElement.value = element;
  }

  async function confirmDownload(): Promise<void> {
    if (typeof window === 'undefined' || !downloadElement.value || !currentDownloadTarget.value) return;
    downloadError.value = '';
    downloadLoading.value = true;
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (props.visualizationRequest?.token) headers.authorization = `Bearer ${props.visualizationRequest.token}`;
      if (props.visualizationRequest?.embedOrigin) headers['x-embed-origin'] = props.visualizationRequest.embedOrigin;
      const body = props.visualizationRequest?.downloadEndpoint
        ? buildDashboardComponentDownloadPayload(
            downloadElement.value,
            options.filtersForElement(downloadElement.value),
            downloadFormat.value,
            currentDownloadTarget.value,
            props.visualizationRequest?.token ? undefined : props.visualizationRequest?.runtimeParameterValues
          )
        : buildDashboardDataExportPayload(props.dashboard, downloadFormat.value, {
            elements: [downloadElement.value],
            filtersByElementId: { [downloadElement.value.id]: options.filtersForElement(downloadElement.value) },
            runtimeParameterValues: props.visualizationRequest?.token ? undefined : props.visualizationRequest?.runtimeParameterValues
          });
      if (!body) {
        downloadError.value = 'Component data could not be prepared for download.';
        return;
      }
      const response = await fetch(props.visualizationRequest?.downloadEndpoint ?? '/api/chart-data/export', {
        body: JSON.stringify(body),
        headers,
        method: 'POST'
      });
      if (!response.ok) {
        downloadError.value = await readDownloadError(response);
        return;
      }
      const blob = await response.blob();
      triggerBlobDownload(blob, downloadFileName(response, downloadElement.value.name, downloadFormat.value));
      closeDownloadDialog();
    } catch (caught) {
      downloadError.value = caught instanceof Error && caught.message ? caught.message : 'Component data could not be downloaded.';
    } finally {
      downloadLoading.value = false;
    }
  }

  function closeViewData(): void {
    viewDataElement.value = null;
    viewDataError.value = '';
    viewDataLoading.value = false;
    viewDataPreview.value = null;
  }

  function closeDownloadDialog(): void {
    downloadElement.value = null;
    downloadError.value = '';
    downloadFormat.value = 'csv';
    downloadLoading.value = false;
  }

  function closeExpandedElement(): void {
    expandedElement.value = null;
  }

  return {
    closeDownloadDialog,
    closeExpandedElement,
    closeInfo,
    closeViewData,
    confirmDownload,
    currentDownloadTarget,
    currentInfoElement,
    downloadElement,
    downloadError,
    downloadFormat,
    downloadLoading,
    expandedElement,
    expandElement,
    infoInitialTab,
    infoSummary,
    openDownloadDialog,
    openInfo,
    openInfoFromMenu,
    openViewData,
    previewCellValue,
    saveInfoSettings,
    viewDataElement,
    viewDataError,
    viewDataLoading,
    viewDataPreview
  };
}

function componentDataPreview(data: { datasets: Array<{ data: number[]; label: string }>; labels: string[]; rawData?: Array<Record<string, unknown>> }): ComponentDataPreview {
  const rows = data.rawData?.length
    ? data.rawData
    : data.labels.map((label, index) => ({
      label,
      ...Object.fromEntries(data.datasets.map(dataset => [dataset.label, dataset.data[index] ?? null]))
    }));
  const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row)))).slice(0, 12);
  return {
    columns,
    rows: rows.slice(0, 100),
    totalRows: rows.length
  };
}

function previewCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

async function readDownloadError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return `Download failed with status ${response.status}`;
  try {
    const payload = await response.json() as { error?: unknown } | null;
    if (payload && typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  } catch {
    return `Download failed with status ${response.status}`;
  }
  return `Download failed with status ${response.status}`;
}

function downloadFileName(response: Response, title: string, format: DashboardComponentDownloadFormat): string {
  const contentDisposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/i.exec(contentDisposition);
  if (match?.[1]) return match[1];
  const safeTitle = title.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '') || 'component-data';
  return `${safeTitle}.${format === 'excel' ? 'xlsx' : 'csv'}`;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
}
