<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  downloadPdfBlob,
  generateDashboardPdf,
  type PdfExportFormat,
  type PdfExportOptions,
  type PdfExportOrientation,
  type PdfExportQuality
} from '../pdf-export-api';
import '../layout/dashboard-pdf-export-dialog.css';

const props = defineProps<{
  dashboardId: string;
  dashboardName: string;
}>();

const emit = defineEmits<{
  close: [];
  exported: [];
}>();

const dialogEl = ref<HTMLElement | null>(null);

onMounted(() => { dialogEl.value?.focus(); });

const exporting = ref(false);
const error = ref('');

const form = reactive<PdfExportOptions>({
  format: 'A4',
  orientation: 'portrait',
  quality: 'medium',
  scale: '1',
  includeFilters: true,
  waitForCharts: true,
  includeIntraqInsights: false,
  includeTimestamp: true,
  includePageNumbers: true,
  includeHeader: true,
  fileName: ''
});

type CustomFilter = { field: string; value: string };
const customFilters = ref<CustomFilter[]>([]);

const progress = reactive({ rendering: false, intraqInsights: false, pdf: false });
const loadingMessage = ref('');
const loadingSubMessage = ref('');

const defaultFileName = computed(() => {
  const date = new Date().toISOString().slice(0, 10);
  const safe = props.dashboardName.replace(/[^a-zA-Z0-9]/g, '_') || 'Dashboard';
  return `${safe}_${date}.pdf`;
});

function addCustomFilter(): void {
  customFilters.value.push({ field: '', value: '' });
}

function removeCustomFilter(index: number): void {
  customFilters.value.splice(index, 1);
}

