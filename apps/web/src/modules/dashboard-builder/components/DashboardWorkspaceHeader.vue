<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchDashboardCategories } from '../../admin-dashboard-categories/api';
import { isDashboardFavorite } from '../dashboard-sidebar-model';
import { DEFAULT_VIEW_MODE_ROW_LIMIT } from '../runtime/dashboard-run-limits';
import type { Dashboard, DashboardRunConfiguration } from '../types';
import DashboardWorkspaceHeaderDeleteDialog from './DashboardWorkspaceHeaderDeleteDialog.vue';
import DashboardWorkspaceHeaderDetailsDialog from './DashboardWorkspaceHeaderDetailsDialog.vue';
import DashboardWorkspaceHeaderEditActions from './DashboardWorkspaceHeaderEditActions.vue';
import DashboardWorkspaceHeaderPreviewScopeDialog from './DashboardWorkspaceHeaderPreviewScopeDialog.vue';
import DashboardWorkspaceHeaderRunConfigDialog from './DashboardWorkspaceHeaderRunConfigDialog.vue';
import DashboardWorkspaceHeaderViewActions from './DashboardWorkspaceHeaderViewActions.vue';
import {
  buildPreviewScopeValues,
  previewScopeFieldsFromDataScope
} from './dashboard-workspace-header-preview-scope';
import '../dashboard-builder-header.css';

const props = defineProps<{
  aiFeaturesEnabled?: boolean;
  dashboard: Dashboard | null;
  canEditDashboard: boolean;
  canConfigurePreviewDataScope?: boolean;
  manualMode: boolean;
  pageTitle: string;
  canUseDashboard: boolean;
  hasUnsavedChanges: boolean;
  isAnalyzerOpen?: boolean;
  isSaving: boolean;
  previewDataScope?: Record<string, unknown>;
  runConfiguration: DashboardRunConfiguration;
  isDashboardRunning: boolean;
}>();

const emit = defineEmits<{
  saveDraft: [];
  cancelEdit: [];
  publish: [];
  duplicate: [];
  addFilter: [];
  rename: [name: string, category: string, categoryId?: string | null];
  deleteDashboard: [];
  runDashboard: [];
  cancelRun: [];
  configureRun: [
    runtime: string,
    scheduled: boolean,
    editModeRowLimit?: number,
    viewModeRowLimit?: number
  ];
  emailReport: [];
  copyEmbed: [];
  exportDashboard: [format: 'json' | 'xml' | 'excel' | 'csv' | 'pdf'];
  exportAdvancedPdf: [];
  importDashboard: [];
  openAnalyzer: [];
  openHistory: [];
  setDashboardFavorite: [payload: { dashboardId: string; isFavorite: boolean }];
  updatePreviewDataScope: [values: Record<string, unknown>];
  'update:manualMode': [value: boolean];
}>();

const editPath = computed(() => props.dashboard ? `/dashboard/${props.dashboard.id}/edit` : '/dashboard/create');
const renameValue = ref('');
const selectedCategoryId = ref('');
const dashboardCategories = ref<Array<{ id: string; name: string }>>([]);
const runtime = ref('databricks');
const editModeRowLimit = ref<number | null>(null);
const viewModeRowLimit = ref(DEFAULT_VIEW_MODE_ROW_LIMIT);
const scheduledRun = ref(false);
const detailsOpen = ref(false);
const runConfigOpen = ref(false);
const previewScopeOpen = ref(false);
const deleteConfirmOpen = ref(false);
const previewCompanyId = ref('');
const previewLocationIds = ref('');
const previewExtraJson = ref('');
const previewScopeError = ref('');
const optimisticFavorite = ref<boolean | null>(null);

const dashboardStatusLabel = computed(() => props.dashboard?.status === 'published' ? 'Live' : (props.dashboard?.status ?? ''));
const dashboardIsFavorite = computed(() => optimisticFavorite.value ?? (props.dashboard ? isDashboardFavorite(props.dashboard) : false));
const previewScopeActive = computed(() => Object.keys(props.previewDataScope ?? {}).length > 0);

const detailCategoryOptions = computed(() => {
  const options = [...dashboardCategories.value];
  const currentCategoryId = props.dashboard?.categoryId ?? '';
  const currentCategoryName = props.dashboard?.category?.trim() ?? '';
  if (
    currentCategoryId
    && currentCategoryName
    && !options.some(category => category.id === currentCategoryId)
    && !options.some(category => category.name.toLowerCase() === currentCategoryName.toLowerCase())
  ) {
    options.unshift({ id: currentCategoryId, name: currentCategoryName });
  }
  return options;
});

