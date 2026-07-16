<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import AdminDictionaryContextCards from './AdminDictionaryContextCards.vue';
import AdminDictionaryReviewDialog from './AdminDictionaryReviewDialog.vue';
import AdminDictionaryTablePickerDialog from './AdminDictionaryTablePickerDialog.vue';
import {
  fetchAdminDictionaryCatalog,
  fetchAdminDictionaryMetadataSummary,
  fetchAdminDictionaryTableDetails
} from './api';
import type {
  AdminDictionaryMetadataSummary,
  AdminDictionaryReadinessFilter,
  AdminDictionarySource,
  AdminDictionaryTableDetails
} from './types';
import {
  buildAdminDictionaryMetrics,
  buildAdminDictionaryDialogTables,
  buildAdminDictionaryTableRows,
  filterAdminDictionaryRows,
  type AdminDictionaryTableRow
} from './view-model';
import '../admin/admin.css';
import './admin-data-dictionary.css';
import './admin-data-dictionary-dialogs.css';

const route = useRoute();

const sources = ref<AdminDictionarySource[]>([]);
const searchQuery = ref('');
const selectedSourceId = ref('');
const selectedTableRowId = ref('');
const readinessFilter = ref<AdminDictionaryReadinessFilter>('all');
const selectedDictionary = ref<AdminDictionaryTableDetails | null>(null);
const metadataSummaries = ref<Record<string, AdminDictionaryMetadataSummary>>({});
const metadataErrors = ref<Record<string, string>>({});
const loadError = ref('');
const dictionaryError = ref('');
const isLoadingCatalog = ref(false);
const isLoadingDictionary = ref(false);
const loadingMetadataSourceId = ref('');
const showTablePicker = ref(false);
const showReviewDialog = ref(false);
let catalogRequestId = 0;
let dictionaryRequestId = 0;

const sourceFromRoute = computed(() => typeof route.query.source === 'string' ? route.query.source : '');
const tableRows = computed(() => buildAdminDictionaryTableRows(sources.value));
const visibleRows = computed(() =>
  filterAdminDictionaryRows(tableRows.value, searchQuery.value, selectedSourceId.value, readinessFilter.value)
);
const selectedRow = computed(() =>
  tableRows.value.find(row => row.id === selectedTableRowId.value) ?? null
);
const selectedSource = computed(() => {
  if (selectedRow.value) return sources.value.find(source => source.id === selectedRow.value?.dataSourceId) ?? null;
  if (selectedSourceId.value) return sources.value.find(source => source.id === selectedSourceId.value) ?? null;
  return sources.value[0] ?? null;
});
const metrics = computed(() => buildAdminDictionaryMetrics(sources.value, tableRows.value));
const dialogRows = computed(() => buildAdminDictionaryDialogTables(visibleRows.value));
const selectedFields = computed(() => {
  if (selectedDictionary.value?.fields.length) return selectedDictionary.value.fields;
  return selectedRow.value?.fields ?? [];
});
const selectedTableTitle = computed(() => selectedDictionary.value?.businessName ?? selectedRow.value?.name ?? 'Field Overview');
const selectedTableDescription = computed(() =>
  selectedDictionary.value?.description ??
  selectedRow.value?.tableDescription ??
  'No table description is available.'
);
const selectedMetadataSummary = computed(() => {
  const row = selectedRow.value;
  return row ? metadataSummaries.value[row.dataSourceId] ?? null : null;
});
const selectedMetadataError = computed(() => {
  const row = selectedRow.value;
  return row ? metadataErrors.value[row.dataSourceId] ?? '' : '';
});
const statusMessage = computed(() => {
  if (isLoadingCatalog.value) return 'Loading admin data dictionary';
  if (loadError.value) return 'Admin data dictionary failed to load';
  if (tableRows.value.length === 0) return 'No dictionary tables available';
  return `Showing ${visibleRows.value.length} of ${tableRows.value.length} tables`;
});

onMounted(() => {
  void loadCatalog();
});

watch(sourceFromRoute, sourceId => {
  if (sourceId) selectedSourceId.value = sourceId;
}, { immediate: true });

watch(visibleRows, rows => {
  if (selectedTableRowId.value && rows.some(row => row.id === selectedTableRowId.value)) return;
  selectedTableRowId.value = rows[0]?.id ?? '';
}, { immediate: true });

watch(selectedRow, row => {
  if (!row) {
    selectedDictionary.value = null;
    dictionaryError.value = '';
    return;
  }
  void loadTableDictionary(row.tableId);
  void loadMetadataSummary(row.dataSourceId);
}, { immediate: true });

async function loadCatalog(): Promise<void> {
  const requestId = ++catalogRequestId;
  isLoadingCatalog.value = true;
  loadError.value = '';
  dictionaryError.value = '';
  try {
    const nextSources = await fetchAdminDictionaryCatalog();
    if (requestId !== catalogRequestId) return;
    sources.value = nextSources;
    metadataSummaries.value = {};
    metadataErrors.value = {};
    if (selectedSourceId.value && !nextSources.some(source => source.id === selectedSourceId.value)) {
      selectedSourceId.value = '';
    }
  } catch (caught) {
    if (requestId !== catalogRequestId) return;
    sources.value = [];
    selectedTableRowId.value = '';
    loadError.value = readError(caught, 'Admin data dictionary could not be loaded.');
  } finally {
    if (requestId === catalogRequestId) isLoadingCatalog.value = false;
  }
}

