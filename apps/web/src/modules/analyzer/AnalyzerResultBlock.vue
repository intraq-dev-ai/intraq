<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  downloadAnalyzerResultCsv,
  fetchAnalyzerPlannedTableData,
  fetchAnalyzerTableData
} from './api';
import AnalyzerChartCanvas from './AnalyzerChartCanvas.vue';
import AnalyzerEvidenceDisclosure from './AnalyzerEvidenceDisclosure.vue';
import {
  ANALYZER_CHART_TYPES,
  ANALYZER_RESULT_PAGE_SIZE,
  analyzerExecutionSummary,
  analyzerResultTitle,
  buildAnalyzerChartData,
  buildAnalyzerMatrixSummary,
  canRenderAnalyzerChart,
  canRenderAnalyzerMatrix,
  formatAnalyzerValue,
  normalizeAnalyzerColumns,
  toAnalyzerLabel,
  type AnalyzerChartType,
  type AnalyzerVisualizationType
} from './result-data';
import type {
  AnalyzerExecution,
  AnalyzerPlan,
  AnalyzerTableData
} from './types';

const props = defineProps<{
  execution: AnalyzerExecution;
  plan?: AnalyzerPlan | null;
  tableDataLoader?: (input: {
    dataSourceId: string;
    limit: number;
    plan: AnalyzerPlan | null;
    tableName: string;
  }) => Promise<AnalyzerTableData>;
  messageId: string;
}>();

const emit = defineEmits<{
  dashboard: [execution: AnalyzerExecution];
  queue: [payload: { execution: AnalyzerExecution; type: AnalyzerVisualizationType }];
  viewChange: [];
}>();

const visualizationType = ref<AnalyzerVisualizationType>('table');
const rows = ref<Array<Record<string, unknown>>>([]);
const totalRows = ref(0);
const isLoadingMore = ref(false);
const isDownloadingCsv = ref(false);
const loadError = ref('');

const title = computed(() => analyzerResultTitle(props.execution));
const resultSummary = computed(() => analyzerExecutionSummary(props.execution, totalRows.value));
const columns = computed(() => normalizeAnalyzerColumns(props.execution.columns, rows.value));
const chartData = computed(() => buildAnalyzerChartData(rows.value, columns.value));
const selectedChartType = computed((): AnalyzerChartType | null =>
  isChartType(visualizationType.value) ? visualizationType.value as AnalyzerChartType : null
);
const matrixData = computed(() => buildAnalyzerMatrixSummary(rows.value, columns.value));
const canConvertChart = computed(() => canRenderAnalyzerChart(rows.value, columns.value));
const canConvertMatrix = computed(() => canRenderAnalyzerMatrix(rows.value, columns.value));
const canLoadMore = computed(() => rows.value.length < totalRows.value);
const canDownloadCsv = computed(() => Boolean(props.plan && props.execution.dataSourceId && props.execution.tableName));
const resultStatus = computed(() => `Showing ${rows.value.length} of ${totalRows.value} rows`);

watch(() => props.execution, execution => {
  rows.value = execution.rows ?? [];
  totalRows.value = execution.totalRows ?? execution.rowCount ?? rows.value.length;
  visualizationType.value = 'table';
  loadError.value = '';
}, { immediate: true });

function selectVisualization(type: AnalyzerVisualizationType): void {
  if (type === 'matrix' && !canConvertMatrix.value) return;
  if (ANALYZER_CHART_TYPES.includes(type as (typeof ANALYZER_CHART_TYPES)[number]) && !canConvertChart.value) return;
  visualizationType.value = type;
  emit('viewChange');
}

async function loadMoreRows(): Promise<void> {
  if (!props.execution.dataSourceId || !props.execution.tableName || isLoadingMore.value) return;
  const targetLimit = Math.min(rows.value.length + ANALYZER_RESULT_PAGE_SIZE, totalRows.value);
  if (targetLimit <= rows.value.length) return;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  isLoadingMore.value = true;
  loadError.value = '';
  try {
    const tableData = props.tableDataLoader
      ? await props.tableDataLoader({
        dataSourceId: props.execution.dataSourceId,
        limit: targetLimit,
        plan: props.plan ?? null,
        tableName: props.execution.tableName
      })
      : props.plan
        ? await fetchAnalyzerPlannedTableData(props.execution.dataSourceId, props.execution.tableName, props.plan, { limit: targetLimit })
        : await fetchAnalyzerTableData(props.execution.dataSourceId, props.execution.tableName, { limit: targetLimit });
    rows.value = tableData.rows.slice(0, targetLimit);
    totalRows.value = tableData.totalRows || totalRows.value;
  } catch {
    loadError.value = 'Result rows could not load.';
  } finally {
    isLoadingMore.value = false;
    window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' });
  }
}

