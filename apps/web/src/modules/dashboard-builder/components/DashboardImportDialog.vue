<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { BuilderDataSource, BuilderDataTable } from '../types';
import { parseDashboardImportText, type DashboardImportType } from '../dashboard-import-api';

const fiveMegabytes = 5 * 1024 * 1024;

const props = defineProps<{
  dataSources: BuilderDataSource[];
  error: string;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  import: [payload: { content: string; dataSourceId?: string; fileName?: string; tableId?: string; type: DashboardImportType }];
}>();

const dialogEl = ref<HTMLElement | null>(null);

onMounted(() => { dialogEl.value?.focus(); });

const content = ref('');
const contentError = ref('');
const columnMappings = ref<Record<string, string>>({});
const filterMappings = ref<Record<string, string>>({});
const fileName = ref('');
const importMethod = ref<'file' | 'paste'>('file');
const importType = ref<DashboardImportType>('looker');
const selectedDataSourceId = ref('');
const selectedTableId = ref('');

const selectedDataSource = computed(() => props.dataSources.find(source => source.id === selectedDataSourceId.value) ?? null);
const availableTables = computed(() => selectedDataSource.value?.tables ?? []);
const selectedTable = computed(() => availableTables.value.find(table => table.id === selectedTableId.value) ?? null);
const selectedTableColumns = computed(() => selectedTable.value?.fields.map(field => field.name).filter(Boolean) ?? []);
const parsedImport = computed(() => parseImportPreview(content.value));
const importedColumns = computed(() => extractImportedColumns(parsedImport.value));
const importedFilters = computed(() => extractImportedFilters(parsedImport.value));
const contentSize = computed(() => new Blob([content.value]).size);
const contentSizeMegabytes = computed(() => contentSize.value / (1024 * 1024));
const contentSizeLabel = computed(() => `${contentSizeMegabytes.value.toFixed(2)} MB / 5.00 MB`);
const canImport = computed(() => Boolean(content.value.trim()) && contentSize.value <= fiveMegabytes && !props.isSaving);
const dataSourceSummary = computed(() => {
  if (!selectedDataSource.value) return 'Mapping can be selected after import.';
  const tableLabel = selectedTable.value?.description || selectedTable.value?.name || 'No table selected';
  return `${selectedDataSource.value.name} - ${tableLabel}`;
});

watch(importType, () => resetContent());
watch(selectedDataSourceId, () => {
  selectedTableId.value = '';
});
watch([importedColumns, importedFilters, selectedTableColumns], () => autoMapColumns(), { deep: true });

function readImportFile(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  fileName.value = file.name;
  contentError.value = '';
  if (file.size > fiveMegabytes) {
    content.value = '';
    contentError.value = `File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size (5.00MB)`;
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    content.value = String(reader.result ?? '');
  });
  reader.addEventListener('error', () => {
    contentError.value = 'Failed to read file. Please try again.';
  });
  reader.readAsText(file);
}

function submitImport(): void {
  if (!canImport.value) return;
  emit('import', {
    columnMappings: mappedValues(columnMappings.value),
    content: content.value,
    filterMappings: mappedValues(filterMappings.value),
    fileName: fileName.value,
    type: importType.value,
    ...(selectedDataSourceId.value ? { dataSourceId: selectedDataSourceId.value } : {}),
    ...(selectedTableId.value ? { tableId: selectedTableId.value } : {})
  });
}

function resetContent(): void {
  content.value = '';
  contentError.value = '';
  fileName.value = '';
}

function fileAccept(): string {
  if (importType.value === 'looker') return '.lkml,.lookml';
  if (importType.value === 'devexpress') return '.xml,text/xml';
  return '.json,application/json';
}

function fileLabel(): string {
  if (importType.value === 'looker') return 'Upload LookML File';
  if (importType.value === 'devexpress') return 'Upload DevExpress XML File';
  return 'Upload JSON File';
}

