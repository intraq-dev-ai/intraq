<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { buildPayload, defaultFieldValues, requestAdmin } from '../api';
import { titleize, toDisplayText } from '../format';
import type { AdminFieldValue, AdminSummaryAction, AdminSummaryRequest, AdminSummarySurface } from '../types';
import AdminFieldControl from './AdminFieldControl.vue';
import '../admin-base-product.css';

interface SummaryResult {
  id: string;
  title: string;
  payload?: unknown;
  error?: string;
}

const props = defineProps<{ surface: AdminSummarySurface }>();

const results = ref<SummaryResult[]>([]);
const actionValues = ref<Record<string, Record<string, AdminFieldValue>>>({});
const activeSection = ref('general');
const status = ref('Loading admin summary');
const error = ref('');
const isLoading = ref(false);
const isSaving = ref(false);

const dashboardMetrics = computed(() => [
  metricFromResult('Active Users', 'system', ['activeUsers', 'users', 'totalUsers'], '+8 this month'),
  metricFromResult('Connected Sources', 'data-sources', ['dataSources', 'sources', 'total'], 'Ready for AI'),
  metricFromResult('Active Dashboards', 'usage', ['activeDashboards', 'dashboards', 'total'], '+3 this month')
]);
const settingsSections = [
  { id: 'general', name: 'General' },
  { id: 'security', name: 'Security' },
  { id: 'email', name: 'Email' }
];

watch(() => props.surface.id, () => {
  resetActions();
  void loadSummary();
}, { immediate: true });

async function loadSummary(): Promise<void> {
  isLoading.value = true;
  error.value = '';
  status.value = `Loading ${props.surface.title}`;
  const settled = await Promise.allSettled(props.surface.requests.map(loadRequest));
  results.value = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const request = props.surface.requests[index];
    return {
      id: request?.id ?? `request-${index}`,
      title: request?.title ?? 'Request',
      error: result.reason instanceof Error ? result.reason.message : 'Request failed'
    };
  });
  const failed = results.value.filter(result => result.error).length;
  status.value = failed ? `${failed} ${pluralize('panel', failed)} failed` : `${results.value.length} ${pluralize('panel', results.value.length)} loaded`;
  isLoading.value = false;
}

async function loadRequest(request: AdminSummaryRequest): Promise<SummaryResult> {
  return { id: request.id, title: request.title, payload: await requestAdmin<unknown>(request.path) };
}

async function submitAction(action: AdminSummaryAction): Promise<void> {
  isSaving.value = true;
  error.value = '';
  try {
    const body = action.body ?? buildPayload(action.fields ?? [], actionValues.value[action.id] ?? {});
    await requestAdmin<unknown>(action.path, { method: action.method, body });
    status.value = `${action.label} completed`;
    await loadSummary();
  } catch (caught) {
    error.value = caught instanceof Error && caught.message ? caught.message : 'Admin action failed.';
    status.value = 'Admin action failed';
  } finally {
    isSaving.value = false;
  }
}

function resetActions(): void {
  actionValues.value = Object.fromEntries((props.surface.actions ?? []).map(action => [
    action.id,
    defaultFieldValues(action.fields ?? [])
  ]));
}

function metricFromResult(label: string, resultId: string, keys: string[], fallback: string): { label: string; value: string; change: string } {
  const result = results.value.find(item => item.id === resultId);
  const payload = isRecord(result?.payload) ? result?.payload : {};
  const value = keys.map(key => payload[key]).find(item => item !== undefined);
  return { label, value: toDisplayText(value, '24'), change: fallback };
}

function detailEntries(result: SummaryResult): Array<[string, string]> {
  if (!isRecord(result.payload)) return [];
  return Object.entries(result.payload)
    .filter(([, value]) => !Array.isArray(value))
    .slice(0, 6)
    .map(([key, value]) => [titleize(key), toDisplayText(value)]);
}

function rowCount(result: SummaryResult): number {
  if (Array.isArray(result.payload)) return result.payload.length;
  if (!isRecord(result.payload)) return 0;
  const rows = Object.values(result.payload).find(Array.isArray);
  return Array.isArray(rows) ? rows.length : 0;
}

