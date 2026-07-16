<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { FilterDraft } from '../dashboard-builder/agent-context/planner-filters';
import DashboardCanvas from '../dashboard-builder/components/DashboardCanvas.vue';
import DashboardFilterBar from '../dashboard-builder/components/DashboardFilterBar.vue';
import { DEFAULT_VIEW_MODE_ROW_LIMIT } from '../dashboard-builder/runtime/dashboard-run-limits';
import type {
  BuilderDataSource,
  Dashboard,
  DashboardFilterCreatePatch,
  DashboardFilterPatch,
  DashboardRunConfiguration,
  DashboardSettings
} from '../dashboard-builder/types';
import type { VisualizationDataRequestContext } from '../dashboard-builder/visualization/data';
import {
  fetchEmbedDataSources,
  fetchEmbeddedDashboard,
  validateEmbedToken
} from './api';
import { activeDashboardFilters } from './dashboard-filtering';
import { loadScopedFilterOptions } from './embed-dashboard-filter-options';
import {
  embedFilterBehaviorFrom,
  toBuilderDataSource,
  toDashboardElement,
  toDashboardFilter
} from './embed-dashboard-mappers';
import {
  embedErrorDetails,
  errorMessage,
  isTokenExpiredErrorMessage,
  readHandshakeTimeoutMs,
  readRouteValue
} from './embed-dashboard-routing';
import { embedRuntimeParameterValues } from './embed-dashboard-runtime';
import { readString } from './embed-dashboard-utils';
import type {
  EmbedAppearance,
  EmbedDashboard,
  EmbedDataSource
} from './types';
import { useEmbedFrameBridge } from './use-embed-frame-bridge';
import '../dashboard-builder/dashboard-builder.css';
import '../dashboard-builder/dashboard-builder-runtime-formats.css';
import './public-access.css';

const DEFAULT_CANVAS_BACKGROUND = '#f8fbff';
const DEFAULT_CANVAS_TEXT = '#0f172a';

const route = useRoute();
const dashboard = ref<EmbedDashboard | null>(null);
const appearance = ref<EmbedAppearance | null>(null);
const accessContext = ref<Record<string, unknown> | null>(null);
const dataSources = ref<EmbedDataSource[]>([]);
const filterPatches = ref<Record<string, DashboardFilterPatch>>({});
const scopedFilterOptions = ref<Record<string, string[]>>({});
const embedOrigin = ref('');
const isLoading = ref(false);
const status = ref('Loading...');
const error = ref('');
const errorDetails = ref('');
let loadRequestId = 0;

const dashboardId = computed(() => readRouteValue(route.params.id));
const token = computed(() => readRouteValue(route.query.token));
const handshakeRequired = computed(() => route.query.handshake === 'required');
const handshakeTimeoutMs = computed(() => readHandshakeTimeoutMs(route.query.handshakeTimeoutMs));
const showHeader = computed(() => {
  if (typeof appearance.value?.showHeader === 'boolean') return appearance.value.showHeader;
  return true;
});
const showFilters = computed(() => {
  if (typeof appearance.value?.showFilters === 'boolean') return appearance.value.showFilters;
  return true;
});
const showExpand = computed(() => {
  if (typeof appearance.value?.showExpand === 'boolean') return appearance.value.showExpand;
  return true;
});
const showExport = computed(() => {
  if (typeof appearance.value?.showExport === 'boolean') return appearance.value.showExport;
  return true;
});
const {
  notifyParentOfEmbedLoaded,
  notifyParentOfEmbedTokenExpiry,
  postEmbedHeight,
  resolveEmbedOrigin,
  start: startEmbedFrameBridge,
  stop: stopEmbedFrameBridge
} = useEmbedFrameBridge({ dashboardId, handshakeRequired, handshakeTimeoutMs });

