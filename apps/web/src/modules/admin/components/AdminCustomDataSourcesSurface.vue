<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { requestAdmin } from '../api';
import { toDisplayText } from '../format';
import type { AdminRecord, AdminResourceSurface } from '../types';
import '../admin-base-product.css';
import '../admin-custom-data-sources.css';
import '../admin-custom-data-sources-modal.css';

const props = defineProps<{ surface: AdminResourceSurface }>();

const records = ref<AdminRecord[]>([]);
const baseDataSources = ref<AdminRecord[]>([]);
const selectedRecord = ref<AdminRecord | null>(null);
const deleteTarget = ref<AdminRecord | null>(null);
const searchQuery = ref('');
const selectedBaseDataSource = ref('');
const status = ref('Loading custom data sources');
const error = ref('');
const isLoading = ref(false);
const isSaving = ref(false);
const queryDialogEl = ref<HTMLElement | null>(null);
const deleteDialogEl = ref<HTMLElement | null>(null);

const filteredRecords = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return records.value.filter(record => {
    const matchesSearch = !query || [
      recordName(record),
      recordDescription(record),
      baseDataSourceName(record)
    ].join(' ').toLowerCase().includes(query);
    const matchesBaseSource = !selectedBaseDataSource.value || baseDataSourceId(record) === selectedBaseDataSource.value;
    return matchesSearch && matchesBaseSource;
  });
});

watch(() => props.surface.id, () => {
  selectedRecord.value = null;
  searchQuery.value = '';
  selectedBaseDataSource.value = '';
  void loadDataSources();
}, { immediate: true });

watch(() => selectedRecord.value, (val) => { if (val) void nextTick(() => queryDialogEl.value?.focus()); });
watch(() => deleteTarget.value, (val) => { if (val) void nextTick(() => deleteDialogEl.value?.focus()); });

async function loadDataSources(): Promise<void> {
  isLoading.value = true;
  error.value = '';
  status.value = 'Loading custom data sources';
  try {
    const [customPayload, allPayload] = await Promise.all([
      requestAdmin<unknown>(props.surface.path),
      requestAdmin<unknown>('/api/data-sources')
    ]);
    records.value = extractRecords(customPayload, 'dataSources');
    baseDataSources.value = extractRecords(allPayload).filter(source => !isCustomQuery(source));
    status.value = `${records.value.length} ${pluralize('custom data source', records.value.length)} loaded`;
  } catch (caught) {
    records.value = [];
    baseDataSources.value = [];
    error.value = caught instanceof Error && caught.message ? caught.message : 'Custom data sources failed to load.';
    status.value = 'Custom data sources failed';
  } finally {
    isLoading.value = false;
  }
}

async function duplicateRecord(record: AdminRecord): Promise<void> {
  await runSaving('Duplicate query completed', async () => {
    await requestAdmin<unknown>(props.surface.path, {
      method: 'POST',
      body: {
        name: `${recordName(record)} (Copy)`,
        description: recordDescription(record),
        type: 'custom_query',
        baseDataSourceId: baseDataSourceId(record),
        query: queryText(record),
        config: {
          ...(isRecord(record.config) ? record.config : {}),
          baseDataSourceId: baseDataSourceId(record),
          query: queryText(record)
        }
      }
    });
    await loadDataSources();
  });
}

async function deleteRecord(record: AdminRecord): Promise<void> {
  await runSaving('Custom data source deleted', async () => {
    await requestAdmin<unknown>(`${props.surface.path}/${encodeURIComponent(recordId(record))}`, { method: 'DELETE' });
    if (selectedRecord.value && recordId(selectedRecord.value) === recordId(record)) selectedRecord.value = null;
    deleteTarget.value = null;
    await loadDataSources();
  });
}

async function runSaving(successMessage: string, action: () => Promise<void>): Promise<void> {
  isSaving.value = true;
  error.value = '';
  try {
    await action();
    status.value = successMessage;
  } catch (caught) {
    error.value = caught instanceof Error && caught.message ? caught.message : 'Custom data source action failed.';
    status.value = 'Custom data source action failed';
  } finally {
    isSaving.value = false;
  }
}

function openQuery(record: AdminRecord): void {
  selectedRecord.value = record;
}

function closeQuery(): void {
  selectedRecord.value = null;
}

function openDeleteDialog(record: AdminRecord): void {
  deleteTarget.value = record;
}

function closeDeleteDialog(): void {
  deleteTarget.value = null;
}

async function confirmDeleteDialog(): Promise<void> {
  if (!deleteTarget.value) return;
  await deleteRecord(deleteTarget.value);
}

