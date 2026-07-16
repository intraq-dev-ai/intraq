<script setup lang="ts">
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import {
  shiftDateRangeValue,
  type DateRangeValue
} from './date-range-values';
import {
  currentFilterValue,
  dateRangeDisplayMode,
  dateRangeEndFieldLabel,
  dateRangeFieldDisplayFormat,
  dateRangeSeparatorLabel,
  dateRangeStartFieldLabel,
  filterValue,
  formatInputDate,
  normalizeLastToken,
  rangePickerTriggerStyle
} from './dashboard-filter-control-utils';
import DashboardFilterRangeControl from './DashboardFilterRangeControl.vue';

const props = defineProps<{
  controlName: string;
  filter: DashboardFilter;
}>();

const emit = defineEmits<{
  update: [patch: DashboardFilterPatch];
}>();

function updateDateRangeFilter(range: DateRangeValue): void {
  if (!range.startDate || !range.endDate) {
    emit('update', { operator: 'between', value: [], config: { ...(props.filter.config ?? {}), endDate: '', startDate: '' } });
    return;
  }
  emit('update', {
    operator: 'between',
    value: [range.startDate, range.endDate],
    config: {
      ...(props.filter.config ?? {}),
      endDate: range.endDate,
      includeTime: range.includeTime,
      operator: 'between',
      startDate: range.startDate,
      value: [range.startDate, range.endDate]
    }
  });
}

function shiftDateRangeFilter(direction: -1 | 1): void {
  updateDateRangeFilter(shiftDateRangeValue(dateRangeValue(), direction));
}

function dateRangeValue(): DateRangeValue {
  const value = currentFilterValue(props.filter);
  const config = props.filter.config ?? {};
  const startFromConfig = readConfigString(config.startDate ?? config.fromDate ?? config.defaultStartDate);
  const endFromConfig = readConfigString(config.endDate ?? config.toDate ?? config.defaultEndDate);
  if (Array.isArray(value) && value.length >= 2) {
    return { endDate: String(value[1] ?? ''), includeTime: config.includeTime === true, startDate: String(value[0] ?? '') };
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const startDate = readConfigString(record.startDate ?? record.start ?? record.from);
    const endDate = readConfigString(record.endDate ?? record.end ?? record.to);
    if (startDate || endDate) return { endDate: endDate ?? '', includeTime: config.includeTime === true, startDate: startDate ?? '' };
  }
  if (startFromConfig || endFromConfig) {
    return { endDate: endFromConfig ?? '', includeTime: config.includeTime === true, startDate: startFromConfig ?? '' };
  }
  return dateRangeFromLastToken(normalizeLastToken(String(value ?? config.defaultValue ?? '30 days')));
}

function dateRangeFromLastToken(value: string): DateRangeValue {
  const days = Number(value.match(/^(\d+)\s+days$/i)?.[1] ?? '30');
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(1, days) + 1);
  return {
    endDate: formatInputDate(end),
    includeTime: false,
    startDate: formatInputDate(start)
  };
}

function showDateRangeNavigation(): boolean {
  const config = props.filter.config ?? {};
  return config.dateRangeShowNavigation !== false
    && config.showDateRangeNavigation !== false
    && config.showRangeNavigation !== false;
}

function readConfigString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
</script>

<template>
  <div
    class="date-range-filter"
    :class="{
      'date-range-filter--inline': dateRangeDisplayMode(filter) === 'inline',
      'date-range-filter--datetime': dateRangeDisplayMode(filter) === 'datetime-fields',
      'date-range-filter--range-picker': dateRangeDisplayMode(filter) === 'range-picker',
      'date-range-filter--no-navigation': !showDateRangeNavigation()
    }"
  >
    <button
      v-if="showDateRangeNavigation()"
      class="nav-btn"
      type="button"
      :aria-label="`Previous ${controlName} range`"
      @click="shiftDateRangeFilter(-1)"
    >
      <span aria-hidden="true">&lt;</span>
    </button>
    <input
      :id="`dashboard-filter-${filter.id}`"
      class="filter-input"
      type="hidden"
      :value="filterValue(filter, currentFilterValue(filter))"
      :aria-label="`${controlName} filter`"
    >
    <DashboardFilterRangeControl
      :control-name="controlName"
      :display-mode="dateRangeDisplayMode(filter)"
      :end-field-label="dateRangeEndFieldLabel(filter)"
      :field-display-format="dateRangeFieldDisplayFormat(filter)"
      :range="dateRangeValue()"
      :separator-label="dateRangeSeparatorLabel(filter)"
      :start-field-label="dateRangeStartFieldLabel(filter)"
      :trigger-style="rangePickerTriggerStyle(dateRangeDisplayMode(filter))"
      @change="updateDateRangeFilter"
    />
    <button
      v-if="showDateRangeNavigation()"
      class="nav-btn"
      type="button"
      :aria-label="`Next ${controlName} range`"
      @click="shiftDateRangeFilter(1)"
    >
      <span aria-hidden="true">&gt;</span>
    </button>
  </div>
</template>
