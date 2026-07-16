<script setup lang="ts">
import { computed, nextTick, ref, watchEffect } from 'vue';
import PublicChartCanvas from './PublicChartCanvas.vue';
import {
  buildPublicDashboardTiles,
  tileStyle,
  type PublicTileModel
} from './dashboard-rendering';
import {
  componentExportData,
  exportDataLimit,
  exportFileName,
  toCsv,
  triggerBlobDownload,
  type PublicComponentExportData,
  type PublicComponentExportFormat
} from './public-dashboard-export';
import { formatCellValue } from './dashboard-values';
import { isTwoRowCardConfig } from '../dashboard-builder/card-layout-config';
import type {
  EmbedDashboardElement,
  EmbedDashboardFilter,
  EmbedDashboardFilterValue,
  EmbedDataSource,
  EmbedDataSourcePreview
} from './types';

const props = defineProps<{
  dataSources: EmbedDataSource[];
  elements: EmbedDashboardElement[];
  filters: EmbedDashboardFilter[];
  filterValues: EmbedDashboardFilterValue[];
  loadingSourceIds: string[];
  previewErrors: Record<string, string>;
  previews: EmbedDataSourcePreview[];
  showExpand: boolean;
  showExport: boolean;
  title: string;
}>();

const emit = defineEmits<{
  'preview-needed': [sourceId: string, limit: number];
}>();

const selectedTileId = ref<string | null>(null);
const selectedTile = computed(() => {
  if (!selectedTileId.value) return null;
  return tiles.value.find(tile => tile.element.id === selectedTileId.value) ?? null;
});
const exportTileId = ref<string | null>(null);
const exportFormat = ref<PublicComponentExportFormat>('csv');
const exportError = ref('');
const exportDialogEl = ref<HTMLElement | null>(null);
const exportTile = computed(() => {
  if (!exportTileId.value) return null;
  return tiles.value.find(tile => tile.element.id === exportTileId.value) ?? null;
});
const exportData = computed<PublicComponentExportData | null>(() => exportTile.value ? componentExportData(exportTile.value) : null);
const exportRowCount = computed(() => exportData.value?.rows.length ?? 0);
const exportCanDownload = computed(() => (exportData.value?.columns.length ?? 0) > 0);
const exportIsLoading = computed(() => isSourceLoading(exportTile.value?.sourceId ?? null));

const tiles = computed<PublicTileModel[]>(() => buildPublicDashboardTiles({
  dataSources: props.dataSources,
  elements: props.elements,
  filters: props.filters,
  filterValues: props.filterValues,
  previews: props.previews
}));

watchEffect(() => {
  for (const tile of tiles.value) {
    if (!tile.sourceId || tile.preview || isSourceLoading(tile.sourceId) || sourceError(tile.sourceId)) continue;
    emit('preview-needed', tile.sourceId, tile.dataLimit);
  }
});

function openTile(tile: PublicTileModel): void {
  selectedTileId.value = tile.element.id;
  if (tile.sourceId) emit('preview-needed', tile.sourceId, modalDataLimit(tile));
}

function closeTile(): void {
  selectedTileId.value = null;
}

async function openExportDialog(tile: PublicTileModel): Promise<void> {
  exportTileId.value = tile.element.id;
  exportError.value = '';
  exportFormat.value = 'csv';
  if (tile.sourceId) emit('preview-needed', tile.sourceId, exportDataLimit(tile));
  await nextTick();
  exportDialogEl.value?.focus();
}

function closeExportDialog(): void {
  exportTileId.value = null;
  exportError.value = '';
  exportFormat.value = 'csv';
}

function confirmExport(): void {
  if (typeof window === 'undefined' || !exportTile.value || !exportData.value) return;
  exportError.value = '';
  if (exportData.value.columns.length === 0) {
    exportError.value = 'No data is available for this component.';
    return;
  }
  const csv = toCsv(exportData.value.columns, exportData.value.rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, exportFileName(exportTile.value, exportFormat.value));
  closeExportDialog();
}

function isSourceLoading(sourceId: string | null): boolean {
  return Boolean(sourceId && props.loadingSourceIds.includes(sourceId));
}

function sourceError(sourceId: string | null): string {
  return sourceId ? props.previewErrors[sourceId] ?? '' : '';
}

function modalDataLimit(tile: PublicTileModel): number {
  if (tile.kind === 'table' || tile.kind === 'matrix' || tile.kind === 'news' || tile.kind === 'chatbot') {
    return Math.max(tile.dataLimit, 1000);
  }
  return tile.dataLimit;
}

function canExportTile(tile: PublicTileModel): boolean {
  const data = componentExportData(tile);
  return data.columns.length > 0;
}

function isTwoRowCardTile(tile: PublicTileModel): boolean {
  if (tile.kind !== 'card') return false;
  return isTwoRowCardConfig(tile.element.config ?? {});
}

</script>

