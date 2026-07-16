<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

type ViewExportFormat = 'excel' | 'csv' | 'pdf';

defineProps<{
  aiFeaturesEnabled?: boolean;
  canConfigurePreviewDataScope?: boolean;
  editPath: string;
  isAnalyzerOpen?: boolean;
  previewScopeActive: boolean;
}>();

const emit = defineEmits<{
  duplicate: [];
  emailReport: [];
  exportAdvancedPdf: [];
  exportDashboard: [format: ViewExportFormat];
  openAnalyzer: [];
  openHistory: [];
  openPreviewScope: [];
}>();

const exportMenuRef = ref<HTMLElement | null>(null);
const exportMenuOpen = ref(false);

onMounted(() => {
  document.addEventListener('pointerdown', closeMenuOnOutsidePointerDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeMenuOnOutsidePointerDown, true);
});

function closeMenuOnOutsidePointerDown(event: PointerEvent): void {
  const target = event.target instanceof Node ? event.target : null;
  if (exportMenuOpen.value && (!target || !exportMenuRef.value?.contains(target))) exportMenuOpen.value = false;
}

function toggleExportMenu(): void {
  exportMenuOpen.value = !exportMenuOpen.value;
}

function emitExportAction(action: () => void): void {
  exportMenuOpen.value = false;
  action();
}
</script>

<template>
  <div class="dashboard-topbar-actions" aria-label="Dashboard actions">
    <button
      v-if="aiFeaturesEnabled !== false"
      class="action-chip dashboard-analyzer-trigger"
      type="button"
      :aria-pressed="isAnalyzerOpen === true"
      aria-label="Ask AI about this dashboard"
      @click="emit('openAnalyzer')"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />
      </svg>
      Ask AI
    </button>
    <button
      v-if="canConfigurePreviewDataScope"
      class="action-chip preview-scope-btn"
      :class="{ 'preview-scope-btn--active': previewScopeActive }"
      type="button"
      :aria-pressed="previewScopeActive"
      @click="emit('openPreviewScope')"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M4 12h10M4 17h7" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M17 14l3 3-3 3" />
      </svg>
      Preview Scope
    </button>
    <button class="action-chip email-reports-btn" type="button" @click="emit('emailReport')">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      Email Reports
    </button>
    <button class="action-chip history-btn" type="button" @click="emit('openHistory')">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      History
    </button>
    <div ref="exportMenuRef" class="dashboard-menu">
      <button class="action-chip export-btn" type="button" :aria-expanded="exportMenuOpen" @click="toggleExportMenu">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Export
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div v-if="exportMenuOpen" class="dashboard-menu-panel" role="menu" aria-label="Dashboard export menu">
        <button type="button" role="menuitem" @click="emitExportAction(() => emit('exportDashboard', 'excel'))">Export Excel</button>
        <button type="button" role="menuitem" @click="emitExportAction(() => emit('exportDashboard', 'csv'))">Export CSV</button>
        <button type="button" role="menuitem" @click="emitExportAction(() => emit('exportDashboard', 'pdf'))">PDF Export</button>
        <button type="button" role="menuitem" @click="emitExportAction(() => emit('exportAdvancedPdf'))">Advanced PDF Export</button>
      </div>
    </div>
    <button class="action-chip clone-btn" type="button" @click="emit('duplicate')">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
      </svg>
      Clone
    </button>
    <RouterLink class="action-chip edit-btn" :to="editPath">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 3.487a2.25 2.25 0 113.182 3.182L7.5 19.212l-4.5 1.5 1.5-4.5 12.362-12.362z" />
      </svg>
      Edit
    </RouterLink>
  </div>
</template>
