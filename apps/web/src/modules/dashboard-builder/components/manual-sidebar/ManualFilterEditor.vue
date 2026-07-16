<script setup lang="ts">
import { computed } from 'vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();

const periodBackgroundColorInput = computed({
  get: () => ctx.filterPeriodBackgroundColor || '#ffffff',
  set: (value: string) => { ctx.filterPeriodBackgroundColor = value; }
});

const periodActiveColorInput = computed({
  get: () => ctx.filterPeriodActiveColor || '#2563eb',
  set: (value: string) => { ctx.filterPeriodActiveColor = value; }
});

function setPeriodNoBackground(): void {
  ctx.filterPeriodBackgroundColor = 'transparent';
  ctx.submitElement();
}
</script>

<template>
  <template v-if="ctx.elementType === 'filter'">
<div class="editor-section">
          <label class="editor-field-label">Filter Field</label>
          <select v-model="ctx.filterField" class="editor-select" @change="ctx.submitElement">
            <option value="">Select field…</option>
            <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
          </select>
        </div>
        <div class="editor-section">
          <label class="editor-field-label">Input Type</label>
          <select v-model="ctx.filterInputType" class="editor-select" @change="ctx.submitElement">
            <option value="single-select">Single Select</option>
            <option value="multi-select">Multi Select</option>
            <option value="checkbox">Checkbox</option>
            <option value="radio">Radio Buttons</option>
            <option value="period-filter">Period Filter</option>
            <option value="date-range">Date Range</option>
            <option value="date">Date Picker</option>
            <option value="text">Text Input</option>
            <option value="number">Number Input</option>
            <option value="slider">Range Slider</option>
          </select>
        </div>
        <div class="editor-section">
          <label class="editor-field-label">Operator</label>
          <select v-model="ctx.filterOperator" class="editor-select" @change="ctx.submitElement">
            <option value="equals">Equals</option>
            <option value="not_equals">Not Equals</option>
            <option value="contains">Contains</option>
            <option value="not_contains">Does Not Contain</option>
            <option value="starts_with">Starts With</option>
            <option value="ends_with">Ends With</option>
            <option value="period">Period</option>
            <option value="between">Between</option>
            <option value="greater_than">Greater Than</option>
            <option value="greater_than_or_equal">Greater Than Or Equal</option>
            <option value="less_than">Less Than</option>
            <option value="less_than_or_equal">Less Than Or Equal</option>
            <option value="in">In List</option>
            <option value="not_in">Not In List</option>
            <option value="is_null">Is Empty</option>
            <option value="is_not_null">Is Not Empty</option>
          </select>
        </div>
        <div class="editor-section">
          <label class="editor-field-label">Apply To</label>
          <select v-model="ctx.filterTarget" class="editor-select" @change="ctx.submitElement">
            <option value="all">All Elements</option>
            <option value="selected">Selected Elements</option>
          </select>
        </div>
        <div class="editor-section">
          <label class="editor-field-label">Container</label>
          <select v-model="ctx.filterContainerId" class="editor-select" @change="ctx.submitElement">
            <option value="">None</option>
            <option v-for="container in ctx.filterContainerOptions" :key="container.id" :value="container.id">{{ container.name }}</option>
          </select>
        </div>
        <div class="editor-section">
          <label class="editor-field-label">Filter Chrome</label>
          <select v-model="ctx.filterChrome" class="editor-select" @change="ctx.submitElement">
            <option value="card">Card</option>
            <option value="transparent">Transparent</option>
            <option value="none">None</option>
          </select>
        </div>
        <div v-if="ctx.filterNeedsValue" class="editor-section">
          <label class="editor-field-label">Default Value</label>
          <input v-model="ctx.filterValue" class="editor-input" placeholder="Default filter value" @input="ctx.submitElement" />
        </div>
        <div
          v-if="ctx.filterInputType === 'date' || ctx.filterInputType === 'date-picker' || ctx.filterInputType === 'datePicker' || ctx.filterInputType === 'datepicker'"
          class="editor-section"
        >
          <label class="editor-field-label">Date Picker Style</label>
          <select v-model="ctx.filterDatePickerDisplayMode" class="editor-select" @change="ctx.submitElement">
            <option value="native">Default input</option>
            <option value="split-date-time">Split date/time field</option>
          </select>
        </div>
        <div
          v-if="ctx.filterInputType === 'date-range' || ctx.filterInputType === 'dateRange' || ctx.filterInputType === 'daterange'"
          class="editor-section"
        >
          <label class="editor-field-label">Date Range Style</label>
          <select v-model="ctx.filterDateRangeDisplayMode" class="editor-select" @change="ctx.submitElement">
            <option value="button">Default picker</option>
            <option value="inline">Inline fields</option>
            <option value="datetime-fields">Split date/time fields</option>
            <option value="range-picker">Two-month range picker</option>
          </select>
        </div>
        <div
          v-if="ctx.filterInputType === 'period-filter' || ctx.filterInputType === 'periodFilter' || ctx.filterInputType === 'period'"
          class="editor-section"
        >
          <label class="editor-field-label">Filter Background</label>
          <div class="color-row">
            <input type="color" v-model="periodBackgroundColorInput" class="color-swatch" @input="ctx.submitElement" />
            <input v-model="ctx.filterPeriodBackgroundColor" class="editor-input color-hex" placeholder="#ffffff or transparent" @input="ctx.submitElement" />
            <button type="button" class="color-reset-btn" @click="setPeriodNoBackground">None</button>
          </div>
          <label class="editor-field-label mt-2">Filter Accent</label>
          <div class="color-row">
            <input type="color" v-model="periodActiveColorInput" class="color-swatch" @input="ctx.submitElement" />
            <input v-model="ctx.filterPeriodActiveColor" class="editor-input color-hex" placeholder="#2563eb" @input="ctx.submitElement" />
          </div>
          <label class="editor-field-label mt-2">Navigation</label>
          <select v-model="ctx.filterPeriodNavigationStyle" class="editor-select" @change="ctx.submitElement">
            <option value="text">Text buttons</option>
            <option value="icons">Icon buttons</option>
          </select>
          <label class="editor-field-label mt-2">Date Picker Theme</label>
          <select v-model="ctx.filterPeriodDatePickerTheme" class="editor-select" @change="ctx.submitElement">
            <option value="default">Default</option>
            <option value="legacy">Legacy report</option>
            <option value="minimal">Minimal</option>
          </select>
          <label class="inline-checkbox mt-2">
            <input v-model="ctx.filterShowPeriodBottomDivider" type="checkbox" @change="ctx.submitElement" />
            <span>Show bottom divider</span>
          </label>
        </div>
  </template>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
