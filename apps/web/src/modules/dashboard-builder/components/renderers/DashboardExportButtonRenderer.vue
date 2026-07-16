<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DashboardElement, DashboardFilter } from '../../types';
import {
  buildDashboardDataExportItem,
  type DashboardDataExportFormat
} from '../../dashboard-export';
import type { VisualizationDataRequestContext } from '../../visualization/data';

const props = defineProps<{
  dashboardElements?: DashboardElement[] | undefined;
  element: DashboardElement;
  filters?: DashboardFilter[];
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>();

type ExportState = 'error' | 'idle' | 'success';
type ExportFieldConfig = string | Record<string, unknown>;

const exportLoading = ref(false);
const exportState = ref<ExportState>('idle');
const exportError = ref('');

const config = computed(() => props.element.config ?? {});
const buttonLabel = computed(() =>
  readString(config.value.buttonLabel)
  ?? readString(config.value.exportLabel)
  ?? readString(config.value.label)
  ?? props.element.name
  ?? 'Export'
);
const exportFormat = computed<DashboardDataExportFormat>(() => {
  const value = readString(config.value.format)?.toLowerCase();
  if (value === 'excel' || value === 'json') return value;
  return 'csv';
});
const buttonStyle = computed(() => {
  const value = readString(config.value.buttonStyle ?? config.value.styleVariant ?? config.value.variant)?.toLowerCase();
  return value === 'legacy-toolbar' || value === 'warning-toolbar' || value === 'toolbar-warning'
    ? 'legacy-toolbar'
    : 'default';
});
const showIcon = computed(() => config.value.showIcon !== false);
const configuredTargetIds = computed(() => readStringArray(
  config.value.targetElementIds
  ?? config.value.targetElements
  ?? config.value.componentIds
  ?? config.value.targetElementId
  ?? config.value.componentId
  ?? config.value.exportElementId
));
const targetElements = computed(() => {
  const peers = props.dashboardElements ?? [];
  const ids = configuredTargetIds.value;
  if (ids.length > 0) {
    const idSet = new Set(ids);
    return peers.filter(element => element.id !== props.element.id && idSet.has(element.id));
  }
  const direct = directExportTargetElement();
  return direct ? [direct] : [];
});
const canExport = computed(() => targetElements.value.length > 0 && !exportLoading.value);
const rootStyle = computed(() => ({
  '--export-button-bg': readString(config.value.buttonBackgroundColor ?? config.value.backgroundColor ?? config.value.background) ?? defaultButtonBackground(),
  '--export-button-border': readString(config.value.buttonBorderColor ?? config.value.borderColor) ?? defaultButtonBorder(),
  '--export-button-color': readString(config.value.buttonTextColor ?? config.value.textColor ?? config.value.color) ?? defaultButtonColor(),
  '--export-button-radius': readCssSize(config.value.borderRadius) ?? defaultButtonRadius(),
  '--export-button-justify': readJustify(config.value.align ?? config.value.justify) ?? 'center'
}));
const buttonClasses = computed(() => ({
  'dashboard-export-button--legacy-toolbar': buttonStyle.value === 'legacy-toolbar'
}));
const rootClasses = computed(() => ({
  'dashboard-export-button-element--legacy-toolbar': buttonStyle.value === 'legacy-toolbar'
}));

async function exportData(): Promise<void> {
  if (!canExport.value || typeof window === 'undefined') return;
  exportLoading.value = true;
  exportState.value = 'idle';
  exportError.value = '';
  try {
    const payload = exportPayload();
    if (!payload) {
      exportError.value = 'Export target is not configured.';
      exportState.value = 'error';
      return;
    }
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (props.visualizationRequest?.token) headers.authorization = `Bearer ${props.visualizationRequest.token}`;
    if (props.visualizationRequest?.embedOrigin) headers['x-embed-origin'] = props.visualizationRequest.embedOrigin;
    const response = await fetch(props.visualizationRequest?.token ? '/api/embed/chart-data/export' : '/api/chart-data/export', {
      body: JSON.stringify(payload),
      headers,
      method: 'POST'
    });
    if (!response.ok) {
      exportError.value = await readExportError(response);
      exportState.value = 'error';
      return;
    }
    triggerBlobDownload(await response.blob(), downloadFileName(response, buttonLabel.value, exportFormat.value));
    exportState.value = 'success';
  } catch (caught) {
    exportError.value = caught instanceof Error && caught.message ? caught.message : 'Export failed.';
    exportState.value = 'error';
  } finally {
    exportLoading.value = false;
  }
}

function exportPayload(): Record<string, unknown> | null {
  const items = targetElements.value.flatMap(target => {
    const item = buildDashboardDataExportItem(
      target,
      props.filters ?? [],
      exportLimit(),
      props.visualizationRequest?.token ? undefined : props.visualizationRequest?.runtimeParameterValues
    );
    return item ? [withExportWorkflow(item, target.config)] : [];
  });
  if (items.length === 0) return null;
  return {
    dashboardId: props.element.dashboardId,
    dashboardName: props.element.name,
    format: exportFormat.value,
    items,
    limit: exportLimit()
  };
}

function directExportTargetElement(): DashboardElement | null {
  const dataSourceId = readString(config.value.dataSourceId);
  const tableName = readString(config.value.tableName ?? config.value.dataSource ?? config.value.dataSourceTable);
  if (!dataSourceId || !tableName) return null;
  const columns = exportColumns();
  const fields = exportFieldNames(columns);
  return {
    id: `${props.element.id}:target`,
    dashboardId: props.element.dashboardId,
    name: props.element.name,
    type: 'table',
    config: {
      dataSourceId,
      dataSource: tableName,
      tableName,
      columns,
      fields,
      ...workflowTargetConfig()
    },
    dataSourceId,
    order: props.element.order,
    isVisible: true
  };
}

function withExportWorkflow<TItem extends Record<string, unknown>>(
  item: TItem,
  targetConfig: Record<string, unknown> | undefined
): TItem {
  const workflowId = readString(config.value.workflowId ?? config.value.pipelineId ?? targetConfig?.workflowId ?? targetConfig?.pipelineId);
  const workflowOutput = readRecord(config.value.workflowOutput ?? config.value.workflowTarget ?? config.value.pipelineOutput ?? targetConfig?.workflowOutput ?? targetConfig?.workflowTarget ?? targetConfig?.pipelineOutput);
  const patch = {
    ...(workflowId ? { workflowId } : {}),
    ...(workflowOutput ? { workflowOutput } : {})
  };
  if (!workflowId && !workflowOutput) return item;
  return {
    ...item,
    ...patch,
    chartDataRequest: {
      ...readRecord(item.chartDataRequest),
      ...patch
    }
  };
}

function workflowTargetConfig(): Record<string, unknown> {
  return {
    ...readOptionalStringPatch('workflowId', config.value.workflowId ?? config.value.pipelineId),
    ...readOptionalRecordPatch('workflowOutput', config.value.workflowOutput ?? config.value.workflowTarget ?? config.value.pipelineOutput)
  };
}

function exportColumns(): ExportFieldConfig[] {
  const fields = readExportFieldArray(
    config.value.columns
    ?? config.value.fields
    ?? config.value.exportFields
    ?? config.value.selectFields
    ?? config.value.xField
  );
  return fields.length > 0 ? fields : ['__export__'];
}

function exportFieldNames(fields: ExportFieldConfig[]): string[] {
  const names = fields.flatMap(field => {
    if (typeof field === 'string') return readString(field) ? [readString(field) as string] : [];
    const name = readString(field.field ?? field.name ?? field.key);
    return name ? [name] : [];
  });
  return names.length > 0 ? names : ['__export__'];
}

function exportLimit(): number {
  const value = Number(config.value.limit ?? config.value.rowLimit ?? config.value.exportLimit ?? 100_000);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 100_000;
}

async function readExportError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return `Export failed with status ${response.status}`;
  try {
    const payload = await response.json() as { error?: unknown } | null;
    if (payload && typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  } catch {
    return `Export failed with status ${response.status}`;
  }
  return `Export failed with status ${response.status}`;
}

function downloadFileName(response: Response, title: string, format: DashboardDataExportFormat): string {
  const contentDisposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/i.exec(contentDisposition);
  if (match?.[1]) return match[1];
  const safeTitle = title.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '') || 'dashboard-export';
  return `${safeTitle}.${format === 'excel' ? 'xls' : format}`;
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

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(item => readString(item) ? [readString(item) as string] : []);
  const text = readString(value);
  return text ? text.split(',').map(item => item.trim()).filter(Boolean) : [];
}

