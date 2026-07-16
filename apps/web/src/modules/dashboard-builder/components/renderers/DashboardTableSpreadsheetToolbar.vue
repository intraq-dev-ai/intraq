<script setup lang="ts">
import type { DashboardTableColumn } from '../../visualization/view-model-types';

defineProps<{
  columns: DashboardTableColumn[];
  tabs: string[];
}>();
</script>

<template>
  <div class="dashboard-table-spreadsheet-toolbar" aria-hidden="true">
    <div class="dashboard-table-spreadsheet-toolbar-main">
      <span class="dashboard-table-spreadsheet-icon">↶</span>
      <span class="dashboard-table-spreadsheet-icon">↷</span>
      <span v-for="tab in tabs" :key="tab" class="dashboard-table-spreadsheet-tab">{{ tab }}</span>
    </div>
    <div class="dashboard-table-spreadsheet-tools">
      <span>▱</span>
      <span>↓</span>
      <span>✂</span>
      <span>▣</span>
      <span>B</span>
      <span>I</span>
      <span>U</span>
      <span>⌕</span>
      <span>12</span>
      <span>⋮</span>
    </div>
    <div class="dashboard-table-spreadsheet-formula">
      <span>A1</span>
      <span>fx</span>
      <span>{{ columns[0]?.label ?? '' }}</span>
    </div>
  </div>
</template>
