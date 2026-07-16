<script setup lang="ts">
import { computed } from 'vue';
import type { DashboardElement, DashboardFilter, DashboardFilterPatch, DashboardSettings } from '../../types';
import type { VisualizationDataRequestContext } from '../../visualization/data';
import DashboardExportButtonRenderer from './DashboardExportButtonRenderer.vue';
import DashboardFilterElementRenderer from './DashboardFilterElementRenderer.vue';

const props = withDefaults(defineProps<{
  canEditDashboard?: boolean;
  childElements?: DashboardElement[];
  dashboardElements?: DashboardElement[];
  dashboardSettings?: DashboardSettings;
  element: DashboardElement;
  filters?: DashboardFilter[];
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>(), {
  childElements: () => [],
  filters: () => []
});

const emit = defineEmits<{
  filterChange: [filterId: string, patch: DashboardFilterPatch];
  configureFilter: [elementId: string];
  removeFilterElement: [elementId: string];
}>();

const filterChildren = computed(() => (props.childElements ?? []).filter(child => child.type === 'filter'));
const exportChildren = computed(() => (props.childElements ?? []).filter(child => child.type === 'export'));
const containerStyle = computed<Record<string, string>>(() => {
  const config = props.element.config ?? {};
  return {
    ...cssVar('--dashboard-container-bg', readString(config.backgroundColor ?? config.background)),
    ...cssVar('--dashboard-container-border-color', readString(config.borderColor)),
    ...cssVar('--dashboard-container-radius', readCssLength(config.borderRadius)),
    ...cssVar('--dashboard-container-padding', readCssLength(config.padding, { ignoreZero: true })),
    ...cssVar('--dashboard-container-gap', readCssLength(config.gap, { ignoreZero: true })),
    ...cssVar('--dashboard-container-toolbar-gap', readCssLength(config.toolbarGap ?? config.exportGap ?? config.buttonGap)),
    ...cssVar('--dashboard-container-border-width', readCssLength(config.borderWidth)),
    '--dashboard-container-columns': String(readPositiveInteger(config.columns, responsiveColumnCount(filterChildren.value.length)))
  };
});
const showTitle = computed(() => props.element.config?.showTitle === true);
const containerTitle = computed(() => readString(props.element.config?.title) ?? props.element.name);

function childElementForRender(child: DashboardElement): DashboardElement {
  const config = child.config ?? {};
  const preserveFilterSurface = isPeriodFilterConfig(config);
  const renderConfig = preserveFilterSurface ? omitTransparentPeriodSurfaceConfig(config) : config;
  return {
    ...child,
    config: {
      ...renderConfig,
      ...(preserveFilterSurface ? {} : {
        background: 'transparent',
        backgroundColor: 'transparent'
      }),
      canvasChrome: 'transparent',
      componentChrome: 'transparent',
      filterChrome: 'transparent'
    }
  };
}

function isPeriodFilterConfig(config: Record<string, unknown>): boolean {
  const type = readString(config.inputType ?? config.filterType ?? config.type)
    ?.replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
  return type === 'periodfilter' || type === 'period-filter' || type === 'period_filter' || type === 'period';
}

function omitTransparentPeriodSurfaceConfig(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  for (const key of ['periodBackgroundColor', 'backgroundColor', 'background']) {
    if (isTransparentColor(next[key])) delete next[key];
  }
  return next;
}

function isTransparentColor(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'transparent';
}

function responsiveColumnCount(childCount: number): number {
  if (childCount <= 1) return 1;
  if (childCount <= 4) return childCount;
  return 4;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readCssLength(value: unknown, options: { ignoreZero?: boolean } = {}): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return `${Math.max(0, value)}px`;
  const text = readString(value);
  if (options.ignoreZero && isZeroLength(text ?? value)) return undefined;
  return text;
}

function isZeroLength(value: unknown): boolean {
  if (typeof value === 'number') return value === 0;
  if (typeof value !== 'string') return false;
  return /^0(?:\.0+)?(?:px|rem|em|%)?$/i.test(value.trim());
}

function cssVar(name: string, value: string | undefined): Record<string, string> {
  return value ? { [name]: value } : {};
}
</script>

<template>
  <section
    class="dashboard-container-element"
    :class="{ 'dashboard-container-element--empty': filterChildren.length === 0 && exportChildren.length === 0 }"
    :style="containerStyle"
    :aria-label="`${element.name} container`"
  >
    <header v-if="showTitle" class="dashboard-container-element__header">
      <h3>{{ containerTitle }}</h3>
    </header>

    <div v-if="filterChildren.length > 0" class="dashboard-container-element__grid">
      <DashboardFilterElementRenderer
        v-for="child in filterChildren"
        :key="child.id"
        :element="childElementForRender(child)"
        :filters="filters"
        :can-edit-dashboard="canEditDashboard"
        :dashboard-settings="dashboardSettings"
        :visualization-request="visualizationRequest"
        @change="(filterId, patch) => emit('filterChange', filterId, patch)"
        @configure="emit('configureFilter', child.id)"
        @remove="emit('removeFilterElement', child.id)"
      />
    </div>

    <div v-if="exportChildren.length > 0" class="dashboard-container-element__toolbar">
      <DashboardExportButtonRenderer
        v-for="child in exportChildren"
        :key="child.id"
        :dashboard-elements="dashboardElements"
        :element="child"
        :filters="filters"
        :visualization-request="visualizationRequest"
      />
    </div>

    <div v-if="filterChildren.length === 0 && exportChildren.length === 0 && canEditDashboard" class="dashboard-container-element__empty">
      Assign canvas controls to this container from the editor.
    </div>
  </section>
</template>