const visibleElements = computed(() => {
  return [...(dashboard.value?.elements ?? [])]
    .filter(element => element.isVisible !== false)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
});
const visibleFilters = computed(() => activeDashboardFilters(dashboard.value?.filters ?? []));
const dashboardSettings = computed(() => dashboard.value?.settings as DashboardSettings | undefined);
const filterBehavior = computed(() => embedFilterBehaviorFrom(dashboardSettings.value, appearance.value));
const builderDashboard = computed<Dashboard | null>(() => {
  const current = dashboard.value;
  if (!current) return null;
  const currentDashboardId = current.id;
  return {
    id: currentDashboardId,
    name: current.name,
    category: readString(current.category) ?? 'Embedded',
    status: 'published',
    settings: (current.settings ?? {}) as DashboardSettings,
    elements: visibleElements.value.map(element => toDashboardElement(element, currentDashboardId, filterBehavior.value)),
    filters: showFilters.value
      ? visibleFilters.value.map(filter => toDashboardFilter(filter, {
        dashboardId: currentDashboardId,
        filterBehavior: filterBehavior.value,
        patch: filterPatches.value[filter.id],
        scopedOptions: scopedFilterOptions.value[filter.id] ?? []
      }))
      : [],
    updatedAt: ''
  };
});
const builderDataSources = computed<BuilderDataSource[]>(() => dataSources.value.map(toBuilderDataSource));
const selectedDataSourceId = computed(() => builderDataSources.value[0]?.id ?? '');
const selectedTableId = computed(() => builderDataSources.value[0]?.tables[0]?.id ?? '');
const canvasStyle = computed(() => ({
  background: DEFAULT_CANVAS_BACKGROUND,
  '--canvas-bg': DEFAULT_CANVAS_BACKGROUND,
  '--canvas-text': DEFAULT_CANVAS_TEXT
}));
const runConfiguration: DashboardRunConfiguration = {
  runtime: 'embed',
  scheduled: false,
  viewModeRowLimit: DEFAULT_VIEW_MODE_ROW_LIMIT
};
const filterDraft: FilterDraft = {
  field: '',
  name: 'Dashboard Filter',
  operator: 'equals',
  type: 'interactive'
};
const visualizationRequest = computed<VisualizationDataRequestContext | undefined>(() => {
  const accessToken = token.value;
  if (!accessToken || !embedOrigin.value) return undefined;
  return {
    cacheKeyPrefix: `embed:${accessToken}:${embedOrigin.value}`,
    downloadEndpoint: '/api/embed/data-sources/download',
    embedOrigin: embedOrigin.value,
    endpoint: '/api/embed/chart-data',
    runtimeParameterValues: embedRuntimeParameterValues(accessContext.value, dashboardId.value),
    token: accessToken
  };
});

onMounted(() => {
  document.body.classList.add('embedded-view');
  startEmbedFrameBridge();
  void loadDashboard();
});

onUnmounted(() => {
  document.body.classList.remove('embedded-view');
  stopEmbedFrameBridge();
});

watch(() => route.fullPath, () => {
  void loadDashboard();
});

async function loadDashboard(): Promise<void> {
  const requestId = ++loadRequestId;
  isLoading.value = true;
  error.value = '';
  errorDetails.value = '';
  appearance.value = null;
  accessContext.value = null;
  dataSources.value = [];
  scopedFilterOptions.value = {};
  filterPatches.value = {};

  try {
    const id = dashboardId.value;
    const accessToken = token.value;
    if (!id) throw new Error('Dashboard ID is required.');
    if (!accessToken) throw new Error('Embed token is required.');

    status.value = 'Loading...';
    embedOrigin.value = await resolveEmbedOrigin(id, accessToken);
    if (requestId !== loadRequestId) return;

    status.value = 'Loading...';
    await validateEmbedToken(accessToken, embedOrigin.value);
    if (requestId !== loadRequestId) return;

    status.value = 'Loading...';
    const payload = await fetchEmbeddedDashboard(id, accessToken, embedOrigin.value);
    if (requestId !== loadRequestId) return;

    dashboard.value = payload.dashboard;
    appearance.value = payload.appearance ?? null;
    accessContext.value = payload.accessContext ?? null;
    document.title = `${payload.dashboard.name} - Embedded Dashboard`;

    status.value = 'Loading...';
    dataSources.value = await fetchEmbedDataSources(accessToken, embedOrigin.value);

    status.value = `${payload.dashboard.name} loaded`;
    isLoading.value = false;
    await nextTick();
    notifyParentOfEmbedLoaded(payload.dashboard.name);
    postEmbedHeight();
    void loadScopedFilterOptionsAfterEmbedLoaded(requestId, accessToken, embedOrigin.value);
  } catch (caught) {
    if (requestId !== loadRequestId) return;
    const message = errorMessage(caught, 'Embedded dashboard could not be loaded.');
    dashboard.value = null;
    appearance.value = null;
    accessContext.value = null;
    dataSources.value = [];
    filterPatches.value = {};
    scopedFilterOptions.value = {};
    embedOrigin.value = '';
    error.value = message;
    errorDetails.value = embedErrorDetails(error.value);
    status.value = 'Embedded dashboard failed';
    if (isTokenExpiredErrorMessage(message)) notifyParentOfEmbedTokenExpiry(message);
  } finally {
    if (requestId === loadRequestId) isLoading.value = false;
  }
}

async function loadScopedFilterOptionsAfterEmbedLoaded(requestId: number, accessToken: string, origin: string): Promise<void> {
  try {
    const options = await loadScopedFilterOptions(accessToken, origin, visibleFilters.value, dataSources.value);
    if (requestId !== loadRequestId) return;
    scopedFilterOptions.value = options;
    await nextTick();
    postEmbedHeight();
  } catch (caught) {
    if (requestId !== loadRequestId) return;
    const message = errorMessage(caught, 'Embedded dashboard filters could not be loaded.');
    if (isTokenExpiredErrorMessage(message)) notifyParentOfEmbedTokenExpiry(message);
  }
}

function handleFilterUpdate(filterId: string, patch: DashboardFilterPatch): void {
  const previous = filterPatches.value[filterId] ?? {};
  filterPatches.value = {
    ...filterPatches.value,
    [filterId]: {
      ...previous,
      ...patch,
      config: {
        ...(previous.config ?? {}),
        ...(patch.config ?? {})
      }
    }
  };
  postEmbedHeight();
}

