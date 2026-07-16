<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { bulkUploadAdminDictionary } from '../api';
import {
  buildBulkDictionaryPreviewRows,
  buildBulkDictionaryTemplate,
  parseBulkDictionaryJson,
  type BulkDictionaryPayload
} from '../bulk-dictionary';
import type { AdminDataSource } from '../types';

const props = defineProps<{
  open: boolean;
  selectedSourceId: string;
  sources: AdminDataSource[];
}>();

const emit = defineEmits<{
  close: [];
  uploaded: [message: string];
}>();

const sourceId = ref('');
const rawJson = ref('');
const payload = ref<BulkDictionaryPayload | null>(null);
const parseError = ref('');
const saveError = ref('');
const saveStatus = ref('');
const isSaving = ref(false);
const isDragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const selectedSource = computed(() =>
  props.sources.find(source => source.id === sourceId.value) ?? null
);
const previewRows = computed(() =>
  payload.value ? buildBulkDictionaryPreviewRows(payload.value, selectedSource.value?.tables ?? []) : []
);
const knownPreviewCount = computed(() => previewRows.value.filter(row => row.isKnownTable).length);
const canReview = computed(() => sourceId.value.length > 0 && rawJson.value.trim().length > 0);
const canUpload = computed(() => sourceId.value.length > 0 && payload.value !== null && !isSaving.value);

watch(() => props.open, isOpen => {
  if (!isOpen) return;
  sourceId.value = props.selectedSourceId;
  rawJson.value = '';
  payload.value = null;
  parseError.value = '';
  saveError.value = '';
  saveStatus.value = '';
  isSaving.value = false;
  isDragOver.value = false;
});

watch(sourceId, () => {
  saveError.value = '';
  saveStatus.value = '';
});

function closeDialog(): void {
  if (isSaving.value) return;
  emit('close');
}

function reviewJson(): void {
  parseError.value = '';
  saveError.value = '';
  saveStatus.value = '';
  try {
    payload.value = parseBulkDictionaryJson(rawJson.value);
  } catch (caught) {
    payload.value = null;
    parseError.value = readError(caught, 'Dictionary JSON could not be reviewed.');
  }
}

async function submitUpload(): Promise<void> {
  if (!sourceId.value) {
    saveError.value = 'Select a target data source before uploading.';
    return;
  }
  if (!payload.value) {
    reviewJson();
    if (!payload.value) return;
  }

  isSaving.value = true;
  saveError.value = '';
  saveStatus.value = '';
  try {
    const result = await bulkUploadAdminDictionary(sourceId.value, payload.value);
    const skipped = result.skipped.length > 0 ? ` ${result.skipped.length} skipped.` : '';
    saveStatus.value = `${result.message}${skipped}`;
    emit('uploaded', saveStatus.value);
  } catch (caught) {
    saveError.value = readError(caught, 'Bulk dictionary upload failed.');
  } finally {
    isSaving.value = false;
  }
}

async function handleFile(file: File | undefined): Promise<void> {
  if (!file) return;
  parseError.value = '';
  saveError.value = '';
  saveStatus.value = '';
  if (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json')) {
    payload.value = null;
    parseError.value = 'Upload a JSON file.';
    return;
  }

  rawJson.value = await file.text();
  reviewJson();
  if (fileInput.value) fileInput.value.value = '';
}

function handleFileSelect(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  void handleFile(input.files?.[0]);
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  void handleFile(event.dataTransfer?.files[0]);
}

function clearReview(): void {
  payload.value = null;
  parseError.value = '';
  saveError.value = '';
  saveStatus.value = '';
}

function loadTemplate(): void {
  rawJson.value = JSON.stringify(buildBulkDictionaryTemplate(selectedSource.value?.tables ?? []), null, 2);
  payload.value = null;
  parseError.value = '';
  saveError.value = '';
  saveStatus.value = '';
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : '';
}

function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
</script>