function editHref(record: AdminRecord): string {
  const params = new URLSearchParams({
    edit: recordId(record),
    dataSourceId: baseDataSourceId(record),
    query: queryText(record)
  });
  return `/admin/sql-query-editor?${params.toString()}`;
}

function recordId(record: AdminRecord): string {
  return toDisplayText(record.id, '');
}

function recordName(record: AdminRecord | null | undefined): string {
  return toDisplayText(record?.name, 'Unnamed data source');
}

function recordDescription(record: AdminRecord | null | undefined): string {
  const dictionary = isRecord(record?.dictionary) ? record.dictionary : {};
  return toDisplayText(record?.description ?? dictionary.description, 'No description');
}

function baseDataSourceId(record: AdminRecord | null | undefined): string {
  const config = isRecord(record?.config) ? record.config : {};
  return toDisplayText(record?.baseDataSourceId ?? config.baseDataSourceId, '');
}

function baseDataSourceName(record: AdminRecord | null | undefined): string {
  const id = baseDataSourceId(record);
  if (!id) return 'Unknown';
  return recordName(baseDataSources.value.find(source => recordId(source) === id));
}

function queryText(record: AdminRecord | null | undefined): string {
  const config = isRecord(record?.config) ? record.config : {};
  const firstTable = Array.isArray(record?.tables) && isRecord(record.tables[0]) ? record.tables[0] : {};
  return toDisplayText(record?.query ?? config.query ?? firstTable.sqlQuery, 'Query not available');
}

function columnRows(record: AdminRecord | null | undefined): AdminRecord[] {
  const firstTable = Array.isArray(record?.tables) && isRecord(record.tables[0]) ? record.tables[0] : {};
  const fields = Array.isArray(firstTable.fields) ? firstTable.fields : [];
  return fields.filter(isRecord);
}

function columnCount(record: AdminRecord | null | undefined): string {
  return String(columnRows(record).length);
}

function createdDate(record: AdminRecord): string {
  return formatDate(record.createdAt ?? record.created_at);
}

function updatedDate(record: AdminRecord | null | undefined): string {
  return formatDate(record?.updatedAt ?? record?.updated_at);
}

