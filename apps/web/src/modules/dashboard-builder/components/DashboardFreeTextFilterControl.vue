<script setup lang="ts">
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';
import {
  currentFilterValue,
  filterValue,
  inputValue,
  parseValueForFilter
} from './dashboard-filter-control-utils';
import { useDashboardFilterOptionItems } from './useDashboardFilterOptionItems';

const props = defineProps<{
  filter: DashboardFilter;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>();

const emit = defineEmits<{
  update: [patch: DashboardFilterPatch];
}>();

const options = useDashboardFilterOptionItems(props);

function filterOptionsId(): string {
  return `dashboard-filter-options-${props.filter.id}`;
}

function filterPlaceholder(): string {
  if (options.filterOptionValues().length > 0) return 'Search values...';
  return 'Enter value...';
}

function updateFilterValue(value: string): void {
  emit('update', { value: parseValueForFilter(props.filter, value) });
}
</script>

<template>
  <input
    :id="`dashboard-filter-${filter.id}`"
    class="filter-input"
    type="search"
    :value="filterValue(filter, currentFilterValue(filter)) === 'Any' ? '' : filterValue(filter, currentFilterValue(filter))"
    :list="options.filterOptionValues().length > 0 ? filterOptionsId() : undefined"
    :placeholder="filterPlaceholder()"
    @change="updateFilterValue(inputValue($event))"
  >
  <datalist v-if="options.filterOptionValues().length > 0" :id="filterOptionsId()">
    <option v-for="option in options.filterOptionItems()" :key="option.value" :value="option.value">{{ option.label }}</option>
  </datalist>
</template>
