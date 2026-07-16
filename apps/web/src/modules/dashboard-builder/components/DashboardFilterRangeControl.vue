<script setup lang="ts">
import type { DateRangeValue } from './date-range-values';
import { toDateRangeOutputValue } from './date-range-values';
import {
  dateRangeInputType,
  dateRangeInputValue,
  inputValue,
  type RangeDisplayMode,
  type RangeFieldDisplayFormat
} from './dashboard-filter-control-utils';
import DashboardDateRangePicker from './DashboardDateRangePicker.vue';
import DashboardDateTimePicker from './DashboardDateTimePicker.vue';

const props = withDefaults(defineProps<{
  controlName: string;
  displayMode: RangeDisplayMode;
  endFieldLabel: string;
  fieldDisplayFormat: RangeFieldDisplayFormat;
  period?: boolean;
  range: DateRangeValue;
  separatorLabel: string;
  startFieldLabel: string;
  triggerStyle: 'button' | 'range-fields';
}>(), {
  period: false
});

const emit = defineEmits<{
  change: [range: DateRangeValue];
}>();

function updateBoundary(boundary: 'end' | 'start', value: string): void {
  emit('change', {
    ...props.range,
    [`${boundary}Date`]: toDateRangeOutputValue(value, props.range.includeTime, boundary)
  });
}
</script>

<template>
  <DashboardDateRangePicker
    v-if="displayMode !== 'inline' && displayMode !== 'datetime-fields'"
    :end-date="range.endDate"
    :end-field-label="endFieldLabel"
    :field-display-format="fieldDisplayFormat"
    :include-time="range.includeTime"
    :label="controlName"
    :start-field-label="startFieldLabel"
    :start-date="range.startDate"
    :trigger-style="triggerStyle"
    @change="emit('change', $event)"
  />
  <div
    v-else
    class="inline-date-range-filter"
    :class="{
      'inline-date-range-filter--datetime': displayMode === 'datetime-fields',
      'inline-date-range-filter--period': period
    }"
  >
    <DashboardDateTimePicker
      v-if="displayMode === 'datetime-fields'"
      :ariaLabel="`${controlName} start date`"
      :include-time="range.includeTime"
      :model-value="dateRangeInputValue(range.startDate, range.includeTime, 'start')"
      @change="updateBoundary('start', $event)"
    />
    <input
      v-else
      class="filter-input inline-date-range-input"
      :type="dateRangeInputType(range.includeTime)"
      :value="dateRangeInputValue(range.startDate, range.includeTime, 'start')"
      :aria-label="`${controlName} start date`"
      @change="updateBoundary('start', inputValue($event))"
    >
    <span class="inline-date-range-separator">{{ separatorLabel }}</span>
    <DashboardDateTimePicker
      v-if="displayMode === 'datetime-fields'"
      :ariaLabel="`${controlName} end date`"
      :include-time="range.includeTime"
      :model-value="dateRangeInputValue(range.endDate, range.includeTime, 'end')"
      @change="updateBoundary('end', $event)"
    />
    <input
      v-else
      class="filter-input inline-date-range-input"
      :type="dateRangeInputType(range.includeTime)"
      :value="dateRangeInputValue(range.endDate, range.includeTime, 'end')"
      :aria-label="`${controlName} end date`"
      @change="updateBoundary('end', inputValue($event))"
    >
  </div>
</template>
