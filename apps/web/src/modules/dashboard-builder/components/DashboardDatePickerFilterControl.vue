<script setup lang="ts">
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import {
  currentFilterValue,
  inputValue,
  normalizeDateTimeLocalValue,
  parseValueForFilter,
  readString
} from './dashboard-filter-control-utils';
import DashboardDateTimePicker from './DashboardDateTimePicker.vue';

const props = defineProps<{
  controlName: string;
  filter: DashboardFilter;
}>();

const emit = defineEmits<{
  update: [patch: DashboardFilterPatch];
}>();

function updateFilterValue(value: string): void {
  emit('update', { value: parseValueForFilter(props.filter, value) });
}

function datePickerInputType(): 'date' | 'datetime-local' {
  return props.filter.config?.includeTime === true ? 'datetime-local' : 'date';
}

function datePickerInputValue(): string {
  const value = String(currentFilterValue(props.filter) ?? props.filter.config?.defaultValue ?? '');
  if (!value) return '';
  if (datePickerInputType() === 'date') return value.slice(0, 10);
  return normalizeDateTimeLocalValue(value);
}

function datePickerDisplayMode(): 'native' | 'split-date-time' {
  const raw = readString(props.filter.config?.datePickerDisplayMode ?? props.filter.config?.datePickerStyle ?? props.filter.config?.datePickerTheme)?.toLowerCase() ?? '';
  if (raw === 'split-date-time' || raw === 'separate-date-time' || raw === 'datetime-fields' || raw === 'date-time-fields' || raw === 'kendo') return 'split-date-time';
  return 'native';
}
</script>

<template>
  <DashboardDateTimePicker
    v-if="datePickerDisplayMode() === 'split-date-time'"
    :ariaLabel="`${controlName} filter`"
    :include-time="filter.config?.includeTime === true"
    :model-value="datePickerInputValue()"
    @change="updateFilterValue($event)"
  />
  <input
    v-else
    :id="`dashboard-filter-${filter.id}`"
    class="filter-input"
    :type="datePickerInputType()"
    :value="datePickerInputValue()"
    @change="updateFilterValue(inputValue($event))"
  >
</template>
