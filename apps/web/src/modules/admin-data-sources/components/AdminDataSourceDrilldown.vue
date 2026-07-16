<script setup lang="ts">
import { computed, ref } from 'vue';
import AdminDataSourceApiRequestPanel from './AdminDataSourceApiRequestPanel.vue';
import type {
  AdminApiWorkflowRunLog,
  AdminDataSource,
  AdminDataSourcePreviewResult,
  AdminDataSourceTable
} from '../types';
import { tableDisplayName } from '../view-model';

const props = defineProps<{
  isLoadingTables: boolean;
  open: boolean;
  selectedTableId: string;
  source: AdminDataSource | null;
  apiPreview: AdminDataSourcePreviewResult | null;
  apiPreviewError: string;
  apiRunLogs: AdminApiWorkflowRunLog[];
  dataSources: AdminDataSource[];
  isLoadingApiRuns: boolean;
  isPreviewingApi: boolean;
  isSavingApiConfig: boolean;
  tables: AdminDataSourceTable[];
}>();

const emit = defineEmits<{
  close: [];
  editSource: [source: AdminDataSource];
  previewApiRequest: [parameterValues: Record<string, unknown>];
  saveApiRequest: [payload: Record<string, unknown>];
  selectTable: [tableId: string];
}>();

const selectedTable = computed(() => props.tables.find(table => table.id === props.selectedTableId) ?? null);
const isApiSource = computed(() => (props.source?.type ?? '').toLowerCase() === 'api');
const resourceLabel = computed(() => isApiSource.value ? 'endpoint' : 'table');
const resourceLabelPlural = computed(() => isApiSource.value ? 'endpoints' : 'tables');
const resourceLabelTitle = computed(() => isApiSource.value ? 'Endpoint' : 'Table');
const resourceLabelPluralTitle = computed(() => isApiSource.value ? 'Endpoints' : 'Tables');
const tableTitle = computed(() => selectedTable.value ? tableDisplayName(selectedTable.value) : `${resourceLabelTitle.value} Details`);
const selectedFieldCount = computed(() => selectedTable.value?.fields.length ?? 0);
const apiRequestPanel = ref<InstanceType<typeof AdminDataSourceApiRequestPanel> | null>(null);

function startCreateApiEndpoint(): void {
  apiRequestPanel.value?.startCreateApiEndpoint();
}

function previewApiRequest(parameterValues: Record<string, unknown>): void {
  emit('previewApiRequest', parameterValues);
}

function saveApiRequest(payload: Record<string, unknown>): void {
  emit('saveApiRequest', payload);
}

function focusMountedElement(vnode: { el?: Element | null }): void {
  (vnode.el as HTMLElement | undefined)?.focus();
}
</script>

<template>
  <div v-if="open" class="admin-modal-overlay" role="presentation" @click.self="$emit('close')">
    <section
      class="admin-modal admin-data-source-drilldown-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-data-source-drilldown-title"
      aria-describedby="admin-data-source-drilldown-description"
      tabindex="-1"
      @keydown.esc="$emit('close')"
      @vue:mounted="focusMountedElement"
    >
      <header class="admin-modal-header admin-data-source-drilldown-header">
        <div class="admin-data-source-title-block">
          <p class="admin-modal-eyebrow">Data source</p>
          <h2 id="admin-data-source-drilldown-title">Data source details</h2>
          <p id="admin-data-source-drilldown-description" class="admin-muted admin-data-source-context">
            {{ source ? source.name : 'Select a source to inspect models and dictionary fields.' }}
          </p>
        </div>
        <button class="admin-icon-button" type="button" aria-label="Close data source details" @click="$emit('close')">x</button>
      </header>

      <div class="admin-data-source-drilldown" aria-label="Selected data source details">
        <aside class="panel admin-data-source-tables" aria-labelledby="admin-data-source-tables-title">
          <div class="admin-data-source-panel-heading">
            <div class="admin-data-source-heading-copy">
              <h2 id="admin-data-source-tables-title">{{ resourceLabelPluralTitle }}</h2>
              <p v-if="source" class="admin-muted">{{ source.name }}</p>
            </div>
            <button
              v-if="isApiSource"
              class="admin-secondary-button is-compact"
              type="button"
              @click="startCreateApiEndpoint"
            >
              Add Endpoint
            </button>
            <span v-else class="admin-data-source-count">{{ tables.length }}</span>
          </div>

          <p v-if="!source" class="admin-empty-state">Select a data source to inspect models.</p>
          <p v-else-if="isLoadingTables" class="admin-empty-state" role="status" aria-live="polite">Loading source {{ resourceLabelPlural }}.</p>
          <p v-else-if="tables.length === 0" class="admin-empty-state">
            {{ isApiSource ? 'No endpoints have been configured for this API source yet.' : 'No selected tables are available for this source.' }}
          </p>

          <ul v-else class="admin-data-source-table-list" :aria-label="`${resourceLabelPluralTitle} for selected data source`">
            <li v-for="table in tables" :key="table.id">
              <button
                class="admin-data-source-table-button"
                type="button"
                :aria-pressed="selectedTableId === table.id"
                :aria-label="`Select ${resourceLabel} ${tableDisplayName(table)}`"
                @click="$emit('selectTable', table.id)"
              >
                <span>{{ tableDisplayName(table) }}</span>
                <small>{{ table.name }} - {{ table.fields.length }} fields</small>
              </button>
            </li>
          </ul>
        </aside>

        <article class="panel admin-data-source-dictionary" aria-labelledby="admin-data-source-dictionary-title">
          <div class="admin-data-source-panel-heading">
            <div class="admin-data-source-heading-copy">
              <h2 id="admin-data-source-dictionary-title">{{ tableTitle }}</h2>
              <p v-if="selectedTable" class="admin-muted">{{ selectedTable.name }}</p>
            </div>
            <p role="status" :aria-label="`${resourceLabelTitle} details status`" aria-live="polite">
              {{ selectedTable ? `${selectedFieldCount} fields` : 'No model selected' }}
            </p>
          </div>

          <AdminDataSourceApiRequestPanel
            ref="apiRequestPanel"
            :api-preview="apiPreview"
            :api-preview-error="apiPreviewError"
            :api-run-logs="apiRunLogs"
            :data-sources="dataSources"
            :is-loading-api-runs="isLoadingApiRuns"
            :is-loading-tables="isLoadingTables"
            :is-previewing-api="isPreviewingApi"
            :is-saving-api-config="isSavingApiConfig"
            :selected-table="selectedTable"
            :source="source"
            @preview-api-request="previewApiRequest"
            @save-api-request="saveApiRequest"
          />
        </article>
      </div>

      <footer class="admin-modal-footer">
        <div v-if="source && isApiSource" class="admin-data-source-footer-links">
          <button v-if="isApiSource" class="admin-secondary-link" type="button" @click="$emit('editSource', source)">
            API setup &amp; tokens
          </button>
        </div>
        <button class="admin-secondary-button" type="button" @click="$emit('close')">Close</button>
      </footer>
    </section>
  </div>
</template>