async function exportPdf(): Promise<void> {
  error.value = '';
  exporting.value = true;
  progress.rendering = false;
  progress.intraqInsights = false;
  progress.pdf = false;
  loadingMessage.value = form.includeIntraqInsights ? 'Generating PDF with intraQ insights…' : 'Generating PDF…';
  loadingSubMessage.value = 'Playwright is rendering your dashboard at full resolution.';

  const stepDelay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  try {
    void stepDelay(800).then(() => {
      progress.rendering = true;
      loadingMessage.value = 'Rendering charts…';
      loadingSubMessage.value = 'Waiting for all charts to fully load.';
    });

    if (form.includeIntraqInsights) {
      void stepDelay(3000).then(() => {
        progress.intraqInsights = true;
        loadingMessage.value = 'Generating dashboard summary…';
        loadingSubMessage.value = 'AI is analysing your charts.';
      });
    }

    void stepDelay(form.includeIntraqInsights ? 6000 : 3000).then(() => {
      progress.pdf = true;
      loadingMessage.value = 'Creating PDF…';
      loadingSubMessage.value = 'Finalising your document.';
    });

    const filtersObj: Record<string, string> = {};
    customFilters.value.forEach(f => { if (f.field && f.value) filtersObj[f.field] = f.value; });

    const result = await generateDashboardPdf(props.dashboardId, {
      ...form,
      dashboardName: props.dashboardName,
      fileName: form.fileName || defaultFileName.value,
      ...(Object.keys(filtersObj).length ? { customFilters: filtersObj } : {})
    });

    const blob = await downloadPdfBlob(result.downloadUrl);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName || form.fileName || defaultFileName.value;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    emit('exported');
    emit('close');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to generate PDF.';
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div ref="dialogEl" class="pdf-export-backdrop" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title" tabindex="-1" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="pdf-export-dialog">
      <div class="pdf-export-header">
        <h2 id="pdf-export-title">Advanced PDF Export</h2>
        <button type="button" class="pdf-export-close" aria-label="Close PDF export dialog" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <form class="pdf-export-body" @submit.prevent="exportPdf">
        <!-- Page settings -->
        <section class="pdf-export-section">
          <h3 class="pdf-export-section-title">Page Settings</h3>
          <div class="pdf-export-grid">
            <div class="pdf-export-field">
              <label for="pdf-format">Page Format</label>
              <select id="pdf-format" v-model="form.format as PdfExportFormat">
                <option value="A4">A4 (210 × 297 mm)</option>
                <option value="A3">A3 (297 × 420 mm)</option>
                <option value="Letter">Letter (8.5 × 11 in)</option>
              </select>
            </div>
            <div class="pdf-export-field">
              <label for="pdf-orientation">Orientation</label>
              <select id="pdf-orientation" v-model="form.orientation as PdfExportOrientation">
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
            <div class="pdf-export-field">
              <label for="pdf-quality">Quality</label>
              <select id="pdf-quality" v-model="form.quality as PdfExportQuality">
                <option value="low">Draft (fast, lower quality)</option>
                <option value="medium">Standard (balanced)</option>
                <option value="high">High (slow, best quality)</option>
              </select>
            </div>
            <div class="pdf-export-field">
              <label for="pdf-scale">Scale</label>
              <select id="pdf-scale" v-model="form.scale">
                <option value="1">100% (actual size)</option>
                <option value="0.8">80% (fit more content)</option>
                <option value="1.2">120% (larger text)</option>
                <option value="1.5">150% (much larger)</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Content options -->
        <section class="pdf-export-section">
          <h3 class="pdf-export-section-title">Content Options</h3>
          <div class="pdf-export-checkboxes">
            <label class="pdf-export-check">
              <input v-model="form.includeFilters" type="checkbox">
              <span>Include current filter values</span>
            </label>
            <label class="pdf-export-check">
              <input v-model="form.waitForCharts" type="checkbox">
              <span>Wait for all charts to load <span class="check-sub">Recommended for accurate output</span></span>
            </label>
            <label class="pdf-export-check">
              <input v-model="form.includeIntraqInsights" type="checkbox">
              <span>
                Include AI-generated chart insights
                <span class="pdf-export-ai-badge">AI</span>
                <span class="check-sub">Adds a second page with chart summaries</span>
              </span>
            </label>
            <label class="pdf-export-check">
              <input v-model="form.includeTimestamp" type="checkbox">
              <span>Include generation timestamp</span>
            </label>
            <label class="pdf-export-check">
              <input v-model="form.includePageNumbers" type="checkbox">
              <span>Include page numbers</span>
            </label>
            <label class="pdf-export-check">
              <input v-model="form.includeHeader" type="checkbox">
              <span>Include header with dashboard name</span>
            </label>
          </div>
        </section>

        <!-- Custom filters -->
        <section v-if="form.includeFilters" class="pdf-export-section">
          <h3 class="pdf-export-section-title">Custom Filters <span style="font-weight:400;text-transform:none;font-size:11px;color:var(--text-secondary)">(optional — overrides current filters)</span></h3>
          <div class="pdf-export-custom-filters">
            <div v-for="(filter, i) in customFilters" :key="i" class="pdf-export-filter-row">
              <input v-model="filter.field" :aria-label="`Custom filter field ${i + 1}`" type="text" placeholder="Field name">
              <input v-model="filter.value" :aria-label="`Custom filter value ${i + 1}`" type="text" placeholder="Value">
              <button type="button" class="pdf-export-remove-filter" aria-label="Remove filter" @click="removeCustomFilter(i)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
            <button type="button" class="pdf-export-add-filter" @click="addCustomFilter">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Add filter
            </button>
          </div>
        </section>

        <!-- File name -->
        <section class="pdf-export-section">
          <h3 class="pdf-export-section-title">File Name</h3>
          <div class="pdf-export-field">
            <label for="pdf-filename">Custom file name <span style="font-weight:400">(leave blank for default)</span></label>
            <input id="pdf-filename" v-model="form.fileName" type="text" :placeholder="defaultFileName">
          </div>
        </section>

        <!-- Preview -->
        <div class="pdf-export-preview">
          <div><strong>Format:</strong> {{ form.format }} {{ form.orientation }}</div>
          <div><strong>Quality:</strong> {{ form.quality === 'low' ? 'Draft' : form.quality === 'medium' ? 'Standard' : 'High' }} · Scale {{ form.scale }}×</div>
          <div><strong>File:</strong> {{ form.fileName || defaultFileName }}</div>
          <div v-if="form.includeFilters && customFilters.length"><strong>Filters:</strong> {{ customFilters.length }} custom filter{{ customFilters.length !== 1 ? 's' : '' }}</div>
        </div>

        <p v-if="error" style="margin:0;color:var(--danger,#ef4444);font-size:13px;">{{ error }}</p>
      </form>

      <div class="pdf-export-footer">
        <button type="button" class="pdf-export-cancel" @click="emit('close')">Cancel</button>
        <button type="button" class="pdf-export-submit" :disabled="exporting" @click="exportPdf">
          <svg v-if="exporting" class="pdf-export-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity=".25"/>
            <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          {{ exporting ? 'Generating PDF…' : 'Export PDF' }}
        </button>
      </div>
    </div>

    <!-- Loading overlay -->
    <div v-if="exporting" class="pdf-export-loading-overlay" aria-live="polite">
      <div class="pdf-export-loading-card">
        <div class="pdf-export-loading-icon">
          <svg class="pdf-export-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:100%;height:100%">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" opacity=".2"/>
            <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <h3>{{ loadingMessage }}</h3>
        <p>{{ loadingSubMessage }}</p>
        <div class="pdf-export-steps">
          <div class="pdf-export-step">
            <span :class="['pdf-export-step-icon', progress.rendering ? 'pdf-export-step-icon--done' : 'pdf-export-step-icon--active']">
              <svg v-if="progress.rendering" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style="width:18px;height:18px">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <svg v-else class="pdf-export-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:18px;height:18px">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" opacity=".2"/>
                <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </span>
            Rendering charts
          </div>
          <div v-if="form.includeIntraqInsights" class="pdf-export-step">
            <span :class="['pdf-export-step-icon', progress.intraqInsights ? 'pdf-export-step-icon--done' : progress.rendering ? 'pdf-export-step-icon--active' : 'pdf-export-step-icon--pending']">
              <svg v-if="progress.intraqInsights" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style="width:18px;height:18px">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <svg v-else class="pdf-export-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:18px;height:18px">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" opacity=".2"/>
                <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </span>
            Generating dashboard summary
            <span class="pdf-export-ai-badge" style="margin-left:6px">AI</span>
          </div>
          <div class="pdf-export-step">
            <span :class="['pdf-export-step-icon', progress.pdf ? 'pdf-export-step-icon--done' : (form.includeIntraqInsights ? progress.intraqInsights : progress.rendering) ? 'pdf-export-step-icon--active' : 'pdf-export-step-icon--pending']">
              <svg v-if="progress.pdf" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style="width:18px;height:18px">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <svg v-else class="pdf-export-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:18px;height:18px">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" opacity=".2"/>
                <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </span>
            Creating PDF
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
