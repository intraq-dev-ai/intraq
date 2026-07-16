<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  buildPayload,
  createResource,
  defaultFieldValues,
  deleteResource,
  fetchResource,
  recordId,
  runRecordAction,
  updateResource
} from '../api';
import { cellValue, recordName, statusClass } from '../format';
import type { AdminField, AdminFieldValue, AdminRecord, AdminRecordAction, AdminResourceSurface } from '../types';
import AdminFieldControl from './AdminFieldControl.vue';
import '../admin-base-product.css';

const props = defineProps<{ surface: AdminResourceSurface }>();

const records = ref<AdminRecord[]>([]);
const selectedId = ref('');
const createValues = ref<Record<string, AdminFieldValue>>({});
const editValues = ref<Record<string, AdminFieldValue>>({});
const createDialogOpen = ref(false);
const editDialogOpen = ref(false);
const deleteDialogOpen = ref(false);
const status = ref('Loading admin records');
const error = ref('');
const isLoading = ref(false);
const isSaving = ref(false);
const createDialogEl = ref<HTMLElement | null>(null);
const editDialogEl = ref<HTMLElement | null>(null);
const deleteDialogEl = ref<HTMLElement | null>(null);

const canCreate = computed(() => props.surface.canCreate !== false && props.surface.createFields.length > 0);
const canEdit = computed(() => props.surface.canEdit !== false);
const canDelete = computed(() => props.surface.canDelete !== false);
const editFields = computed(() => props.surface.editFields ?? props.surface.createFields);
const selectedRecord = computed(() => records.value.find(record => recordId(props.surface, record) === selectedId.value) ?? null);
const visibleActions = computed(() => props.surface.actions ?? []);
const hasRowActions = computed(() => canEdit.value || visibleActions.value.length > 0);

watch(() => props.surface.id, () => {
  selectedId.value = '';
  closeDialogs();
  resetForms();
  void loadRecords();
}, { immediate: true });

watch(selectedRecord, record => {
  editValues.value = record ? defaultFieldValues(editFields.value, record) : defaultFieldValues(editFields.value);
});

watch(createDialogOpen, (open) => { if (open) void nextTick(() => createDialogEl.value?.focus()); });
watch(editDialogOpen, (open) => { if (open) void nextTick(() => editDialogEl.value?.focus()); });
watch(deleteDialogOpen, (open) => { if (open) void nextTick(() => deleteDialogEl.value?.focus()); });

async function loadRecords(): Promise<void> {
  isLoading.value = true;
  error.value = '';
  status.value = `Loading ${props.surface.title}`;
  try {
    const nextRecords = await fetchResource(props.surface);
    records.value = nextRecords;
    if (!nextRecords.some(record => recordId(props.surface, record) === selectedId.value)) {
      selectedId.value = nextRecords[0] ? recordId(props.surface, nextRecords[0]) : '';
    }
    status.value = `${nextRecords.length} ${pluralize('record', nextRecords.length)} loaded`;
  } catch (caught) {
    records.value = [];
    error.value = readError(caught, `${props.surface.title} failed to load.`);
    status.value = `${props.surface.title} failed`;
  } finally {
    isLoading.value = false;
  }
}

async function submitCreate(): Promise<void> {
  if (!canCreate.value) return;
  await runSaving('Record created', async () => {
    await createResource(props.surface, buildPayload(props.surface.createFields, createValues.value));
    createValues.value = defaultFieldValues(props.surface.createFields);
    createDialogOpen.value = false;
    await loadRecords();
  });
}

async function submitEdit(): Promise<void> {
  if (!selectedRecord.value) return;
  await runSaving('Record updated', async () => {
    await updateResource(props.surface, selectedRecord.value as AdminRecord, buildPayload(editFields.value, editValues.value));
    editDialogOpen.value = false;
    await loadRecords();
  });
}

async function submitAction(action: AdminRecordAction, record: AdminRecord): Promise<void> {
  await runSaving(`${action.label} completed`, async () => {
    await runRecordAction(action, record);
    if (action.reload !== false) await loadRecords();
  });
}

async function removeSelected(): Promise<void> {
  if (!selectedRecord.value) return;
  await runSaving('Record deleted', async () => {
    await deleteResource(props.surface, selectedRecord.value as AdminRecord);
    selectedId.value = '';
    deleteDialogOpen.value = false;
    editDialogOpen.value = false;
    await loadRecords();
  });
}

