<script setup lang="ts">
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import type { FilterOptionItem } from './filter-options-api';
import {
  controlType,
  filterApplied,
  filterIndicators,
  filterStateLabel,
  shouldUseSearchableSingleSelect,
  typeLabel
} from './dashboard-filter-bar-utils';
import DashboardFilterDatePickerInput from './DashboardFilterDatePickerInput.vue';
import DashboardFilterDateRangeControl from './DashboardFilterDateRangeControl.vue';
import DashboardFilterFreeTextInput from './DashboardFilterFreeTextInput.vue';
import DashboardFilterNativeSelect from './DashboardFilterNativeSelect.vue';
import DashboardFilterPeriodControl from './DashboardFilterPeriodControl.vue';
import DashboardFilterSearchableDropdown from './DashboardFilterSearchableDropdown.vue';

defineProps<{
  actionsOpen: boolean;
  canEditDashboard: boolean;
  fetchedOptionsByFilter: Record<string, FilterOptionItem[]>;
  fetchedOptionsLoadedByFilter: Record<string, boolean>;
  filter: DashboardFilter;
}>();

const emit = defineEmits<{
  edit: [filter: DashboardFilter];
  remove: [filter: DashboardFilter];
  toggleActions: [filter: DashboardFilter];
  update: [filterId: string, patch: DashboardFilterPatch];
}>();

function updateFilter(filter: DashboardFilter, patch: DashboardFilterPatch): void {
  emit('update', filter.id, patch);
}
</script>

<template>
  <article
    class="filter-component"
    :class="{ 'date-range-component': controlType(filter) === 'date-range', 'period-filter-component': controlType(filter) === 'period-filter', 'is-applied': filterApplied(filter) }"
  >
    <div class="filter-badge-row" :aria-label="`${filter.name} filter status`">
      <span class="filter-type-badge">{{ typeLabel(filter.type) }}</span>
      <span v-for="indicator in filterIndicators(filter)" :key="indicator" class="filter-state-badge">{{ indicator }}</span>
      <span class="filter-state-badge" :class="{ applied: filterApplied(filter) }">{{ filterStateLabel(filter) }}</span>
    </div>

    <div v-if="canEditDashboard" class="filter-controls">
      <button
        v-show="!actionsOpen"
        class="filter-menu-trigger"
        type="button"
        :aria-expanded="actionsOpen"
        :aria-label="`Filter actions for ${filter.name}`"
        :aria-controls="`filter-actions-${filter.id}`"
        aria-haspopup="menu"
        @click="emit('toggleActions', filter)"
      >
        <span aria-hidden="true">...</span>
      </button>
      <div
        v-if="actionsOpen"
        :id="`filter-actions-${filter.id}`"
        class="filter-actions-menu"
        role="menu"
        :aria-label="`Actions for ${filter.name} filter`"
      >
        <button role="menuitem" type="button" :aria-label="`Change ${filter.name} filter`" @click="emit('edit', filter)">
          Change
        </button>
        <button role="menuitem" type="button" class="danger" :aria-label="`Delete ${filter.name} filter`" @click="emit('remove', filter)">
          Delete
        </button>
      </div>
    </div>

    <label v-if="filter.config?.showTitle !== false" class="filter-label" :for="`dashboard-filter-${filter.id}`">{{ filter.name }}</label>

    <DashboardFilterPeriodControl
      v-if="controlType(filter) === 'period-filter'"
      :filter="filter"
      @update="updateFilter(filter, $event)"
    />
    <DashboardFilterDateRangeControl
      v-else-if="controlType(filter) === 'date-range'"
      :filter="filter"
      @update="updateFilter(filter, $event)"
    />
    <DashboardFilterDatePickerInput
      v-else-if="controlType(filter) === 'date-picker'"
      :filter="filter"
      @update="updateFilter(filter, $event)"
    />
    <DashboardFilterNativeSelect
      v-else-if="controlType(filter) === 'dropdown' && !shouldUseSearchableSingleSelect(filter)"
      :fetched-options-by-filter="fetchedOptionsByFilter"
      :fetched-options-loaded-by-filter="fetchedOptionsLoadedByFilter"
      :filter="filter"
      @update="updateFilter(filter, $event)"
    />
    <DashboardFilterSearchableDropdown
      v-else-if="controlType(filter) === 'multi-select' || (controlType(filter) === 'dropdown' && shouldUseSearchableSingleSelect(filter))"
      :fetched-options-by-filter="fetchedOptionsByFilter"
      :fetched-options-loaded-by-filter="fetchedOptionsLoadedByFilter"
      :filter="filter"
      @update="updateFilter(filter, $event)"
    />
    <DashboardFilterFreeTextInput
      v-else
      :fetched-options-by-filter="fetchedOptionsByFilter"
      :fetched-options-loaded-by-filter="fetchedOptionsLoadedByFilter"
      :filter="filter"
      @update="updateFilter(filter, $event)"
    />
  </article>
</template>
