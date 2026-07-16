<script setup lang="ts">
import type { DashboardElement } from '../../types';

const search = defineModel<string>('search', { required: true });

defineProps<{
  element: DashboardElement;
}>();

const emit = defineEmits<{
  exportCsv: [];
}>();
</script>

<template>
  <div class="dashboard-table-toolbar">
    <div class="dashboard-table-tools">
      <button v-if="element.config?.enableExport" type="button" @click="emit('exportCsv')">
        Export CSV
      </button>
      <span v-if="element.config?.showExecutionTime">1ms</span>
    </div>
    <div v-if="element.config?.enableSearch" class="dashboard-table-search">
      <svg aria-hidden="true" class="dashboard-table-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <input v-model="search" type="search" :aria-label="`Search ${element.name}`" placeholder="Search...">
    </div>
  </div>
</template>