function formatDate(value: unknown): string {
  if (!value) return 'Unknown';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return toDisplayText(value, 'Unknown');
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function extractRecords(payload: unknown, listKey?: string): AdminRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  const keyed = listKey ? payload[listKey] : undefined;
  if (Array.isArray(keyed)) return keyed.filter(isRecord);
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

function isCustomQuery(record: AdminRecord): boolean {
  return record.type === 'custom_query' || record.sourceType === 'custom_query';
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function isRecord(value: unknown): value is AdminRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
</script>

<template>
  <section class="admin-custom-sources page-container" :aria-labelledby="`${surface.id}-title`">
    <header class="page-header">
      <div class="page-title-section">
        <h1 :id="`${surface.id}-title`" class="page-title">Custom Data Sources</h1>
        <p class="page-subtitle">{{ surface.description }}</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-primary" href="/admin/sql-query-editor">
          <svg class="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create New Query
        </a>
      </div>
    </header>

    <p class="sr-only" role="status" aria-label="Custom Data Sources status" aria-live="polite">{{ status }}</p>
    <p v-if="error" class="admin-error" role="alert">{{ error }}</p>

    <div class="page-content">
      <div class="content-header">
        <div class="search-section">
          <label class="search-input-wrapper">
            <span class="sr-only">Search custom data sources</span>
            <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
            </svg>
            <input v-model="searchQuery" class="search-input" type="search" placeholder="Search custom data sources..." />
          </label>
        </div>
        <div class="filter-section">
          <label>
            <span class="sr-only">Base data source filter</span>
            <select v-model="selectedBaseDataSource" class="filter-select" aria-label="Base data source filter">
              <option value="">All Base Data Sources</option>
              <option v-for="source in baseDataSources" :key="recordId(source)" :value="recordId(source)">
                {{ recordName(source) }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <article class="data-sources-container" aria-label="Custom Data Sources">
        <div v-if="isLoading" class="loading-state">
          <div class="loading-spinner" aria-hidden="true"></div>
          <p>Loading custom data sources...</p>
        </div>
        <div v-else-if="filteredRecords.length === 0" class="empty-state">
          <svg class="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414A1 1 0 0 1 18 8.414V19a2 2 0 0 1-2 2z" />
          </svg>
          <h2>No Custom Data Sources</h2>
          <p>Create your first custom data source by building SQL queries in the Query Editor</p>
          <a class="btn btn-primary" href="/admin/sql-query-editor">Get Started</a>
        </div>
        <div v-else class="data-sources-table-container">
          <table class="data-sources-table" aria-label="Custom Data Sources">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Description</th>
                <th scope="col">Base Data Source</th>
                <th scope="col">Columns</th>
                <th scope="col">Created</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in filteredRecords" :key="recordId(record)">
                <td>
                  <div class="name-cell">
                    <span class="data-source-name">{{ recordName(record) }}</span>
                    <span class="data-source-type">Custom Query</span>
                  </div>
                </td>
                <td><span class="description-text">{{ recordDescription(record) }}</span></td>
                <td><span class="base-source-name">{{ baseDataSourceName(record) }}</span></td>
                <td><span class="column-count">{{ columnCount(record) }}</span></td>
                <td><span class="date-text">{{ createdDate(record) }}</span></td>
                <td>
                  <span class="status-cell">
                    <span class="status-dot" aria-hidden="true"></span>
                    <span>Active</span>
                  </span>
                </td>
                <td>
                  <div class="actions-cell">
                    <button class="action-btn view" type="button" :aria-label="`View query for ${recordName(record)}`" title="View Query" @click="openQuery(record)">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <a class="action-btn edit" :href="editHref(record)" :aria-label="`Edit query for ${recordName(record)}`" title="Edit Query">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828z" />
                      </svg>
                    </a>
                    <button class="action-btn duplicate" type="button" :disabled="isSaving" :aria-label="`Duplicate query for ${recordName(record)}`" title="Duplicate" @click="duplicateRecord(record)">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2z" />
                      </svg>
                    </button>
                    <button class="action-btn delete" type="button" :disabled="isSaving" :aria-label="`Delete query for ${recordName(record)}`" title="Delete" @click="openDeleteDialog(record)">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <div v-if="selectedRecord" class="modal-overlay" role="presentation" @click.self="closeQuery">
      <section ref="queryDialogEl" class="modal-container modal-large" role="dialog" aria-modal="true" :aria-labelledby="`${surface.id}-query-title`" tabindex="-1" @keydown.esc="closeQuery">
        <header class="modal-header">
          <h2 :id="`${surface.id}-query-title`" class="modal-title">{{ recordName(selectedRecord) }}</h2>
          <button class="modal-close" type="button" aria-label="Close query dialog" @click="closeQuery">x</button>
        </header>
        <div class="modal-body">
          <section class="query-section" aria-label="SQL Query">
            <label class="form-label">SQL Query</label>
            <pre class="query-display">{{ queryText(selectedRecord) }}</pre>
          </section>
          <section class="details-section" aria-label="Custom data source details">
            <div class="detail-grid">
              <div class="detail-item"><span>Base Data Source</span><strong>{{ baseDataSourceName(selectedRecord) }}</strong></div>
              <div class="detail-item"><span>Columns</span><strong>{{ columnCount(selectedRecord) }}</strong></div>
              <div class="detail-item"><span>Created</span><strong>{{ createdDate(selectedRecord) }}</strong></div>
              <div class="detail-item"><span>Last Modified</span><strong>{{ updatedDate(selectedRecord) }}</strong></div>
            </div>
          </section>
          <section v-if="columnRows(selectedRecord).length" class="columns-section" aria-label="Result Columns">
            <label class="form-label">Result Columns</label>
            <div class="columns-grid">
              <div v-for="field in columnRows(selectedRecord)" :key="toDisplayText(field.name)" class="column-item">
                <span>{{ toDisplayText(field.name) }}</span>
                <strong>{{ toDisplayText(field.type, 'string') }}</strong>
              </div>
            </div>
          </section>
        </div>
        <footer class="modal-footer">
          <a class="btn btn-primary" :href="editHref(selectedRecord)">Edit in Query Editor</a>
          <button class="btn btn-outline" type="button" @click="closeQuery">Close</button>
        </footer>
      </section>
    </div>

    <div v-if="deleteTarget" class="modal-overlay" role="presentation" @click.self="closeDeleteDialog">
      <section ref="deleteDialogEl" class="modal-container" role="dialog" aria-modal="true" :aria-label="`Delete query for ${recordName(deleteTarget)}`" tabindex="-1" @keydown.esc="closeDeleteDialog">
        <header class="modal-header">
          <h2 class="modal-title">Delete Custom Data Source</h2>
          <button class="modal-close" type="button" aria-label="Close delete query dialog" @click="closeDeleteDialog">x</button>
        </header>
        <div class="modal-body">
          <p>Delete "{{ recordName(deleteTarget) }}"? This removes the saved SQL query from reusable data sources.</p>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-outline" type="button" :disabled="isSaving" @click="closeDeleteDialog">Cancel</button>
          <button class="btn btn-danger" type="button" :disabled="isSaving" @click="confirmDeleteDialog">Delete</button>
        </footer>
      </section>
    </div>
  </section>
</template>
