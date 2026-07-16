<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

type SettingsExportFormat = 'excel' | 'csv' | 'json' | 'xml';

defineProps<{
  canConfigurePreviewDataScope?: boolean;
  canUseDashboard: boolean;
  isDashboardRunning: boolean;
  isSaving: boolean;
  manualMode: boolean;
  previewScopeActive: boolean;
  runConfigOpen: boolean;
}>();

const emit = defineEmits<{
  addFilter: [];
  cancelEdit: [];
  cancelRun: [];
  copyEmbed: [];
  exportDashboard: [format: SettingsExportFormat];
  openDelete: [];
  openDetails: [];
  openHistory: [];
  openPreviewScope: [];
  openRunSettings: [];
  publish: [];
  runDashboard: [];
  saveDraft: [];
  'update:manualMode': [value: boolean];
}>();

const settingsMenuRef = ref<HTMLElement | null>(null);
const settingsOpen = ref(false);

onMounted(() => {
  document.addEventListener('pointerdown', closeMenuOnOutsidePointerDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeMenuOnOutsidePointerDown, true);
});

function closeMenuOnOutsidePointerDown(event: PointerEvent): void {
  const target = event.target instanceof Node ? event.target : null;
  if (settingsOpen.value && (!target || !settingsMenuRef.value?.contains(target))) settingsOpen.value = false;
}

function toggleSettingsMenu(): void {
  settingsOpen.value = !settingsOpen.value;
}

function emitAction(action: () => void): void {
  settingsOpen.value = false;
  action();
}
</script>

<template>
  <div class="dashboard-topbar-actions" aria-label="Dashboard actions">
    <button
      class="manual-mode-btn"
      :class="{ 'manual-mode-btn--active': manualMode }"
      type="button"
      :aria-pressed="manualMode"
      :title="manualMode ? 'Exit manual edit mode' : 'Enter manual edit mode'"
      @click="emit('update:manualMode', !manualMode)"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="4" y="4" width="6" height="6" rx="1.25" />
        <rect x="14" y="4" width="6" height="6" rx="1.25" />
        <rect x="4" y="14" width="6" height="6" rx="1.25" />
        <rect x="14" y="14" width="6" height="6" rx="1.25" />
      </svg>
      Manual
    </button>
    <button class="add-filter-btn" type="button" :disabled="!canUseDashboard" @click="emitAction(() => emit('addFilter'))">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z"
        />
      </svg>
      Add Filter
    </button>
    <button
      v-if="canConfigurePreviewDataScope"
      class="preview-scope-btn"
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
    <div class="run-button-group">
      <button class="run-btn main" type="button" :disabled="!canUseDashboard || isDashboardRunning" @click="emit('runDashboard')">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        Run
      </button>
      <button
        class="run-btn config"
        type="button"
        aria-label="Configure run"
        aria-controls="dashboard-run-config-dialog"
        :aria-expanded="runConfigOpen"
        :disabled="!canUseDashboard"
        @click="emit('openRunSettings')"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"
          />
        </svg>
      </button>
    </div>
    <button v-if="isDashboardRunning" class="cancel-run-btn" type="button" :disabled="!canUseDashboard" @click="emit('cancelRun')">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Cancel
    </button>
    <div ref="settingsMenuRef" class="dashboard-menu">
      <button
        class="settings-btn-text"
        type="button"
        :disabled="!canUseDashboard"
        :aria-expanded="settingsOpen"
        aria-controls="dashboard-settings-menu"
        @click="toggleSettingsMenu"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Settings
      </button>
      <div v-if="settingsOpen" id="dashboard-settings-menu" class="dashboard-menu-panel" role="menu" aria-label="Dashboard settings menu">
        <button type="button" role="menuitem" @click="emitAction(() => emit('publish'))">Publish</button>
        <button type="button" role="menuitem" @click="emitAction(() => emit('openHistory'))">History</button>
        <button type="button" role="menuitem" @click="emitAction(() => emit('copyEmbed'))">Embed Dashboard</button>
        <button type="button" role="menuitem" @click="emitAction(() => emit('openDetails'))">Rename</button>
        <button type="button" role="menuitem" @click="emitAction(() => emit('openDetails'))">Change Category</button>
        <button type="button" role="menuitem" @click="emitAction(() => emit('exportDashboard', 'excel'))">Export Excel</button>
        <button type="button" role="menuitem" @click="emitAction(() => emit('exportDashboard', 'csv'))">Export CSV</button>
        <button type="button" role="menuitem" @click="emitAction(() => emit('exportDashboard', 'json'))">Export JSON</button>
        <button type="button" role="menuitem" @click="emitAction(() => emit('exportDashboard', 'xml'))">Export XML</button>
        <button type="button" role="menuitem" class="danger-menu-item" @click="emitAction(() => emit('openDelete'))">Delete</button>
      </div>
    </div>
    <button class="cancel-btn-text" type="button" :disabled="isSaving" @click="emit('cancelEdit')">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Cancel
    </button>
    <button class="save-btn-text" type="button" :disabled="!canUseDashboard" @click="emit('saveDraft')">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Save
    </button>
  </div>
</template>