async function loadTableDictionary(tableId: string): Promise<void> {
  const requestId = ++dictionaryRequestId;
  isLoadingDictionary.value = true;
  dictionaryError.value = '';
  try {
    const details = await fetchAdminDictionaryTableDetails(tableId);
    if (requestId !== dictionaryRequestId) return;
    selectedDictionary.value = details;
  } catch (caught) {
    if (requestId !== dictionaryRequestId) return;
    selectedDictionary.value = null;
    dictionaryError.value = readError(caught, 'Table dictionary details could not be loaded.');
  } finally {
    if (requestId === dictionaryRequestId) isLoadingDictionary.value = false;
  }
}

async function loadMetadataSummary(sourceId: string): Promise<void> {
  if (metadataSummaries.value[sourceId] || metadataErrors.value[sourceId] || loadingMetadataSourceId.value === sourceId) return;
  loadingMetadataSourceId.value = sourceId;
  try {
    const summary = await fetchAdminDictionaryMetadataSummary(sourceId);
    metadataSummaries.value = { ...metadataSummaries.value, [sourceId]: summary };
  } catch (caught) {
    metadataErrors.value = { ...metadataErrors.value, [sourceId]: readError(caught, 'Metadata summary unavailable.') };
  } finally {
    if (loadingMetadataSourceId.value === sourceId) loadingMetadataSourceId.value = '';
  }
}

function selectRow(row: AdminDictionaryTableRow): void {
  selectedTableRowId.value = row.id;
}

function selectDialogRow(rowId: string): void {
  selectedTableRowId.value = rowId;
  showTablePicker.value = false;
  showReviewDialog.value = true;
}

function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
</script>

