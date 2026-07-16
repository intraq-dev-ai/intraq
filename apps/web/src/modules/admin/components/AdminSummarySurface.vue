<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { buildPayload, defaultFieldValues, requestAdmin } from '../api';
import { titleize, toDisplayText } from '../format';
import type {
  AdminField,
  AdminFieldValue,
  AdminSummaryAction,
  AdminSummaryRequest,
  AdminSummarySurface
} from '../types';
import AdminFieldControl from './AdminFieldControl.vue';

interface SummaryResult {
  id: string;
  title: string;
  payload?: unknown;
  error?: string;
}

const props = defineProps<{ surface: AdminSummarySurface }>();

const results = ref<SummaryResult[]>([]);
const actionValues = ref<Record<string, Record<string, AdminFieldValue>>>({});
const status = ref('Loading admin summary');
const error = ref('');
const isLoading = ref(false);
const isSaving = ref(false);

const hasActions = computed(() => (props.surface.actions?.length ?? 0) > 0);

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
  return {
    id: request.id,
    title: request.title,
    payload: await requestAdmin<unknown>(request.path)
  };
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
    error.value = readError(caught, 'Admin action failed.');
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

function resultRequest(result: SummaryResult): AdminSummaryRequest | undefined {
  return props.surface.requests.find(request => request.id === result.id);
}

function detailEntries(result: SummaryResult): Array<[string, string]> {
  if (!isRecord(result.payload)) return [];
  return Object.entries(result.payload)
    .filter(([, value]) => !Array.isArray(value))
    .slice(0, 10)
    .map(([key, value]) => [titleize(key), toDisplayText(value)]);
}

function rowsFor(result: SummaryResult): Record<string, unknown>[] {
  const request = resultRequest(result);
  const payload = result.payload;
  const candidate = request?.rowsKey && isRecord(payload) ? payload[request.rowsKey] : payload;
  if (Array.isArray(candidate)) return candidate.filter(isRecord);
  if (isRecord(candidate)) {
    const nested = Object.values(candidate).find(Array.isArray);
    return Array.isArray(nested) ? nested.filter(isRecord) : [];
  }
  return [];
}

function rowColumns(rows: Record<string, unknown>[]): string[] {
  return rows[0] ? Object.keys(rows[0]).slice(0, 6) : [];
}

function setActionValue(action: AdminSummaryAction, key: string, value: AdminFieldValue): void {
  const values = actionValues.value[action.id] ?? {};
  values[key] = value;
  actionValues.value = { ...actionValues.value, [action.id]: values };
}

function inputId(action: AdminSummaryAction, field: AdminField): string {
  return `${props.surface.id}-${action.id}-${field.key}`;
}

function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
</script>

<template>
  <section class="admin-page" :aria-labelledby="`${surface.id}-title`">
    <header class="page-header admin-page-header">
      <p class="eyebrow">{{ surface.eyebrow }}</p>
      <h1 :id="`${surface.id}-title`" class="admin-page-title">{{ surface.title }}</h1>
      <p class="admin-page-subtitle">{{ surface.description }}</p>
    </header>

    <article class="panel admin-toolbar admin-status-card" aria-labelledby="admin-summary-status-title">
      <h2 id="admin-summary-status-title">Status</h2>
      <p role="status" :aria-label="`${surface.title} status`" aria-live="polite">{{ status }}</p>
      <button class="button" type="button" :disabled="isLoading || isSaving" :aria-label="`Refresh ${surface.title}`" @click="loadSummary">Refresh</button>
      <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    </article>

    <section class="admin-summary-grid" :aria-label="`${surface.title} summary results`">
      <article v-for="result in results" :key="result.id" class="panel admin-summary-panel" :aria-labelledby="`${surface.id}-${result.id}-title`">
        <h2 :id="`${surface.id}-${result.id}-title`" :aria-label="`${result.title} panel`">{{ result.title }}</h2>
        <p v-if="result.error" class="admin-error" role="alert">{{ result.error }}</p>
        <template v-else>
          <dl v-if="detailEntries(result).length" class="admin-detail-list">
            <template v-for="[key, value] in detailEntries(result)" :key="key">
              <dt>{{ key }}</dt>
              <dd>{{ value }}</dd>
            </template>
          </dl>
          <div v-if="rowsFor(result).length" class="admin-table-wrap">
            <table :aria-label="`${result.title} rows`">
              <thead>
                <tr>
                  <th v-for="column in rowColumns(rowsFor(result))" :key="column" scope="col">{{ titleize(column) }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in rowsFor(result)" :key="`${result.id}-${index}`">
                  <td v-for="column in rowColumns(rowsFor(result))" :key="column">{{ toDisplayText(row[column]) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!detailEntries(result).length && !rowsFor(result).length" class="admin-empty-state">
            No displayable fields returned.
          </p>
        </template>
      </article>
    </section>

    <section v-if="hasActions" class="admin-action-grid" :aria-label="`${surface.title} actions`">
      <form v-for="action in surface.actions" :key="action.id" class="panel admin-form" :aria-label="action.title" @submit.prevent="submitAction(action)">
        <h2>{{ action.title }}</h2>
        <p class="admin-muted">{{ action.description }}</p>
        <AdminFieldControl
          v-for="field in action.fields ?? []"
          :key="field.key"
          :field="field"
          :input-id="inputId(action, field)"
          :model-value="actionValues[action.id]?.[field.key]"
          @update:model-value="setActionValue(action, field.key, $event)"
        />
        <button class="button" type="submit" :disabled="isSaving">{{ action.label }}</button>
      </form>
    </section>
  </section>
</template>
