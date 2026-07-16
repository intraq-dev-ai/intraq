<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DashboardAnalyzerPanel from './components/DashboardAnalyzerPanel.vue';
import DashboardCreateDialog from './components/DashboardCreateDialog.vue';
import DashboardEmailReportsDialog from './components/DashboardEmailReportsDialog.vue';
import DashboardPdfExportDialog from './components/DashboardPdfExportDialog.vue';
import DashboardEmbedDialog from './components/DashboardEmbedDialog.vue';
import DashboardImportDialog from './components/DashboardImportDialog.vue';
import DashboardVersionHistoryDialog from './components/DashboardVersionHistoryDialog.vue';
import DashboardWorkspaceMain from './components/DashboardWorkspaceMain.vue';
import DashboardWorkspaceSidebar from './components/DashboardWorkspaceSidebar.vue';
import type { DashboardImportRequest } from './dashboard-import-api';
import { readRecentDashboardId, readRecentDashboardIds, writeRecentDashboardId } from './dashboard-recent';
import { readBuilderRailCollapsed, writeBuilderRailCollapsed } from './layout/builder-rail-preferences';
import { saveDashboardRuntimeParameterValues } from './runtime/dashboard-runtime-state';
import { useDashboardBuilderWorkspace } from './workspace/use-dashboard-builder-workspace';
import { useToast } from '../shared/use-toast';
import { readEffectiveRole } from '../shell/role-context';
import './dashboard-builder.css';
import './dashboard-builder-runtime-formats.css';
import './layout/dashboard-builder-mobile.css';

const route = useRoute();
const router = useRouter();

const {
  actionPlan,
  agentMessages,
  addDashboard,
  addFilter,
  applyAgentToSelectedElement,
  canEditDashboard,
  canUseDashboard,
  cancelDashboardRun,
  changeFilter,
  cloneElement,
  clearElementSelection,
  configureDashboardRun,
  createElement,
  createManualElement,
  createFilter,
  dashboardName,
  dashboardRuntimeState,
  dashboards,
  dataModelRecommendation,
  dataSources,
  dashboardRunConfiguration,
  deleteSelectedDashboard,
  discardSelectedDashboardDraft,
  duplicateSelectedDashboard,
  editElement,
  error,
  editorFocusElementId,
  exportDashboard,
  filterCreateRequestKey,
  hasUnsavedChanges,
  importDashboard,
  isSaving,
  isDashboardRunning,
  isWorkspaceLoading,
  lastAgentPrompt,
  newFilterDraft,
  pageTitle,
  prompt,
  publishSelectedDashboard,
  removeElement,
  removeFilter,
  renameSelectedDashboard,
  restoreVersion,
  saveElement,
  runDashboard,
  samplePrompts,
  saveDraft,
  selectedDashboard,
  selectedDataSource,
  selectedElement,
  selectedTable,
  selectDataSource,
  selectDataTable,
  setDashboardFavorite,
  status,
  suggestions,
  modelContextError,
  modelContextSummary,
  undoLastAiChange,
  updateDashboardSettings,
  updateElementConfig,
  updateElementLayout,
  versions
} = useDashboardBuilderWorkspace();