function fileHint(): string {
  if (importType.value === 'looker') return 'Supported formats: .lkml, .lookml';
  if (importType.value === 'devexpress') return 'Supported formats: .xml';
  return 'Supported formats: .json';
}

function pasteLabel(): string {
  if (importType.value === 'looker') return 'Paste LookML Code';
  if (importType.value === 'devexpress') return 'Paste DevExpress XML Template';
  return 'Paste JSON Content';
}

function pastePlaceholder(): string {
  if (importType.value === 'looker') return 'Paste your LookML dashboard configuration here...';
  if (importType.value === 'devexpress') return 'Paste your DevExpress XML template here...';
  return '{"dashboard":{"name":"Executive Revenue","category":"Operations","elements":[]}}';
}

function tableLabel(table: BuilderDataTable): string {
  return table.description || table.name;
}

function autoMapColumns(): void {
  columnMappings.value = autoMap(importedColumns.value, selectedTableColumns.value, columnMappings.value);
  filterMappings.value = autoMap(importedFilters.value, selectedTableColumns.value, filterMappings.value);
}

function autoMap(sourceFields: string[], targetFields: string[], existing: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of sourceFields) {
    const existingTarget = existing[field];
    next[field] = existingTarget && targetFields.includes(existingTarget)
      ? existingTarget
      : targetFields.find(target => target.toLowerCase() === field.toLowerCase()) ?? '';
  }
  return next;
}

function mappedValues(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value));
}

function parseImportPreview(value: string): unknown {
  if (!value.trim()) return null;
  try {
    return parseDashboardImportText(value);
  } catch {
    return null;
  }
}

function extractImportedColumns(value: unknown): string[] {
  const dashboard = importDashboardRecord(value);
  const elements = Array.isArray(dashboard?.elements) ? dashboard.elements : [];
  const columns = new Set<string>();
  for (const element of elements.filter(isRecord)) {
    const config = isRecord(element.config) ? element.config : {};
    for (const key of ['columns', 'fields', 'rowFields', 'columnFields', 'valueFields', 'ySeries']) {
      const values = config[key];
      if (Array.isArray(values)) values.filter(isString).forEach(field => columns.add(field));
    }
    for (const key of ['xField', 'valueField']) {
      const field = config[key];
      if (typeof field === 'string' && field.trim()) columns.add(field.trim());
    }
  }
  return [...columns].sort();
}

function extractImportedFilters(value: unknown): string[] {
  const dashboard = importDashboardRecord(value);
  const filters = Array.isArray(dashboard?.filters) ? dashboard.filters : [];
  return [...new Set(filters.filter(isRecord).map(filter => filter.field).filter(isString))].sort();
}

function importDashboardRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return isRecord(value.dashboard) ? value.dashboard : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
</script>