async function runSaving(successMessage: string, action: () => Promise<void>): Promise<void> {
  isSaving.value = true;
  error.value = '';
  try {
    await action();
    status.value = successMessage;
  } catch (caught) {
    error.value = readError(caught, 'Admin action failed.');
    status.value = 'Admin action failed';
  } finally {
    isSaving.value = false;
  }
}

function resetForms(): void {
  createValues.value = defaultFieldValues(props.surface.createFields);
  editValues.value = defaultFieldValues(editFields.value);
}

function openCreateDialog(): void {
  createValues.value = defaultFieldValues(props.surface.createFields);
  createDialogOpen.value = true;
}

function openEditDialog(record: AdminRecord): void {
  selectedId.value = recordId(props.surface, record);
  editValues.value = defaultFieldValues(editFields.value, record);
  editDialogOpen.value = true;
}

function openDeleteDialog(): void {
  deleteDialogOpen.value = true;
}

function closeDialogs(): void {
  createDialogOpen.value = false;
  editDialogOpen.value = false;
  deleteDialogOpen.value = false;
}

function setFormValue(values: Record<string, AdminFieldValue>, key: string, value: AdminFieldValue): void {
  values[key] = value;
}

function inputId(prefix: string, field: AdminField): string {
  return `${props.surface.id}-${prefix}-${field.key}`;
}

function rowKey(record: AdminRecord): string {
  return recordId(props.surface, record) || recordName(props.surface, record);
}

function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}
</script>

