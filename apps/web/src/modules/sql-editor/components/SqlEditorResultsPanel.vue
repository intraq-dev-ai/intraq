<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import SqlEditorPivotPanel from './SqlEditorPivotPanel.vue';
import type { SqlEditorPivotConfig, SqlEditorQueryResult } from '../types';

const props = defineProps<{
  result: SqlEditorQueryResult | null;
  resultColumns: string[];
  paginatedRows: Array<Record<string, unknown>>;
  currentPage: number;
  aiAssistantEnabled?: boolean;
  totalPages: number;
  pivotConfig: SqlEditorPivotConfig | null;
  error: string;
  isRunning: boolean;
}>();

const emit = defineEmits<{
  executeAssistantTool: [];
  fixWithAi: [error: string];
  nextPage: [];
  postRunAction: [prompt: string];
  prepareCsv: [];
  previousPage: [];
  updatePivotConfig: [config: SqlEditorPivotConfig];
}>();

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '(null)';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const expandedCell = ref<{ column: string; value: string } | null>(null);
const cellCopied = ref(false);

function openCell(column: string, value: unknown): void {
  expandedCell.value = { column, value: formatCellValue(value) };
  cellCopied.value = false;
}

function closeCell(): void {
  expandedCell.value = null;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && expandedCell.value) closeCell();
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));

async function copyExpandedCell(): Promise<void> {
  if (!expandedCell.value) return;
  try {
    await navigator.clipboard.writeText(expandedCell.value.value);
    cellCopied.value = true;
  } catch {
    cellCopied.value = false;
  }
}

type SqlEditorResultView = 'results' | 'pivot';

const activeView = ref<SqlEditorResultView>(props.pivotConfig?.viewMode === 'pivot' ? 'pivot' : 'results');

watch(() => props.pivotConfig?.viewMode, viewMode => {
  activeView.value = viewMode === 'pivot' && props.result?.rows.length ? 'pivot' : 'results';
}, { immediate: true });

watch(() => props.result, nextResult => {
  if (!nextResult?.rows.length) {
    activeView.value = 'results';
    return;
  }
  if (props.pivotConfig?.viewMode === 'pivot') activeView.value = 'pivot';
});

function selectView(viewMode: SqlEditorResultView): void {
  activeView.value = viewMode;
  if (props.pivotConfig) emit('updatePivotConfig', { ...props.pivotConfig, viewMode });
}
</script>

<template>
  <section class="sql-editor-results-panel" aria-labelledby="sql-results-title">
    <div class="sql-editor-panel-heading">
      <div class="sql-editor-panel-title">
        <h2 id="sql-results-title">Results</h2>
        <p v-if="result" class="muted">
          {{ result.rowCount }} row{{ result.rowCount === 1 ? '' : 's' }} in {{ result.executionTime }}ms from {{ result.dataSource.name }}.
        </p>
      </div>
      <div class="sql-editor-action-row">
        <div v-if="result?.rows.length" class="sql-editor-view-tabs" role="tablist" aria-label="SQL result views">
          <button type="button" role="tab" :aria-selected="activeView === 'results'" @click="selectView('results')">Results</button>
          <button type="button" role="tab" :aria-selected="activeView === 'pivot'" @click="selectView('pivot')">Pivot</button>
        </div>
        <button v-if="aiAssistantEnabled !== false" type="button" class="sql-editor-secondary-button" :disabled="!result" @click="emit('executeAssistantTool')">
          Run assistant tool
        </button>
        <button type="button" class="sql-editor-secondary-button" :disabled="!result" @click="emit('prepareCsv')">
          Download CSV
        </button>
      </div>
    </div>

    <div v-if="error" class="sql-editor-error">
      <div class="sql-editor-error-header">
        <strong>Query Error</strong>
        <button v-if="aiAssistantEnabled !== false" type="button" class="sql-editor-fix-ai-btn" @click="emit('fixWithAi', error)">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
          Fix with AI
        </button>
      </div>
      <pre>{{ error }}</pre>
    </div>
    <p v-else-if="isRunning" class="sql-editor-empty-state">Executing query...</p>
    <p v-else-if="!result" class="sql-editor-empty-state">No query results yet</p>
    <p v-else-if="result.rows.length === 0" class="sql-editor-empty-state">Query executed successfully. No rows returned.</p>
    <div v-else-if="activeView === 'results'" class="sql-editor-result-table-wrap">
      <table aria-label="SQL query results" class="sql-editor-result-table">
        <thead>
          <tr><th v-for="column in resultColumns" :key="column" scope="col">{{ column }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in paginatedRows" :key="index">
            <td v-for="column in resultColumns" :key="column">
              <button
                type="button"
                class="sql-editor-cell"
                :title="formatCellValue(row[column])"
                @click="openCell(column, row[column])"
              >
                <span class="sql-editor-cell-text">{{ formatCellValue(row[column]) }}</span>
                <svg class="sql-editor-cell-expand" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0-5 5M4 16v4m0 0h4m-4 0 5-5m11 5-5-5m5 5v-4m0 4h-4"/></svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="expandedCell" class="sql-editor-cell-viewer" role="dialog" aria-modal="true" :aria-label="`Value of ${expandedCell.column}`" @click.self="closeCell">
        <div class="sql-editor-cell-viewer-box">
          <div class="sql-editor-cell-viewer-head">
            <span class="sql-editor-cell-viewer-column">{{ expandedCell.column }}</span>
            <div class="sql-editor-action-row">
              <button type="button" class="sql-editor-secondary-button" @click="copyExpandedCell">{{ cellCopied ? 'Copied' : 'Copy' }}</button>
              <button type="button" class="sql-editor-icon-button" aria-label="Close value viewer" title="Close" @click="closeCell">
                <svg aria-hidden="true" fill="none" viewBox="0 0 20 20" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
          <pre class="sql-editor-cell-viewer-value">{{ expandedCell.value }}</pre>
        </div>
      </div>
    </div>
    <SqlEditorPivotPanel
      v-else-if="activeView === 'pivot' && result?.rows.length"
      :result="result"
      :pivot-config="pivotConfig"
      @update-pivot-config="emit('updatePivotConfig', $event)"
    />
    <!-- Post-run AI action chips -->
    <div v-if="aiAssistantEnabled !== false && result?.rows.length" class="sql-editor-post-run-actions" aria-label="Post-run AI actions">
      <button type="button" class="sql-editor-post-run-chip" @click="emit('postRunAction', 'Explain these query results')">Explain results</button>
      <button type="button" class="sql-editor-post-run-chip" @click="emit('postRunAction', 'Optimize this query for better performance')">Optimize query</button>
      <button type="button" class="sql-editor-post-run-chip" @click="emit('postRunAction', 'Suggest filters or improvements for this query')">Suggest improvements</button>
    </div>

    <nav v-if="result?.rows.length && activeView === 'results' && totalPages > 1" class="sql-editor-pagination" aria-label="SQL results pagination">
      <button type="button" class="sql-editor-secondary-button" :disabled="currentPage <= 1" @click="emit('previousPage')">
        Previous
      </button>
      <span aria-live="polite">Page {{ currentPage }} of {{ totalPages }}</span>
      <button type="button" class="sql-editor-secondary-button" :disabled="currentPage >= totalPages" @click="emit('nextPage')">
        Next
      </button>
    </nav>

  </section>
</template>