<template>
  <div class="dashboard-modal-overlay" role="presentation" @click.self="emit('close')">
    <section
      ref="dialogEl"
      class="dashboard-modal dashboard-modal--wide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-import-title"
      tabindex="-1"
      @keydown.esc="emit('close')"
    >
      <header class="dashboard-modal-header">
        <div>
          <p class="dashboard-dialog-eyebrow">Dashboard Builder</p>
          <h2 id="dashboard-import-title">Import Dashboard</h2>
        </div>
        <button class="dashboard-dialog-secondary" type="button" :disabled="isSaving" @click="emit('close')">Close</button>
      </header>

      <div class="dashboard-modal-body dashboard-import-body">
        <label>
          Import From
          <select v-model="importType" :disabled="isSaving">
            <option value="looker">Looker (LookML)</option>
            <option value="devexpress">DevExpress Dashboard</option>
            <option value="self">Self (JSON)</option>
          </select>
        </label>

        <div class="dashboard-import-tabs" role="tablist" aria-label="Dashboard import method">
          <button type="button" role="tab" :aria-selected="importMethod === 'file'" :class="{ active: importMethod === 'file' }" @click="importMethod = 'file'">
            Upload File
          </button>
          <button type="button" role="tab" :aria-selected="importMethod === 'paste'" :class="{ active: importMethod === 'paste' }" @click="importMethod = 'paste'">
            Paste Content
          </button>
        </div>

        <section v-if="importMethod === 'file'" class="dashboard-import-upload" aria-label="Upload File">
          <div class="dashboard-import-label-row">
            <strong>{{ fileLabel() }}</strong>
            <span v-if="content" :class="{ warning: contentSizeMegabytes > 4 }">{{ contentSizeLabel }}</span>
          </div>
          <label class="dashboard-import-dropzone">
            <input type="file" :accept="fileAccept()" :disabled="isSaving" @change="readImportFile">
            <span>{{ fileName || 'Click to upload or drag and drop' }}</span>
            <small>{{ fileHint() }}</small>
          </label>
        </section>

        <label v-else>
          {{ pasteLabel() }}
          <textarea
            v-model="content"
            rows="10"
            :disabled="isSaving"
            aria-label="Dashboard import content"
            :placeholder="pastePlaceholder()"
          ></textarea>
        </label>

        <section class="dashboard-import-mapper" aria-label="Map Data Sources & Columns">
          <div>
            <h3>Map Data Sources & Columns</h3>
            <p>{{ dataSourceSummary }}</p>
          </div>
          <div class="dashboard-import-map-grid">
            <label>
              Data Source
              <select v-model="selectedDataSourceId" :disabled="isSaving">
                <option value="">Select data source...</option>
                <option v-for="source in dataSources" :key="source.id" :value="source.id">{{ source.name }}</option>
              </select>
            </label>
            <label>
              Table
              <select v-model="selectedTableId" :disabled="isSaving || availableTables.length === 0">
                <option value="">Select table...</option>
                <option v-for="table in availableTables" :key="table.id" :value="table.id">{{ tableLabel(table) }}</option>
              </select>
            </label>
          </div>
          <section v-if="selectedTableId && importedFilters.length" class="dashboard-import-column-section" aria-label="Filter Column Mapping">
            <div class="dashboard-import-label-row">
              <strong>Filter Column Mapping</strong>
              <span>{{ Object.values(filterMappings).filter(Boolean).length }} / {{ importedFilters.length }} mapped</span>
            </div>
            <label v-for="field in importedFilters" :key="`filter-${field}`">
              {{ field }}
              <select v-model="filterMappings[field]" :aria-label="`Map filter ${field}`">
                <option value="">Not mapped</option>
                <option v-for="column in selectedTableColumns" :key="column" :value="column">{{ column }}</option>
              </select>
            </label>
          </section>
          <section v-if="selectedTableId && importedColumns.length" class="dashboard-import-column-section" aria-label="Column Mappings">
            <div class="dashboard-import-label-row">
              <strong>Column Mappings</strong>
              <span>{{ Object.values(columnMappings).filter(Boolean).length }} / {{ importedColumns.length }} mapped</span>
            </div>
            <label v-for="field in importedColumns" :key="field">
              {{ field }}
              <select v-model="columnMappings[field]" :aria-label="`Map column ${field}`">
                <option value="">Not mapped</option>
                <option v-for="column in selectedTableColumns" :key="column" :value="column">{{ column }}</option>
              </select>
            </label>
          </section>
        </section>

        <section class="dashboard-modal-note" aria-label="Import Summary">
          <strong>Import Summary</strong>
          <span>The import will parse the dashboard definition, create a saved dashboard record, and open it in edit mode.</span>
          <span v-if="importType === 'self'">Self imports can map the imported dashboard to the selected data source and table.</span>
        </section>

        <p v-if="contentError || error" class="error-banner" role="alert">{{ contentError || error }}</p>
      </div>

      <footer class="dashboard-modal-footer">
        <button class="dashboard-dialog-secondary" type="button" :disabled="isSaving" @click="emit('close')">Cancel</button>
        <button class="dashboard-dialog-primary" type="button" :disabled="!canImport" @click="submitImport">
          {{ isSaving ? 'Importing...' : 'Import Dashboard' }}
        </button>
      </footer>
    </section>
  </div>
</template>
