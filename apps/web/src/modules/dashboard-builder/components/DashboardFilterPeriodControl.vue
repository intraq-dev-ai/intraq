<script setup lang="ts">
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import DashboardDateRangePicker from './DashboardDateRangePicker.vue';
import DashboardDateTimePicker from './DashboardDateTimePicker.vue';
import DashboardPeriodDatePicker from './DashboardPeriodDatePicker.vue';
import {
  toDateRangeOutputValue,
  type DateRangeBoundary,
  type DateRangeValue
} from './date-range-values';
import {
  activePeriodUsesRange,
  dateRangeEndFieldLabel,
  dateRangeFieldDisplayFormat,
  dateRangeSeparatorLabel,
  dateRangeStartFieldLabel,
  periodDatePickerTheme,
  periodDisplay,
  periodOptions,
  periodRangeDisplayMode,
  periodTabIcon,
  periodValue,
  rangePickerTriggerStyle,
  showPeriodTabIcons
} from './dashboard-filter-bar-utils';
import {
  changePeriod,
  changeRange,
  changeSelectedDate,
  periodFilterValue as readPeriodFilterValue,
  shiftPeriodFilterValue,
  type PeriodFilterValue
} from './period-filter-values';

const props = defineProps<{
  filter: DashboardFilter;
}>();

const emit = defineEmits<{
  update: [patch: DashboardFilterPatch];
}>();

function updatePeriodFilter(value: PeriodFilterValue): void {
  emit('update', {
    config: {
      ...(props.filter.config ?? {}),
      endDate: value.endDate,
      operator: 'period',
      period: value.period,
      selectedDate: value.selectedDate,
      startDate: value.startDate,
      value
    },
    operator: 'period',
    value
  });
}

function updatePeriodSelection(period: string): void {
  updatePeriodFilter(changePeriod(readPeriodFilterValue(props.filter), period, props.filter.config));
}

function updatePeriodDate(value: string): void {
  if (!value) return;
  updatePeriodFilter(changeSelectedDate(readPeriodFilterValue(props.filter), value, props.filter.config));
}

function updatePeriodRange(range: DateRangeValue): void {
  updatePeriodFilter(changeRange(readPeriodFilterValue(props.filter), range));
}

function updatePeriodRangeBoundary(boundary: DateRangeBoundary, value: string): void {
  const current = readPeriodFilterValue(props.filter);
  const includeTime = props.filter.config?.includeTime === true;
  updatePeriodRange({
    endDate: boundary === 'end' ? toDateRangeOutputValue(value, includeTime, 'end') : current.endDate,
    includeTime,
    startDate: boundary === 'start' ? toDateRangeOutputValue(value, includeTime, 'start') : current.startDate
  });
}

function shiftPeriodFilter(direction: -1 | 1): void {
  updatePeriodFilter(shiftPeriodFilterValue(readPeriodFilterValue(props.filter), props.filter.config, direction));
}
</script>

<template>
  <div class="period-filter">
    <div class="period-tabs" role="tablist" :aria-label="`${filter.name} period`">
      <button
        v-for="option in periodOptions(filter)"
        :key="option.id"
        class="period-tab"
        :class="{ active: periodValue(filter).period === option.id }"
        type="button"
        role="tab"
        :aria-selected="periodValue(filter).period === option.id"
        @click="updatePeriodSelection(option.id)"
      >
        <span v-if="showPeriodTabIcons(filter) && periodTabIcon(filter, option)" class="period-tab-icon" aria-hidden="true">{{ periodTabIcon(filter, option) }}</span>
        <span class="period-tab-label">{{ option.label }}</span>
      </button>
    </div>
    <div class="period-picker">
      <button
        class="nav-btn"
        type="button"
        :aria-label="`Previous ${filter.name} period`"
        @click="shiftPeriodFilter(-1)"
      >
        <span aria-hidden="true">&lt;</span>
      </button>
      <div v-if="activePeriodUsesRange(filter) && periodRangeDisplayMode(filter) === 'datetime-fields'" class="inline-date-range-filter inline-date-range-filter--period inline-date-range-filter--datetime">
        <DashboardDateTimePicker
          :ariaLabel="`${filter.name} start date`"
          :include-time="filter.config?.includeTime === true"
          :model-value="periodValue(filter).startDate"
          @change="updatePeriodRangeBoundary('start', $event)"
        />
        <span class="inline-date-range-separator">{{ dateRangeSeparatorLabel(filter) }}</span>
        <DashboardDateTimePicker
          :ariaLabel="`${filter.name} end date`"
          :include-time="filter.config?.includeTime === true"
          :model-value="periodValue(filter).endDate"
          @change="updatePeriodRangeBoundary('end', $event)"
        />
      </div>
      <DashboardDateRangePicker
        v-else-if="activePeriodUsesRange(filter)"
        :end-date="periodValue(filter).endDate"
        :end-field-label="dateRangeEndFieldLabel(filter)"
        :field-display-format="dateRangeFieldDisplayFormat(filter)"
        :include-time="filter.config?.includeTime === true"
        :label="filter.name"
        :start-field-label="dateRangeStartFieldLabel(filter)"
        :start-date="periodValue(filter).startDate"
        :trigger-style="rangePickerTriggerStyle(periodRangeDisplayMode(filter))"
        @change="updatePeriodRange($event)"
      />
      <DashboardPeriodDatePicker
        v-else
        :ariaLabel="`${filter.name} selected date`"
        :display-text="periodDisplay(filter)"
        :model-value="periodValue(filter).selectedDate"
        :theme="periodDatePickerTheme(filter)"
        variant="compact"
        @change="updatePeriodDate($event)"
      />
      <button
        class="nav-btn"
        type="button"
        :aria-label="`Next ${filter.name} period`"
        @click="shiftPeriodFilter(1)"
      >
        <span aria-hidden="true">&gt;</span>
      </button>
    </div>
  </div>
</template>
