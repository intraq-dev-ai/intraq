<script setup lang="ts">
import type { AdminDataSourceTable } from '../types';

const props = defineProps<{
  availableTables: AdminDataSourceTable[];
  error: string;
  isLoading: boolean;
  isSaving: boolean;
  mode: 'tables' | 'models';
  open: boolean;
  searchQuery: string;
  selectedNames: string[];
  selectedTables: AdminDataSourceTable[];
  sourceName: string;
  resourceLabel: string;
  resourceLabelSingular: string;
}>();

const emit = defineEmits<{
  close: [];
  deselectAll: [];
  save: [];
  selectAll: [];
  tableFilters: [table: AdminDataSourceTable];
  toggle: [tableName: string, selected: boolean];
  'update:searchQuery': [value: string];
}>();

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : '';
}

function checkboxValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked;
}

function isSelected(table: AdminDataSourceTable): boolean {
  return props.selectedNames.includes(table.name);
}

function lowerResourceLabel(): string {
  return props.resourceLabel.toLowerCase();
}

function resourceTypeBadge(table: AdminDataSourceTable): string {
  if (props.resourceLabelSingular.toLowerCase() === 'endpoint') return 'ENDPOINT';
  return table.tableType === 'view' ? 'VIEW' : table.tableType === 'custom' ? 'CUSTOM' : 'TABLE';
}
</script>

<template>
  <div v-if="open" class="admin-modal-overlay" @click.self="emit('close')">
    <section
      class="admin-modal admin-ds-workflow-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`admin-ds-${mode}-dialog-title`"
      tabindex="-1"
      @keydown.esc="emit('close')"
      @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()"
    >
      <header class="admin-modal-header">
        <div>
          <p class="admin-modal-eyebrow">{{ sourceName }}</p>
          <h2 :id="`admin-ds-${mode}-dialog-title`">{{ mode === 'tables' ? `Manage ${resourceLabel}` : 'Manage Data Models' }}</h2>
          <p class="admin-muted">
            {{ mode === 'tables' ? `Select which ${lowerResourceLabel()} are available for modeling.` : `Choose which selected ${lowerResourceLabel()} appear in model workflows.` }}
          </p>
        </div>
        <button class="admin-icon-button" type="button" aria-label="Close" @click="emit('close')">×</button>
      </header>

      <div class="admin-ds-workflow-body">
        <label class="admin-ds-workflow-search">
          <span>Search {{ lowerResourceLabel() }}</span>
          <input
            :value="searchQuery"
            type="search"
            :placeholder="`Search ${lowerResourceLabel()}...`"
            @input="emit('update:searchQuery', inputValue($event))"
          />
        </label>

        <p v-if="isLoading" class="admin-ds-workflow-state" role="status" aria-live="polite">Loading {{ lowerResourceLabel() }}...</p>
        <p v-else-if="error" class="admin-ds-workflow-error" role="alert">{{ error }}</p>

        <template v-else>
          <section class="admin-ds-table-section" :aria-label="mode === 'tables' ? `Selected ${lowerResourceLabel()}` : 'Selected data models'">
            <div class="admin-ds-table-section-header">
              <h3>{{ mode === 'tables' ? `Selected ${resourceLabel}` : 'Selected Data Models' }} ({{ selectedNames.length }})</h3>
              <div class="admin-row-actions">
                <button class="admin-secondary-button" type="button" @click="emit('selectAll')">Select All</button>
                <button class="admin-secondary-button" type="button" @click="emit('deselectAll')">Deselect All</button>
              </div>
            </div>

            <p v-if="selectedTables.length === 0" class="admin-ds-workflow-state">
              {{ mode === 'tables' ? `No selected ${lowerResourceLabel()} match this view.` : 'No selected data model candidates match this view.' }}
            </p>

            <div v-else class="admin-ds-table-picker-list">
              <article v-for="table in selectedTables" :key="table.id" class="admin-ds-table-picker-row">
                <label>
                  <input
                    type="checkbox"
                    :checked="isSelected(table)"
                    @change="emit('toggle', table.name, checkboxValue($event))"
                  />
                  <span>{{ table.businessName || table.name }}</span>
                  <small>{{ resourceTypeBadge(table) }}</small>
                </label>
                <button
                  v-if="mode === 'tables'"
                  class="admin-secondary-button"
                  type="button"
                  :aria-label="`Filters for ${table.name}`"
                  @click="emit('tableFilters', table)"
                >
                  Filters
                  <span v-if="table.defaultFilters.length" class="admin-ds-filter-count">{{ table.defaultFilters.length }}</span>
                </button>
              </article>
            </div>
          </section>

          <section v-if="mode === 'tables'" class="admin-ds-table-section" :aria-label="`Available ${lowerResourceLabel()}`">
            <div class="admin-ds-table-section-header">
              <h3>Available {{ resourceLabel }} ({{ availableTables.length }})</h3>
            </div>
            <p v-if="availableTables.length === 0" class="admin-ds-workflow-state">
              {{
                searchQuery
                  ? `No available ${lowerResourceLabel()} match your search.`
                  : selectedTables.length === 0
                    ? `No registered ${lowerResourceLabel()} were found.`
                    : `All ${lowerResourceLabel()} are selected.`
              }}
            </p>
            <div v-else class="admin-ds-table-picker-list">
              <article v-for="table in availableTables" :key="table.id" class="admin-ds-table-picker-row">
                <label>
                  <input
                    type="checkbox"
                    :checked="isSelected(table)"
                    @change="emit('toggle', table.name, checkboxValue($event))"
                  />
                  <span>{{ table.businessName || table.name }}</span>
                  <small>{{ resourceTypeBadge(table) }}</small>
                </label>
              </article>
            </div>
          </section>
        </template>
      </div>

      <footer class="admin-modal-footer">
        <button class="admin-secondary-button" type="button" @click="emit('close')">Cancel</button>
        <button class="button" type="button" :disabled="isSaving || isLoading || Boolean(error)" @click="emit('save')">
          {{ isSaving ? 'Saving...' : mode === 'tables' ? 'Save Changes' : 'Save Data Models' }}
        </button>
      </footer>
    </section>
  </div>
</template>
