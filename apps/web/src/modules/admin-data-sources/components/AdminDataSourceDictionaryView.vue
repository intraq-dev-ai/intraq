<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { AdminDataSource } from '../types';
import type { AdminDictionaryTableRow } from '../view-model';
import AdminDataSourceBulkDictionaryDialog from './AdminDataSourceBulkDictionaryDialog.vue';

const props = defineProps<{
  isBusy: boolean;
  rows: AdminDictionaryTableRow[];
  searchQuery: string;
  selectedSourceId: string;
  sources: AdminDataSource[];
  status: string;
}>();

const emit = defineEmits<{
  deleteTable: [row: AdminDictionaryTableRow];
  details: [sourceId: string, tableId?: string];
  info: [];
  syncTable: [row: AdminDictionaryTableRow];
  uploaded: [message: string];
  'update:searchQuery': [value: string];
  'update:selectedSourceId': [value: string];
}>();

const bulkDialogOpen = ref(false);
const bulkDialogSourceId = computed(() => props.selectedSourceId || props.rows[0]?.dataSourceId || '');

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : '';
}

function openDetails(row: AdminDictionaryTableRow): void {
  emit('details', row.dataSourceId, row.table.id);
}

function handleBulkUploaded(message: string): void {
  emit('uploaded', message);
}
</script>

