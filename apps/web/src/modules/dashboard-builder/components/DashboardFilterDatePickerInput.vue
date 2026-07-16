<script setup lang="ts">
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import DashboardDateTimePicker from './DashboardDateTimePicker.vue';
import {
  datePickerDisplayMode,
  datePickerInputType,
  datePickerInputValue,
  inputValue,
  parseValueForFilter
} from './dashboard-filter-bar-utils';

const props = defineProps<{
  filter: DashboardFilter;
}>();

const emit = defineEmits<{
  update: [patch: DashboardFilterPatch];
}>();

function updateFilterValue(value: string): void {
  emit('update', { value: parseValueForFilter(props.filter, value) });
}
</script>

<template>
  <DashboardDateTimePicker
    v-if="datePickerDisplayMode(filter) === 'split-date-time'"
    :ariaLabel="`${filter.name} filter`"
    :include-time="filter.config?.includeTime === true"
    :model-value="datePickerInputValue(filter)"
    @change="updateFilterValue($event)"
  />
  <input
    v-else
    :id="`dashboard-filter-${filter.id}`"
    class="filter-input"
    :type="datePickerInputType(filter)"
    :value="datePickerInputValue(filter)"
    @change="updateFilterValue(inputValue($event))"
  >
</template>
