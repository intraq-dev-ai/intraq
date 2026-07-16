<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type {
  AdminDashboard,
  DashboardDialogName,
  DashboardEditForm,
  DashboardVisibilitySettings
} from './types';
import './admin-dashboard-management-dialogs.css';

const props = defineProps<{
  activeDialog: DashboardDialogName;
  canSubmitClone: boolean;
  canSubmitEdit: boolean;
  cloneName: string;
  editForm: DashboardEditForm;
  isSaving: boolean;
  selectedDashboard: AdminDashboard | null;
  visibilitySettings: DashboardVisibilitySettings;
}>();

const emit = defineEmits<{
  close: [];
  submitClone: [];
  submitDelete: [];
  submitEdit: [];
  submitVisibility: [];
  'update:cloneName': [value: string];
  'update:editForm': [value: DashboardEditForm];
  'update:visibilitySettings': [value: DashboardVisibilitySettings];
}>();

const viewDialogEl = ref<HTMLElement | null>(null);
const visibilityDialogEl = ref<HTMLElement | null>(null);
const editDialogEl = ref<HTMLElement | null>(null);
const cloneDialogEl = ref<HTMLElement | null>(null);
const deleteDialogEl = ref<HTMLElement | null>(null);

watch(() => props.activeDialog, async (name) => {
  await nextTick();
  if (name === 'view') viewDialogEl.value?.focus();
  else if (name === 'visibility') visibilityDialogEl.value?.focus();
  else if (name === 'edit') editDialogEl.value?.focus();
  else if (name === 'clone') cloneDialogEl.value?.focus();
  else if (name === 'delete') deleteDialogEl.value?.focus();
}, { immediate: true });

function updateCloneName(event: Event): void {
  emit('update:cloneName', inputValue(event));
}

function updateEditField(key: keyof DashboardEditForm, event: Event): void {
  emit('update:editForm', {
    ...props.editForm,
    [key]: inputValue(event)
  });
}

function updateVisibility(key: keyof DashboardVisibilitySettings, event: Event): void {
  emit('update:visibilitySettings', {
    ...props.visibilitySettings,
    [key]: checkedValue(event)
  });
}

function dashboardHref(dashboard: AdminDashboard): string {
  return `/dashboard/${encodeURIComponent(dashboard.id)}/edit`;
}

function dashboardViewHref(dashboard: AdminDashboard): string {
  return `/dashboard/${encodeURIComponent(dashboard.id)}`;
}

function visibilityText(dashboard: AdminDashboard): string {
  const labels: string[] = [];
  if (dashboard.isGloballyVisible) labels.push('Global');
  if (dashboard.isPublic) labels.push('Public');
  return labels.length ? labels.join(', ') : 'Private';
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : '';
}

function checkedValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}
</script>

