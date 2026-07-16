<script setup lang="ts">
import { computed } from 'vue';
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';
import {
  controlType,
  cssVariable,
  currentFilterValue,
  filterValue,
  periodBackgroundColor,
  periodDisplayMode
} from './dashboard-filter-control-utils';
import DashboardDatePickerFilterControl from './DashboardDatePickerFilterControl.vue';
import DashboardDateRangeFilterControl from './DashboardDateRangeFilterControl.vue';
import DashboardFilterActionsMenu from './DashboardFilterActionsMenu.vue';
import DashboardFreeTextFilterControl from './DashboardFreeTextFilterControl.vue';
import DashboardOptionsFilterControl from './DashboardOptionsFilterControl.vue';
import DashboardPeriodFilterControl from './DashboardPeriodFilterControl.vue';

const props = defineProps<{
  actionsLabel?: string;
  filter: DashboardFilter;
  canEditDashboard?: boolean;
  displayName?: string;
  showTitle?: boolean;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>();

const emit = defineEmits<{
  update: [filterId: string, patch: DashboardFilterPatch];
  edit: [];
  remove: [];
}>();

const controlName = computed(() => props.displayName?.trim() || props.filter.name);
const controlKind = computed(() => controlType(props.filter));
const filterApplied = computed(() => filterValue(props.filter, currentFilterValue(props.filter)) !== 'Any');
const periodStyle = computed<Record<string, string>>(() => {
  if (controlKind.value !== 'period-filter') return {};
  return {
    ...cssVariable('--period-filter-background', periodBackgroundColor(props.filter)),
    ...cssVariable('--period-filter-active-color', props.filter.config?.periodActiveColor ?? props.filter.config?.periodAccentColor)
  };
});
const periodDisplayModeClass = computed(() => (
  controlKind.value === 'period-filter' ? `period-filter-component--${periodDisplayMode(props.filter)}` : ''
));

function updateFilter(patch: DashboardFilterPatch): void {
  emit('update', props.filter.id, patch);
}
</script>

<template>
  <article
    class="filter-component"
    :class="[
      {
        'date-range-component': controlKind === 'date-range',
        'period-filter-component': controlKind === 'period-filter',
        'is-applied': filterApplied
      },
      periodDisplayModeClass
    ]"
    :data-filter-id="filter.id"
    :style="periodStyle"
  >
    <DashboardFilterActionsMenu
      v-if="canEditDashboard"
      :actions-label="actionsLabel"
      :control-name="controlName"
      :filter-id="filter.id"
      @edit="emit('edit')"
      @remove="emit('remove')"
    />

    <label v-if="showTitle !== false" class="filter-label" :for="`dashboard-filter-${filter.id}`" data-dashboard-drag-handle="true">{{ controlName }}</label>

    <DashboardPeriodFilterControl
      v-if="controlKind === 'period-filter'"
      :control-name="controlName"
      :filter="filter"
      @update="updateFilter"
    />
    <DashboardDateRangeFilterControl
      v-else-if="controlKind === 'date-range'"
      :control-name="controlName"
      :filter="filter"
      @update="updateFilter"
    />
    <DashboardDatePickerFilterControl
      v-else-if="controlKind === 'date-picker'"
      :control-name="controlName"
      :filter="filter"
      @update="updateFilter"
    />
    <DashboardOptionsFilterControl
      v-else-if="controlKind === 'options'"
      :control-name="controlName"
      :filter="filter"
      :visualization-request="visualizationRequest"
      @update="updateFilter"
    />
    <DashboardFreeTextFilterControl
      v-else
      :filter="filter"
      :visualization-request="visualizationRequest"
      @update="updateFilter"
    />
  </article>
</template>
