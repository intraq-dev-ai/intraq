<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  BuilderDataSource,
  BuilderDataTable
} from '../dashboard-builder/types';
import type { DashboardTemplateDefinition } from './template-definitions';

const props = defineProps<{
  dataSources: BuilderDataSource[];
  error?: string;
  isCreating: boolean;
  isLoading: boolean;
  template: DashboardTemplateDefinition;
}>();

const emit = defineEmits<{
  cancel: [];
  create: [selection: { dataSource: BuilderDataSource; table: BuilderDataTable }];
}>();

const selectedDataSourceId = ref('');
const selectedTableId = ref('');

const visibleDataSources = computed(() => props.dataSources.filter(source => source.tables.length > 0));
const selectedDataSource = computed(() =>
  visibleDataSources.value.find(source => source.id === selectedDataSourceId.value) ?? visibleDataSources.value[0]
);
const dataModels = computed(() => selectedDataSource.value?.tables ?? []);
const selectedTable = computed(() =>
  dataModels.value.find(table => table.id === selectedTableId.value) ?? dataModels.value[0]
);
const canCreate = computed(() => Boolean(selectedDataSource.value && selectedTable.value) && !props.isCreating && !props.isLoading);

watch(
  visibleDataSources,
  sources => {
    if (!selectedDataSourceId.value || !sources.some(source => source.id === selectedDataSourceId.value)) {
      selectedDataSourceId.value = sources[0]?.id ?? '';
    }
  },
  { immediate: true }
);

watch(
  dataModels,
  tables => {
    if (!selectedTableId.value || !tables.some(table => table.id === selectedTableId.value)) {
      selectedTableId.value = tables[0]?.id ?? '';
    }
  },
  { immediate: true }
);

function submit(): void {
  if (!selectedDataSource.value || !selectedTable.value) return;
  emit('create', {
    dataSource: selectedDataSource.value,
    table: selectedTable.value
  });
}
</script>

<template>
  <div class="template-use-dialog-backdrop" role="presentation" @click="emit('cancel')">
    <form
      class="template-use-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-use-dialog-title"
      @click.stop
      @submit.prevent="submit"
      @keydown.esc="emit('cancel')"
    >
      <header>
        <p>Dashboard template</p>
        <h2 id="template-use-dialog-title">{{ template.title }}</h2>
      </header>

      <p class="template-use-dialog-copy">Choose the data source and data model for this dashboard.</p>

      <div v-if="isLoading" class="template-use-dialog-state">Loading data sources...</div>
      <div v-else-if="error" class="template-use-dialog-error">{{ error }}</div>
      <div v-else-if="visibleDataSources.length === 0" class="template-use-dialog-state">
        No dashboard-ready data sources were found.
      </div>
      <template v-else>
        <label>
          Data source
          <select v-model="selectedDataSourceId">
            <option v-for="source in visibleDataSources" :key="source.id" :value="source.id">
              {{ source.name }}
            </option>
          </select>
        </label>

        <label>
          Data model
          <select v-model="selectedTableId">
            <option v-for="table in dataModels" :key="table.id" :value="table.id">
              {{ table.name }}
            </option>
          </select>
        </label>
      </template>

      <footer>
        <button class="template-use-secondary" type="button" @click="emit('cancel')">Cancel</button>
        <button class="template-use-primary" type="submit" :disabled="!canCreate">
          {{ isCreating ? 'Creating...' : 'Create dashboard' }}
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.template-use-dialog-backdrop {
  align-items: center;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 24px;
  position: fixed;
  z-index: 1300;
}

.template-use-dialog {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
  color: #0f172a;
  display: grid;
  gap: 16px;
  max-width: 460px;
  padding: 22px;
  width: min(100%, 460px);
}

.template-use-dialog header {
  display: grid;
  gap: 4px;
}

.template-use-dialog header p,
.template-use-dialog h2,
.template-use-dialog-copy {
  margin: 0;
}

.template-use-dialog header p {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.template-use-dialog h2 {
  font-size: 22px;
}

.template-use-dialog-copy,
.template-use-dialog-state {
  color: #475569;
}

.template-use-dialog-error {
  border-radius: 10px;
  background: #fef2f2;
  color: #991b1b;
  padding: 10px 12px;
}

.template-use-dialog label {
  color: #334155;
  display: grid;
  font-size: 13px;
  font-weight: 800;
  gap: 6px;
}

.template-use-dialog select {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  color: #0f172a;
  font: inherit;
  padding: 10px 12px;
}

.template-use-dialog footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.template-use-secondary,
.template-use-primary {
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 800;
  padding: 10px 16px;
}

.template-use-secondary {
  background: #eef2f7;
  color: #334155;
}

.template-use-primary {
  background: linear-gradient(135deg, var(--tenant-gradient-start) 0%, var(--tenant-gradient-end) 100%);
  color: #fff;
}

.template-use-primary:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}
</style>
