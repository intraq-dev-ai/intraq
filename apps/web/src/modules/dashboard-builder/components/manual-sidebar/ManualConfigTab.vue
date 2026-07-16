<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { FilterDraft } from '../../agent-context/planner-filters';
import type { DashboardFilter, DashboardFilterCreatePatch, DashboardSettings } from '../../types';
import {
  dashboardDataCacheOptions,
  defaultDashboardDataCachePolicy,
  normalizeDashboardDataCachePolicy,
  type DashboardDataCachePolicy
} from '../../dashboard-data-cache-policy';
import DashboardFilterEditorDialog from '../DashboardFilterEditorDialog.vue';
import {
  dashboardCurrencyOptions,
  defaultDashboardCurrencySymbol
} from './manualDashboardSettingsOptions';
import { useManualSidebarContext } from './manualSidebarContext';
import ManualStaticFilterDialog from './ManualStaticFilterDialog.vue';

const ctx = useManualSidebarContext();
const currencySymbol = ref(defaultDashboardCurrencySymbol);
const dataCachePolicy = ref<DashboardDataCachePolicy>(defaultDashboardDataCachePolicy);
const interactiveDialogOpen = ref(false);
const staticDialogOpen = ref(false);
const editingInteractiveFilter = ref<DashboardFilter | null>(null);
const editingStaticFilter = ref<DashboardFilter | null>(null);
const settingsSaveState = ref<'idle' | 'saved' | 'saving'>('idle');
const layoutAlignState = ref<'aligned' | 'idle'>('idle');
let lastSettingsSignature = '';

const filters = computed(() => ctx.dashboard?.filters ?? []);
const dashboardElements = computed(() => ctx.dashboard?.elements ?? []);
const interactiveFilters = computed(() => filters.value.filter(filter => !isStaticFilter(filter)));
const staticFilters = computed(() => filters.value.filter(isStaticFilter));
const filterDraft = computed<FilterDraft & { label: string }>(() => {
  const field = ctx.currentTableFields[0];
  const label = field?.label || field?.description || field?.name || 'Dashboard Filter';
  return {
    field: field?.name ?? '',
    label,
    name: label,
    operator: 'equals',
    type: 'dropdown'
  };
});

watch(() => ctx.dashboard?.settings, settings => {
  currencySymbol.value = settings?.currencySymbol || defaultDashboardCurrencySymbol;
  dataCachePolicy.value = normalizeDashboardDataCachePolicy(settings?.dataCachePolicy);
  lastSettingsSignature = settingsSignature(readDashboardSettings());
  settingsSaveState.value = 'saved';
}, { immediate: true, deep: true });

watch([currencySymbol, dataCachePolicy], saveDashboardSettings, { flush: 'post' });
watch(() => dashboardElements.value.map(element => `${element.id}:${JSON.stringify(element.layout ?? {})}`).join('|'), () => {
  layoutAlignState.value = 'idle';
});

function openInteractiveFilter(filter: DashboardFilter | null): void {
  editingInteractiveFilter.value = filter;
  interactiveDialogOpen.value = true;
}

function closeInteractiveFilter(): void {
  editingInteractiveFilter.value = null;
  interactiveDialogOpen.value = false;
}

function openStaticFilter(filter: DashboardFilter | null): void {
  editingStaticFilter.value = filter;
  staticDialogOpen.value = true;
}

function closeStaticFilter(): void {
  editingStaticFilter.value = null;
  staticDialogOpen.value = false;
}

function readDashboardSettings(): DashboardSettings {
  return {
    currencySymbol: currencySymbol.value,
    dataCachePolicy: dataCachePolicy.value
  };
}

function saveDashboardSettings(): void {
  if (!ctx.dashboard) return;
  const settings = readDashboardSettings();
  const nextSignature = settingsSignature(settings);
  if (nextSignature === lastSettingsSignature) return;
  settingsSaveState.value = 'saving';
  lastSettingsSignature = nextSignature;
  ctx.updateDashboardSettings(settings);
  settingsSaveState.value = 'saved';
}

function resetDashboardSettings(): void {
  currencySymbol.value = defaultDashboardCurrencySymbol;
  dataCachePolicy.value = defaultDashboardDataCachePolicy;
  saveDashboardSettings();
}

async function autoAlignLayout(): Promise<void> {
  ctx.autoAlignDashboardElements();
  await nextTick();
  layoutAlignState.value = 'aligned';
}

function toggleFilter(filter: DashboardFilter): void {
  ctx.changeFilter(filter.id, { isActive: filter.isActive === false });
}

function cloneFilter(filter: DashboardFilter): void {
  const name = `${filter.name} Copy`;
  const config = cloneJson(filter.config) ?? {};
  ctx.createFilter({
    config: { ...config, label: name },
    field: filter.field || ctx.currentTableFields[0]?.name || 'id',
    isActive: filter.isActive !== false,
    name,
    operator: filter.operator || 'equals',
    type: filter.type || 'interactive',
    value: cloneJson(filter.value)
  } satisfies DashboardFilterCreatePatch);
}

function removeFilter(filter: DashboardFilter): void {
  ctx.removeFilter(filter.id);
}

function filterStateLabel(filter: DashboardFilter): string {
  return filter.isActive === false ? 'Inactive' : 'Active';
}

function filterSummary(filter: DashboardFilter): string {
  const target = filter.config?.scope === 'component' || filter.config?.applyTo === 'element'
    ? 'Components'
    : 'Data source';
  return `${target} · ${filter.field || 'No field'} · ${filter.operator || 'equals'}`;
}

function isStaticFilter(filter: DashboardFilter): boolean {
  return filter.type === 'static'
    || filter.config?.static === true
    || filter.config?.isStatic === true
    || filter.config?.type === 'static';
}