<template>
  <div class="admin-ds-dictionary-page">
    <header class="admin-ds-page-header">
      <div>
        <div class="admin-ds-title-row">
          <h1 id="admin-ds-dictionary-title" class="admin-ds-page-title">Data Models Dictionary</h1>
          <button
            class="admin-ds-info-button"
            type="button"
            aria-label="Why Data Dictionary matters"
            title="Why Data Dictionary matters"
            @click="$emit('info')"
          >
            i
          </button>
        </div>
        <p class="admin-ds-page-subtitle">
          Browse all data models that power your dashboards and configure the Data Dictionary to make AI smarter
        </p>
      </div>

      <button class="admin-ds-primary-button" type="button" @click="bulkDialogOpen = true">
        <svg aria-hidden="true" class="admin-ds-button-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 0 1-.88-7.9A5 5 0 0 1 15.9 6H16a5 5 0 0 1 1 9.9M15 13l-3-3m0 0-3 3m3-3v12" />
        </svg>
        Bulk Upload Dictionary
      </button>
    </header>

    <article class="sr-only" role="status" aria-label="Data Models Dictionary status" aria-live="polite">
      {{ status }}
    </article>

    <section class="admin-ds-dictionary-filters" aria-label="Data Models Dictionary filters">
      <label class="admin-ds-source-filter">
        <span>Data Source:</span>
        <select
          :value="selectedSourceId"
          aria-label="Data Source"
          @change="$emit('update:selectedSourceId', inputValue($event))"
        >
          <option value="">All Data Sources</option>
          <option v-for="source in sources" :key="source.id" :value="source.id">
            {{ source.name }} ({{ source.tables.length || source.tableCount }})
          </option>
        </select>
      </label>

      <label class="admin-ds-search-field">
        <span class="sr-only">Search tables</span>
        <svg aria-hidden="true" class="admin-ds-search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
        </svg>
        <input
          :value="searchQuery"
          type="search"
          placeholder="Search tables..."
          @input="$emit('update:searchQuery', inputValue($event))"
        />
      </label>

      <p class="admin-ds-result-count">
        Showing {{ rows.length }} {{ rows.length === 1 ? 'table' : 'tables' }}
      </p>
    </section>

    <div v-if="isBusy" class="admin-ds-loading-state" role="status" aria-live="polite">
      <span class="admin-ds-spinner" aria-hidden="true"></span>
      <p>Loading tables...</p>
    </div>

    <section v-else-if="rows.length === 0" class="admin-ds-empty-state" aria-labelledby="admin-ds-empty-title">
      <svg aria-hidden="true" class="admin-ds-empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z" />
      </svg>
      <h2 id="admin-ds-empty-title">No Tables Found</h2>
      <p>{{ searchQuery ? 'No tables match your search criteria' : 'No tables have been configured yet' }}</p>
    </section>

    <div v-else class="admin-ds-table-container">
      <table aria-label="Data Models Dictionary tables" class="admin-ds-dictionary-table">
        <thead>
          <tr>
            <th scope="col">Table Name</th>
            <th scope="col">Data Source</th>
            <th scope="col">Columns</th>
            <th scope="col">Dictionary</th>
            <th scope="col">Dashboards</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <th scope="row">
              <div class="admin-ds-table-name-cell">
                <svg aria-hidden="true" class="admin-ds-table-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z" />
                </svg>
                <span>{{ row.name }}</span>
              </div>
            </th>
            <td>
              <div class="admin-ds-source-badge">
                <span>{{ row.dataSourceName }}</span>
              </div>
            </td>
            <td>
              <span class="admin-ds-count-pill">{{ row.fields.length }}</span>
              {{ row.fields.length === 1 ? 'column' : 'columns' }}
            </td>
            <td>
              <span :class="row.hasDictionary ? 'admin-ds-status-pill is-ready' : 'admin-ds-status-pill'">
                {{ row.hasDictionary ? 'Configured' : 'Missing' }}
              </span>
            </td>
            <td>{{ row.dashboardCount > 0 ? `${row.dashboardCount} dashboard` : 'No dashboards' }}</td>
            <td>
              <div class="admin-ds-row-actions">
                <button class="admin-ds-secondary-button admin-ds-icon-action" type="button" :aria-label="`View details for ${row.dataSourceName}`" title="Details" @click="openDetails(row)">
                  <svg aria-hidden="true" class="admin-ds-action-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11v5m0-8h.01M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0Z" />
                  </svg>
                </button>
                <button class="admin-ds-secondary-button admin-ds-icon-action" type="button" :aria-label="`Sync ${row.name} to cloud`" title="Sync to Cloud" @click="$emit('syncTable', row)">
                  <svg aria-hidden="true" class="admin-ds-action-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 0 1-.88-7.9A5 5 0 0 1 15.9 6H16a5 5 0 0 1 1 9.9M12 12v8m0-8 3 3m-3-3-3 3" />
                  </svg>
                </button>
                <RouterLink
                  v-if="row.table.isSqlModel"
                  class="admin-ds-secondary-link admin-ds-icon-action"
                  :to="{ path: '/admin/sql-query-editor', query: { dataSource: row.dataSourceId, model: row.table.id } }"
                  :aria-label="`Edit SQL model ${row.name}`"
                  title="Edit SQL Model"
                >
                  <svg aria-hidden="true" class="admin-ds-action-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16.86 4.49 2.65 2.65M14 20h6M4 20l4.5-1 10-10a1.87 1.87 0 0 0-2.65-2.65l-10 10L4 20Z" />
                  </svg>
                </RouterLink>
                <button
                  v-if="row.table.isSqlModel && row.dashboardCount === 0"
                  class="admin-danger-button admin-ds-icon-action"
                  type="button"
                  :aria-label="`Delete SQL model ${row.name}`"
                  title="Delete SQL Model"
                  @click="$emit('deleteTable', row)"
                >
                  <svg aria-hidden="true" class="admin-ds-action-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 7h12m-9 0V5h6v2m-7 3v8m4-8v8m4-8v8M8 7l1 13h6l1-13" />
                  </svg>
                </button>
                <RouterLink class="admin-ds-secondary-link admin-ds-icon-action" :to="{ path: '/admin/data-dictionary', query: { source: row.dataSourceId } }" aria-label="Dictionary" title="Dictionary">
                  <svg aria-hidden="true" class="admin-ds-action-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 1 4 16.5v-11Zm0 11A2.5 2.5 0 0 0 6.5 19H20M8 7h8M8 11h6" />
                  </svg>
                </RouterLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AdminDataSourceBulkDictionaryDialog
      :open="bulkDialogOpen"
      :selected-source-id="bulkDialogSourceId"
      :sources="sources"
      @close="bulkDialogOpen = false"
      @uploaded="handleBulkUploaded"
    />
  </div>
</template>
