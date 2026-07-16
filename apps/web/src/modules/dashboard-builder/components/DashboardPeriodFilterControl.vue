<script setup lang="ts">
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import type { DateRangeValue } from './date-range-values';
import {
  changePeriod,
  changeRange,
  changeSelectedDate,
  periodDisplayValue,
  periodFilterValue as readPeriodFilterValue,
  periodOptionsFromConfig,
  shiftPeriodFilterValue,
  type PeriodFilterOption,
  type PeriodFilterValue,
  type PeriodUnit
} from './period-filter-values';
import {
  dateRangeEndFieldLabel,
  dateRangeFieldDisplayFormat,
  dateRangeSeparatorLabel,
  dateRangeStartFieldLabel,
  formatInputDate,
  periodDisplayMode,
  periodRangeDisplayMode,
  rangePickerTriggerStyle,
  readBoolean,
  readString,
  toolbarNavigationIcon,
  toolbarNavigationLabel,
  toolbarNavigationText
} from './dashboard-filter-control-utils';
import DashboardFilterRangeControl from './DashboardFilterRangeControl.vue';
import DashboardPeriodDatePicker from './DashboardPeriodDatePicker.vue';

const props = defineProps<{
  controlName: string;
  filter: DashboardFilter;
}>();

const emit = defineEmits<{
  update: [patch: DashboardFilterPatch];
}>();