<template>
  <section class="public-dashboard-grid" :aria-label="`${title} dashboard grid`">
    <article
      v-for="tile in tiles"
      :key="tile.element.id"
      class="public-dashboard-tile"
      :class="{ 'public-dashboard-tile--two-row-card': isTwoRowCardTile(tile) }"
      :style="tileStyle(tile.element)"
      :aria-labelledby="`tile-${tile.element.id}-title`"
    >
      <header class="public-dashboard-tile-header">
        <div class="public-dashboard-tile-title">
          <p>{{ tile.kind }}</p>
          <h2 :id="`tile-${tile.element.id}-title`">{{ tile.element.title }}</h2>
        </div>
        <div v-if="showExport || showExpand" class="public-dashboard-tile-actions">
          <button
            v-if="showExport && canExportTile(tile)"
            type="button"
            class="tile-icon-button"
            :aria-label="`Download data for ${tile.element.title}`"
            title="Download data"
            @click="openExportDialog(tile)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v9m0 0l-4-4m4 4 4-4m3 8H5a2 2 0 0 1-2-2v-1m18 1a2 2 0 0 1-2 2" />
            </svg>
          </button>
          <button
            v-if="showExpand"
            type="button"
            class="tile-icon-button tile-expand-button"
            :aria-label="`Expand ${tile.element.title}`"
            title="Expand"
            @click="openTile(tile)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M9 9 3.8 3.8M15 9l5.2-5.2M9 15l-5.2 5.2M15 15l5.2 5.2" />
            </svg>
          </button>
        </div>
      </header>

      <div v-if="isSourceLoading(tile.sourceId)" class="public-dashboard-empty" role="status">
        Loading...
      </div>

      <div v-else-if="sourceError(tile.sourceId)" class="public-dashboard-empty public-dashboard-empty--error" role="status">
        {{ sourceError(tile.sourceId) }}
      </div>

      <div v-else-if="!tile.hasRenderableContent" class="public-dashboard-empty" role="status">
        No preview data is available for this component.
      </div>

      <section
        v-else-if="tile.kind === 'card'"
        class="public-dashboard-card"
        :class="{ 'public-dashboard-card--two-row': isTwoRowCardTile(tile) }"
        :aria-label="`${tile.element.title} metrics`"
      >
        <article
          v-for="metric in tile.cardMetrics"
          :key="metric.label"
          class="public-dashboard-card-metric"
          :class="{ 'public-dashboard-card-metric--two-row': isTwoRowCardTile(tile) }"
        >
          <p>{{ metric.label }}</p>
          <span>{{ metric.value }}</span>
          <small v-if="!isTwoRowCardTile(tile)">{{ metric.helper }}</small>
        </article>
      </section>

      <section v-else-if="tile.kind === 'matrix' && tile.matrix" class="public-dashboard-table-wrap public-dashboard-matrix-wrap">
        <table :aria-label="`Matrix for ${tile.element.title}`">
          <thead>
            <tr>
              <th scope="col">{{ tile.matrix.rowHeader }}</th>
              <th v-for="column in tile.matrix.columns" :key="column" scope="col">{{ column }}</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in tile.matrix.rows" :key="row.key">
              <th scope="row">{{ row.label }}</th>
              <td v-for="(cell, index) in row.cells" :key="`${row.key}-${index}`">{{ cell }}</td>
              <td>{{ row.total }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-else-if="tile.kind === 'table' || tile.kind === 'matrix'" class="public-dashboard-table-wrap">
        <table :aria-label="`Table for ${tile.element.title}`">
          <thead>
            <tr>
              <th v-for="column in tile.columns" :key="column.key" scope="col">{{ column.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in tile.rows.slice(0, 8)" :key="rowIndex">
              <td v-for="column in tile.columns" :key="column.key">{{ formatCellValue(row[column.key]) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-else-if="tile.kind === 'news' || tile.kind === 'chatbot'" class="public-dashboard-list">
        <p v-for="(row, rowIndex) in tile.rows.slice(0, 4)" :key="rowIndex">
          {{ tile.columns.map(column => formatCellValue(row[column.key])).filter(Boolean).join(' | ') }}
        </p>
      </section>

      <div v-else class="public-dashboard-chart">
        <PublicChartCanvas
          :chart-type="tile.chart.type"
          :datasets="tile.chart.datasets"
          :labels="tile.chart.labels"
          :stacked="tile.chart.stacked"
          :title="tile.element.title"
          :values="[]"
        />
      </div>
    </article>
  </section>

  <div v-if="selectedTile" class="public-chart-modal-overlay" @click.self="closeTile">
    <section class="public-chart-modal component-expand-dialog" role="dialog" aria-modal="true" :aria-labelledby="`modal-${selectedTile.element.id}-title`" tabindex="-1" @keydown.esc="closeTile" @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()">
      <header>
        <h2 :id="`modal-${selectedTile.element.id}-title`">{{ selectedTile.element.title }}</h2>
        <div class="public-chart-modal-actions">
          <button
            v-if="showExport && canExportTile(selectedTile)"
            type="button"
            class="tile-icon-button"
            :aria-label="`Download data for ${selectedTile.element.title}`"
            title="Download data"
            @click="openExportDialog(selectedTile)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v9m0 0l-4-4m4 4 4-4m3 8H5a2 2 0 0 1-2-2v-1m18 1a2 2 0 0 1-2 2" />
            </svg>
          </button>
          <button type="button" class="tile-expand-button" :aria-label="`Close ${selectedTile.element.title}`" @click="closeTile">
            Close
          </button>
        </div>
      </header>
      <div class="public-chart-modal-content">
        <PublicChartCanvas
          v-if="selectedTile.kind === 'chart' && selectedTile.rows.length > 0"
          :chart-type="selectedTile.chart.type"
          :datasets="selectedTile.chart.datasets"
          :labels="selectedTile.chart.labels"
          :stacked="selectedTile.chart.stacked"
          :title="selectedTile.element.title"
          :values="[]"
        />

        <section v-else-if="selectedTile.kind === 'card'" class="public-dashboard-card public-dashboard-card-modal">
          <article v-for="metric in selectedTile.cardMetrics" :key="metric.label" class="public-dashboard-card-metric">
            <span>{{ metric.value }}</span>
            <p>{{ metric.label }}</p>
            <small>{{ metric.helper }}</small>
          </article>
        </section>

        <div v-else-if="isSourceLoading(selectedTile.sourceId)" class="public-dashboard-empty" role="status">
          Loading...
        </div>

        <div v-else-if="sourceError(selectedTile.sourceId)" class="public-dashboard-empty public-dashboard-empty--error" role="status">
          {{ sourceError(selectedTile.sourceId) }}
        </div>

        <section v-else-if="selectedTile.kind === 'matrix' && selectedTile.matrix" class="public-dashboard-table-wrap public-dashboard-matrix-wrap">
          <table :aria-label="`Details for ${selectedTile.element.title}`">
            <thead>
              <tr>
                <th scope="col">{{ selectedTile.matrix.rowHeader }}</th>
                <th v-for="column in selectedTile.matrix.columns" :key="column" scope="col">{{ column }}</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in selectedTile.matrix.rows" :key="row.key">
                <th scope="row">{{ row.label }}</th>
                <td v-for="(cell, index) in row.cells" :key="`${row.key}-${index}`">{{ cell }}</td>
                <td>{{ row.total }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else class="public-dashboard-table-wrap">
          <table :aria-label="`Details for ${selectedTile.element.title}`">
            <thead>
              <tr>
                <th v-for="column in selectedTile.columns" :key="column.key" scope="col">{{ column.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in selectedTile.rows.slice(0, 20)" :key="rowIndex">
                <td v-for="column in selectedTile.columns" :key="column.key">{{ formatCellValue(row[column.key]) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </section>
  </div>

  <div v-if="exportTile" class="public-chart-modal-overlay" @click.self="closeExportDialog">
    <section
      ref="exportDialogEl"
      class="public-component-download-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="`Download data: ${exportTile.element.title}`"
      tabindex="-1"
      @click.stop
      @keydown.esc="closeExportDialog"
    >
      <header class="public-component-download-header">
        <h2>Download Data</h2>
        <button
          type="button"
          class="tile-icon-button"
          aria-label="Close download dialog"
          title="Close"
          @click="closeExportDialog"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="public-component-download-summary">
        <strong>Component: {{ exportTile.element.title }}</strong>
        <span>{{ exportTile.kind }} - {{ exportRowCount }} scoped row{{ exportRowCount === 1 ? '' : 's' }}</span>
      </div>

      <fieldset class="public-component-download-formats">
        <legend>Select Format</legend>
        <label class="public-component-download-option">
          <input v-model="exportFormat" type="radio" name="public-component-download-format" value="csv" />
          <span>
            <strong>CSV (.csv)</strong>
            <small>Comma-separated values, plain text format</small>
          </span>
        </label>
        <label class="public-component-download-option">
          <input v-model="exportFormat" type="radio" name="public-component-download-format" value="excel" />
          <span>
            <strong>Excel (.xlsx)</strong>
            <small>Spreadsheet format for the underlying component data</small>
          </span>
        </label>
      </fieldset>

      <div class="public-component-download-info" role="note">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
        <span>Download the scoped data used by this embedded component. Maximum 5,000 rows.</span>
      </div>

      <p v-if="exportIsLoading" class="public-component-download-note" role="status">Preparing download...</p>
      <p v-if="exportError" class="public-component-download-error" role="alert">{{ exportError }}</p>

      <div class="public-component-download-actions">
        <button type="button" class="tile-expand-button" @click="closeExportDialog">Cancel</button>
        <button
          type="button"
          class="tile-expand-button tile-expand-button--primary"
          :disabled="exportIsLoading || !exportCanDownload"
          @click="confirmExport"
        >
          {{ exportIsLoading ? 'Preparing...' : 'Download' }}
        </button>
      </div>
    </section>
  </div>
</template>
