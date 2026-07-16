<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';

const props = defineProps<{
  aiFeaturesEnabled?: boolean;
  dashboardId: string;
  isAnalyzerOpen: boolean;
  mobileFiltersOpen: boolean;
  showFilters: boolean;
}>();

const emit = defineEmits<{
  emailReport: [];
  exportDashboard: [format: 'excel' | 'csv' | 'pdf'];
  openAnalyzer: [];
  openFilters: [];
  openHistory: [];
}>();

const mobileExportMenuOpen = ref(false);

function openMobileFilters(): void {
  mobileExportMenuOpen.value = false;
  emit('openFilters');
}

function exportMobileDashboard(format: 'excel' | 'csv' | 'pdf'): void {
  mobileExportMenuOpen.value = false;
  emit('exportDashboard', format);
}
</script>

<template>
  <nav class="dashboard-mobile-actions" aria-label="Dashboard mobile actions">
    <button
      v-if="aiFeaturesEnabled !== false"
      type="button"
      class="dashboard-mobile-action"
      :aria-pressed="isAnalyzerOpen"
      @click="emit('openAnalyzer')"
    >
      AI Analyzer
    </button>
    <button type="button" class="dashboard-mobile-action" @click="emit('emailReport')">
      Email Report
    </button>
    <button
      v-if="showFilters"
      type="button"
      class="dashboard-mobile-action"
      :aria-pressed="mobileFiltersOpen"
      @click="openMobileFilters"
    >
      Filters
    </button>
    <button
      type="button"
      class="dashboard-mobile-action"
      :aria-pressed="mobileExportMenuOpen"
      @click="mobileExportMenuOpen = !mobileExportMenuOpen"
    >
      Export
    </button>
    <button type="button" class="dashboard-mobile-action" @click="emit('openHistory')">
      History
    </button>
    <RouterLink class="dashboard-mobile-action" :to="`/dashboard/${dashboardId}/edit`">
      {{ props.aiFeaturesEnabled === false ? 'Edit' : 'AI Builder' }}
    </RouterLink>
  </nav>

  <div
    v-if="mobileExportMenuOpen"
    class="dashboard-mobile-export-menu"
    role="menu"
    aria-label="Mobile dashboard export menu"
  >
    <button type="button" role="menuitem" @click="exportMobileDashboard('excel')">Export Excel</button>
    <button type="button" role="menuitem" @click="exportMobileDashboard('csv')">Export CSV</button>
    <button type="button" role="menuitem" @click="exportMobileDashboard('pdf')">PDF Export</button>
  </div>
</template>