<template>
  <div v-if="selectedDashboard && activeDialog === 'view'" class="admin-modal-overlay" role="presentation" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section ref="viewDialogEl" class="admin-modal admin-dashboard-management-dialog" role="dialog" aria-modal="true" aria-labelledby="view-dialog-title" tabindex="-1">
      <header class="admin-modal-header">
        <div><p class="admin-modal-eyebrow">Dashboard Details</p><h2 id="view-dialog-title">{{ selectedDashboard.name }}</h2></div>
        <button class="admin-icon-button" type="button" aria-label="Close dashboard details dialog" @click="emit('close')">x</button>
      </header>
      <div class="admin-dashboard-management-view">
        <p>{{ selectedDashboard.description || 'No description' }}</p>
        <dl>
          <div><dt>Category</dt><dd>{{ selectedDashboard.category }}</dd></div>
          <div><dt>Status</dt><dd>{{ selectedDashboard.status }}</dd></div>
          <div><dt>Type</dt><dd>{{ selectedDashboard.type }}</dd></div>
          <div><dt>Charts</dt><dd>{{ selectedDashboard.charts.toLocaleString() }}</dd></div>
          <div><dt>Views</dt><dd>{{ selectedDashboard.views.toLocaleString() }}</dd></div>
          <div><dt>Visibility</dt><dd>{{ visibilityText(selectedDashboard) }}</dd></div>
        </dl>
        <footer class="admin-modal-footer">
          <button class="admin-secondary-button" type="button" @click="emit('close')">Close</button>
          <a class="button" :href="dashboardViewHref(selectedDashboard)">Open Dashboard</a>
        </footer>
      </div>
    </section>
  </div>

  <div v-if="selectedDashboard && activeDialog === 'visibility'" class="admin-modal-overlay" role="presentation" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section ref="visibilityDialogEl" class="admin-modal admin-dashboard-management-dialog" role="dialog" aria-modal="true" aria-labelledby="visibility-dialog-title" tabindex="-1">
      <header class="admin-modal-header">
        <div><p class="admin-modal-eyebrow">Dashboard Visibility</p><h2 id="visibility-dialog-title">Manage Dashboard Visibility</h2></div>
        <button class="admin-icon-button" type="button" aria-label="Close visibility dialog" @click="emit('close')">x</button>
      </header>
      <form class="admin-form" aria-label="Manage dashboard visibility" @submit.prevent="emit('submitVisibility')">
        <div class="admin-dashboard-management-visibility-intro">
          <strong>{{ selectedDashboard.name }}</strong>
          <p>Configure visibility settings for this dashboard.</p>
        </div>
        <label class="admin-check-row">
          <input :checked="visibilitySettings.isGloballyVisible" type="checkbox" @change="updateVisibility('isGloballyVisible', $event)" />
          <span><strong>Show as a global sample</strong><small>Make this dashboard available to all users.</small></span>
        </label>
        <footer class="admin-modal-footer">
          <button class="admin-secondary-button" type="button" @click="emit('close')">Cancel</button>
          <button class="button" type="submit" :disabled="isSaving">{{ isSaving ? 'Saving...' : 'Save Changes' }}</button>
        </footer>
      </form>
    </section>
  </div>

  <div v-if="selectedDashboard && activeDialog === 'edit'" class="admin-modal-overlay" role="presentation" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section ref="editDialogEl" class="admin-modal admin-dashboard-management-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-dialog-title" tabindex="-1">
      <header class="admin-modal-header">
        <div><p class="admin-modal-eyebrow">Dashboard</p><h2 id="edit-dialog-title">Edit Dashboard</h2></div>
        <button class="admin-icon-button" type="button" aria-label="Close edit dialog" @click="emit('close')">x</button>
      </header>
      <form class="admin-form" aria-label="Edit dashboard" @submit.prevent="emit('submitEdit')">
        <label>Dashboard Name<input :value="editForm.name" required @input="updateEditField('name', $event)" /></label>
        <label>Description<textarea :value="editForm.description" @input="updateEditField('description', $event)"></textarea></label>
        <label>Category<input :value="editForm.category" required @input="updateEditField('category', $event)" /></label>
        <label>
          Status
          <select :value="editForm.status" @change="updateEditField('status', $event)">
            <option value="active">Active</option>
            <option value="draft">Draft</option>
          </select>
        </label>
        <footer class="admin-modal-footer">
          <a class="admin-secondary-button" :href="dashboardHref(selectedDashboard)">Open Builder</a>
          <button class="admin-secondary-button" type="button" @click="emit('close')">Cancel</button>
          <button class="button" type="submit" :disabled="isSaving || !canSubmitEdit">Save Dashboard</button>
        </footer>
      </form>
    </section>
  </div>

  <div v-if="selectedDashboard && activeDialog === 'clone'" class="admin-modal-overlay" role="presentation" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section ref="cloneDialogEl" class="admin-modal admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="clone-dialog-title" tabindex="-1">
      <header class="admin-modal-header">
        <div><p class="admin-modal-eyebrow">Dashboard</p><h2 id="clone-dialog-title">Clone Dashboard</h2></div>
        <button class="admin-icon-button" type="button" aria-label="Close clone dialog" @click="emit('close')">x</button>
      </header>
      <form class="admin-form" aria-label="Clone dashboard" @submit.prevent="emit('submitClone')">
        <label>Clone Name<input :value="cloneName" required @input="updateCloneName" /></label>
        <footer class="admin-modal-footer">
          <button class="admin-secondary-button" type="button" @click="emit('close')">Cancel</button>
          <button class="button" type="submit" :disabled="isSaving || !canSubmitClone">Clone Dashboard</button>
        </footer>
      </form>
    </section>
  </div>

  <div v-if="selectedDashboard && activeDialog === 'delete'" class="admin-modal-overlay" role="presentation" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section ref="deleteDialogEl" class="admin-modal admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" tabindex="-1">
      <header class="admin-modal-header">
        <div><p class="admin-modal-eyebrow">Dashboard</p><h2 id="delete-dialog-title">Delete Dashboard</h2></div>
        <button class="admin-icon-button" type="button" aria-label="Close delete dialog" @click="emit('close')">x</button>
      </header>
      <div class="admin-form">
        <p>Delete "{{ selectedDashboard.name }}"? This action cannot be undone.</p>
        <footer class="admin-modal-footer">
          <button class="admin-secondary-button" type="button" @click="emit('close')">Cancel</button>
          <button class="admin-danger-button" type="button" :disabled="isSaving" @click="emit('submitDelete')">Delete Dashboard</button>
        </footer>
      </div>
    </section>
  </div>
</template>