function updatePeriodFilter(value: PeriodFilterValue): void {
  emit('update', {
    operator: 'period',
    value,
    config: {
      ...(props.filter.config ?? {}),
      endDate: value.endDate,
      operator: 'period',
      period: value.period,
      selectedDate: value.selectedDate,
      startDate: value.startDate,
      value
    }
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

function shiftPeriodFilter(direction: -1 | 1): void {
  updatePeriodFilter(shiftPeriodFilterValue(readPeriodFilterValue(props.filter), props.filter.config, direction));
}

function shiftPeriodByUnit(unit: PeriodUnit, direction: -1 | 1): void {
  const current = readPeriodFilterValue(props.filter);
  const selected = new Date(`${current.selectedDate || formatInputDate(new Date())}T00:00:00`);
  if (Number.isNaN(selected.getTime())) {
    shiftPeriodFilter(direction);
    return;
  }
  if (unit === 'week') selected.setDate(selected.getDate() + direction * 7);
  else if (unit === 'month') selected.setMonth(selected.getMonth() + direction);
  else if (unit === 'quarter') selected.setMonth(selected.getMonth() + direction * 3);
  else if (unit === 'year') selected.setFullYear(selected.getFullYear() + direction);
  else selected.setDate(selected.getDate() + direction);
  updatePeriodFilter(changeSelectedDate(current, formatInputDate(selected), props.filter.config));
}

function periodOptions(): PeriodFilterOption[] {
  return periodOptionsFromConfig(props.filter.config);
}

function showPeriodTabIcons(): boolean {
  const config = props.filter.config ?? {};
  return readBoolean(config.periodShowTabIcons ?? config.showPeriodTabIcons ?? config.periodTabIconsEnabled);
}

function periodTabIcon(option: PeriodFilterOption): string {
  const config = props.filter.config ?? {};
  const icons = config.periodTabIcons;
  if (icons && typeof icons === 'object' && !Array.isArray(icons)) {
    const icon = readString((icons as Record<string, unknown>)[option.id]);
    if (icon) return icon;
  }
  return readString(option.icon ?? config.periodTabIcon ?? config.periodIcon) ?? '';
}

function periodValue(): PeriodFilterValue {
  return readPeriodFilterValue(props.filter);
}

function periodRangeValue(): DateRangeValue {
  const value = periodValue();
  return {
    endDate: value.endDate,
    includeTime: props.filter.config?.includeTime === true,
    startDate: value.startDate
  };
}

function periodDisplay(): string {
  return periodDisplayValue(readPeriodFilterValue(props.filter), props.filter.config);
}

function showPeriodBottomDivider(): boolean {
  return props.filter.config?.showPeriodBottomDivider !== false;
}

function activePeriodOption(): PeriodFilterOption | undefined {
  const value = readPeriodFilterValue(props.filter);
  return periodOptions().find(option => option.id === value.period);
}

function activePeriodShowsToolbar(): boolean {
  return activePeriodOption()?.showToolbar !== false;
}

function activePeriodShowsNavigation(): boolean {
  const config = props.filter.config ?? {};
  return activePeriodOption()?.showNavigation !== false
    && config.periodShowNavigation !== false
    && config.showPeriodNavigation !== false
    && config.showRangeNavigation !== false;
}

function activePeriodShowsSummary(): boolean {
  const config = props.filter.config ?? {};
  return activePeriodOption()?.showSummary !== false
    && config.periodShowSummary !== false
    && config.showPeriodSummary !== false;
}

function activePeriodUsesRange(): boolean {
  const unit = activePeriodOption()?.unit;
  return unit === 'range' || unit === 'custom';
}

function activePeriodUnit(): PeriodUnit {
  return activePeriodOption()?.unit ?? 'day';
}

function toolbarOuterUnit(): PeriodUnit | null {
  const unit = activePeriodUnit();
  if (unit === 'day') return 'week';
  if (unit === 'week') return 'month';
  if (unit === 'month' || unit === 'quarter') return 'year';
  return null;
}

function toolbarPrimaryUnit(): PeriodUnit {
  const unit = activePeriodUnit();
  return unit === 'range' || unit === 'custom' ? 'day' : unit;
}

function periodToolbarSummary(): string {
  const value = readPeriodFilterValue(props.filter);
  const start = new Date(`${(value.selectedDate || value.startDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime())) return periodDisplay();
  const unit = activePeriodUnit();
  if (unit === 'day') {
    const weekday = start.toLocaleDateString('en-AU', { weekday: 'long' });
    const date = start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${weekday}, ${date}`;
  }
  return periodDisplay();
}

function toolbarNavigationStyle(): 'icons' | 'text' {
  const raw = readString(props.filter.config?.periodNavigationStyle ?? props.filter.config?.periodToolbarNavigationStyle)?.toLowerCase() ?? '';
  return raw === 'icon' || raw === 'icons' || raw === 'compact' ? 'icons' : 'text';
}

function periodDatePickerTheme(): 'default' | 'legacy' | 'minimal' {
  const raw = readString(props.filter.config?.periodDatePickerTheme ?? props.filter.config?.datePickerTheme ?? props.filter.config?.periodDateInputTheme)?.toLowerCase() ?? '';
  if (raw === 'legacy' || raw === 'classic' || raw === 'report') return 'legacy';
  if (raw === 'minimal' || raw === 'plain' || raw === 'underline') return 'minimal';
  return 'default';
}
</script>

<template>
  <div
    class="period-filter"
    :class="[`period-filter--${periodDisplayMode(filter)}`, { 'period-filter--hide-toolbar-divider': !showPeriodBottomDivider() }]"
  >
    <div class="period-tabs" role="tablist" :aria-label="`${controlName} period`">
      <button
        v-for="option in periodOptions()"
        :key="option.id"
        class="period-tab"
        :class="{ active: periodValue().period === option.id }"
        type="button"
        role="tab"
        :aria-selected="periodValue().period === option.id"
        @click="updatePeriodSelection(option.id)"
      >
        <span v-if="showPeriodTabIcons() && periodTabIcon(option)" class="period-tab-icon" aria-hidden="true">{{ periodTabIcon(option) }}</span>
        <span class="period-tab-label">{{ option.label }}</span>
      </button>
    </div>
    <div v-if="periodDisplayMode(filter) === 'toolbar' && activePeriodShowsToolbar()" class="period-toolbar">
      <strong v-if="activePeriodShowsSummary()" class="period-toolbar-summary">{{ periodToolbarSummary() }}</strong>
      <div class="period-toolbar-actions">
        <button
          v-if="activePeriodShowsNavigation() && toolbarOuterUnit()"
          class="period-toolbar-btn"
          :class="{ 'period-toolbar-btn--icon': toolbarNavigationStyle() === 'icons' }"
          type="button"
          :aria-label="toolbarNavigationLabel(toolbarOuterUnit() || 'week', -1)"
          :title="toolbarNavigationLabel(toolbarOuterUnit() || 'week', -1)"
          @click="shiftPeriodByUnit(toolbarOuterUnit() || 'week', -1)"
        >
          {{ toolbarNavigationStyle() === 'icons' ? toolbarNavigationIcon(-1, true) : toolbarNavigationText(toolbarOuterUnit() || 'week', -1, true) }}
        </button>
        <button
          v-if="activePeriodShowsNavigation()"
          class="period-toolbar-btn"
          :class="{ 'period-toolbar-btn--icon': toolbarNavigationStyle() === 'icons' }"
          type="button"
          :aria-label="toolbarNavigationLabel(toolbarPrimaryUnit(), -1)"
          :title="toolbarNavigationLabel(toolbarPrimaryUnit(), -1)"
          @click="shiftPeriodByUnit(toolbarPrimaryUnit(), -1)"
        >
          {{ toolbarNavigationStyle() === 'icons' ? toolbarNavigationIcon(-1) : toolbarNavigationText(toolbarPrimaryUnit(), -1) }}
        </button>
        <DashboardFilterRangeControl
          v-if="activePeriodUsesRange()"
          :control-name="controlName"
          :display-mode="periodRangeDisplayMode(filter)"
          :end-field-label="dateRangeEndFieldLabel(filter)"
          :field-display-format="dateRangeFieldDisplayFormat(filter)"
          period
          :range="periodRangeValue()"
          :separator-label="dateRangeSeparatorLabel(filter)"
          :start-field-label="dateRangeStartFieldLabel(filter)"
          :trigger-style="rangePickerTriggerStyle(periodRangeDisplayMode(filter))"
          @change="updatePeriodRange"
        />
        <DashboardPeriodDatePicker
          v-else
          :ariaLabel="`${controlName} selected date`"
          :model-value="periodValue().selectedDate"
          :theme="periodDatePickerTheme()"
          variant="toolbar"
          @change="updatePeriodDate"
        />
        <button
          v-if="activePeriodShowsNavigation()"
          class="period-toolbar-btn"
          :class="{ 'period-toolbar-btn--icon': toolbarNavigationStyle() === 'icons' }"
          type="button"
          :aria-label="toolbarNavigationLabel(toolbarPrimaryUnit(), 1)"
          :title="toolbarNavigationLabel(toolbarPrimaryUnit(), 1)"
          @click="shiftPeriodByUnit(toolbarPrimaryUnit(), 1)"
        >
          {{ toolbarNavigationStyle() === 'icons' ? toolbarNavigationIcon(1) : toolbarNavigationText(toolbarPrimaryUnit(), 1) }}
        </button>
        <button
          v-if="activePeriodShowsNavigation() && toolbarOuterUnit()"
          class="period-toolbar-btn"
          :class="{ 'period-toolbar-btn--icon': toolbarNavigationStyle() === 'icons' }"
          type="button"
          :aria-label="toolbarNavigationLabel(toolbarOuterUnit() || 'week', 1)"
          :title="toolbarNavigationLabel(toolbarOuterUnit() || 'week', 1)"
          @click="shiftPeriodByUnit(toolbarOuterUnit() || 'week', 1)"
        >
          {{ toolbarNavigationStyle() === 'icons' ? toolbarNavigationIcon(1, true) : toolbarNavigationText(toolbarOuterUnit() || 'week', 1, true) }}
        </button>
      </div>
    </div>
    <div v-else-if="periodDisplayMode(filter) !== 'toolbar' || activePeriodShowsToolbar()" class="period-picker">
      <button
        v-if="activePeriodShowsNavigation()"
        class="nav-btn"
        type="button"
        :aria-label="`Previous ${controlName} period`"
        @click="shiftPeriodFilter(-1)"
      >
        <span aria-hidden="true">&lt;</span>
      </button>
      <DashboardFilterRangeControl
        v-if="activePeriodUsesRange()"
        :control-name="controlName"
        :display-mode="periodRangeDisplayMode(filter)"
        :end-field-label="dateRangeEndFieldLabel(filter)"
        :field-display-format="dateRangeFieldDisplayFormat(filter)"
        period
        :range="periodRangeValue()"
        :separator-label="dateRangeSeparatorLabel(filter)"
        :start-field-label="dateRangeStartFieldLabel(filter)"
        :trigger-style="rangePickerTriggerStyle(periodRangeDisplayMode(filter))"
        @change="updatePeriodRange"
      />
      <DashboardPeriodDatePicker
        v-else
        :ariaLabel="`${controlName} selected date`"
        :display-text="periodDisplay()"
        :model-value="periodValue().selectedDate"
        :theme="periodDatePickerTheme()"
        variant="compact"
        @change="updatePeriodDate"
      />
      <button
        v-if="activePeriodShowsNavigation()"
        class="nav-btn"
        type="button"
        :aria-label="`Next ${controlName} period`"
        @click="shiftPeriodFilter(1)"
      >
        <span aria-hidden="true">&gt;</span>
      </button>
    </div>
  </div>
</template>
