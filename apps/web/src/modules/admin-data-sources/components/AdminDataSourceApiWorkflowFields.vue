<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AdminDataSourceFormState } from '../types';
import AdminDataSourceApiWorkflowSidebar from './AdminDataSourceApiWorkflowSidebar.vue';
import AdminDataSourceApiWorkflowTemplateBar from './AdminDataSourceApiWorkflowTemplateBar.vue';
import { API_WORKFLOW_TEMPLATES, type AdminDataSourceApiWorkflowTemplate } from './admin-data-source-api-workflow-templates';

const props = defineProps<{
  modelValue: AdminDataSourceFormState;
}>();

const emit = defineEmits<{
  'replace-model': [value: AdminDataSourceFormState];
  'update-field': [key: keyof AdminDataSourceFormState, value: string | boolean];
}>();

const apiWorkflowTemplates = API_WORKFLOW_TEMPLATES;
const previewMessage = ref('');
const apiEndpointSummary = computed(() => props.modelValue.apiEndpoint.trim() || '(endpoint not set)');
const apiAccessSummary = computed(() => props.modelValue.apiWorkflowAccess === 'public'
  ? 'Public client API'
  : 'Private dashboard API'
);
const apiAuthSummary = computed(() => {
  const labels: Record<string, string> = {
    api_key: 'API key header',
    api_key_query: 'API key query parameter',
    basic: 'Basic auth',
    bearer: 'Bearer token',
    none: 'No auth',
    token_request: 'Managed token request'
  };
  return labels[props.modelValue.apiAuthType] ?? 'Custom auth';
});
const apiMethodSummary = computed(() => props.modelValue.apiMethod || 'GET');
const apiDataPathSummary = computed(() => props.modelValue.apiDataPath.trim() || 'response root');
const apiWorkflowSubtitle = computed(() => `${apiMethodSummary.value} ${apiEndpointSummary.value} -> ${apiDataPathSummary.value}`);
const apiWorkflowSteps = computed(() => [
  {
    id: 'connect',
    label: 'Connect',
    detail: props.modelValue.baseUrl.trim() || '(base URL not set)',
    state: props.modelValue.baseUrl.trim() ? 'Ready' : 'Missing'
  },
  {
    id: 'secure',
    label: 'Secure',
    detail: apiAuthSummary.value,
    state: props.modelValue.apiAuthType === 'none' ? 'Open' : 'Ready'
  },
  {
    id: 'request',
    label: 'Request',
    detail: apiWorkflowSubtitle.value,
    state: props.modelValue.apiEndpoint.trim() ? 'Ready' : 'Draft'
  },
  {
    id: 'map',
    label: 'Map',
    detail: props.modelValue.apiResponseShape || 'Rows / JSON',
    state: props.modelValue.apiDataPath.trim() || props.modelValue.apiResponseMapping.trim() ? 'Ready' : 'Draft'
  },
  {
    id: 'publish',
    label: 'Publish',
    detail: apiAccessSummary.value,
    state: props.modelValue.apiWorkflowAccess === 'public' ? 'Token' : 'Private'
  }
]);
const apiWorkflowRunSteps = computed(() => [
  {
    label: 'Token',
    detail: props.modelValue.apiAuthType === 'token_request'
      ? `${props.modelValue.apiTokenMethod || 'POST'} ${props.modelValue.apiTokenEndpoint || '(token endpoint not set)'}`
      : apiAuthSummary.value,
    state: props.modelValue.apiAuthType === 'none' ? 'Skipped' : 'Ready'
  },
  {
    label: 'Upstream API',
    detail: `${apiMethodSummary.value} ${apiEndpointSummary.value}`,
    state: props.modelValue.baseUrl.trim() && props.modelValue.apiEndpoint.trim() ? 'Ready' : 'Waiting'
  },
  {
    label: 'Response mapper',
    detail: apiDataPathSummary.value,
    state: props.modelValue.apiDataPath.trim() || props.modelValue.apiResponseMapping.trim() ? 'Ready' : 'Draft'
  },
  {
    label: 'Data model output',
    detail: props.modelValue.apiWorkflowAccess === 'public' ? 'Private dashboards and public API' : 'Dashboards and Analyzer',
    state: props.modelValue.dashboardVisible ? 'Enabled' : 'Hidden'
  }
]);

