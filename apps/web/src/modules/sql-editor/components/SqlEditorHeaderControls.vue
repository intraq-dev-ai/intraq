<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { resolvedTheme, subscribeTheme, toggleResolvedTheme } from '../../theme/theme';
import ProfileDropdown from '../../shell/ProfileDropdown.vue';
import { readEffectiveRole, roleLabel } from '../../shell/role-context';
import type { SqlEditorSavedDataModel, SqlEditorSource } from '../types';

const props = defineProps<{
  pageTitle: string;
  status: string;
  isLoading: boolean;
  isRunning: boolean;
  dataSources: SqlEditorSource[];
  customSources: SqlEditorSavedDataModel[];
  selectedDataSourceId: string;
  selectedCustomSourceId: string;
  canRun: boolean | string;
  canUpdateModel: boolean;
}>();

const emit = defineEmits<{
  runQuery: [];
  dataSourceChange: [value: string];
  customSourceChange: [value: string];
  clearQuery: [];
  saveModel: [];
  updateModel: [];
}>();

function selectValue(event: Event): string {
  return event.target instanceof HTMLSelectElement ? event.target.value : '';
}

const isDarkTheme = ref(resolvedTheme() === 'dark');
const currentUserName = ref('intraQ User');
const currentRoleKey = ref(readEffectiveRole());
const currentUserRole = ref(roleLabel(currentRoleKey.value));
const selectedSource = computed(() => props.dataSources.find(source => source.id === props.selectedDataSourceId) ?? null);
const selectedSourceLabel = computed(() => {
  const source = selectedSource.value;
  if (!source) return '';
  const tableLabel = `${source.tableCount} table${source.tableCount === 1 ? '' : 's'}`;
  return `${source.name} is ${source.status} with ${tableLabel}`;
});
let unsubscribeTheme: (() => void) | null = null;

onMounted(() => {
  syncUserProfile();
  unsubscribeTheme = subscribeTheme(theme => {
    isDarkTheme.value = theme === 'dark';
  });
  window.addEventListener('intraq-session-updated', syncUserProfile);
  window.addEventListener('storage', syncUserProfile);
});

onBeforeUnmount(() => {
  unsubscribeTheme?.();
  window.removeEventListener('intraq-session-updated', syncUserProfile);
  window.removeEventListener('storage', syncUserProfile);
});

function toggleTheme(): void {
  isDarkTheme.value = toggleResolvedTheme() === 'dark';
}

function syncUserProfile(): void {
  currentUserName.value = storedValue(['userName', 'name', 'displayName']) ?? 'intraQ User';
  currentRoleKey.value = readEffectiveRole();
  currentUserRole.value = roleLabel(currentRoleKey.value);
}

function storedValue(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = window.localStorage.getItem(key)?.trim();
    if (value) return value;
  }
  return undefined;
}
</script>

<template>
  <header class="sql-header sql-editor-header" role="banner" aria-label="SQL editor toolbar">
    <div class="header-left sql-editor-header-left">
      <div class="sql-editor-title-group">
        <h1 id="sql-editor-title" class="editor-title">{{ pageTitle }}</h1>
      </div>
      <label class="data-source-control sql-editor-select-field">
        <span class="sr-only">Data source</span>
        <select
          class="data-source-select"
          :value="selectedDataSourceId"
          :disabled="isLoading || isRunning"
          aria-label="Data source"
          @change="emit('dataSourceChange', selectValue($event))"
        >
          <option value="">Select Data Source...</option>
          <option v-for="source in dataSources" :key="source.id" :value="source.id">{{ source.name }} ({{ source.type }})</option>
        </select>
        <span v-if="selectedSource" class="connection-status" :aria-label="selectedSourceLabel">
          <span class="status-dot"></span>
          <span class="connection-label">{{ selectedSource.status }} · {{ selectedSource.tableCount }} table{{ selectedSource.tableCount === 1 ? '' : 's' }}</span>
        </span>
      </label>
    </div>

    <div class="header-center sql-editor-header-center">
      <label v-if="selectedDataSourceId" class="custom-data-sources-section sql-editor-select-field sql-editor-model-select">
        <span class="dropdown-label">SQL Data Models:</span>
        <select class="custom-data-source-select" :value="selectedCustomSourceId" :disabled="isRunning" aria-label="Saved SQL data model" @change="emit('customSourceChange', selectValue($event))">
          <option value="">-- Select to Edit --</option>
          <option v-if="customSources.length === 0" value="" disabled>No data models for this data source</option>
          <option v-for="source in customSources" :key="source.id" :value="source.id">{{ source.name }}</option>
        </select>
      </label>
    </div>

    <form class="header-actions sql-editor-header-actions" aria-label="SQL query controls" @submit.prevent="emit('runQuery')">
      <p class="sql-editor-status" role="status" aria-label="SQL editor status" aria-live="polite">
        <span class="sql-editor-status-dot"></span>
        {{ isLoading || isRunning ? 'Loading SQL editor' : status }}
      </p>
      <button
        class="theme-btn"
        type="button"
        :aria-label="isDarkTheme ? 'Switch to light SQL editor theme' : 'Switch to dark SQL editor theme'"
        :title="isDarkTheme ? 'Switch to Light Theme' : 'Switch to Dark Theme'"
        @click="toggleTheme"
      >
        <svg v-if="isDarkTheme" class="theme-icon" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"/>
        </svg>
        <svg v-else class="theme-icon" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 0 1 8.646 3.646 9.003 9.003 0 0 0 12 21a9.003 9.003 0 0 0 8.354-5.646z"/>
        </svg>
      </button>
      <button class="execute-btn button" type="submit" :disabled="!canRun" aria-label="Run query">{{ isRunning ? 'Running...' : 'Execute Query' }}</button>
      <button class="clear-btn sql-editor-secondary-button" type="button" :disabled="isRunning" @click="emit('clearQuery')">Clear</button>
      <button v-if="selectedCustomSourceId" class="update-btn sql-editor-secondary-button" type="button" :disabled="!canUpdateModel" @click="emit('updateModel')">Update Data Model</button>
      <button v-else class="save-btn sql-editor-secondary-button" type="button" :disabled="!canRun" @click="emit('saveModel')">Save as Data Model</button>
      <ProfileDropdown
        class="sql-profile-dropdown"
        :user-name="currentUserName"
        :user-role="currentUserRole"
        :role-key="currentRoleKey"
      />
    </form>
  </header>

</template>