function readExportFieldArray(value: unknown): ExportFieldConfig[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      const text = readString(item);
      if (text) return [text];
      const record = readRecord(item);
      return record && readString(record.field ?? record.name ?? record.key) ? [record] : [];
    });
  }
  return readStringArray(value);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readOptionalStringPatch(key: string, value: unknown): Record<string, string> {
  const text = readString(value);
  return text ? { [key]: text } : {};
}

function readOptionalRecordPatch(key: string, value: unknown): Record<string, Record<string, unknown>> {
  const record = readRecord(value);
  return record && Object.keys(record).length > 0 ? { [key]: record } : {};
}

function readCssSize(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
  return readString(value);
}

function readJustify(value: unknown): string | undefined {
  const text = readString(value)?.toLowerCase();
  if (text === 'left' || text === 'start') return 'flex-start';
  if (text === 'right' || text === 'end') return 'flex-end';
  if (text === 'center') return 'center';
  return undefined;
}

function defaultButtonBackground(): string {
  return buttonStyle.value === 'legacy-toolbar' ? '#f0ad4e' : '#111827';
}

function defaultButtonBorder(): string {
  return buttonStyle.value === 'legacy-toolbar' ? '#eea236' : 'transparent';
}

function defaultButtonColor(): string {
  return '#ffffff';
}

