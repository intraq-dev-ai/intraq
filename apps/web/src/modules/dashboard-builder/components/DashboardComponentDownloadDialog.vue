<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DashboardElement } from '../types';
import type {
  DashboardComponentDownloadFormat,
  DashboardComponentDownloadTarget
} from './canvas/component-download';

const props = defineProps<{
  componentLabel: (element: DashboardElement) => string;
  element: DashboardElement;
  error: string;
  format: DashboardComponentDownloadFormat;
  loading: boolean;
  target: DashboardComponentDownloadTarget | null;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
  'update:format': [format: DashboardComponentDownloadFormat];
}>();

const dialogEl = ref<HTMLElement | null>(null);
const selectedFormat = computed({
  get: () => props.format,
  set: (format: DashboardComponentDownloadFormat) => emit('update:format', format)
});

onMounted(() => {
  dialogEl.value?.focus();
});
</script>

<template>
  <div class="dashboard-modal-overlay component-panel-overlay" @click="emit('close')">
    <section
      ref="dialogEl"
      class="component-download-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="`Download data: ${element.name}`"
      tabindex="-1"
      @click.stop
      @keydown.esc="emit('close')"
    >
      <div class="component-download-header">
        <h2>Download Data</h2>
        <button
          class="component-download-close"
          type="button"
          aria-label="Close download dialog"
          title="Close"
          @click="emit('close')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="component-download-summary">
        <div class="component-download-summary-title">Component: {{ element.name }}</div>
        <div class="component-download-summary-meta">{{ componentLabel(element) }}</div>
      </div>
      <fieldset class="component-download-formats">
        <legend>Select Format</legend>
        <label class="component-download-option">
          <input v-model="selectedFormat" type="radio" name="component-download-format" value="csv" />
          <div class="component-download-option-copy">
            <div class="component-download-option-title">CSV (.csv)</div>
            <div class="component-download-option-detail">Comma-separated values, plain text format</div>
          </div>
        </label>
        <label class="component-download-option">
          <input v-model="selectedFormat" type="radio" name="component-download-format" value="excel" />
          <div class="component-download-option-copy">
            <div class="component-download-option-title">Excel (.xlsx)</div>
            <div class="component-download-option-detail">Spreadsheet format for the underlying component data</div>
          </div>
        </label>
      </fieldset>
      <div class="component-download-info" role="note" :aria-label="`Download info for ${element.name}`">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
        <div class="component-download-info-copy">
          <div class="component-download-info-title">Download Info</div>
          <div class="component-download-info-detail">Download underlying data used by this component</div>
          <div class="component-download-info-meta">
            Source: {{ target?.sourceName ?? 'Unavailable' }} ·
            Table: {{ target?.tableName ?? 'Unavailable' }} ·
            Maximum 1,000,000 rows
          </div>
        </div>
      </div>
      <p v-if="loading" class="component-download-note" role="status">Preparing download...</p>
      <p v-if="error" class="component-download-error" role="alert">{{ error }}</p>
      <div class="component-download-actions">
        <button class="secondary-button" type="button" @click="emit('close')">Cancel</button>
        <button
          class="primary-button"
          type="button"
          :disabled="loading || !target"
          @click="emit('confirm')"
        >
          {{ loading ? 'Preparing...' : 'Download' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.component-download-dialog {
  display: grid;
  gap: 16px;
  width: min(460px, calc(100vw - 32px));
  max-height: min(80vh, 680px);
  overflow: auto;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-primary);
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.3);
}

.component-download-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.component-download-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 800;
}

.component-download-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.component-download-close:hover {
  background: var(--surface);
  color: var(--text-primary);
}

.component-download-close svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  fill: none;
}

.component-download-summary {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-secondary);
}

.component-download-summary-title {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.component-download-summary-meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.component-download-formats {
  display: grid;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}

.component-download-formats legend {
  padding: 0 4px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.component-download-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.component-download-option input {
  margin-top: 3px;
}

.component-download-option-copy {
  display: grid;
  gap: 2px;
}

.component-download-option-title {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.component-download-option-detail {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.component-download-info {
  display: flex;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, #60a5fa 36%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, #3b82f6 10%, var(--surface));
}

.component-download-info svg {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  stroke: color-mix(in srgb, #2563eb 82%, var(--text-primary));
  fill: none;
}

.component-download-info-copy {
  display: grid;
  gap: 2px;
}

.component-download-info-title {
  color: color-mix(in srgb, #1d4ed8 78%, var(--text-primary));
  font-size: 13px;
  font-weight: 700;
}

.component-download-info-detail {
  color: color-mix(in srgb, #1d4ed8 62%, var(--text-primary));
  font-size: 13px;
}

.component-download-info-meta {
  color: color-mix(in srgb, #2563eb 70%, var(--text-primary));
  font-size: 11px;
  line-height: 1.45;
}

.component-download-note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.component-download-error {
  margin: 0;
  color: var(--ai-danger-600, #dc2626);
  font-size: 13px;
  font-weight: 700;
}

.component-download-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.component-download-actions .secondary-button,
.component-download-actions .primary-button {
  min-height: 38px;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 700;
}

.component-download-actions .secondary-button {
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.component-download-actions .secondary-button:hover {
  background: var(--surface);
  color: var(--text-primary);
}

.component-download-actions .primary-button {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  cursor: pointer;
}

.component-download-actions .primary-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary) 86%, #000);
  border-color: color-mix(in srgb, var(--color-primary) 86%, #000);
  box-shadow: 0 0 18px color-mix(in srgb, var(--color-primary) 24%, transparent);
}

.component-download-actions .primary-button:disabled,
.component-download-actions .secondary-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

@media (max-width: 760px) {
  .component-download-dialog {
    width: min(100vw - 16px, 460px);
    padding: 16px;
  }

  .component-download-actions {
    flex-direction: column-reverse;
  }
}
</style>