const aiFeaturesEnabled = computed(() => true);
const showAnalyzerPanel = ref(false);
const manualMode = ref(!aiFeaturesEnabled.value);
const showEmailReportsDialog = ref(false);
const showPdfExportDialog = ref(false);
const showEmbedDialog = ref(false);
const showImportDialog = ref(false);
const showVersionHistoryDialog = ref(false);
const showMobileSidebar = ref(false);
const builderRailCollapsed = ref(readBuilderRailCollapsed());
const recentDashboardId = ref(readRecentDashboardId());
const recentDashboardIds = ref(readRecentDashboardIds());
const currentRoleKey = ref(readEffectiveRole());
const dashboardEmbedEnabled = ref(false);
const isCreateRoute = computed(() => route.path.endsWith('/create'));
const isDashboardHomeRoute = computed(() => route.path === '/dashboard');
const isCreateDialogOpen = computed(() => route.path.endsWith('/create') && selectedDashboard.value === null);
const showBuilderRail = computed(() => aiFeaturesEnabled.value && (canEditDashboard.value || isCreateRoute.value));
const loadingTitle = computed(() => route.params.id ? 'Loading dashboard' : 'Loading dashboards');
const loadingDetail = computed(() => route.params.id ? 'Preparing dashboard workspace.' : 'Preparing dashboard list.');
const previewDataScope = computed(() => dashboardRuntimeState.value?.runtimeParameterValues ?? {});
const canManagePreviewDataScope = computed(() => {
  const role = currentRoleKey.value.trim().toUpperCase();
  return Boolean(role)
    && !role.includes('VIEWER')
    && !role.includes('SUBSCRIPTION_REQUESTER');
});
const canConfigurePreviewDataScope = computed(() => canManagePreviewDataScope.value && dashboardEmbedEnabled.value);
// Intentionally disabled for now. We still surface the Unsaved chip, but do not
// block route changes or browser unload while the draft-save flow is being revised.

watch(canEditDashboard, isEditing => {
  if (isEditing) showAnalyzerPanel.value = false;
  if (isEditing && !aiFeaturesEnabled.value) manualMode.value = true;
});

watch(selectedDashboard, dashboard => {
  if (!dashboard) showAnalyzerPanel.value = false;
  if (dashboard && route.params.id) {
    recentDashboardIds.value = writeRecentDashboardId(dashboard.id);
    recentDashboardId.value = recentDashboardIds.value[0] ?? '';
  }
});

watch(() => selectedDashboard.value?.id ?? '', () => {
  dashboardEmbedEnabled.value = false;
});

watch(builderRailCollapsed, collapsed => {
  writeBuilderRailCollapsed(collapsed);
});

watch(manualMode, enabled => {
  if (!enabled || !showBuilderRail.value || !isDesktopBuilderRailLayout()) return;
  builderRailCollapsed.value = true;
});

watch(showMobileSidebar, open => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = open ? 'hidden' : '';
  }
});

function toggleMobileSidebar(): void {
  showMobileSidebar.value = !showMobileSidebar.value;
}

function closeMobileSidebar(): void {
  showMobileSidebar.value = false;
}

function handleAgentMessageAction(actionId: string): void {
  if (actionId === 'undo-ai-change') undoLastAiChange();
}

function toggleBuilderRail(): void {
  builderRailCollapsed.value = !builderRailCollapsed.value;
}

function isDesktopBuilderRailLayout(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(min-width: 1181px)').matches;
}

function closeCreateDialog(): void {
  void router.push('/dashboard');
}

function openAnalyzerPanel(): void {
  if (!aiFeaturesEnabled.value || !selectedDashboard.value || canEditDashboard.value) return;
  showAnalyzerPanel.value = !showAnalyzerPanel.value;
}

async function submitDashboardImport(request: DashboardImportRequest): Promise<void> {
  if (await importDashboard(request)) showImportDialog.value = false;
}

function handleEmbedError(message: string): void {
  error.value = message;
}

function handleEmbedGenerated(): void {
  status.value = 'Dashboard embed token generated';
  dashboardEmbedEnabled.value = canManagePreviewDataScope.value;
}

function handleEmbedRevoked(): void {
  status.value = 'Dashboard embed token revoked';
  dashboardEmbedEnabled.value = false;
}

function updatePreviewDataScope(values: Record<string, unknown>): void {
  const dashboard = selectedDashboard.value;
  if (!dashboard || !canConfigurePreviewDataScope.value) return;
  dashboardRuntimeState.value = saveDashboardRuntimeParameterValues(dashboard.id, values);
  status.value = Object.keys(dashboardRuntimeState.value?.runtimeParameterValues ?? {}).length > 0
    ? 'Preview scope updated'
    : 'Preview scope cleared';
}

const { success: toastSuccess } = useToast();