watch(() => props.dashboard && isDashboardFavorite(props.dashboard), serverValue => {
  if (optimisticFavorite.value === null) return;
  if (optimisticFavorite.value === serverValue) optimisticFavorite.value = null;
});

watch(() => props.dashboard?.id ?? '', () => syncRenameFields(), { immediate: true });

watch(() => props.runConfiguration, configuration => {
  runtime.value = configuration.runtime;
  scheduledRun.value = configuration.scheduled;
  editModeRowLimit.value = configuration.editModeRowLimit ?? null;
  viewModeRowLimit.value = configuration.viewModeRowLimit ?? DEFAULT_VIEW_MODE_ROW_LIMIT;
}, { immediate: true, deep: true });

function configuredEditModeRowLimit(): number | undefined {
  const parsed = Number(editModeRowLimit.value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function configuredViewModeRowLimit(): number {
  const parsed = Number(viewModeRowLimit.value);
  return Number.isFinite(parsed) && parsed >= 1000 ? Math.floor(parsed) : DEFAULT_VIEW_MODE_ROW_LIMIT;
}

function syncRenameFields(): void {
  renameValue.value = props.dashboard?.name ?? '';
  selectedCategoryId.value = props.dashboard?.categoryId ?? '';
}

async function openDetailsPanel(): Promise<void> {
  syncRenameFields();
  detailsOpen.value = true;
  await loadDashboardCategories();
}

function openDeleteConfirmation(): void {
  deleteConfirmOpen.value = true;
}

function confirmDeleteDashboard(): void {
  deleteConfirmOpen.value = false;
  emit('deleteDashboard');
}

function categoryNameForSelection(): string {
  if (!selectedCategoryId.value) return '';
  const match = detailCategoryOptions.value.find(category => category.id === selectedCategoryId.value);
  return match?.name ?? props.dashboard?.category ?? '';
}

function submitDetails(): void {
  detailsOpen.value = false;
  emit('rename', renameValue.value, categoryNameForSelection(), selectedCategoryId.value || null);
}

function openRunSettings(): void {
  runConfigOpen.value = true;
}

function openPreviewScope(): void {
  syncPreviewScopeFields();
  previewScopeOpen.value = true;
}

function saveRunSettings(): void {
  emit(
    'configureRun',
    runtime.value,
    scheduledRun.value,
    configuredEditModeRowLimit(),
    configuredViewModeRowLimit()
  );
  runConfigOpen.value = false;
}

function toggleFavorite(): void {
  if (!props.dashboard) return;
  const newValue = !dashboardIsFavorite.value;
  optimisticFavorite.value = newValue;
  emit('setDashboardFavorite', {
    dashboardId: props.dashboard.id,
    isFavorite: newValue
  });
}

function syncPreviewScopeFields(): void {
  previewScopeError.value = '';
  const fields = previewScopeFieldsFromDataScope(props.previewDataScope ?? {});
  previewCompanyId.value = fields.companyId;
  previewLocationIds.value = fields.locationIds;
  previewExtraJson.value = fields.extraJson;
}

function savePreviewScope(): void {
  const result = buildPreviewScopeValues(
    previewCompanyId.value,
    previewLocationIds.value,
    previewExtraJson.value
  );
  if (!result.ok) {
    previewScopeError.value = result.error;
    return;
  }
  emit('updatePreviewDataScope', result.values);
  previewScopeOpen.value = false;
}

function clearPreviewScope(): void {
  previewCompanyId.value = '';
  previewLocationIds.value = '';
  previewExtraJson.value = '';
  previewScopeError.value = '';
  emit('updatePreviewDataScope', {});
  previewScopeOpen.value = false;
}

async function loadDashboardCategories(): Promise<void> {
  try {
    const categories = await fetchDashboardCategories();
    dashboardCategories.value = categories
      .filter(category => category.isActive !== false)
      .map(category => ({ id: category.id, name: category.name }));
    if (selectedCategoryId.value && !dashboardCategories.value.some(category => category.id === selectedCategoryId.value)) {
      const currentName = props.dashboard?.category?.trim().toLowerCase() ?? '';
      const match = dashboardCategories.value.find(category => category.name.toLowerCase() === currentName);
      if (match) selectedCategoryId.value = match.id;
    }
  } catch {
    dashboardCategories.value = [];
  }
}
</script>

<template>
  <header class="dashboard-topbar">
    <div class="dashboard-header">
      <div class="dashboard-heading" aria-label="Dashboard heading">
        <div class="dashboard-title-row">
          <h1 id="builder-title">{{ dashboard?.name ?? pageTitle }}</h1>
          <button
            v-if="dashboard && !dashboard.isSample"
            class="dashboard-favorite-btn"
            :class="{ 'dashboard-favorite-btn--active': dashboardIsFavorite }"
            type="button"
            :aria-pressed="dashboardIsFavorite"
            :aria-label="dashboardIsFavorite ? `Remove ${dashboard.name} from favorites` : `Add ${dashboard.name} to favorites`"
            :disabled="isSaving"
            @click.stop.prevent="toggleFavorite"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 3.25 2.68 5.43 6 .87-4.34 4.23 1.02 5.98L12 16.94l-5.36 2.82 1.02-5.98L3.32 9.55l6-.87L12 3.25Z" />
            </svg>
          </button>
          <span v-if="dashboard && canEditDashboard" class="dashboard-status-chip">{{ dashboardStatusLabel }}</span>
          <span v-if="dashboard && canEditDashboard && hasUnsavedChanges" class="dashboard-status-chip dashboard-status-chip--unsaved">Unsaved</span>
        </div>
        <p v-if="!dashboard">Select or create a dashboard</p>
      </div>

      <DashboardWorkspaceHeaderEditActions
        v-if="canEditDashboard"
        :can-configure-preview-data-scope="canConfigurePreviewDataScope"
        :can-use-dashboard="canUseDashboard"
        :is-dashboard-running="isDashboardRunning"
        :is-saving="isSaving"
        :manual-mode="manualMode"
        :preview-scope-active="previewScopeActive"
        :run-config-open="runConfigOpen"
        @add-filter="emit('addFilter')"
        @cancel-edit="emit('cancelEdit')"
        @cancel-run="emit('cancelRun')"
        @copy-embed="emit('copyEmbed')"
        @export-dashboard="emit('exportDashboard', $event)"
        @open-delete="openDeleteConfirmation"
        @open-details="openDetailsPanel"
        @open-history="emit('openHistory')"
        @open-preview-scope="openPreviewScope"
        @open-run-settings="openRunSettings"
        @publish="emit('publish')"
        @run-dashboard="emit('runDashboard')"
        @save-draft="emit('saveDraft')"
        @update:manual-mode="emit('update:manualMode', $event)"
      />
      <DashboardWorkspaceHeaderViewActions
        v-else-if="dashboard"
        :ai-features-enabled="aiFeaturesEnabled"
        :can-configure-preview-data-scope="canConfigurePreviewDataScope"
        :edit-path="editPath"
        :is-analyzer-open="isAnalyzerOpen"
        :preview-scope-active="previewScopeActive"
        @duplicate="emit('duplicate')"
        @email-report="emit('emailReport')"
        @export-advanced-pdf="emit('exportAdvancedPdf')"
        @export-dashboard="emit('exportDashboard', $event)"
        @open-analyzer="emit('openAnalyzer')"
        @open-history="emit('openHistory')"
        @open-preview-scope="openPreviewScope"
      />
    </div>

    <DashboardWorkspaceHeaderDeleteDialog
      v-if="canEditDashboard && dashboard && deleteConfirmOpen"
      :dashboard-name="dashboard.name"
      :is-saving="isSaving"
      @close="deleteConfirmOpen = false"
      @confirm="confirmDeleteDashboard"
    />
    <DashboardWorkspaceHeaderPreviewScopeDialog
      v-if="dashboard && canConfigurePreviewDataScope && previewScopeOpen"
      v-model:company-id="previewCompanyId"
      v-model:location-ids="previewLocationIds"
      v-model:extra-json="previewExtraJson"
      :error="previewScopeError"
      @clear="clearPreviewScope"
      @close="previewScopeOpen = false"
      @submit="savePreviewScope"
    />
    <DashboardWorkspaceHeaderRunConfigDialog
      v-if="canEditDashboard && dashboard && runConfigOpen"
      v-model:runtime="runtime"
      v-model:scheduled-run="scheduledRun"
      v-model:edit-mode-row-limit="editModeRowLimit"
      v-model:view-mode-row-limit="viewModeRowLimit"
      :can-use-dashboard="canUseDashboard"
      @close="runConfigOpen = false"
      @submit="saveRunSettings"
    />
    <DashboardWorkspaceHeaderDetailsDialog
      v-if="canEditDashboard && dashboard && detailsOpen"
      v-model:name="renameValue"
      v-model:selected-category-id="selectedCategoryId"
      :can-use-dashboard="canUseDashboard"
      :category-options="detailCategoryOptions"
      :is-saving="isSaving"
      @close="detailsOpen = false"
      @submit="submitDetails"
    />
  </header>
</template>