<template>
  <section class="admin-page admin-data-dictionary-page" aria-labelledby="admin-data-dictionary-title">
    <header class="admin-dictionary-header">
      <div>
        <p class="eyebrow">Admin</p>
        <h1 id="admin-data-dictionary-title" class="admin-page-title">Data Dictionary</h1>
        <p class="admin-page-subtitle">
          Review source, table, field, alias, and value definitions used by Analyzer, SQL, dashboards, and AI.
        </p>
      </div>
      <div class="admin-dictionary-actions">
        <button class="admin-secondary-button" type="button" :disabled="isLoadingCatalog" @click="showTablePicker = true">
          Choose table
        </button>
        <RouterLink class="admin-secondary-link" to="/admin/view-data-sources">Data sources</RouterLink>
        <button class="button" type="button" :disabled="!selectedRow" @click="showReviewDialog = true">Review metadata</button>
      </div>
    </header>

    <section class="admin-dictionary-metrics" aria-label="Data dictionary metrics">
      <article v-for="metric in metrics" :key="metric.label" class="admin-dictionary-metric panel">
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
        <p>{{ metric.detail }}</p>
      </article>
    </section>

    <AdminDictionaryContextCards
      :selected-row="selectedRow"
      :selected-source="selectedSource"
      @review="showReviewDialog = true"
    />

    <section class="admin-dictionary-controls panel" aria-label="Data dictionary filters">
      <label for="admin-dictionary-source">
        <span>Data source</span>
        <select id="admin-dictionary-source" v-model="selectedSourceId" :disabled="isLoadingCatalog">
          <option value="">All data sources</option>
          <option v-for="source in sources" :key="source.id" :value="source.id">
            {{ source.name }} ({{ source.tables.length || source.tableCount }})
          </option>
        </select>
      </label>

      <label for="admin-dictionary-search">
        <span>Search tables and fields</span>
        <input
          id="admin-dictionary-search"
          v-model="searchQuery"
          type="search"
          placeholder="Search by table, source, field, or definition"
        />
      </label>

      <label for="admin-dictionary-readiness">
        <span>Dictionary status</span>
        <select id="admin-dictionary-readiness" v-model="readinessFilter">
          <option value="all">All tables</option>
          <option value="configured">Configured</option>
          <option value="missing">Missing</option>
        </select>
      </label>

      <button class="admin-secondary-button" type="button" :disabled="isLoadingCatalog" @click="loadCatalog">
        {{ isLoadingCatalog ? 'Loading' : 'Refresh' }}
      </button>
      <p role="status" aria-label="Admin data dictionary status" aria-live="polite">{{ statusMessage }}</p>
    </section>

    <p v-if="loadError" class="admin-error" role="alert">{{ loadError }}</p>

    <div v-if="!loadError" class="admin-dictionary-workspace">
      <section class="panel admin-dictionary-table-panel" aria-labelledby="admin-dictionary-table-title">
        <div class="admin-dictionary-panel-heading">
          <div>
            <h2 id="admin-dictionary-table-title">Dictionary Tables</h2>
            <p class="admin-muted">{{ visibleRows.length }} table{{ visibleRows.length === 1 ? '' : 's' }}</p>
          </div>
        </div>

        <div v-if="isLoadingCatalog" class="admin-empty-state" role="status" aria-live="polite">
          Loading dictionary tables.
        </div>
        <div v-else-if="visibleRows.length === 0" class="admin-empty-state" role="status">
          No dictionary tables match the current filters.
        </div>
        <div v-else class="admin-table-wrap">
          <table aria-label="Admin dictionary tables">
            <thead>
              <tr>
                <th scope="col">Table</th>
                <th scope="col">Data Source</th>
                <th scope="col">Fields</th>
                <th scope="col">Dictionary</th>
                <th scope="col">AI Metadata</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="row.id" :class="{ 'is-selected': selectedTableRowId === row.id }">
                <th scope="row">
                  <button class="admin-dictionary-row-button" type="button" @click="selectRow(row)">
                    <span>{{ row.name }}</span>
                    <small>{{ row.physicalName }}</small>
                  </button>
                </th>
                <td>
                  <div class="admin-dictionary-source-cell">
                    <span>{{ row.dataSourceName }}</span>
                    <small>{{ row.sourceType }} - {{ row.sourceStatus }}</small>
                  </div>
                </td>
                <td>{{ row.fieldCount }}</td>
                <td>
                  <span :class="row.hasDictionary ? 'admin-badge admin-badge-success' : 'admin-badge admin-badge-warning'">
                    {{ row.hasDictionary ? 'Configured' : 'Missing' }}
                  </span>
                </td>
                <td>
                  <span v-if="selectedMetadataSummary && selectedMetadataSummary.dataSourceId === row.dataSourceId">
                    {{ selectedMetadataSummary.overallCoverage }}%
                  </span>
                  <span v-else class="admin-muted">Pending</span>
                </td>
                <td>
                  <div class="admin-dictionary-row-actions">
                    <button class="admin-secondary-button" type="button" @click="selectRow(row)">Fields</button>
                    <button class="admin-secondary-button" type="button" @click="selectRow(row); showReviewDialog = true">
                      Review
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="panel admin-dictionary-fields-panel" aria-labelledby="admin-dictionary-fields-title">
        <div class="admin-dictionary-panel-heading">
          <div>
            <h2 id="admin-dictionary-fields-title">{{ selectedTableTitle }}</h2>
            <p v-if="selectedRow" class="admin-muted">{{ selectedRow.dataSourceName }} / {{ selectedRow.physicalName }}</p>
          </div>
          <p role="status" aria-label="Selected table dictionary status" aria-live="polite">
            {{ isLoadingDictionary ? 'Loading dictionary' : `${selectedFields.length} fields` }}
          </p>
        </div>

        <p v-if="selectedRow" class="admin-dictionary-description">{{ selectedTableDescription }}</p>
        <p v-if="dictionaryError" class="admin-error" role="alert">{{ dictionaryError }}</p>

        <div v-if="selectedRow" class="admin-dictionary-metadata-summary" aria-label="AI metadata readiness">
          <span v-if="selectedMetadataSummary">
            Metadata {{ selectedMetadataSummary.overallCoverage }}%, {{ selectedMetadataSummary.documentedFields }} documented fields, {{ selectedMetadataSummary.valueAliasCount }} value aliases
          </span>
          <span v-else-if="loadingMetadataSourceId === selectedRow.dataSourceId">Loading metadata coverage</span>
          <span v-else-if="selectedMetadataError" class="admin-dictionary-warning">{{ selectedMetadataError }}</span>
          <button class="admin-secondary-button" type="button" @click="showReviewDialog = true">Review dictionary</button>
        </div>

        <div v-if="!selectedRow" class="admin-empty-state">Select a table to inspect fields.</div>
        <div v-else-if="isLoadingDictionary" class="admin-empty-state" role="status" aria-live="polite">Loading field definitions.</div>
        <div v-else-if="selectedFields.length === 0" class="admin-empty-state" role="status">No field definitions are available.</div>
        <div v-else class="admin-table-wrap">
          <table aria-label="Admin dictionary fields">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Type</th>
                <th scope="col">Definition</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="field in selectedFields" :key="field.name">
                <th scope="row">{{ field.name }}</th>
                <td>{{ field.type }}</td>
                <td>{{ field.dictionaryDescription || field.description || 'No definition available.' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </aside>
    </div>

    <AdminDictionaryTablePickerDialog
      :loading="isLoadingCatalog"
      :rows="dialogRows"
      :selected-row-id="selectedTableRowId"
      :show="showTablePicker"
      @close="showTablePicker = false"
      @select="selectDialogRow"
    />
    <AdminDictionaryReviewDialog
      :fields="selectedFields"
      :loading="isLoadingDictionary"
      :row="selectedRow"
      :show="showReviewDialog"
      :table-details="selectedDictionary"
      @close="showReviewDialog = false"
    />
  </section>
</template>