function ignoreFilterCreate(_patch: DashboardFilterCreatePatch): void {
  // Embedded dashboards are read-only; the shared filter bar requires the event.
}
</script>

<template>
  <main class="public-access-page embed-page" aria-labelledby="embed-dashboard-title">
    <section class="embed-shell" :class="{ 'embed-shell--loading': isLoading }">
      <h2 v-if="!dashboard || !showHeader" id="embed-dashboard-title" class="public-access-sr-only">
        {{ dashboard?.name ?? 'Embedded Dashboard' }}
      </h2>

      <p v-if="isLoading" class="public-access-status embed-loading-status" role="status" aria-live="polite">{{ status }}</p>

      <section v-else-if="error" class="public-access-error" role="alert" aria-labelledby="embed-error-title">
        <h2 id="embed-error-title">Dashboard Unavailable</h2>
        <p>{{ error }}</p>
        <p>{{ errorDetails }}</p>
      </section>

      <template v-else-if="dashboard">
        <header v-if="showHeader" class="embed-header">
          <h2 id="embed-dashboard-title">{{ dashboard.name }}</h2>
        </header>

        <section v-if="visibleElements.length === 0" class="public-panel" aria-labelledby="dashboard-empty-title">
          <p class="eyebrow">Dashboard</p>
          <h2 id="dashboard-empty-title">No Charts Available</h2>
          <p>This dashboard does not have any visible components configured.</p>
        </section>

        <section
          v-else-if="builderDashboard"
          class="dashboard-content embed-dashboard-content"
          :aria-label="`${dashboard.name} dashboard grid`"
        >
          <section
            class="dashboard-canvas-area embed-dashboard-canvas-area"
            :style="canvasStyle"
            aria-labelledby="embed-dashboard-title"
          >
            <DashboardFilterBar
              v-if="showFilters && builderDashboard.filters.length > 0"
              :can-edit-dashboard="false"
              :create-draft="filterDraft"
              :create-request-key="0"
              :dashboard-elements="builderDashboard.elements"
              :data-sources="builderDataSources"
              :filters="builderDashboard.filters"
              :selected-data-source-id="selectedDataSourceId"
              :selected-table-id="selectedTableId"
              @create="ignoreFilterCreate"
              @update="handleFilterUpdate"
              @remove="() => undefined"
            />

            <DashboardCanvas
              :dashboard="builderDashboard"
              :can-edit-dashboard="false"
              :data-sources="builderDataSources"
              :dashboard-settings="builderDashboard.settings"
              editor-focus-element-id=""
              :run-configuration="runConfiguration"
              :show-view-download-actions="showExport"
              :show-view-expand-actions="showExpand"
              :visualization-request="visualizationRequest"
              @clear-edit="() => undefined"
              @clone="() => undefined"
              @edit="() => undefined"
              @configure-filter="() => undefined"
              @change-filter="handleFilterUpdate"
              @remove="() => undefined"
              @open-filter-editor="() => undefined"
              @update-config="() => undefined"
              @update-layout="() => undefined"
              @drop-component="() => undefined"
              @resize="postEmbedHeight"
            />
          </section>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.embed-page,
.embed-shell {
  min-height: auto;
}

.embed-shell {
  gap: 0;
  box-sizing: border-box;
  padding: 0;
}

.embed-header {
  background: #ffffff;
  border: 0;
  box-shadow: none;
  min-height: auto;
  padding: 0;
}

.embed-header #embed-dashboard-title {
  color: #333333;
  font-family: "Open Sans", Arial, sans-serif;
  font-size: 28px;
  font-weight: 300;
  line-height: 1.2;
  margin: 10px 0 0 15px;
  padding: 0 0 15px;
}

.embed-dashboard-content {
  box-sizing: border-box;
  min-height: auto;
  overflow: visible;
  width: 100%;
}

.embed-dashboard-canvas-area {
  box-sizing: border-box;
  overflow: visible;
  width: 100%;
}

.embed-dashboard-canvas-area :deep(.dashboard-canvas-panel) {
  min-width: 0;
}

.embed-dashboard-canvas-area :deep(.dashboard-canvas-card) {
  background: var(--embed-surface, var(--surface));
  border-color: var(--embed-border, var(--border));
  border-radius: var(--embed-radius, 8px);
  border-width: var(--embed-border-width, 1px);
}

.embed-dashboard-canvas-area :deep(.dashboard-canvas-card--view.dashboard-canvas-card--chrome-none),
.embed-dashboard-canvas-area :deep(.dashboard-canvas-card--view.dashboard-canvas-card--chrome-none:not(.dashboard-canvas-card--two-row-card)) {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  overflow: visible;
  padding: 0;
}

.embed-dashboard-canvas-area :deep(.component-expand-dialog),
.embed-dashboard-canvas-area :deep(.component-download-dialog) {
  background: var(--embed-surface, var(--bg-primary));
  border-color: var(--embed-border, var(--border));
  border-radius: var(--embed-radius, 8px);
  border-width: var(--embed-border-width, 1px);
}
</style>
