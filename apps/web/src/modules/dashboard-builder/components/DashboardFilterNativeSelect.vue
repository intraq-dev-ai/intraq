<script setup lang="ts">
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import type { FilterOptionItem } from './filter-options-api';
import {
  filterOptionItems,
  inputValue,
  nativeSelectControlValue,
  noDataFoundLabel,
  parseValueForFilter,
  readString,
  shouldShowAnyOption,
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

function singleSelectPlaceholder(): string {
  const config = props.filter.config ?? {};
  return readString(config.placeholder ?? config.selectPlaceholder ?? config.singleSelectPlaceholder ?? config.searchPlaceholder)
    ?? 'Search or select...';
}

function updateFilterValue(value: string): void {
  emit('update', { value: parseValueForFilter(props.filter, value) });
}
</script>

<template>
  <select
    :id="`dashboard-filter-${filter.id}`"
    class="filter-input filter-select-input"
    :value="nativeSelectControlValue(filter, optionLookup())"
    :aria-label="`${filter.name} filter`"
    @change="updateFilterValue(inputValue($event))"
  >
    <option v-if="shouldShowAnyOption(filter)" value="all">Any</option>
    <option v-else-if="filterOptionItems(filter, optionLookup()).length === 0" value="" disabled>{{ noDataFoundLabel(filter) }}</option>
    <option v-else value="" disabled>{{ singleSelectPlaceholder() }}</option>
    <option v-for="option in filterOptionItems(filter, optionLookup())" :key="option.value" :value="option.value">{{ option.label }}</option>
  </select>
</template>
