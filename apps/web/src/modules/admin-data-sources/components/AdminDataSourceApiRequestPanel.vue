<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AdminDataSourceCompositeWorkflowDialog from './AdminDataSourceCompositeWorkflowDialog.vue';
import {
  buildApiTablePayload,
  buildCompositeWorkflowSummary,
  createApiDraftFromTable,
  createEmptyApiDraft,
  formatRunTime,
  parsePreviewParameters,
  runStatusLabel,
  type AdminDataSourceApiDraft
} from './admin-data-source-api-request';
import type {
  AdminApiWorkflowRunLog,
  AdminDataSource,
  AdminDataSourcePreviewResult,
  AdminDataSourceTable
} from '../types';

const props = defineProps<{
  apiPreview: AdminDataSourcePreviewResult | null;
  apiPreviewError: string;
  apiRunLogs: AdminApiWorkflowRunLog[];
  dataSources: AdminDataSource[];
  isLoadingApiRuns: boolean;
  isLoadingTables: boolean;
  isPreviewingApi: boolean;
  isSavingApiConfig: boolean;
  selectedTable: AdminDataSourceTable | null;
  source: AdminDataSource | null;
}>();

const emit = defineEmits<{
  previewApiRequest: [parameterValues: Record<string, unknown>];
  saveApiRequest: [payload: Record<string, unknown>];
}>();

const workflowDialogOpen = ref(false);
const isCreatingApiEndpoint = ref(false);
const apiDraft = ref<AdminDataSourceApiDraft>(createApiDraftFromTable(props.selectedTable));
const apiConfigError = ref('');

const isApiSource = computed(() => (props.source?.type ?? '').toLowerCase() === 'api');
const canConfigureApiRequest = computed(() =>
  Boolean(props.source && isApiSource.value && (props.selectedTable || isCreatingApiEndpoint.value))
);
const apiRequestLegend = computed(() => isCreatingApiEndpoint.value ? 'New API Endpoint' : 'Endpoint Behavior');
const compositeWorkflowSummary = computed(() => buildCompositeWorkflowSummary(apiDraft.value.compositeConfig));
const selectedApiRunLogs = computed(() => {
  if (!props.selectedTable) return props.apiRunLogs;
  return props.apiRunLogs.filter(log => log.tableId === props.selectedTable?.id || log.tableName === props.selectedTable?.name);
});

watch(
  () => props.selectedTable,
  table => {
    if (table) isCreatingApiEndpoint.value = false;
    apiDraft.value = createApiDraftFromTable(table);
    apiConfigError.value = '';
  },
  { immediate: true }
);

function startCreateApiEndpoint(): void {
  isCreatingApiEndpoint.value = true;
  apiConfigError.value = '';
  apiDraft.value = createEmptyApiDraft();
}

function cancelCreateApiEndpoint(): void {
  isCreatingApiEndpoint.value = false;
  apiConfigError.value = '';
}

function saveApiRequest(): void {
  apiConfigError.value = '';
  const result = buildApiTablePayload(apiDraft.value, props.selectedTable, isCreatingApiEndpoint.value);
  if (!result.ok) {
    if (result.error) apiConfigError.value = result.error;
    return;
  }
  emit('saveApiRequest', result.payload);
}

function saveCompositeWorkflow(workflow: Record<string, unknown>): void {
  apiDraft.value.compositeConfig = JSON.stringify(workflow, null, 2);
  workflowDialogOpen.value = false;
  saveApiRequest();
}

function previewApiRequest(): void {
  apiConfigError.value = '';
  const parsed = parsePreviewParameters(apiDraft.value.previewParameters);
  if (!parsed.ok) {
    apiConfigError.value = parsed.error;
    return;
  }
  emit('previewApiRequest', parsed.data);
}

defineExpose({ startCreateApiEndpoint });
</script>

