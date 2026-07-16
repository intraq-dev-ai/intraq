<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import type { SqlEditorParameter } from '../types';

interface PreviewField {
  name: string;
  type: string;
}

const props = defineProps<{
  fields: PreviewField[];
  initialDescription: string;
  initialIsTemplate: boolean;
  initialName: string;
  mode: 'create' | 'update';
  parameters: SqlEditorParameter[];
  saving: boolean;
  show: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [form: { description: string; generateMetadataAfterSave: boolean; isTemplate: boolean; name: string }];
}>();

const dialogEl = ref<HTMLElement | null>(null);
const form = reactive({
  description: '',
  generateMetadataAfterSave: true,
  isTemplate: false,
  name: ''
});

onMounted(() => { dialogEl.value?.focus(); });

const isUpdate = computed(() => props.mode === 'update');
const modalTitle = computed(() => isUpdate.value ? 'Update Data Model' : 'Save as Data Model');
const actionText = computed(() => isUpdate.value ? 'Update Data Model' : 'Save Data Model');
const savingText = computed(() => isUpdate.value ? 'Updating...' : 'Saving...');
const nameError = computed(() => {
  if (!form.name.trim()) return '';
  return /^[A-Za-z0-9_]+$/.test(form.name.trim()) ? '' : 'Use letters, numbers, or underscores only.';
});

watch(() => props.show, show => {
  if (!show) return;
  form.name = props.initialName.replace(/^sql_/i, '');
  form.description = props.initialDescription;
  form.isTemplate = props.initialIsTemplate;
  form.generateMetadataAfterSave = true;
});

function close(): void {
  if (!props.saving) emit('close');
}

function save(): void {
  const name = form.name.trim();
  if (!name || nameError.value) return;
  emit('save', {
    name: `sql_${name}`,
    description: form.description.trim().slice(0, 40),
    isTemplate: form.isTemplate,
    generateMetadataAfterSave: true
  });
}
</script>

<template>
  <div v-if="show" class="sql-editor-modal-overlay" @click="close">
    <section
      ref="dialogEl"
      class="sql-editor-modal-container sql-editor-save-modal"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'sql-editor-save-modal-title'"
      tabindex="-1"
      @click.stop
      @keydown.esc="close"
    >
      <header class="sql-editor-modal-header">
        <h2 id="sql-editor-save-modal-title">{{ modalTitle }}</h2>
        <button type="button" class="sql-editor-modal-close" aria-label="Close dialog" :disabled="saving" @click="close">
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <div class="sql-editor-modal-body">
        <label class="sql-editor-modal-field" for="sql-editor-data-model-name">
          <span>Data Model Name</span>
          <span class="sql-editor-name-input-group">
            <span class="sql-editor-name-prefix">sql_</span>
            <input id="sql-editor-data-model-name" v-model="form.name" :disabled="saving" placeholder="data_model_summary" />
          </span>
        </label>
        <p class="sql-editor-form-hint">Use letters, numbers, or underscores only.</p>
        <p v-if="nameError" class="sql-editor-form-error" role="alert">{{ nameError }}</p>

        <label class="sql-editor-modal-field" for="sql-editor-data-model-description">
          <span>Label (Optional)</span>
          <input
            id="sql-editor-data-model-description"
            v-model="form.description"
            :disabled="saving"
            maxlength="40"
            placeholder="Short label for end users"
          />
        </label>

        <label class="sql-editor-modal-check">
          <input v-model="form.isTemplate" type="checkbox" :disabled="saving" />
          <span>Mark as SQL Template</span>
        </label>

        <label class="sql-editor-modal-check">
          <input v-model="form.generateMetadataAfterSave" type="checkbox" disabled />
          <span>Create AI metadata after save</span>
        </label>

        <section class="sql-editor-modal-preview" aria-label="SQL field preview">
          <h3>Fields</h3>
          <div v-if="fields.length" class="sql-editor-preview-table">
            <div class="sql-editor-preview-row sql-editor-preview-header"><span>Field</span><span>Data Type</span></div>
            <div v-for="field in fields" :key="field.name" class="sql-editor-preview-row">
              <span>{{ field.name }}</span><span>{{ field.type }}</span>
            </div>
          </div>
          <p v-else class="sql-editor-preview-empty">Run the query to preview field types.</p>
        </section>

        <section class="sql-editor-modal-preview" aria-label="SQL parameter preview">
          <h3>Parameters</h3>
          <div v-if="parameters.length" class="sql-editor-preview-table">
            <div class="sql-editor-preview-row sql-editor-preview-header sql-editor-parameter-preview-row">
              <span>Parameter</span><span>Data Type</span><span>Role</span><span>Required</span>
            </div>
            <div v-for="param in parameters" :key="param.id" class="sql-editor-preview-row sql-editor-parameter-preview-row">
              <span>
                <strong>{{ param.name }}</strong>
                <small>{{ param.description || 'No description' }}</small>
              </span>
              <span>{{ param.dataType }}</span>
              <span>{{ param.dateRole }}</span>
              <span>{{ param.required ? 'Yes' : 'No' }}</span>
            </div>
          </div>
          <p v-else class="sql-editor-preview-empty">No parameters detected.</p>
        </section>
      </div>

      <footer class="sql-editor-modal-footer">
        <button type="button" class="sql-editor-secondary-button" :disabled="saving" @click="close">Cancel</button>
        <button type="button" class="button" :disabled="!form.name.trim() || !!nameError || saving" @click="save">
          {{ saving ? savingText : actionText }}
        </button>
      </footer>
    </section>
  </div>
</template>
