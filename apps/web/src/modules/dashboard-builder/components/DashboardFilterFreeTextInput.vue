<script setup lang="ts">
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import type { FilterOptionItem } from './filter-options-api';
import {
  currentFilterValue,
  filterOptionItems,
  filterOptionsId,
  filterOptionValues,
  filterPlaceholder,
  filterValue,
  inputValue,
  parseValueForFilter,
  type FilterOptionLookup
} from './dashboard-filter-bar-utils';

const props = defineProps<{
  fetchedOptionsByFilter: Record<string, FilterOptionItem[]>;
  fetchedOptionsLoadedByFilter: Record<string, boolean>;
  filter: DashboardFilter;
}>();

const emit = defineEmits<{
  update: [patch: DashboardFilterPatch];
}>();

function optionLookup(): FilterOptionLookup {
  return {
    fetchedOptionsByFilter: props.fetchedOptionsByFilter,
    fetchedOptionsLoadedByFilter: props.fetchedOptionsLoadedByFilter
  };
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
    :list="filterOptionValues(filter, optionLookup()).length > 0 ? filterOptionsId(filter) : undefined"
    :placeholder="filterPlaceholder(filter, optionLookup())"
    @change="updateFilterValue(inputValue($event))"
  >
  <datalist v-if="filterOptionValues(filter, optionLookup()).length > 0" :id="filterOptionsId(filter)">
    <option v-for="option in filterOptionItems(filter, optionLookup())" :key="option.value" :value="option.value">{{ option.label }}</option>
  </datalist>
</template>