const TOAST_MESSAGES = new Set([
  'Dashboard draft saved',
  'Dashboard published',
  'Dashboard version saved',
  'Dashboard version restored',
  'Dashboard duplicated',
  'Dashboard details updated',
  'Dashboard deleted',
  'Dashboard created',
  'Embed URL copied',
  'Dashboard embed code copied',
  'Dashboard embed token generated',
  'Dashboard embed token revoked',
  'Email subscription created',
  'Email subscription deleted',
  'Test email queued',
]);

watch(status, newStatus => {
  if (newStatus && TOAST_MESSAGES.has(newStatus)) toastSuccess(newStatus, 3000);
});
</script>

<template>
  <section class="dashboard-builder-page" :class="{ 'dashboard-builder-page--analyzer-open': showAnalyzerPanel, 'sidebar-open': showMobileSidebar }" aria-labelledby="builder-title">
    <button
      class="mobile-menu-toggle"
      @click="toggleMobileSidebar"
      :aria-label="showMobileSidebar ? 'Close navigation menu' : 'Open navigation menu'"
      :aria-expanded="showMobileSidebar"
      type="button"
    >
      <svg v-if="!showMobileSidebar" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
      </svg>
    </button>

    <div
      v-if="showMobileSidebar"
      class="mobile-sidebar-overlay"
      @click="closeMobileSidebar"
    />

    <div
      v-if="isWorkspaceLoading"
      class="dashboard-workspace-loading"
      role="status"
      aria-live="polite"
      aria-label="Loading dashboard workspace"
    >
      <div class="dashboard-workspace-loading-panel">
        <span class="dashboard-workspace-spinner" aria-hidden="true"></span>
        <div>
          <strong>{{ loadingTitle }}</strong>
          <p>{{ loadingDetail }}</p>
        </div>
      </div>
    </div>

    <DashboardWorkspaceSidebar
      :class="{ 'is-open': showMobileSidebar }"
      v-model:prompt="prompt"
      :action-plan="actionPlan"
      :agent-messages="agentMessages"
      :can-edit-dashboard="canEditDashboard"
      :can-use-dashboard="canUseDashboard"
      :data-model-recommendation="dataModelRecommendation"
      :data-sources="dataSources"
      :dashboards="dashboards"
      :recent-dashboard-id="recentDashboardId"
      :selected-dashboard="selectedDashboard"
      :selected-data-source-id="selectedDataSource?.id ?? ''"
      :selected-element="selectedElement"
      :selected-table-id="selectedTable?.id ?? ''"
      :selected-table="selectedTable"
      :builder-rail-collapsed="builderRailCollapsed"
      :ai-features-enabled="aiFeaturesEnabled"
      :show-builder-rail="showBuilderRail"
      :suggestions="suggestions"
      :sample-prompts="samplePrompts"
      :last-agent-prompt="lastAgentPrompt"
      :status="status"
      :model-context-error="modelContextError"
      :model-context-summary="modelContextSummary"
      :error="error"
      @create-element="createElement"
      @create-manual-element="createManualElement"
      @new-dashboard="addDashboard"
      @apply-to-selected-element="applyAgentToSelectedElement"
      @select-data-source="selectDataSource"
      @select-data-table="selectDataTable"
      @clear-element-selection="clearElementSelection"
      @message-action="handleAgentMessageAction"
      @toggle-builder-rail="toggleBuilderRail"
      @click="closeMobileSidebar"
    />

    <DashboardWorkspaceMain
      :dashboard="selectedDashboard"
      :dashboards="dashboards"
      :can-edit-dashboard="canEditDashboard"
      :can-configure-preview-data-scope="canConfigurePreviewDataScope"
      :page-title="pageTitle"
      :can-use-dashboard="canUseDashboard"
      :data-sources="dataSources"
      :filter-create-request-key="filterCreateRequestKey"
      :filter-draft="newFilterDraft"
      :run-configuration="dashboardRunConfiguration"
      :is-analyzer-open="showAnalyzerPanel"
      :ai-features-enabled="aiFeaturesEnabled"
      :is-dashboard-running="isDashboardRunning"
      :is-saving="isSaving"
      :has-unsaved-changes="hasUnsavedChanges"
      :manual-mode="manualMode"
      :is-dashboard-home="isDashboardHomeRoute"
      :recent-dashboard-ids="recentDashboardIds"
      :preview-data-scope="previewDataScope"
      :editor-focus-element-id="editorFocusElementId"
      :selected-data-source-id="selectedDataSource?.id ?? ''"
      :selected-element="selectedElement"
      :selected-table-id="selectedTable?.id ?? ''"
      :versions="versions"
      @cancel-edit="discardSelectedDashboardDraft"
      @publish="publishSelectedDashboard"
      @duplicate="duplicateSelectedDashboard"
      @rename="renameSelectedDashboard"
      @save-draft="saveDraft"
      @add-filter="addFilter"
      @change-filter="changeFilter"
      @create-filter="createFilter"
      @copy-embed="showEmbedDialog = true"
      @delete-dashboard="deleteSelectedDashboard"
      @clear-element-selection="clearElementSelection"
      @clone-element="cloneElement"
      @edit-element="editElement"
      @email-report="showEmailReportsDialog = true"
      @open-analyzer="openAnalyzerPanel"
      @open-history="showVersionHistoryDialog = true"
      @remove-element="removeElement"
      @remove-filter="removeFilter"
      @run-dashboard="runDashboard"
      @cancel-run="cancelDashboardRun"
      @configure-run="configureDashboardRun"
      @update-preview-data-scope="updatePreviewDataScope"
      @export-dashboard="exportDashboard"
      @export-advanced-pdf="showPdfExportDialog = true"
      @update-element-config="updateElementConfig"
      @update-element-layout="updateElementLayout"
      @update-dashboard-settings="updateDashboardSettings"
      @set-dashboard-favorite="setDashboardFavorite"
      @create-manual-element="createManualElement"
      @update:manual-mode="manualMode = $event"
      @restore-version="restoreVersion"
      @save-element="saveElement"
      @select-data-source="selectDataSource"
      @select-data-table="selectDataTable"
    />

    <DashboardAnalyzerPanel
      v-if="aiFeaturesEnabled && selectedDashboard && showAnalyzerPanel"
      :dashboard="selectedDashboard"
      :data-sources="dataSources"
      @close="showAnalyzerPanel = false"
    />

    <DashboardCreateDialog
      v-if="isCreateDialogOpen"
      v-model:dashboard-name="dashboardName"
      :is-saving="isSaving"
      @create-dashboard="addDashboard"
      @cancel="closeCreateDialog"
    />


    <DashboardEmbedDialog
      v-if="selectedDashboard"
      v-model:open="showEmbedDialog"
      :dashboard-id="selectedDashboard.id"
      :dashboard-name="selectedDashboard.name"
      @copied="status = $event === 'url' ? 'Embed URL copied' : 'Dashboard embed code copied'"
      @error="handleEmbedError"
      @generated="handleEmbedGenerated"
      @revoked="handleEmbedRevoked"
    />

    <DashboardEmailReportsDialog
      v-if="selectedDashboard && showEmailReportsDialog"
      :dashboard-id="selectedDashboard.id"
      :dashboard-name="selectedDashboard.name"
      @close="showEmailReportsDialog = false"
      @created="status = 'Email subscription created'"
      @deleted="status = 'Email subscription deleted'"
      @test-sent="status = 'Test email queued'"
    />

    <DashboardPdfExportDialog
      v-if="selectedDashboard && showPdfExportDialog"
      :dashboard-id="selectedDashboard.id"
      :dashboard-name="selectedDashboard.name"
      @close="showPdfExportDialog = false"
      @exported="status = 'PDF export ready'"
    />

    <DashboardVersionHistoryDialog
      v-if="selectedDashboard && showVersionHistoryDialog"
      :dashboard="selectedDashboard"
      :is-saving="isSaving"
      :versions="versions"
      @close="showVersionHistoryDialog = false"
      @restore-version="restoreVersion"
    />

  </section>
</template>