function cloneJson<T>(value: T): T {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function settingsSignature(settings: DashboardSettings): string {
  return JSON.stringify(settings);
}
</script>

<template>
  <section class="manual-config-tab" aria-label="Dashboard configuration">
    <div class="manual-config-section">
      <div class="manual-config-heading">
        <div>
          <h3>Dashboard Settings</h3>
          <p>Configure dashboard behavior</p>
        </div>
        <span class="settings-save-pill" :data-state="settingsSaveState">
          {{ settingsSaveState === 'saving' ? 'Updating' : 'Draft' }}
        </span>
      </div>
      <div class="settings-content">
        <div class="settings-theme-row">
          <label class="editor-field-label" for="manual-currency-symbol">Default Currency</label>
          <select id="manual-currency-symbol" v-model="currencySymbol" class="editor-select">
            <option v-for="option in dashboardCurrencyOptions" :key="option.label" :value="option.value">{{ option.label }}</option>
          </select>
        </div>
        <div class="settings-theme-row">
          <label class="editor-field-label" for="manual-data-cache-policy">Data Cache</label>
          <select id="manual-data-cache-policy" v-model="dataCachePolicy" class="editor-select">
            <option v-for="option in dashboardDataCacheOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>
      </div>
      <div class="settings-action-row">
        <button type="button" class="manage-btn manage-btn--config" :disabled="dashboardElements.length === 0" @click="autoAlignLayout">Auto Align Layout</button>
        <button type="button" class="modal-cancel-btn" @click="resetDashboardSettings">Reset Settings</button>
      </div>
      <p v-if="layoutAlignState === 'aligned'" class="setting-success" role="status">Layout aligned.</p>
    </div>

    <div class="manual-config-section">
      <div class="manual-config-heading">
        <div>
          <h3>Interactive Filters</h3>
          <p>{{ interactiveFilters.length }} configured</p>
        </div>
        <button type="button" class="manage-btn manage-btn--data" @click="openInteractiveFilter(null)">Add Filter</button>
      </div>
      <div v-if="interactiveFilters.length" class="manual-filter-list">
        <article v-for="filter in interactiveFilters" :key="filter.id" class="manual-filter-row">
          <div class="manual-filter-main">
            <strong>{{ filter.name }}</strong>
            <span>{{ filterSummary(filter) }}</span>
          </div>
          <span class="manual-filter-state">{{ filterStateLabel(filter) }}</span>
          <div class="manual-filter-actions">
            <button type="button" class="manage-btn" @click="toggleFilter(filter)">{{ filter.isActive === false ? 'Enable' : 'Disable' }}</button>
            <button type="button" class="manage-btn manage-btn--config" @click="openInteractiveFilter(filter)">Edit</button>
            <button type="button" class="manage-btn manage-btn--style" @click="cloneFilter(filter)">Clone</button>
            <button type="button" class="modal-cancel-btn" @click="removeFilter(filter)">Delete</button>
          </div>
        </article>
      </div>
      <p v-else class="manual-config-empty">No interactive filters yet.</p>
    </div>

    <div class="manual-config-section">
      <div class="manual-config-heading">
        <div>
          <h3>Static Filters</h3>
          <p>{{ staticFilters.length }} configured</p>
        </div>
        <button type="button" class="manage-btn manage-btn--calc" @click="openStaticFilter(null)">Add Static Filter</button>
      </div>
      <div v-if="staticFilters.length" class="manual-filter-list">
        <article v-for="filter in staticFilters" :key="filter.id" class="manual-filter-row manual-filter-row--static">
          <div class="manual-filter-main">
            <strong>{{ filter.name }}</strong>
            <span>{{ filterSummary(filter) }}</span>
          </div>
          <span class="manual-filter-state">{{ filterStateLabel(filter) }}</span>
          <div class="manual-filter-actions">
            <button type="button" class="manage-btn" @click="toggleFilter(filter)">{{ filter.isActive === false ? 'Enable' : 'Disable' }}</button>
            <button type="button" class="manage-btn manage-btn--config" :aria-label="`Edit Static Filter ${filter.name}`" title="Edit Static Filter" @click="openStaticFilter(filter)">Edit</button>
            <button type="button" class="manage-btn manage-btn--style" :aria-label="`Clone Static Filter ${filter.name}`" title="Clone Static Filter" @click="cloneFilter(filter)">Clone</button>
            <button type="button" class="modal-cancel-btn" :aria-label="`Delete Static Filter ${filter.name}`" title="Delete Static Filter" @click="removeFilter(filter)">Delete</button>
          </div>
        </article>
      </div>
      <p v-else class="manual-config-empty">No static filters yet.</p>
    </div>

    <DashboardFilterEditorDialog
      v-if="ctx.dashboard && interactiveDialogOpen"
      :create-draft="filterDraft"
      :dashboard-elements="dashboardElements"
      :data-sources="ctx.dataSources"
      :editing-filter="editingInteractiveFilter"
      :filters-count="filters.length"
      :selected-data-source-id="ctx.selectedDataSourceId"
      :selected-table-id="ctx.selectedTableId"
      suggested-target-element-id=""
      @close="closeInteractiveFilter"
      @create="patch => { ctx.createFilter(patch); closeInteractiveFilter(); }"
      @update="(filterId, patch) => { ctx.changeFilter(filterId, patch); closeInteractiveFilter(); }"
    />
    <ManualStaticFilterDialog
      :editing-filter="editingStaticFilter"
      :open="staticDialogOpen"
      @close="closeStaticFilter"
    />
  </section>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-config-tab.css"></style>
