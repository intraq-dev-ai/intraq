<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

interface MetadataColumn {
  columnType: string;
  dictionaryDescription: string;
  name: string;
  type: string;
}

interface MetadataInitialValues {
  columns?: MetadataColumn[];
  dataModelDefinition?: string;
  dataSourceDefinition?: string;
}

const props = defineProps<{
  confirmText: string;
  fields: Array<{ name: string; type: string; description?: string; dictionaryDescription?: string; columnType?: string }>;
  initialValues: MetadataInitialValues;
  saving: boolean;
  show: boolean;
  subtitle: string;
  title: string;
}>();

const emit = defineEmits<{
  close: [];
  submit: [answers: { columns: MetadataColumn[]; dataModelDefinition: string }];
}>();

const dialogEl = ref<HTMLElement | null>(null);
const form = reactive<{ columns: MetadataColumn[]; dataModelDefinition: string }>({
  columns: [],
  dataModelDefinition: ''
});

onMounted(() => { dialogEl.value?.focus(); });

const canSubmit = computed(() =>
  form.dataModelDefinition.trim().length > 0
  && form.columns.length > 0
  && form.columns.every(column =>
    column.dictionaryDescription.trim().length > 0
    && ['dimension', 'measure', 'identifier'].includes(column.columnType)
  )
);

watch(() => props.show, show => {
  if (show) hydrateForm();
});

watch(() => props.initialValues, () => {
  if (props.show) hydrateForm();
}, { deep: true });

function close(): void {
  if (!props.saving) emit('close');
}

function hydrateForm(): void {
  form.dataModelDefinition = String(props.initialValues.dataModelDefinition ?? props.initialValues.dataSourceDefinition ?? '');
  const initialColumns = Array.isArray(props.initialValues.columns) ? props.initialValues.columns : [];
  const fallbackColumns = props.fields.map(field => ({
    name: field.name,
    type: field.type || 'unknown',
    columnType: field.columnType ?? '',
    dictionaryDescription: field.dictionaryDescription ?? field.description ?? ''
  }));
  form.columns = (initialColumns.length > 0 ? initialColumns : fallbackColumns)
    .map(column => ({
      name: String(column.name ?? '').trim(),
      type: String(column.type ?? 'unknown').trim(),
      columnType: inferColumnRole(column),
      dictionaryDescription: String(column.dictionaryDescription ?? '').trim()
    }))
    .filter(column => column.name);
}

function inferColumnRole(column: { columnType?: string; name?: string; type?: string }): string {
  const existing = String(column.columnType ?? '').trim().toLowerCase();
  if (['dimension', 'measure', 'identifier'].includes(existing)) return existing;

  const name = String(column.name ?? '').trim().toLowerCase();
  const type = String(column.type ?? '').trim().toLowerCase();
  if (/(^id$|_id$|id_|code$|_code$|uuid|key$|_key$)/i.test(name)) return 'identifier';
  if (['number', 'integer', 'int', 'decimal', 'float', 'double', 'numeric', 'currency', 'percent'].some(token => type.includes(token))) {
    return 'measure';
  }
  return 'dimension';
}

function submit(): void {
  if (!canSubmit.value) return;
  emit('submit', {
    dataModelDefinition: form.dataModelDefinition.trim(),
    columns: form.columns.map(column => ({
      name: column.name,
      type: column.type,
      columnType: column.columnType,
      dictionaryDescription: column.dictionaryDescription.trim()
    }))
  });
}
</script>

<template>
  <div v-if="show" class="sql-editor-modal-overlay" @click="close">
    <section
      ref="dialogEl"
      class="sql-editor-modal-container sql-editor-metadata-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sql-editor-metadata-modal-title"
      tabindex="-1"
      @click.stop
      @keydown.esc="close"
    >
      <header class="sql-editor-modal-header">
        <div>
          <h2 id="sql-editor-metadata-modal-title">{{ title }}</h2>
          <p v-if="subtitle" class="sql-editor-modal-subtitle">{{ subtitle }}</p>
        </div>
        <button type="button" class="sql-editor-modal-close" aria-label="Close AI metadata setup" :disabled="saving" @click="close">
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <div class="sql-editor-modal-body">
        <div class="sql-editor-intro-card">
          <strong>AI Metadata Setup</strong>
          <span>AI will use this data model definition, column descriptions, aliases, and value wording when answering questions.</span>
        </div>

        <label class="sql-editor-modal-field" for="sql-editor-metadata-definition">
          <span>Data Model Definition</span>
          <textarea
            id="sql-editor-metadata-definition"
            v-model="form.dataModelDefinition"
            :disabled="saving"
            rows="5"
            placeholder="Explain what this data model means and how it should be used."
          />
        </label>

        <section class="sql-editor-modal-preview" aria-label="AI metadata column definitions">
          <h3>Column Definitions</h3>
          <div v-if="form.columns.length" class="sql-editor-metadata-columns">
            <div class="sql-editor-metadata-column-row sql-editor-preview-header">
              <span>Column</span><span>Role</span><span>Definition</span>
            </div>
            <div v-for="column in form.columns" :key="column.name" class="sql-editor-metadata-column-row">
              <span>
                <strong>{{ column.name }}</strong>
                <small>{{ column.type || 'unknown' }}</small>
              </span>
              <select v-model="column.columnType" :disabled="saving" :aria-label="`${column.name} column role`">
                <option value="dimension">Dimension</option>
                <option value="measure">Measure</option>
                <option value="identifier">Identifier</option>
              </select>
              <textarea
                v-model="column.dictionaryDescription"
                :disabled="saving"
                rows="2"
                :aria-label="`${column.name} column definition`"
                :placeholder="`Define ${column.name}`"
              />
            </div>
          </div>
          <p v-else class="sql-editor-preview-empty">No fields found. Run the query first so columns can be described.</p>
        </section>
      </div>

      <footer class="sql-editor-modal-footer">
        <button type="button" class="sql-editor-secondary-button" :disabled="saving" @click="close">Cancel</button>
        <button type="button" class="button" :disabled="saving || !canSubmit" @click="submit">
          {{ saving ? 'Generating...' : confirmText }}
        </button>
      </footer>
    </section>
  </div>
</template>