function defaultButtonRadius(): string {
  return buttonStyle.value === 'legacy-toolbar' ? '4px' : '8px';
}
</script>

<template>
  <div
    class="dashboard-export-button-element"
    :class="rootClasses"
    :style="rootStyle"
    role="group"
    :aria-label="`Export component ${element.name}`"
  >
    <button
      type="button"
      class="dashboard-export-button"
      :class="buttonClasses"
      :disabled="!canExport"
      @click="exportData"
    >
      <svg v-if="showIcon" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 4v10m0 0-4-4m4 4 4-4M5 20h14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
      </svg>
      <span>{{ exportLoading ? 'Exporting...' : buttonLabel }}</span>
    </button>
    <p v-if="exportState === 'error'" class="dashboard-export-button-status" role="alert">{{ exportError }}</p>
  </div>
</template>

<style scoped>
.dashboard-export-button-element {
  align-items: center;
  display: flex;
  height: 100%;
  justify-content: var(--export-button-justify);
  min-height: 48px;
  width: 100%;
}

.dashboard-export-button-element--legacy-toolbar {
  align-items: flex-start;
  min-height: 34px;
}

.dashboard-export-button {
  align-items: center;
  background: var(--export-button-bg);
  border: 1px solid var(--export-button-border);
  border-radius: var(--export-button-radius);
  color: var(--export-button-color);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  gap: 0.5rem;
  justify-content: center;
  min-height: 42px;
  min-width: 150px;
  padding: 0.65rem 1rem;
  width: min(100%, 240px);
}

.dashboard-export-button--legacy-toolbar {
  border-color: var(--export-button-border);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 24%, transparent);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.42857143;
  min-height: 34px;
  min-width: 0;
  padding: 6px 12px;
  text-shadow: 0 -1px 0 color-mix(in srgb, #000000 18%, transparent);
  white-space: nowrap;
  width: auto;
}

.dashboard-export-button--legacy-toolbar:hover:not(:disabled) {
  background: color-mix(in srgb, var(--export-button-bg) 86%, #000000);
  border-color: color-mix(in srgb, var(--export-button-border) 86%, #000000);
}

.dashboard-export-button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.dashboard-export-button svg {
  height: 18px;
  width: 18px;
}

.dashboard-export-button-status {
  color: #b91c1c;
  font-size: 0.78rem;
  margin: 0.5rem 0 0;
}
</style>
