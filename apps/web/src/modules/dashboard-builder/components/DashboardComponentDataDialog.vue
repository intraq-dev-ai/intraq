<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { DashboardElement } from '../types';
import type { DashboardCanvasIndicatorSummary } from './canvas/dashboard-canvas-indicators';
import type { ComponentDataPreview } from './dashboard-canvas-types';

defineProps<{
  componentLabel: (element: DashboardElement) => string;
  element: DashboardElement;
  error: string;
  indicatorSummary: (element: DashboardElement) => DashboardCanvasIndicatorSummary;
  loading: boolean;
  preview: ComponentDataPreview | null;
  previewCellValue: (value: unknown) => string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const dialogEl = ref<HTMLElement | null>(null);

onMounted(() => {
  dialogEl.value?.focus();
});
</script>

<template>
  <div class="dashboard-modal-overlay component-panel-overlay" @click="emit('close')">
    <section
      ref="dialogEl"
      class="component-data-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="`View data: ${element.name}`"
      tabindex="-1"
      @click.stop
      @keydown.esc="emit('close')"
    >
      <div class="filter-modal-header">
        <h2>View Data: {{ element.name }}</h2>
        <button class="secondary-button" type="button" @click="emit('close')">Close</button>
      </div>
      <table :aria-label="`Data summary for ${element.name}`">
        <thead>
          <tr>
            <th scope="col">Setting</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Component</td>
            <td>{{ componentLabel(element) }}</td>
          </tr>
          <tr>
            <td>Fields</td>
            <td>{{ indicatorSummary(element).fields.length }}</td>
          </tr>
          <tr>
            <td>Rows</td>
            <td>{{ preview?.totalRows ?? 0 }}</td>
          </tr>
          <tr>
            <td>Columns</td>
            <td>{{ preview?.columns.length ?? 0 }}</td>
          </tr>
          <tr>
            <td>Filters</td>
            <td>{{ indicatorSummary(element).filterCount }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="dashboard-render-state" role="status">
        <p class="dashboard-render-state-title">Loading...</p>
      </div>
      <div v-else-if="error" class="dashboard-render-state" role="alert">
        <p class="dashboard-render-state-title">Component data could not be loaded</p>
        <p class="dashboard-render-state-detail">{{ error }}</p>
      </div>
      <div v-else-if="preview && preview.rows.length > 0" class="component-data-preview">
        <p class="component-data-preview-caption">
          Showing {{ preview.rows.length }} of {{ preview.totalRows }} rows.
        </p>
        <table :aria-label="`Data preview for ${element.name}`">
          <thead>
            <tr>
              <th v-for="column in preview.columns" :key="column" scope="col">{{ column }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in preview.rows" :key="rowIndex">
              <td v-for="column in preview.columns" :key="column">{{ previewCellValue(row[column]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="dashboard-render-state-detail">No component data available.</p>
    </section>
  </div>
</template>