async function downloadCsv(): Promise<void> {
  if (!props.plan || !props.execution.dataSourceId || !props.execution.tableName || isDownloadingCsv.value) return;
  isDownloadingCsv.value = true;
  loadError.value = '';
  try {
    const result = await downloadAnalyzerResultCsv({
      dataSourceId: props.execution.dataSourceId,
      plan: props.plan,
      tableName: props.execution.tableName
    });
    triggerNativeDownload(result.downloadUrl);
  } catch {
    loadError.value = 'CSV export could not be prepared.';
  } finally {
    isDownloadingCsv.value = false;
  }
}

function columnValue(row: Record<string, unknown>, field: string): string {
  return formatAnalyzerValue(row[field]);
}

function matrixValue(values: Record<string, number>, label: string): string {
  return formatAnalyzerValue(values[label] ?? 0);
}

function isChartType(type: AnalyzerVisualizationType): boolean {
  return ANALYZER_CHART_TYPES.includes(type as (typeof ANALYZER_CHART_TYPES)[number]);
}

function triggerNativeDownload(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  link.click();
}
</script>

<template>
  <section class="analyzer-result-block" :aria-label="`Analyzer result for ${title}`">
    <header class="analyzer-result-header">
      <div>
        <span>Result</span>
        <strong>{{ title }}</strong>
        <p>{{ resultSummary }}</p>
      </div>
      <div class="analyzer-result-actions" role="toolbar" :aria-label="`Visualization controls for ${title}`">
        <button
          type="button"
          :aria-pressed="visualizationType === 'table'"
          aria-label="Show table"
          @click="selectVisualization('table')"
        >
          Table
        </button>
        <button
          v-for="chartType in ANALYZER_CHART_TYPES"
          :key="chartType"
          type="button"
          :aria-label="`${toAnalyzerLabel(chartType)} chart`"
          :aria-pressed="visualizationType === chartType"
          :disabled="!canConvertChart"
          @click="selectVisualization(chartType)"
        >
          {{ toAnalyzerLabel(chartType) }}
        </button>
        <button
          type="button"
          :aria-pressed="visualizationType === 'matrix'"
          :disabled="!canConvertMatrix"
          aria-label="Matrix summary"
          @click="selectVisualization('matrix')"
        >
          Matrix
        </button>
        <button type="button" class="analyzer-result-dashboard" aria-label="Add result to Dashboard Builder" @click="emit('dashboard', execution)">
          Dashboard
        </button>
        <button type="button" aria-label="Add result to dashboard queue" @click="emit('queue', { execution, type: visualizationType })">
          Add to Queue
        </button>
      </div>
    </header>

    <AnalyzerEvidenceDisclosure
      :execution="execution"
      :message-id="messageId"
      :plan="plan ?? null"
      :title="title"
    />

    <div v-if="rows.length === 0" class="analyzer-result-empty" role="status">
      Result returned no rows.
    </div>

    <div v-else-if="visualizationType === 'table'" class="ai-analyzer-visualization analyzer-result-table-wrap">
      <table :aria-label="`Analyzer result table for ${title}`">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column.field" scope="col">{{ column.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in rows" :key="`${messageId}-row-${rowIndex}`">
            <td v-for="column in columns" :key="`${rowIndex}-${column.field}`">{{ columnValue(row, column.field) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="visualizationType === 'matrix' && matrixData" class="ai-analyzer-visualization analyzer-result-table-wrap">
      <table :aria-label="`Analyzer result matrix for ${title}`">
        <thead>
          <tr>
            <th scope="col">{{ matrixData.rowColumn.label }}</th>
            <th v-for="label in matrixData.columnLabels" :key="label" scope="col">{{ label }}</th>
            <th scope="col">Total {{ matrixData.metricColumn.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in matrixData.rows" :key="row.label">
            <th scope="row">{{ row.label }}</th>
            <td v-for="label in matrixData.columnLabels" :key="`${row.label}-${label}`">{{ matrixValue(row.values, label) }}</td>
            <td>{{ formatAnalyzerValue(row.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="chartData && selectedChartType" class="analyzer-result-chart">
      <AnalyzerChartCanvas
        :chart-data="chartData"
        :chart-type="selectedChartType"
        :show-data-labels="true"
        :show-grid="true"
        :show-legend="true"
        :show-x-axis="true"
        :show-y-axis="true"
        :title="title"
      />
      <p>{{ chartData.metricColumn.label }} by {{ chartData.labelColumn.label }}</p>
    </div>

    <div class="analyzer-result-state" role="status" aria-live="polite">
      <span>{{ resultStatus }}</span>
      <button
        v-if="canDownloadCsv"
        type="button"
        :disabled="isDownloadingCsv"
        aria-label="Download full analyzer result as CSV"
        @click="downloadCsv"
      >
        {{ isDownloadingCsv ? 'Preparing CSV...' : 'Download CSV' }}
      </button>
      <button
        v-if="canLoadMore"
        type="button"
        :disabled="isLoadingMore"
        aria-label="Load more analyzer result rows"
        @click="loadMoreRows"
      >
        {{ isLoadingMore ? 'Loading...' : 'Load more' }}
      </button>
    </div>
    <p v-if="loadError" class="analyzer-result-error" role="alert">{{ loadError }}</p>
  </section>
</template>
