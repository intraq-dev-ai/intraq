<script setup lang="ts">
interface MatrixColumn {
  key: 'q1' | 'q2';
  label: string;
}

interface MatrixRow {
  label: string;
  q1: number;
  q2: number;
}

defineProps<{
  title?: string;
  variant?: 'heatmap' | 'multi-column' | 'multi-row' | 'professional';
}>();

const columns: MatrixColumn[] = [
  { key: 'q1', label: 'Q1' },
  { key: 'q2', label: 'Q2' }
];

const rows: MatrixRow[] = [
  { label: 'East', q1: 120, q2: 150 },
  { label: 'West', q1: 90, q2: 160 },
  { label: 'North', q1: 110, q2: 140 },
  { label: 'South', q1: 132, q2: 174 }
];

const matrixValues = rows.flatMap(row => columns.map(column => row[column.key]));

function conditionalCellStyle(value: number): Record<string, string> {
  const min = Math.min(...matrixValues);
  const max = Math.max(...matrixValues);
  const ratio = (value - min) / Math.max(1, max - min);
  const palette = ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#6c8eee', '#3152ad'];
  const index = Math.min(palette.length - 1, Math.max(0, Math.round(ratio * (palette.length - 1))));
  return {
    background: palette[index] ?? palette[0],
    color: index >= 4 ? '#ffffff' : '#1e3a8a'
  };
}
</script>

<template>
  <div class="template-preview-matrix" :class="`variant-${variant || 'heatmap'}`">
    <strong>{{ title || 'Heat Map' }}</strong>
    <div class="template-preview-matrix-scroll">
      <table class="template-preview-matrix-table" aria-label="Matrix heatmap preview">
        <thead>
          <tr>
            <th scope="col">Region</th>
            <th v-for="column in columns" :key="column.key" scope="col">{{ column.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.label">
            <th scope="row">{{ row.label }}</th>
            <td
              v-for="column in columns"
              :key="`${row.label}-${column.key}`"
              :style="conditionalCellStyle(row[column.key])"
            >
              {{ row[column.key] }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.template-preview-matrix {
  display: grid;
  gap: 8px;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.template-preview-matrix strong {
  color: #475569;
  font-size: 12px;
}

.template-preview-matrix-scroll {
  min-height: 0;
  overflow: hidden;
}

.template-preview-matrix-table {
  border-collapse: collapse;
  font-size: 12px;
  height: 100%;
  table-layout: fixed;
  width: 100%;
}

.template-preview-matrix-table th,
.template-preview-matrix-table td {
  border: 1px solid #dbe3ef;
  padding: 7px;
  text-align: center;
  vertical-align: middle;
}

.template-preview-matrix-table thead th {
  background: #f1f5f9;
  color: #334155;
  font-weight: 800;
}

.template-preview-matrix-table tbody th {
  background: #f8fafc;
  color: #0f172a;
  font-weight: 800;
  text-align: left;
}

.template-preview-matrix-table td {
  font-weight: 800;
}

.variant-professional .template-preview-matrix-table thead th,
.variant-professional .template-preview-matrix-table tbody th {
  background: #e2e8f0;
}
</style>