<template>
  <section class="admin-page" :aria-labelledby="`${surface.id}-title`">
    <header class="page-header admin-page-header">
      <p class="eyebrow">{{ surface.eyebrow }}</p>
      <h1 :id="`${surface.id}-title`" class="admin-page-title">{{ surface.title }}</h1>
      <p class="admin-page-subtitle">{{ surface.description }}</p>
    </header>

    <article class="panel admin-toolbar admin-status-card" aria-labelledby="admin-resource-status-title">
      <h2 id="admin-resource-status-title">Status</h2>
      <p role="status" :aria-label="`${surface.title} status`" aria-live="polite">{{ status }}</p>
      <div class="admin-toolbar-actions">
        <button class="admin-secondary-button" type="button" :disabled="isLoading || isSaving" :aria-label="`Refresh ${surface.title}`" @click="loadRecords">Refresh</button>
        <a v-for="link in surface.quickLinks ?? []" :key="link.href" class="admin-secondary-button" :href="link.href">{{ link.label }}</a>
        <button v-if="canCreate" class="button" type="button" :disabled="isSaving" @click="openCreateDialog">
          {{ surface.createLabel ?? `Create ${surface.title}` }}
        </button>
      </div>
      <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    </article>

    <section class="admin-workspace admin-workspace-full" :aria-label="`${surface.title} workspace`">
      <article class="panel admin-table-panel" :aria-labelledby="`${surface.id}-records-title`">
        <h2 :id="`${surface.id}-records-title`">Records</h2>
        <p v-if="isLoading" class="admin-empty-state">Loading records.</p>
        <p v-else-if="records.length === 0" class="admin-empty-state">No records returned by this endpoint.</p>
        <div v-else class="admin-table-wrap">
          <table :aria-label="`${surface.title} records`">
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th v-for="column in surface.columns" :key="column.key" scope="col">{{ column.label }}</th>
                <th v-if="hasRowActions" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in records" :key="rowKey(record)">
                <td>
                  <button v-if="hasRowActions" class="admin-link-button" type="button" :aria-label="`Select ${recordName(surface, record)}`" @click="selectedId = recordId(surface, record)">
                    {{ recordName(surface, record) }}
                  </button>
                  <span v-else>{{ recordName(surface, record) }}</span>
                </td>
                <td v-for="column in surface.columns" :key="column.key">
                  <span :class="column.type === 'status' ? statusClass(record[column.key]) : undefined">
                    {{ cellValue(record, column) }}
                  </span>
                </td>
                <td v-if="hasRowActions">
                  <div class="admin-row-actions">
                    <button v-if="canEdit" class="admin-secondary-button" type="button" :aria-label="`Edit ${recordName(surface, record)}`" @click="openEditDialog(record)">
                      Edit
                    </button>
                    <button
                      v-for="action in visibleActions"
                      :key="action.id"
                      class="admin-secondary-button"
                      :class="{ 'admin-danger-button': action.variant === 'danger' }"
                      type="button"
                      :disabled="isSaving"
                      :aria-label="`${action.label} for ${recordName(surface, record)}`"
                      @click="submitAction(action, record)"
                    >
                      {{ action.label }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </section>

    <div v-if="createDialogOpen && canCreate" class="admin-modal-overlay" role="presentation" @click.self="closeDialogs">
      <section
        ref="createDialogEl"
        class="admin-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${surface.id}-create-dialog-title`"
        tabindex="-1"
        @keydown.esc="closeDialogs"
      >
        <form class="admin-form" :aria-label="surface.createLabel ?? `Create ${surface.title}`" @submit.prevent="submitCreate">
          <header class="admin-modal-header">
            <div>
              <p class="admin-modal-eyebrow">{{ surface.title }}</p>
              <h2 :id="`${surface.id}-create-dialog-title`">{{ surface.createLabel ?? `Create ${surface.title}` }}</h2>
            </div>
            <button class="admin-icon-button" type="button" aria-label="Close create dialog" @click="closeDialogs">x</button>
          </header>
          <AdminFieldControl
            v-for="field in surface.createFields"
            :key="field.key"
            :field="field"
            :input-id="inputId('create', field)"
            :model-value="createValues[field.key]"
            @update:model-value="setFormValue(createValues, field.key, $event)"
          />
          <footer class="admin-modal-footer">
            <button class="admin-secondary-button" type="button" :disabled="isSaving" @click="closeDialogs">Cancel</button>
            <button class="button" type="submit" :disabled="isSaving">{{ surface.createButtonLabel ?? 'Create' }}</button>
          </footer>
        </form>
      </section>
    </div>

    <div v-if="editDialogOpen && canEdit && selectedRecord" class="admin-modal-overlay" role="presentation" @click.self="closeDialogs">
      <section
        ref="editDialogEl"
        class="admin-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${surface.id}-edit-dialog-title`"
        tabindex="-1"
        @keydown.esc="closeDialogs"
      >
        <form class="admin-form" :aria-label="`Edit ${recordName(surface, selectedRecord)}`" @submit.prevent="submitEdit">
          <header class="admin-modal-header">
            <div>
              <p class="admin-modal-eyebrow">{{ surface.title }}</p>
              <h2 :id="`${surface.id}-edit-dialog-title`">Edit {{ recordName(surface, selectedRecord) }}</h2>
            </div>
            <button class="admin-icon-button" type="button" aria-label="Close edit dialog" @click="closeDialogs">x</button>
          </header>
          <AdminFieldControl
            v-for="field in editFields"
            :key="field.key"
            :field="field"
            :input-id="inputId('edit', field)"
            :model-value="editValues[field.key]"
            @update:model-value="setFormValue(editValues, field.key, $event)"
          />
          <footer class="admin-modal-footer">
            <button v-if="canDelete" class="admin-danger-button" type="button" :disabled="isSaving" @click="openDeleteDialog">Delete selected record</button>
            <button class="admin-secondary-button" type="button" :disabled="isSaving" @click="closeDialogs">Cancel</button>
            <button class="button" type="submit" :disabled="isSaving">{{ surface.editButtonLabel ?? 'Save selected record' }}</button>
          </footer>
        </form>
      </section>
    </div>

    <div v-if="deleteDialogOpen && selectedRecord" class="admin-modal-overlay" role="presentation" @click.self="deleteDialogOpen = false">
      <section
        ref="deleteDialogEl"
        class="admin-modal admin-confirm-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${surface.id}-delete-dialog-title`"
        tabindex="-1"
        @keydown.esc="deleteDialogOpen = false"
      >
        <header class="admin-modal-header">
          <div>
            <p class="admin-modal-eyebrow">Delete record</p>
            <h2 :id="`${surface.id}-delete-dialog-title`">Delete {{ recordName(surface, selectedRecord) }}</h2>
          </div>
          <button class="admin-icon-button" type="button" aria-label="Close delete dialog" @click="deleteDialogOpen = false">x</button>
        </header>
        <p class="admin-muted">This removes the selected record from {{ surface.title }}.</p>
        <footer class="admin-modal-footer">
          <button class="admin-secondary-button" type="button" :disabled="isSaving" @click="deleteDialogOpen = false">Cancel</button>
          <button class="admin-danger-button" type="button" :disabled="isSaving" @click="removeSelected">Confirm delete</button>
        </footer>
      </section>
    </div>
  </section>
</template>
