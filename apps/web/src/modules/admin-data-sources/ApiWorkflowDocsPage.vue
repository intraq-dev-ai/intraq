<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { fetchAdminApiWorkflowOpenApi, fetchAdminDataSources } from './api';
import type { AdminDataSource } from './types';
import '../admin/admin.css';
import '../admin/admin-base-product.css';
import './api-workflow-docs.css';

declare global {
  interface Window {
    Redoc?: {
      init: (spec: unknown, options: Record<string, unknown>, element: HTMLElement) => void;
    };
  }
}

const REDOC_SCRIPT_ID = 'intraq-redoc-viewer-script';
const REDOC_SCRIPT_URL = 'https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js';

const route = useRoute();
const router = useRouter();
const sources = ref<AdminDataSource[]>([]);
const selectedSourceId = ref('');
const openApiDocument = ref<Record<string, unknown> | null>(null);
const status = ref('Loading API workflow docs');
const error = ref('');
const redocError = ref('');
const isLoadingSources = ref(false);
const isLoadingDocument = ref(false);
const redocContainer = ref<HTMLElement | null>(null);

const apiWorkflowSources = computed(() => sources.value.filter(source => source.type.toLowerCase() === 'api'));
const selectedSource = computed(() => apiWorkflowSources.value.find(source => source.id === selectedSourceId.value) ?? null);
const openApiInfo = computed(() => readRecord(openApiDocument.value?.info));
const openApiMetadata = computed(() => readRecord(openApiDocument.value?.['x-intraq']));
const openApiPaths = computed(() => {
  const paths = readRecord(openApiDocument.value?.paths);
  return Object.entries(paths).flatMap(([path, operations]) => {
    const operationRecord = readRecord(operations);
    return Object.entries(operationRecord).flatMap(([method, operation]) => {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) return [];
      const operationDetails = readRecord(operation);
      return [{
        id: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        summary: readString(operationDetails.summary) || path,
        description: readString(operationDetails.description),
        responseContract: readString(readRecord(operationDetails['x-intraq']).responseContract),
        responseSchema: readRecord(readRecord(readRecord(operationDetails.responses)?.['200']).content)?.['application/json']
      }];
    });
  });
});

onMounted(() => {
  void loadSources();
});

watch(selectedSourceId, sourceId => {
  if (!sourceId) {
    openApiDocument.value = null;
    return;
  }
  void router.replace({ query: { ...route.query, sourceId } });
  void loadOpenApi(sourceId);
});

watch(openApiDocument, () => {
  void renderRedoc();
});

async function loadSources(): Promise<void> {
  isLoadingSources.value = true;
  error.value = '';
  try {
    sources.value = await fetchAdminDataSources();
    const routeSourceId = typeof route.query.sourceId === 'string' ? route.query.sourceId : '';
    selectedSourceId.value = apiWorkflowSources.value.some(source => source.id === routeSourceId)
      ? routeSourceId
      : apiWorkflowSources.value[0]?.id ?? '';
    status.value = `${apiWorkflowSources.value.length} API workflow source${apiWorkflowSources.value.length === 1 ? '' : 's'} available`;
  } catch (caught) {
    error.value = readError(caught, 'API workflow sources could not be loaded.');
    status.value = 'API workflow docs failed to load';
  } finally {
    isLoadingSources.value = false;
  }
}

async function loadOpenApi(sourceId: string): Promise<void> {
  isLoadingDocument.value = true;
  error.value = '';
  redocError.value = '';
  try {
    openApiDocument.value = await fetchAdminApiWorkflowOpenApi(sourceId);
    status.value = `OpenAPI contract loaded for ${selectedSource.value?.name ?? 'selected API workflow'}`;
  } catch (caught) {
    openApiDocument.value = null;
    error.value = readError(caught, 'OpenAPI contract could not be loaded.');
    status.value = 'OpenAPI contract failed to load';
  } finally {
    isLoadingDocument.value = false;
  }
}

async function renderRedoc(): Promise<void> {
  await nextTick();
  if (!openApiDocument.value || !redocContainer.value) return;
  redocContainer.value.innerHTML = '';
  try {
    await loadRedocScript();
    if (!window.Redoc) throw new Error('Redoc viewer did not initialize.');
    window.Redoc.init(openApiDocument.value, {
      hideDownloadButton: false,
      hideHostname: false,
      nativeScrollbars: true,
      pathInMiddlePanel: true,
      requiredPropsFirst: true,
      scrollYOffset: 12,
      theme: {
        colors: {
          primary: { main: '#2563eb' }
        },
        typography: {
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          headings: {
            fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
          }
        }
      }
    }, redocContainer.value);
    redocError.value = '';
  } catch (caught) {
    redocError.value = readError(caught, 'Redoc viewer could not be loaded.');
  }
}

