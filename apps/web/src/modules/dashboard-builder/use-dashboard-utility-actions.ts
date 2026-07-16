import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import html2pdf from 'html2pdf.js';
import { copyTextWithFallback } from '../shared/clipboard';
import {
  dashboardRunConfigurationFromState,
  readDashboardRuntimeState,
  saveDashboardRunConfiguration
} from './runtime/dashboard-runtime-state';
import {
  buildDashboardDataExportPayload,
  type DashboardDataExportFormat
} from './dashboard-export';
import type { Dashboard, DashboardRunConfiguration, DashboardRuntimeState } from './types';

type DashboardExportFormat = 'json' | 'xml' | 'excel' | 'csv' | 'pdf';

export function useDashboardUtilityActions(
  selectedDashboard: ComputedRef<Dashboard | null>,
  status: Ref<string>,
  dashboardRuntimeState: Ref<DashboardRuntimeState | null>
): {
  cancelDashboardRun: () => void;
  configureDashboardRun: (
    runtime: string,
    scheduled: boolean,
    editModeRowLimit?: number,
    viewModeRowLimit?: number
  ) => void;
  copyDashboardEmbed: () => void;
  dashboardRunConfiguration: ComputedRef<DashboardRunConfiguration>;
  exportDashboard: (format: DashboardExportFormat) => void;
  isDashboardRunning: Ref<boolean>;
  runDashboard: () => void;
  sendEmailReport: () => void;
} {
  const isDashboardRunning = ref(false);
  const dashboardRunConfiguration = computed(() => dashboardRunConfigurationFromState(dashboardRuntimeState.value));

  watch(() => selectedDashboard.value?.id ?? '', dashboardId => {
    dashboardRuntimeState.value = dashboardId ? readDashboardRuntimeState(dashboardId) : null;
  }, { immediate: true });

  function runDashboard(): void {
    isDashboardRunning.value = true;
    status.value = `Dashboard run started for ${dashboardName()}`;
  }

  function cancelDashboardRun(): void {
    isDashboardRunning.value = false;
    status.value = `Dashboard run cancelled for ${dashboardName()}`;
  }

  function configureDashboardRun(
    runtime: string,
    scheduled: boolean,
    editModeRowLimit?: number,
    viewModeRowLimit?: number
  ): void {
    const dashboard = selectedDashboard.value;
    if (!dashboard) return;
    dashboardRuntimeState.value = saveDashboardRunConfiguration(dashboard.id, {
      editModeRowLimit,
      runtime,
      scheduled,
      viewModeRowLimit
    });
    const config = dashboardRunConfiguration.value;
    const limits = [
      config.editModeRowLimit ? `edit ${config.editModeRowLimit}` : '',
      config.viewModeRowLimit ? `view ${config.viewModeRowLimit}` : ''
    ].filter(Boolean).join(' / ');
    status.value = `Run configuration saved for ${config.runtime}${config.scheduled ? ' with schedule' : ''}${limits ? ` at ${limits} rows` : ''}`;
  }

  function sendEmailReport(): void {
    status.value = `Email report prepared for ${dashboardName()}`;
  }

  function copyDashboardEmbed(): void {
    const dashboard = selectedDashboard.value;
    if (!dashboard) return;
    const embedCode = `<iframe src="/embed/dashboard/${dashboard.id}"></iframe>`;
    void copyTextWithFallback(embedCode).then(copied => {
      status.value = copied ? 'Dashboard embed code copied' : 'Dashboard embed code ready to copy';
    });
  }

  function exportDashboard(format: DashboardExportFormat): void {
    const dashboard = selectedDashboard.value;
    if (!dashboard) return;
    if (format === 'pdf') {
      const dashboardContent = document.querySelector<HTMLElement>('.dashboard-content');
      if (!dashboardContent) return;
      const opt = {
        margin: 0.5,
        filename: `${dashboard.name.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' as const }
      };
      html2pdf().set(opt).from(dashboardContent).save();
      status.value = `Dashboard PDF export ready`;
      return;
    }
    if (format === 'csv' || format === 'excel') {
      void exportDashboardData(dashboard, format);
      return;
    }
    const content = exportContent(dashboard, format);
    const blob = new Blob([content], { type: exportMime(format) });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dashboard.id}.${exportExtension(format)}`;
    link.click();
    URL.revokeObjectURL(url);
    status.value = `Dashboard ${exportLabel(format)} export ready`;
  }

  async function exportDashboardData(dashboard: Dashboard, format: DashboardDataExportFormat): Promise<void> {
    const payload = buildDashboardDataExportPayload(dashboard, format, {
      runtimeParameterValues: dashboardRuntimeState.value?.runtimeParameterValues
    });
    if (!payload) {
      status.value = 'No exportable dashboard data found';
      return;
    }
    status.value = `Preparing ${exportLabel(format)} export`;
    try {
      const response = await fetch('/api/chart-data/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        status.value = await exportErrorMessage(response);
        return;
      }
      const blob = await response.blob();
      triggerBlobDownload(blob, downloadFileName(response, dashboard.name, format));
      status.value = `Dashboard ${exportLabel(format)} export ready`;
    } catch (caught) {
      status.value = caught instanceof Error && caught.message ? caught.message : 'Dashboard export failed';
    }
  }

  function dashboardName(): string {
    return selectedDashboard.value?.name ?? 'dashboard';
  }

  return {
    cancelDashboardRun,
    configureDashboardRun,
    copyDashboardEmbed,
    dashboardRunConfiguration,
    exportDashboard,
    isDashboardRunning,
    runDashboard,
    sendEmailReport
  };
}

function exportContent(dashboard: Dashboard, format: DashboardExportFormat): string {
  if (format === 'json') return JSON.stringify(dashboard, null, 2);
  if (format === 'xml') return `<dashboard id="${dashboard.id}" name="${dashboard.name}" category="${dashboard.category}" />`;
  if (format === 'csv') return `id,name,category,status\n${dashboard.id},${dashboard.name},${dashboard.category},${dashboard.status}`;
  return `${dashboard.name}\n${dashboard.category}\n${dashboard.status}`;
}

function exportMime(format: DashboardExportFormat): string {
  if (format === 'json') return 'application/json';
  if (format === 'xml') return 'application/xml';
  if (format === 'csv') return 'text/csv';
  if (format === 'pdf') return 'application/pdf';
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

function exportExtension(format: DashboardExportFormat): string {
  return format === 'excel' ? 'xlsx' : format;
}

function exportLabel(format: DashboardExportFormat): string {
  return format === 'excel' ? 'Excel' : format.toUpperCase();
}

async function exportErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error ?? 'Dashboard export failed';
  } catch {
    return 'Dashboard export failed';
  }
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadFileName(response: Response, dashboardName: string, format: DashboardDataExportFormat): string {
  const header = response.headers.get('content-disposition') ?? '';
  const fromHeader = /filename="?([^";]+)"?/i.exec(header)?.[1];
  if (fromHeader) return fromHeader;
  const extension = format === 'excel' ? 'xls' : format;
  return `${dashboardName.replace(/\s+/g, '_')}.${extension}`;
}
