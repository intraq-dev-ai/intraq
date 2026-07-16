<script setup lang="ts">
const filterField = defineModel<string>('filterField', { required: true });
const filterDatePickerDisplayMode = defineModel<'split-date-time' | 'native'>('filterDatePickerDisplayMode', { required: true });
const filterDateRangeDisplayMode = defineModel<'button' | 'datetime-fields' | 'inline' | 'range-picker'>('filterDateRangeDisplayMode', { required: true });
const filterInputType = defineModel<string>('filterInputType', { required: true });
const filterOperator = defineModel<string>('filterOperator', { required: true });
const filterPeriodDatePickerTheme = defineModel<'default' | 'legacy' | 'minimal'>('filterPeriodDatePickerTheme', { required: true });
const filterPeriodNavigationStyle = defineModel<'text' | 'icons'>('filterPeriodNavigationStyle', { required: true });
const filterShowPeriodBottomDivider = defineModel<boolean>('filterShowPeriodBottomDivider', { required: true });
const filterTarget = defineModel<string>('filterTarget', { required: true });
const filterValue = defineModel<string>('filterValue', { required: true });

function isPeriodFilter(): boolean {
  return ['period', 'periodfilter', 'period-filter'].includes(filterInputType.value.replace(/_/g, '-').toLowerCase());
}

function isDateRangeFilter(): boolean {
  return ['daterange', 'date-range'].includes(filterInputType.value.replace(/_/g, '-').toLowerCase());
}

function isDatePickerFilter(): boolean {
  return ['date', 'datepicker', 'date-picker'].includes(filterInputType.value.replace(/_/g, '-').toLowerCase());
}
</script>

<template>
  <fieldset class="editor-fieldset" aria-label="Filter configuration">
    <legend>Filter configuration</legend>
    <label for="filter-field">Filter field</label>
    <input id="filter-field" v-model="filterField" placeholder="location_name">
    <label for="filter-input-type">Input type</label>
    <select id="filter-input-type" v-model="filterInputType">
      <option value="single-select">Dropdown</option>
      <option value="multi-select">Multi select</option>
      <option value="free-text">Free text</option>
      <option value="date-picker">Date picker</option>
      <option value="date-range">Date range</option>
      <option value="parameter">Parameter</option>
      <option value="static">Static</option>
    </select>
    <label for="filter-operator">Filter operator</label>
    <select id="filter-operator" v-model="filterOperator">
      <option value="equals">Equals</option>
      <option value="notEquals">Not equals</option>
      <option value="contains">Contains</option>
      <option value="in">In list</option>
      <option value="between">Between</option>
      <option value="last">Last</option>
      <option value="greaterThan">Greater than</option>
      <option value="lessThan">Less than</option>
    </select>
    <label for="filter-value">Default value</label>
    <input id="filter-value" v-model="filterValue" placeholder="Any">
    <template v-if="isDatePickerFilter()">
      <label for="filter-date-picker-display">Date picker style</label>
      <select id="filter-date-picker-display" v-model="filterDatePickerDisplayMode">
        <option value="native">Default input</option>
        <option value="split-date-time">Split date/time field</option>
      </select>
    </template>
    <template v-if="isDateRangeFilter()">
      <label for="filter-date-range-display">Date range style</label>
      <select id="filter-date-range-display" v-model="filterDateRangeDisplayMode">
        <option value="button">Default picker</option>
        <option value="inline">Inline fields</option>
        <option value="datetime-fields">Split date/time fields</option>
        <option value="range-picker">Two-month range picker</option>
      </select>
    </template>
    <template v-if="isPeriodFilter()">
      <label for="filter-period-navigation">Navigation buttons</label>
      <select id="filter-period-navigation" v-model="filterPeriodNavigationStyle">
        <option value="text">Text buttons</option>
        <option value="icons">Icon buttons</option>
      </select>
      <label for="filter-period-date-picker-theme">Date picker theme</label>
      <select id="filter-period-date-picker-theme" v-model="filterPeriodDatePickerTheme">
        <option value="default">Default</option>
        <option value="legacy">Legacy report</option>
        <option value="minimal">Minimal</option>
      </select>
      <label class="inline-checkbox" for="filter-period-bottom-divider">
        <input id="filter-period-bottom-divider" v-model="filterShowPeriodBottomDivider" type="checkbox">
        <span>Show bottom divider</span>
      </label>
    </template>
    <label for="filter-target">Filter target</label>
    <select id="filter-target" v-model="filterTarget">
      <option value="all">All components</option>
      <option value="component">Selected components</option>
      <option value="dataSource">Data source</option>
      <option value="table">Data model</option>
    </select>
  </fieldset>
</template>