function updateField(key: keyof AdminDataSourceFormState, value: string | boolean): void {
  emit('update-field', key, value);
}

function applyApiWorkflowTemplate(template: AdminDataSourceApiWorkflowTemplate): void {
  emit('replace-model', {
    ...props.modelValue,
    ...template.patch,
    type: 'api'
  });
  previewMessage.value = 'Template applied. Review credentials, URL, endpoint, and filters before saving.';
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : '';
}

function checkedValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}

function previewApiData(): void {
  const url = props.modelValue.baseUrl || props.modelValue.apiUrl;
  previewMessage.value = url
    ? `Preview ready for ${props.modelValue.apiMethod || 'GET'} ${url}${props.modelValue.apiEndpoint || ''}${props.modelValue.apiDataPath ? ` at ${props.modelValue.apiDataPath}` : ''}.`
    : 'Enter a Base URL before previewing API data.';
}
</script>

<template>
  <fieldset class="admin-data-source-fieldset api-workflow-builder">
    <legend>API Workflow</legend>

    <div class="api-workflow-hero">
      <div class="api-workflow-title-block">
        <span class="api-workflow-kicker">Workflow</span>
        <h3>{{ modelValue.name || 'Untitled API workflow' }}</h3>
        <p>{{ apiWorkflowSubtitle }}</p>
      </div>
      <div class="api-workflow-publish-chip" :data-access="modelValue.apiWorkflowAccess">
        <span>{{ apiAccessSummary }}</span>
        <strong>{{ modelValue.apiWorkflowAccess === 'public' ? 'OAuth client credentials' : 'Internal token' }}</strong>
      </div>
    </div>

    <AdminDataSourceApiWorkflowTemplateBar :templates="apiWorkflowTemplates" @apply="applyApiWorkflowTemplate" />

    <div class="api-workflow-shell">
      <AdminDataSourceApiWorkflowSidebar
        :method-summary="apiMethodSummary"
        :run-steps="apiWorkflowRunSteps"
        :steps="apiWorkflowSteps"
      />

      <div class="api-workflow-editor">
        <section class="api-workflow-panel">
          <header class="api-workflow-panel-header">
            <span>1</span>
            <div>
              <h3>Connection</h3>
              <p>{{ modelValue.baseUrl || 'Base URL required' }}</p>
            </div>
          </header>
          <div class="admin-data-source-form-grid">
            <label class="api-workflow-field api-workflow-field--wide">
              <span>Base URL *</span>
              <input :value="modelValue.baseUrl" required type="url" autocomplete="off" placeholder="https://api.example.com" @input="updateField('baseUrl', inputValue($event))" />
            </label>
            <label>
              <span>Default Endpoint</span>
              <input :value="modelValue.apiEndpoint" type="text" autocomplete="off" placeholder="/reports/sales" @input="updateField('apiEndpoint', inputValue($event))" />
            </label>
            <label>
              <span>Default Method</span>
              <select :value="modelValue.apiMethod" @change="updateField('apiMethod', inputValue($event))">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </label>
            <label>
              <span>Request Timeout (ms)</span>
              <input :value="modelValue.requestTimeoutMs" inputmode="numeric" type="text" autocomplete="off" placeholder="15000" @input="updateField('requestTimeoutMs', inputValue($event))" />
            </label>
          </div>
        </section>

        <section class="api-workflow-panel">
          <header class="api-workflow-panel-header">
            <span>2</span>
            <div>
              <h3>Authentication</h3>
              <p>{{ apiAuthSummary }}</p>
            </div>
          </header>
          <div class="admin-data-source-form-grid">
            <label>
              <span>Authentication</span>
              <select :value="modelValue.apiAuthType" @change="updateField('apiAuthType', inputValue($event))">
                <option value="none">None</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="api_key">API Key</option>
                <option value="api_key_query">API Key Query Param</option>
                <option value="token_request">Token Request</option>
              </select>
            </label>
            <label v-if="modelValue.apiAuthType !== 'none' && modelValue.apiAuthType !== 'token_request'">
              <span>{{ modelValue.apiAuthType === 'bearer' ? 'Bearer Token' : modelValue.apiAuthType === 'basic' ? 'Username' : 'API Key' }}</span>
              <input :value="modelValue.apiAuthValue" type="text" autocomplete="off" @input="updateField('apiAuthValue', inputValue($event))" />
            </label>
            <label>
              <span>Credential Mode</span>
              <select :value="modelValue.apiCredentialMode" @change="updateField('apiCredentialMode', inputValue($event))">
                <option value="static">Static credentials</option>
                <option value="lookup">Lookup credentials per request</option>
              </select>
            </label>
            <label v-if="modelValue.apiCredentialMode === 'lookup'">
              <span>Lookup Data Source ID</span>
              <input :value="modelValue.apiCredentialLookupDataSourceId" type="text" autocomplete="off" placeholder="sql-source-id" @input="updateField('apiCredentialLookupDataSourceId', inputValue($event))" />
            </label>
            <label v-if="modelValue.apiCredentialMode === 'lookup'">
              <span>Lookup Timeout (ms)</span>
              <input :value="modelValue.apiCredentialLookupTimeoutMs" inputmode="numeric" type="text" autocomplete="off" placeholder="45000" @input="updateField('apiCredentialLookupTimeoutMs', inputValue($event))" />
            </label>
          </div>
          <label class="api-workflow-field api-workflow-field--full">
            <span>Auth Variables JSON</span>
            <textarea :value="modelValue.apiAuthVariables" rows="4" spellcheck="false" placeholder='{"apiKey":"...","tenantId":"...","accountKey":"..."}' @input="updateField('apiAuthVariables', inputValue($event))"></textarea>
          </label>
          <details v-if="modelValue.apiCredentialMode === 'lookup'" class="api-workflow-advanced">
            <summary>Credential lookup details</summary>
            <label>
              <span>Lookup SQL</span>
              <textarea
                :value="modelValue.apiCredentialLookupQuery"
                rows="4"
                spellcheck="false"
                placeholder="select clientId, clientSecret from api_credentials where clientId = {{clientId}}"
                @input="updateField('apiCredentialLookupQuery', inputValue($event))"
              ></textarea>
            </label>
            <label>
              <span>Advanced Lookup JSON</span>
              <textarea :value="modelValue.apiCredentialLookup" rows="4" spellcheck="false" placeholder='{"dataSourceId":"sql-source-id","query":"select clientId, clientSecret from api_credentials where clientId = {{clientId}}"}' @input="updateField('apiCredentialLookup', inputValue($event))"></textarea>
            </label>
          </details>
        </section>

        <section v-if="modelValue.apiAuthType === 'token_request'" class="api-workflow-panel">
          <header class="api-workflow-panel-header">
            <span>3</span>
            <div>
              <h3>Token Request</h3>
              <p>{{ modelValue.apiTokenEndpoint || 'Token endpoint required' }}</p>
            </div>
          </header>
          <div class="admin-data-source-form-grid">
            <label>
              <span>Token Endpoint *</span>
              <input :value="modelValue.apiTokenEndpoint" required type="text" autocomplete="off" placeholder="/oauth/token" @input="updateField('apiTokenEndpoint', inputValue($event))" />
            </label>
            <label>
              <span>Token Method</span>
              <select :value="modelValue.apiTokenMethod" @change="updateField('apiTokenMethod', inputValue($event))">
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </label>
            <label>
              <span>Client ID</span>
              <input :value="modelValue.apiClientId" type="text" autocomplete="off" @input="updateField('apiClientId', inputValue($event))" />
            </label>
            <label>
              <span>Client Secret</span>
              <input :value="modelValue.apiClientSecret" type="password" autocomplete="new-password" @input="updateField('apiClientSecret', inputValue($event))" />
            </label>
            <label>
              <span>Body Format</span>
              <select :value="modelValue.apiTokenBodyFormat" @change="updateField('apiTokenBodyFormat', inputValue($event))">
                <option value="json">JSON</option>
                <option value="form">Form URL Encoded</option>
                <option value="raw">Raw</option>
              </select>
            </label>
            <label>
              <span>Apply Token As</span>
              <select :value="modelValue.apiTokenApplyAs" @change="updateField('apiTokenApplyAs', inputValue($event))">
                <option value="bearer">Bearer Authorization</option>
                <option value="header">Custom Header</option>
                <option value="query">Query Parameter</option>
              </select>
            </label>
            <label>
              <span>Token Path</span>
              <input :value="modelValue.apiTokenPath" type="text" autocomplete="off" placeholder="access_token or Data.AccessToken" @input="updateField('apiTokenPath', inputValue($event))" />
            </label>
            <label>
              <span>Expires In Path</span>
              <input :value="modelValue.apiTokenExpiresInPath" type="text" autocomplete="off" placeholder="expires_in" @input="updateField('apiTokenExpiresInPath', inputValue($event))" />
            </label>
            <label>
              <span>Header Name</span>
              <input :value="modelValue.apiTokenHeaderName" type="text" autocomplete="off" placeholder="Authorization" @input="updateField('apiTokenHeaderName', inputValue($event))" />
            </label>
            <label>
              <span>Scheme</span>
              <input :value="modelValue.apiTokenScheme" type="text" autocomplete="off" placeholder="Bearer" @input="updateField('apiTokenScheme', inputValue($event))" />
            </label>
            <label>
              <span>Query Param</span>
              <input :value="modelValue.apiTokenQueryParam" type="text" autocomplete="off" placeholder="access_token" @input="updateField('apiTokenQueryParam', inputValue($event))" />
            </label>
            <label>
              <span>Cache TTL Seconds</span>
              <input :value="modelValue.apiTokenCacheTtlSeconds" inputmode="numeric" type="text" autocomplete="off" placeholder="300" @input="updateField('apiTokenCacheTtlSeconds', inputValue($event))" />
            </label>
          </div>
          <label class="admin-checkbox-field">
            <input
              :checked="modelValue.apiTokenAllowBodyOnGet"
              type="checkbox"
              @change="updateField('apiTokenAllowBodyOnGet', checkedValue($event))"
            />
            <span>Send token body with GET</span>
          </label>
          <details class="api-workflow-advanced">
            <summary>Token request payload</summary>
            <div class="admin-data-source-form-grid">
              <label>
                <span>Custom Token Body</span>
                <textarea :value="modelValue.apiTokenBody" rows="4" spellcheck="false" placeholder='{"client_id":"{{clientId}}","client_secret":"{{clientSecret}}"}' @input="updateField('apiTokenBody', inputValue($event))"></textarea>
              </label>
              <label>
                <span>Token Headers JSON</span>
                <textarea :value="modelValue.apiTokenHeaders" rows="4" spellcheck="false" placeholder='{"content-type":"application/json"}' @input="updateField('apiTokenHeaders', inputValue($event))"></textarea>
              </label>
              <label>
                <span>Token Query Params JSON</span>
                <textarea :value="modelValue.apiTokenQueryParams" rows="4" spellcheck="false" placeholder='{"tenant":"{{tenantId}}"}' @input="updateField('apiTokenQueryParams', inputValue($event))"></textarea>
              </label>
            </div>
          </details>
        </section>

        <section class="api-workflow-panel">
          <header class="api-workflow-panel-header">
            <span>{{ modelValue.apiAuthType === 'token_request' ? '4' : '3' }}</span>
            <div>
              <h3>Request</h3>
              <p>{{ apiMethodSummary }} {{ apiEndpointSummary }}</p>
            </div>
          </header>
          <div class="admin-data-source-form-grid">
            <label>
              <span>Query Params JSON</span>
              <textarea :value="modelValue.apiQueryParams" rows="4" spellcheck="false" placeholder='{"accountId":"{{accountId}}"}' @input="updateField('apiQueryParams', inputValue($event))"></textarea>
            </label>
            <label>
              <span>Body JSON</span>
              <textarea :value="modelValue.apiBody" rows="4" spellcheck="false" placeholder='{"from":"{{fromDate}}","to":"{{toDate}}"}' @input="updateField('apiBody', inputValue($event))"></textarea>
            </label>
            <label>
              <span>Headers JSON</span>
              <textarea :value="modelValue.apiHeaders" rows="4" spellcheck="false" placeholder='{"x-tenant":"{{tenantId}}"}' @input="updateField('apiHeaders', inputValue($event))"></textarea>
            </label>
            <label>
              <span>Pagination JSON</span>
              <textarea :value="modelValue.apiPagination" rows="4" spellcheck="false" placeholder='{"mode":"page","pageParam":"page","pageSizeParam":"pageSize","pageSize":100,"maxPages":5}' @input="updateField('apiPagination', inputValue($event))"></textarea>
            </label>
          </div>
          <label class="admin-checkbox-field">
            <input
              :checked="modelValue.apiAllowBodyOnGet"
              type="checkbox"
              @change="updateField('apiAllowBodyOnGet', checkedValue($event))"
            />
            <span>Send body with GET requests</span>
          </label>
        </section>

        <section class="api-workflow-panel">
          <header class="api-workflow-panel-header">
            <span>{{ modelValue.apiAuthType === 'token_request' ? '5' : '4' }}</span>
            <div>
              <h3>Response Mapping</h3>
              <p>{{ apiDataPathSummary }}</p>
            </div>
          </header>
          <div class="admin-data-source-form-grid">
            <label>
              <span>Default Data Path</span>
              <input :value="modelValue.apiDataPath" type="text" autocomplete="off" placeholder="data.results" @input="updateField('apiDataPath', inputValue($event))" />
            </label>
            <label>
              <span>Default Response Shape</span>
              <select :value="modelValue.apiResponseShape" @change="updateField('apiResponseShape', inputValue($event))">
                <option value="rows">Rows / JSON</option>
                <option value="kendo">Kendo DataSource</option>
                <option value="highcharts">Highcharts Series</option>
                <option value="matrix">Matrix Mapping</option>
              </select>
            </label>
            <label>
              <span>Response Mapping JSON</span>
              <textarea :value="modelValue.apiResponseMapping" rows="4" spellcheck="false" placeholder='{"type":"matrix","rootPath":"Data","labelPath":"Xlabel","labelColumn":"period","labelDateMode":"fill_from_first_label","seriesPath":"Name","seriesColumn":"location","valueColumns":{"sales":"Data","orders":"Count"}}' @input="updateField('apiResponseMapping', inputValue($event))"></textarea>
            </label>
            <label>
              <span>Additional Row Fields JSON</span>
              <textarea :value="modelValue.apiRowContextColumns" rows="4" spellcheck="false" placeholder='[{"name":"source_status","path":"meta.status"},{"mode":"byIndex","name":"overlay_value","path":"sidecar.values","valuePath":"value"}]' @input="updateField('apiRowContextColumns', inputValue($event))"></textarea>
            </label>
          </div>
        </section>

        <section class="api-workflow-panel">
          <header class="api-workflow-panel-header">
            <span>{{ modelValue.apiAuthType === 'token_request' ? '6' : '5' }}</span>
            <div>
              <h3>Publish</h3>
              <p>{{ apiAccessSummary }}</p>
            </div>
          </header>
          <div class="admin-data-source-form-grid">
            <label>
              <span>Workflow Access</span>
              <select :value="modelValue.apiWorkflowAccess" @change="updateField('apiWorkflowAccess', inputValue($event))">
                <option value="private">Private - dashboards only</option>
                <option value="public">Public - client credentials</option>
              </select>
            </label>
          </div>
          <div class="api-workflow-actions">
            <button class="admin-secondary-button" type="button" :disabled="!modelValue.baseUrl" @click="previewApiData">
              Preview Data
            </button>
            <p v-if="previewMessage" class="admin-muted" role="status">{{ previewMessage }}</p>
          </div>
        </section>
      </div>
    </div>
  </fieldset>
</template>