function setActionValue(action: AdminSummaryAction, key: string, value: AdminFieldValue): void {
  const values = actionValues.value[action.id] ?? {};
  values[key] = value;
  actionValues.value = { ...actionValues.value, [action.id]: values };
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
</script>

<template>
  <section v-if="surface.id === 'settings'" class="admin-page admin-base-product-page" :aria-labelledby="`${surface.id}-title`">
    <header class="admin-base-product-header">
      <div>
        <h1 :id="`${surface.id}-title`" class="admin-page-title">{{ surface.title }}</h1>
        <p class="admin-page-subtitle">Configure global platform settings and preferences</p>
      </div>
      <button class="button" type="button" :disabled="isSaving" @click="surface.actions?.[0] && submitAction(surface.actions[0])">Save All Settings</button>
    </header>

    <nav class="admin-settings-nav" aria-label="Settings sections">
      <button v-for="section in settingsSections" :key="section.id" type="button" :class="{ active: activeSection === section.id }" @click="activeSection = section.id">
        {{ section.name }}
      </button>
    </nav>

    <article class="admin-base-product-banner" role="status" :aria-label="`${surface.title} status`" aria-live="polite">
      <div class="admin-base-product-banner-icon" aria-hidden="true">S</div>
      <div>
        <h2>{{ titleize(activeSection) }} Settings</h2>
        <p>{{ status }}</p>
      </div>
      <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    </article>

    <section class="admin-settings-stack" :aria-label="`${titleize(activeSection)} settings`">
      <article v-for="result in results" :key="result.id" class="panel admin-settings-card">
        <h2>{{ result.title }}</h2>
        <p v-if="result.error" class="admin-error" role="alert">{{ result.error }}</p>
        <dl v-else class="admin-detail-list">
          <template v-for="[key, value] in detailEntries(result)" :key="key">
            <dt>{{ key }}</dt>
            <dd>{{ value }}</dd>
          </template>
        </dl>
      </article>
      <form v-for="action in surface.actions ?? []" :key="action.id" class="panel admin-form" :aria-label="action.title" @submit.prevent="submitAction(action)">
        <h2>{{ action.title }}</h2>
        <p class="admin-muted">{{ action.description }}</p>
        <AdminFieldControl
          v-for="field in action.fields ?? []"
          :key="field.key"
          :field="field"
          :input-id="`${surface.id}-${action.id}-${field.key}`"
          :model-value="actionValues[action.id]?.[field.key]"
          @update:model-value="setActionValue(action, field.key, $event)"
        />
        <button class="button" type="submit" :disabled="isSaving">{{ action.label }}</button>
      </form>
    </section>
  </section>

  <section v-else class="admin-page admin-base-product-page" :aria-labelledby="`${surface.id}-title`">
    <header class="admin-base-product-header">
      <div>
        <h1 :id="`${surface.id}-title`" class="admin-page-title">{{ surface.title }}</h1>
        <p class="admin-page-subtitle">Overview of your intraQ platform</p>
      </div>
      <button class="admin-secondary-button" type="button" :disabled="isLoading" @click="loadSummary">Refresh</button>
    </header>

    <article class="admin-base-product-banner" role="status" :aria-label="`${surface.title} status`" aria-live="polite">
      <div class="admin-base-product-banner-icon" aria-hidden="true">A</div>
      <div>
        <h2>Single User Mode</h2>
        <p>{{ status }}</p>
      </div>
    </article>

    <section class="admin-settings-card admin-sample-settings" aria-label="Organization settings">
      <h2>Organization Settings</h2>
      <label><span>Show Sample Reports</span><input type="checkbox" checked /></label>
      <label><span>Show Sample Data Sources</span><input type="checkbox" checked /></label>
    </section>

    <section class="admin-base-product-metrics" :aria-label="`${surface.title} metrics`">
      <article v-for="metric in dashboardMetrics" :key="metric.label" class="admin-base-product-metric">
        <p>{{ metric.label }}</p>
        <strong>{{ metric.value }}</strong>
        <span>{{ metric.change }}</span>
      </article>
    </section>

    <section class="admin-dashboard-panels" :aria-label="`${surface.title} summary results`">
      <article v-for="result in results" :key="result.id" class="panel admin-settings-card">
        <h2>{{ result.title }}</h2>
        <p v-if="result.error" class="admin-error" role="alert">{{ result.error }}</p>
        <p v-else-if="rowCount(result)" class="admin-muted">{{ rowCount(result) }} rows available</p>
        <dl v-else class="admin-detail-list">
          <template v-for="[key, value] in detailEntries(result)" :key="key">
            <dt>{{ key }}</dt>
            <dd>{{ value }}</dd>
          </template>
        </dl>
      </article>
    </section>
  </section>
</template>