<template>
  <div v-if="open" class="admin-modal-overlay" role="presentation" @click.self="closeDialog">
    <section
      class="admin-modal admin-ds-bulk-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-ds-bulk-title"
      tabindex="-1"
      @keydown.esc="closeDialog"
      @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()"
    >
      <header class="admin-modal-header">
        <div>
          <p class="admin-modal-eyebrow">Data dictionary</p>
          <h2 id="admin-ds-bulk-title">Bulk Upload Dictionary</h2>
          <p class="admin-muted">Review JSON table definitions before saving them to a data source.</p>
        </div>
        <button class="admin-icon-button" type="button" aria-label="Close bulk dictionary upload" @click="closeDialog">x</button>
      </header>

      <div class="admin-ds-bulk-body">
        <label class="admin-ds-bulk-field" for="admin-ds-bulk-source">
          <span>Target Data Source</span>
          <select
            id="admin-ds-bulk-source"
            :value="sourceId"
            :disabled="isSaving"
            @change="sourceId = inputValue($event)"
          >
            <option value="">Select data source</option>
            <option v-for="source in sources" :key="source.id" :value="source.id">
              {{ source.name }} ({{ source.tables.length || source.tableCount }})
            </option>
          </select>
        </label>

        <section
          class="admin-ds-bulk-dropzone"
          :class="{ 'is-drag-over': isDragOver }"
          aria-label="Bulk dictionary file upload"
          @dragover.prevent="isDragOver = true"
          @dragleave.prevent="isDragOver = false"
          @drop.prevent="handleDrop"
        >
          <input
            ref="fileInput"
            class="sr-only"
            type="file"
            accept=".json,application/json"
            aria-label="Bulk dictionary file"
            @change="handleFileSelect"
          />
          <strong>Upload JSON</strong>
          <span>Drop a file here or choose a JSON file.</span>
          <button class="admin-secondary-button" type="button" :disabled="isSaving" @click="fileInput?.click()">
            Browse JSON
          </button>
        </section>

        <label class="admin-ds-bulk-field" for="admin-ds-bulk-json">
          <span>Dictionary JSON</span>
          <textarea
            id="admin-ds-bulk-json"
            :value="rawJson"
            :disabled="isSaving"
            rows="10"
            placeholder='{"pos_sales":{"businessName":"POS Sales","columns":[{"name":"net_sales","dictionaryDescription":"Net sales after discounts."}]}}'
            @input="rawJson = inputValue($event); clearReview()"
          ></textarea>
        </label>

        <div class="admin-ds-bulk-actions">
          <button class="admin-secondary-button" type="button" :disabled="isSaving" @click="loadTemplate">
            Load Template
          </button>
          <button class="admin-secondary-button" type="button" :disabled="!payload || isSaving" @click="clearReview">
            Clear Review
          </button>
          <button class="button" type="button" :disabled="!canReview || isSaving" @click="reviewJson">
            Review Dictionary
          </button>
        </div>

        <p v-if="parseError" class="admin-error" role="alert">{{ parseError }}</p>
        <p v-if="saveError" class="admin-error" role="alert">{{ saveError }}</p>
        <p
          v-if="saveStatus"
          class="admin-ds-bulk-status"
          role="status"
          aria-label="Bulk dictionary upload status"
          aria-live="polite"
        >
          {{ saveStatus }}
        </p>

        <section v-if="payload" class="admin-ds-bulk-preview" aria-labelledby="admin-ds-bulk-preview-title">
          <div class="admin-ds-bulk-preview-heading">
            <div>
              <h3 id="admin-ds-bulk-preview-title">Review Changes</h3>
              <p class="admin-muted">
                {{ previewRows.length }} table{{ previewRows.length === 1 ? '' : 's' }},
                {{ knownPreviewCount }} matched to {{ selectedSource?.name ?? 'the selected source' }}.
              </p>
            </div>
          </div>

          <div class="admin-table-wrap">
            <table aria-label="Bulk dictionary preview">
              <thead>
                <tr>
                  <th scope="col">Table</th>
                  <th scope="col">Business Name</th>
                  <th scope="col">Category</th>
                  <th scope="col">Columns</th>
                  <th scope="col">Sample Questions</th>
                  <th scope="col">Match</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in previewRows" :key="row.tableName">
                  <th scope="row">{{ row.tableName }}</th>
                  <td>{{ row.businessName }}</td>
                  <td>{{ row.category }}</td>
                  <td>{{ row.fieldCount }}</td>
                  <td>{{ row.sampleQuestionCount }}</td>
                  <td>
                    <span :class="row.isKnownTable ? 'admin-badge admin-badge-success' : 'admin-badge admin-badge-warning'">
                      {{ row.isKnownTable ? 'Will update' : 'Will skip' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer class="admin-modal-footer">
        <button class="admin-secondary-button" type="button" :disabled="isSaving" @click="closeDialog">Cancel</button>
        <button class="button" type="button" :disabled="!canUpload" @click="submitUpload">
          {{ isSaving ? 'Uploading' : 'Upload Dictionary' }}
        </button>
      </footer>
    </section>
  </div>
</template>
