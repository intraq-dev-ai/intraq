<script setup lang="ts">
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import DashboardDateRangePicker from './DashboardDateRangePicker.vue';
import DashboardDateTimePicker from './DashboardDateTimePicker.vue';
import {
  shiftDateRangeValue,
  toDateRangeOutputValue,
  type DateRangeBoundary,
  type DateRangeValue
} from './date-range-values';
import {
  currentFilterValue,
  dateRangeDisplayMode,
  dateRangeEndFieldLabel,
  dateRangeFieldDisplayFormat,
  dateRangeSeparatorLabel,
  dateRangeStartFieldLabel,
  dateRangeValue,
  filterValue,
  rangePickerTriggerStyle
} from './dashboard-filter-bar-utils';

const props = defineProps<{
  filter: DashboardFilter;
}>();

const emit = defineEmits<{
  update: [patch: DashboardFilterPatch];
}>();

function updateDateRangeFilter(range: DateRangeValue): void {
  if (!range.startDate || !range.endDate) {
    emit('update', {
      config: { ...(props.filter.config ?? {}), endDate: '', startDate: '' },
      operator: 'between',
      value: []
    });
    return;
  }
  emit('update', {
    config: {
      ...(props.filter.config ?? {}),
      endDate: range.endDate,
      includeTime: range.includeTime,
      operator: 'between',
      startDate: range.startDate,
      value: [range.startDate, range.endDate]
    },
    operator: 'between',
    value: [range.startDate, range.endDate]
  });
}

function updateDateRangeBoundary(boundary: DateRangeBoundary, value: string): void {
  const current = dateRangeValue(props.filter);
  updateDateRangeFilter({
    endDate: boundary === 'end' ? toDateRangeOutputValue(value, current.includeTime, 'end') : current.endDate,
    includeTime: current.includeTime,
    startDate: boundary === 'start' ? toDateRangeOutputValue(value, current.includeTime, 'start') : current.startDate
  });
}

function shiftDateRangeFilter(direction: -1 | 1): void {
  updateDateRangeFilter(shiftDateRangeValue(dateRangeValue(props.filter), direction));
}
</script>

<template>
  <div
    class="date-range-filter"
    :class="{
      'date-range-filter--datetime': dateRangeDisplayMode(filter) === 'datetime-fields',
      'date-range-filter--range-picker': dateRangeDisplayMode(filter) === 'range-picker'
    }"
  >
    <button
      class="nav-btn"
      type="button"
      :aria-label="`Previous ${filter.name} range`"
      @click="shiftDateRangeFilter(-1)"
    >
      <span aria-hidden="true">&lt;</span>
    </button>
    <input
      :id="`dashboard-filter-${filter.id}`"
      class="filter-input"
      type="hidden"
      :value="filterValue(filter, currentFilterValue(filter))"
      :aria-label="`${filter.name} filter`"
    >
    <div v-if="dateRangeDisplayMode(filter) === 'datetime-fields'" class="inline-date-range-filter inline-date-range-filter--datetime">
      <DashboardDateTimePicker
        :ariaLabel="`${filter.name} start date`"
        :include-time="dateRangeValue(filter).includeTime"
        :model-value="dateRangeValue(filter).startDate"
        @change="updateDateRangeBoundary('start', $event)"
      />
      <span class="inline-date-range-separator">{{ dateRangeSeparatorLabel(filter) }}</span>
      <DashboardDateTimePicker
        :ariaLabel="`${filter.name} end date`"
        :include-time="dateRangeValue(filter).includeTime"
        :model-value="dateRangeValue(filter).endDate"
        @change="updateDateRangeBoundary('end', $event)"
      />
    </div>
    <DashboardDateRangePicker
      v-else
      :end-date="dateRangeValue(filter).endDate"
      :end-field-label="dateRangeEndFieldLabel(filter)"
      :field-display-format="dateRangeFieldDisplayFormat(filter)"
      :include-time="dateRangeValue(filter).includeTime"
      :label="filter.name"
      :start-field-label="dateRangeStartFieldLabel(filter)"
      :start-date="dateRangeValue(filter).startDate"
      :trigger-style="rangePickerTriggerStyle(dateRangeDisplayMode(filter))"
      @change="updateDateRangeFilter($event)"
    />
    <button
      class="nav-btn"
      type="button"
      :aria-label="`Next ${filter.name} range`"
      @click="shiftDateRangeFilter(1)"
    >
      <span aria-hidden="true">&gt;</span>
    </button>
  </div>
</template>