<template>
  <p v-if="!source" class="admin-empty-state">Choose a source from the table to inspect configured models.</p>
  <p v-else-if="!selectedTable && !isLoadingTables && !isCreatingApiEndpoint" class="admin-empty-state">
    {{ isApiSource ? 'Select an endpoint or add a new endpoint model.' : 'Select a table to inspect details.' }}
  </p>
  <p v-else-if="!isApiSource && selectedTable" class="admin-empty-state">
    This table is selected for this source. Dictionary and AI metadata are managed from Data Sources.
  </p>

  <form
    v-if="canConfigureApiRequest"
    class="admin-data-source-dictionary-form"
    aria-label="Configure API request for selected endpoint"
    @submit.prevent="saveApiRequest"
  >
    <fieldset class="admin-data-source-fieldset">
      <legend>{{ apiRequestLegend }}</legend>
      <p class="admin-muted">
        Configure this endpoint's method, path, payload, response shape, mapping, export, and workflow behavior here.
        Shared API base URL, credential lookup, and token refresh are configured in API setup.
      </p>
      <div class="admin-data-source-form-grid">
        <label>
          <span>Endpoint Name</span>
          <input v-model="apiDraft.label" required type="text" placeholder="Discounts" />
        </label>
        <label>
          <span>Internal Key</span>
          <input v-model="apiDraft.tableName" type="text" placeholder="auto-generated" :disabled="!isCreatingApiEndpoint" />
        </label>
        <label>
          <span>Endpoint</span>
          <input v-model="apiDraft.endpoint" required type="text" placeholder="/report/sales-summary" />
        </label>
        <label>
          <span>Method</span>
          <select v-model="apiDraft.method">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
          </select>
        </label>
        <label class="admin-checkbox-field">
          <input v-model="apiDraft.allowBodyOnGet" type="checkbox" />
          <span>Send body with GET</span>
        </label>
        <label>
          <span>Data Path</span>
          <input v-model="apiDraft.dataPath" type="text" placeholder="Data or Results.Items" />
        </label>
        <label>
          <span>Response Shape</span>
          <select v-model="apiDraft.responseShape">
            <option value="rows">Rows / JSON</option>
            <option value="kendo">Kendo DataSource</option>
            <option value="highcharts">Highcharts Series</option>
            <option value="matrix">Matrix Mapping</option>
          </select>
        </label>
      </div>
      <div class="admin-data-source-form-grid">
        <label>
          <span>Query Params JSON</span>
          <textarea v-model="apiDraft.queryParams" rows="5" spellcheck="false" placeholder='{"RangeType":"{{rangeType}}","From":"{{fromDate}}"}'></textarea>
        </label>
        <label>
          <span>Body JSON</span>
          <textarea v-model="apiDraft.body" rows="5" spellcheck="false" placeholder='{"RangeType":"{{rangeType}}","From":"{{fromDate}}"}'></textarea>
        </label>
      </div>
      <div class="admin-data-source-form-grid">
        <label>
          <span>Headers JSON</span>
          <textarea v-model="apiDraft.headers" rows="4" spellcheck="false" placeholder='{"Accept":"application/json"}'></textarea>
        </label>
        <label>
          <span>Defaults JSON</span>
          <textarea v-model="apiDraft.defaults" rows="4" spellcheck="false" placeholder='{"rangeType":2,"rangeFrequency":"Monthly"}'></textarea>
        </label>
      </div>
      <label>
        <span>Response Mapping JSON</span>
        <textarea v-model="apiDraft.responseMapping" rows="4" spellcheck="false" placeholder='{"type":"matrix","rootPath":"Data","labelPath":"Xlabel","valueColumns":{"sales":"Data"}}'></textarea>
      </label>
      <label>
        <span>Additional Row Fields JSON</span>
        <textarea v-model="apiDraft.rowContextColumns" rows="4" spellcheck="false" placeholder='[{"name":"source_status","path":"meta.status"},{"mode":"byIndex","name":"overlay_value","path":"sidecar.values","valuePath":"value"}]'></textarea>
      </label>
      <label>
        <span>Direct Export JSON</span>
        <textarea v-model="apiDraft.exportConfig" rows="4" spellcheck="false" placeholder='{"direct":true,"endpoint":"/report/sales/export.csv","filename":"sales-export.csv","method":"POST","body":{"StartDate":"{{fromDateOnly}}","EndDate":"{{toDateExclusiveOnly}}"}}'></textarea>
      </label>
      <div class="admin-ds-composite-summary">
        <div>
          <span class="admin-ds-composite-summary-label">Composite Workflow</span>
          <strong>{{ compositeWorkflowSummary.label }}</strong>
          <small>Use this when one data model is assembled from multiple systems such as warehouse history plus current operational data.</small>
        </div>
        <button class="admin-secondary-button" type="button" @click="workflowDialogOpen = true">Open Workflow Builder</button>
      </div>
      <details class="admin-ds-composite-raw-json">
        <summary>Raw workflow JSON</summary>
        <label>
          <span>Composite Workflow JSON</span>
          <textarea v-model="apiDraft.compositeConfig" rows="5" spellcheck="false" placeholder='{"segments":[{"dataSourceId":"warehouse-source","query":"select * from discount_history where created_on between {{segmentStartDate}} and {{segmentEndDate}}","fieldMap":{"created_on":"CreatedOn","invoice_discount":"InvoiceDiscount"}},{"dataSourceId":"current-source","query":"select * from discount_current where CreatedOn between {{segmentStartDate}} and {{segmentEndDate}}"}],"sortBy":"CreatedOn","dedupeBy":["CompanyId","CreatedOn"]}'></textarea>
        </label>
      </details>
      <p class="admin-muted">
        Use placeholders like &#123;&#123;rangeType&#125;&#125;, &#123;&#123;fromDate&#125;&#125;, &#123;&#123;toDateExclusiveOnly&#125;&#125;, or &#123;&#123;locationId&#125;&#125;. Dashboard filters and preview parameters supply those values at runtime.
      </p>
      <p v-if="apiConfigError || apiPreviewError" class="admin-error" role="alert">{{ apiConfigError || apiPreviewError }}</p>
      <div class="admin-modal-actions">
        <button v-if="isCreatingApiEndpoint" class="admin-secondary-button" type="button" @click="cancelCreateApiEndpoint">
          Cancel
        </button>
        <button class="admin-secondary-button" type="submit" :disabled="isSavingApiConfig">
          {{ isSavingApiConfig ? 'Saving API Request' : isCreatingApiEndpoint ? 'Create Endpoint' : 'Save API Request' }}
        </button>
      </div>
    </fieldset>

    <fieldset v-if="selectedTable" class="admin-data-source-fieldset">
      <legend>Preview Dynamic Parameters</legend>
      <label>
        <span>Parameter Values JSON</span>
        <textarea v-model="apiDraft.previewParameters" rows="5" spellcheck="false"></textarea>
      </label>
      <div class="admin-modal-actions">
        <button class="admin-secondary-button" type="button" :disabled="isPreviewingApi" @click="previewApiRequest">
          {{ isPreviewingApi ? 'Previewing' : 'Preview Request' }}
        </button>
      </div>
      <div v-if="apiPreview" class="admin-ds-table-container admin-data-source-field-summary">
        <p class="admin-muted">Preview returned {{ apiPreview.rowCount }} row{{ apiPreview.rowCount === 1 ? '' : 's' }}.</p>
        <table v-if="apiPreview.sampleData.length > 0" class="admin-ds-dictionary-table" aria-label="API preview rows">
          <thead>
            <tr>
              <th v-for="column in Object.keys(apiPreview.sampleData[0] ?? {})" :key="column" scope="col">{{ column }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in apiPreview.sampleData.slice(0, 5)" :key="rowIndex">
              <td v-for="column in Object.keys(apiPreview.sampleData[0] ?? {})" :key="column">{{ row[column] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </fieldset>

    <fieldset v-if="selectedTable" class="admin-data-source-fieldset admin-api-run-history">
      <legend>Execution History</legend>
      <p class="admin-muted">
        Recent runs from previews, dashboards, Analyzer, SQL Editor, and public API calls for this endpoint.
      </p>
      <p v-if="isLoadingApiRuns" class="admin-empty-state" role="status">Loading API run history.</p>
      <p v-else-if="selectedApiRunLogs.length === 0" class="admin-empty-state">
        No runs recorded for this endpoint yet. Preview the request to create the first run log.
      </p>
      <div v-else class="admin-api-run-list" aria-label="Recent API workflow runs">
        <article v-for="run in selectedApiRunLogs" :key="run.id" class="admin-api-run-item" :data-ok="run.ok">
          <div>
            <strong>{{ runStatusLabel(run) }}</strong>
            <span>{{ formatRunTime(run.startedAt) }}</span>
          </div>
          <div>
            <span>{{ run.method || 'API' }} {{ run.endpoint || selectedTable.name }}</span>
            <small>{{ run.rowCount }} rows &middot; {{ run.pageCount }} page{{ run.pageCount === 1 ? '' : 's' }} &middot; {{ run.durationMs }} ms</small>
          </div>
          <p v-if="run.error">{{ run.error }}</p>
        </article>
      </div>
    </fieldset>
  </form>

  <AdminDataSourceCompositeWorkflowDialog
    v-if="source && selectedTable"
    :data-sources="dataSources"
    :open="workflowDialogOpen"
    :source="source"
    :table="selectedTable"
    :workflow-json="apiDraft.compositeConfig"
    @close="workflowDialogOpen = false"
    @save="saveCompositeWorkflow"
  />
</template>