function loadRedocScript(): Promise<void> {
  if (window.Redoc) return Promise.resolve();
  const existing = document.getElementById(REDOC_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Redoc script failed to load.')), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = REDOC_SCRIPT_ID;
    script.src = REDOC_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Redoc script failed to load.'));
    document.head.appendChild(script);
  });
}

function formatSchema(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readError(value: unknown, fallback: string): string {
  return value instanceof Error && value.message ? value.message : fallback;
}
</script>

<template>
  <section class="admin-page api-workflow-docs-page" aria-labelledby="api-workflow-docs-title">
    <header class="api-docs-hero">
      <div>
        <p class="api-docs-kicker">API workflow docs</p>
        <h1 id="api-workflow-docs-title">OpenAPI documentation</h1>
        <p>
          View the active endpoint surface, request schema, response schema, and legacy response-contract details
          for each API workflow source. A workflow is documented as public or private, never both.
        </p>
      </div>
      <div class="api-docs-actions">
        <RouterLink class="admin-secondary-button" to="/admin/api-workflows/guide">Open Guide</RouterLink>
        <RouterLink class="admin-primary-button" to="/admin/data-sources">Open Data Sources</RouterLink>
      </div>
    </header>

    <section class="api-docs-toolbar" aria-label="API workflow docs controls">
      <label>
        <span>API workflow source</span>
        <select v-model="selectedSourceId" :disabled="isLoadingSources || apiWorkflowSources.length === 0">
          <option v-for="source in apiWorkflowSources" :key="source.id" :value="source.id">
            {{ source.name }}
          </option>
        </select>
      </label>
      <div class="api-docs-toolbar-status" role="status" aria-live="polite">
        {{ status }}
      </div>
    </section>

    <p v-if="error" class="admin-error">{{ error }}</p>

    <section v-if="selectedSource && openApiDocument" class="api-docs-summary" aria-label="Selected API workflow summary">
      <div>
        <span>Source</span>
        <strong>{{ selectedSource.name }}</strong>
      </div>
      <div>
        <span>OpenAPI</span>
        <strong>{{ readString(openApiDocument.openapi) || '3.1.0' }}</strong>
      </div>
      <div>
        <span>Version</span>
        <strong>{{ readString(openApiInfo.version) || '1.0.0' }}</strong>
      </div>
      <div>
        <span>Access</span>
        <strong>{{ readString(openApiMetadata.access) || 'private' }}</strong>
      </div>
      <div>
        <span>Endpoints</span>
        <strong>{{ openApiPaths.length }}</strong>
      </div>
    </section>

    <section v-if="openApiDocument" class="api-docs-redoc-shell" aria-labelledby="api-docs-redoc-title">
      <header>
        <div>
          <p class="api-docs-kicker">Redoc view</p>
          <h2 id="api-docs-redoc-title">{{ readString(openApiInfo.title) || 'API workflow contract' }}</h2>
        </div>
      </header>
      <div ref="redocContainer" class="api-docs-redoc-viewer" />
    </section>

    <section v-if="openApiDocument && redocError" class="api-docs-fallback" aria-labelledby="api-docs-fallback-title">
      <header>
        <p class="api-docs-kicker">Fallback view</p>
        <h2 id="api-docs-fallback-title">Endpoint contract</h2>
        <p>{{ redocError }}</p>
      </header>
      <article v-for="operation in openApiPaths" :key="operation.id" class="api-docs-operation">
        <header>
          <span :class="['api-docs-method', `api-docs-method--${operation.method.toLowerCase()}`]">{{ operation.method }}</span>
          <code>{{ operation.path }}</code>
        </header>
        <h3>{{ operation.summary }}</h3>
        <p v-if="operation.description">{{ operation.description }}</p>
        <p v-if="operation.responseContract" class="api-docs-contract">
          Response contract: <strong>{{ operation.responseContract }}</strong>
        </p>
        <details>
          <summary>200 response schema</summary>
          <pre><code>{{ formatSchema(operation.responseSchema) }}</code></pre>
        </details>
      </article>
    </section>

    <section v-if="!isLoadingSources && apiWorkflowSources.length === 0" class="api-docs-empty">
      <h2>No API workflow sources found</h2>
      <p>Create a REST API data source with workflow access to view OpenAPI documentation here.</p>
      <RouterLink class="admin-primary-button" to="/admin/data-sources">Create API workflow</RouterLink>
    </section>

    <section v-if="isLoadingDocument" class="api-docs-loading" role="status" aria-label="Loading OpenAPI documentation">
      Loading OpenAPI documentation
    </section>
  </section>
</template>
