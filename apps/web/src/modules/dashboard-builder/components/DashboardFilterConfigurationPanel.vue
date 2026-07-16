<script setup lang="ts">
import { computed } from 'vue';
import type { BuilderDataField, BuilderDataTable } from '../types';
import {
  availableFilterTypes,
  type FilterFormState,
  type TargetDataSource
} from './dashboard-filter-editor-model';

const props = defineProps<{
  allAvailableDataModels: TargetDataSource[];
  availableFields: BuilderDataField[];
  availableTables: BuilderDataTable[];
  dashboardDataModels: TargetDataSource[];
  fieldLabel: (field: BuilderDataField) => string;
  form: FilterFormState;
  isSelectedDataModelFromDashboard: boolean;
  requiredParameterLabels: string[];
}>();

const emit = defineEmits<{
  fieldSelectionChange: [];
  filterTypeChange: [];
}>();

const periodBackgroundColorInput = computed({
  get: () => colorInputValue(props.form.periodBackgroundColor, '#ffffff'),
  set: (value: string) => { props.form.periodBackgroundColor = value; }
});

const periodActiveColorInput = computed({
  get: () => colorInputValue(props.form.periodActiveColor, '#2563eb'),
  set: (value: string) => { props.form.periodActiveColor = value; }
});

function setPeriodNoBackground(): void {
  props.form.periodBackgroundColor = 'transparent';
}

function colorInputValue(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}
</script>

<template>
  <div class="tab-panel">
    <div class="two-column-layout">
      <div class="column-left">
        <h5 class="column-title">Filter Details</h5>
        <div class="form-group">
          <label class="form-label" for="filter-editor-name">Filter Name</label>
          <input id="filter-editor-name" v-model="form.label" type="text" class="form-input" placeholder="Enter filter name (e.g., 'Company Filter', 'Date Range')" />
          <div class="form-group" style="margin-top: 8px;">
            <label class="form-label">Title Visibility</label>
            <label class="inline-checkbox filter-checkbox-label">
              <input v-model="form.showTitle" type="checkbox" />
              Show title
            </label>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="filter-editor-type">Filter Type</label>
          <select id="filter-editor-type" v-model="form.type" class="form-select" @change="emit('filterTypeChange')">
            <option value="">Select Filter Type</option>
            <option v-for="filterType in availableFilterTypes" :key="filterType.type" :value="filterType.type">{{ filterType.name }}</option>
          </select>
          <small class="form-help">Choose how users will interact with this filter</small>
        </div>
        <div v-if="form.type === 'dropdown'" class="form-group">
          <label class="form-label">Display</label>
          <div class="filter-mode-options">
            <label class="filter-mode-option" :class="{ active: form.displayMode === 'dropdown' }">
              <input type="radio" v-model="form.displayMode" value="dropdown" />
              <span>Dropdown</span>
            </label>
            <label class="filter-mode-option" :class="{ active: form.displayMode === 'list' }">
              <input type="radio" v-model="form.displayMode" value="list" />
              <span>List</span>
            </label>
            <label class="filter-mode-option" :class="{ active: form.displayMode === 'buttons' }">
              <input type="radio" v-model="form.displayMode" value="buttons" />
              <span>Buttons</span>
            </label>
          </div>
          <small class="form-help">Dropdown: searchable input. List: all options visible. Buttons: option chips.</small>
        </div>
        <div v-if="form.type === 'dropdown'" class="form-group">
          <label class="form-label">Selection</label>
          <div class="filter-mode-options">
            <label class="filter-mode-option" :class="{ active: form.selectionMode === 'single' }">
              <input type="radio" v-model="form.selectionMode" value="single" />
              <span>Single</span>
            </label>
            <label class="filter-mode-option" :class="{ active: form.selectionMode === 'multi' }">
              <input type="radio" v-model="form.selectionMode" value="multi" />
              <span>Multiple</span>
            </label>
          </div>
          <small class="form-help">Single: one value at a time. Multiple: select several values.</small>
        </div>
        <div v-if="form.type === 'dropdown'" class="form-group">
          <label class="form-label" for="filter-editor-behavior">Filter Behavior</label>
          <select id="filter-editor-behavior" v-model="form.behavior" class="form-select">
            <option value="value">Filter by Value</option>
            <option value="value-name-pair">Filter by Value/Name Pair</option>
          </select>
          <small class="form-help"><strong>Value:</strong> Filter directly by the field value<br><strong>Value/Name Pair:</strong> Filter by ID but display name</small>
        </div>
      </div>

      <div class="column-right">
        <h5 class="column-title">Data Model</h5>
        <div v-if="form.type === 'dropdown'" class="form-group">
          <label class="form-label" for="filter-editor-data-model">Select Data Model</label>
          <select id="filter-editor-data-model" v-model="form.dataModelId" class="form-select">
            <option value="">Choose Data Model</option>
            <optgroup v-if="dashboardDataModels.length > 0" label="Dashboard Data Models">
              <option v-for="dataModel in dashboardDataModels" :key="dataModel.id" :value="dataModel.id">{{ dataModel.name }} · {{ dataModel.sourceName }}</option>
            </optgroup>
            <optgroup label="All Available Data Models">
              <option v-for="dataModel in allAvailableDataModels" :key="dataModel.id" :value="dataModel.id" :disabled="dashboardDataModels.some(model => model.id === dataModel.id)">{{ dataModel.name }} · {{ dataModel.sourceName }}</option>
            </optgroup>
          </select>
          <small class="form-help">Select the model that will provide the dropdown values.</small>
        </div>
        <div v-if="form.type !== 'dropdown'" class="form-group">
          <small class="form-help">Choose the target data model or component field on the Target Components tab.</small>
        </div>
        <div v-if="form.type === 'dropdown' && form.dataModelId" class="form-group">
          <div v-if="requiredParameterLabels.length > 0" class="parameter-binding-help" role="status">
            Required SQL parameters: {{ requiredParameterLabels.join(', ') }}.
          </div>
          <label class="form-label" for="filter-editor-field">Filter Field</label>
          <select id="filter-editor-field" v-model="form.field" class="form-select" @change="emit('fieldSelectionChange')">
            <option value="">Select Field</option>
            <option v-for="field in availableFields" :key="field.name" :value="field.name">{{ fieldLabel(field) }}</option>
          </select>
          <small class="form-help">Choose the field that supplies this filter's values.</small>
        </div>
        <div v-if="form.behavior === 'value-name-pair' && form.type === 'dropdown' && form.dataModelId" class="form-group">
          <label class="form-label" for="filter-editor-display-field">Display Field (Name)</label>
          <select id="filter-editor-display-field" v-model="form.displayField" class="form-select">
            <option value="">Select display field</option>
            <option v-for="field in availableFields" :key="field.name" :value="field.name">{{ fieldLabel(field) }}</option>
          </select>
          <small class="form-help">Field to show in the UI (e.g., CompanyName)</small>
        </div>
        <div v-if="form.type === 'freeText'" class="form-group">
          <label class="form-label" for="filter-editor-placeholder">Placeholder Text</label>
          <input id="filter-editor-placeholder" v-model="form.placeholder" type="text" class="form-input" placeholder="Enter placeholder text (e.g., 'Search by name')" />
        </div>
        <div v-if="form.type === 'datePicker'" class="form-group">
          <label class="form-label filter-checkbox-label"><input v-model="form.includeTime" type="checkbox" class="form-checkbox" /> Include Time (Hours & Minutes)</label>
          <small class="form-help">Enable to filter by date and time, disable for date-only filtering</small>
          <label class="form-label mt-2" for="filter-editor-date-picker-display">Date Picker Style</label>
          <select id="filter-editor-date-picker-display" v-model="form.datePickerDisplayMode" class="form-select mb-2">
            <option value="native">Default input</option>
            <option value="split-date-time">Split date/time field</option>
          </select>
          <small class="form-help">Split date/time field uses a report-style date picker and a separate time dropdown.</small>
          <label class="form-label" for="filter-editor-default-date">Default Date</label>
          <select id="filter-editor-default-date" v-model="form.defaultDatePreset" class="form-select mb-2">
            <option value="">No Default</option>
            <option value="start_of_last_month">Start of Last Month</option>
            <option value="end_of_last_month">End of Last Month</option>
            <option value="start_of_month">Start of Month</option>
            <option value="end_of_month">End of Month</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
          </select>
          <small class="form-help">Choose a default date for this filter</small>
          <label class="form-label">Date Range Constraints</label>
          <div class="date-range-inputs">
            <input v-model="form.minDate" type="date" class="form-input" placeholder="Min date" aria-label="Min date" />
            <span class="date-separator">to</span>
            <input v-model="form.maxDate" type="date" class="form-input" placeholder="Max date" aria-label="Max date" />
          </div>
          <small class="form-help">Optional: Set minimum and maximum date constraints</small>
        </div>
        <div v-if="form.type === 'dateRange'" class="form-group">
          <label class="form-label filter-checkbox-label"><input v-model="form.includeTime" type="checkbox" class="form-checkbox" /> Include Time (Hours & Minutes)</label>
          <small class="form-help">Enable to filter by date and time, disable for date-only filtering</small>
          <label class="form-label mt-2" for="filter-editor-date-range-display">Date Range Style</label>
          <select id="filter-editor-date-range-display" v-model="form.dateRangeDisplayMode" class="form-select mb-2">
            <option value="button">Default picker</option>
            <option value="inline">Inline fields</option>
            <option value="datetime-fields">Split date/time fields</option>
            <option value="range-picker">Two-month range picker</option>
          </select>
          <small class="form-help">Default keeps the current dashboard picker. Split date/time fields use separate date and time controls. Two-month range picker uses two Start/End boxes and a two-month popup.</small>
          <label class="form-label filter-checkbox-label mt-2"><input v-model="form.showRangeNavigation" type="checkbox" class="form-checkbox" /> Show Previous/Next Navigation</label>
          <small class="form-help">Adds quick month/week/year navigation next to the picker</small>
          <label class="form-label" for="filter-editor-date-range">Default Date Range</label>
          <select id="filter-editor-date-range" v-model="form.dateRangePreset" class="form-select mb-2">
            <option value="">No Default (User must select)</option>
            <option value="custom">Custom Dates</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="last_90_days">Last 90 Days</option>
            <option value="this_week">This Week</option>
            <option value="last_week">Last Week</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_quarter">This Quarter</option>
            <option value="last_quarter">Last Quarter</option>
            <option value="this_year">This Year</option>
            <option value="last_year">Last Year</option>
          </select>
          <small class="form-help">Choose a dynamic date range that updates automatically based on current date</small>
          <div v-if="form.dateRangePreset === 'custom'" class="date-range-inputs mt-2">
            <input v-model="form.defaultStartDate" :type="form.includeTime ? 'datetime-local' : 'date'" class="form-input" :placeholder="form.includeTime ? 'Default start date & time' : 'Default start date'" aria-label="Default start date" />
            <span class="date-separator">to</span>
            <input v-model="form.defaultEndDate" :type="form.includeTime ? 'datetime-local' : 'date'" class="form-input" :placeholder="form.includeTime ? 'Default end date & time' : 'Default end date'" aria-label="Default end date" />
          </div>
        </div>
        <div v-if="form.type === 'periodFilter'" class="form-group">
          <label class="form-label filter-checkbox-label"><input v-model="form.includeTime" type="checkbox" class="form-checkbox" /> Include Time (Hours & Minutes)</label>
          <small class="form-help">Use datetime values for API parameters such as From and To.</small>
          <label class="form-label mt-2" for="filter-editor-period-display">Presentation</label>
          <select id="filter-editor-period-display" v-model="form.periodDisplayMode" class="form-select mb-2">
            <option value="segmented">Segmented</option>
            <option value="toolbar">Toolbar</option>
          </select>
          <small class="form-help">Segmented is compact. Toolbar shows tabs, period label, and previous/next controls on the canvas.</small>
          <div class="date-range-inputs mt-2">
            <label class="compact-field">
              <span>Background</span>
              <input v-model="periodBackgroundColorInput" type="color" class="form-input color-input" aria-label="Period filter background color" />
            </label>
            <label class="compact-field">
              <span>Accent</span>
              <input v-model="periodActiveColorInput" type="color" class="form-input color-input" aria-label="Period filter accent color" />
            </label>
          </div>
          <div class="date-range-inputs mt-2">
            <label class="compact-field">
              <span>Background value</span>
              <input v-model="form.periodBackgroundColor" type="text" class="form-input" placeholder="#ffffff or transparent" aria-label="Period filter background value" />
            </label>
            <label class="compact-field">
              <span>Accent value</span>
              <input v-model="form.periodActiveColor" type="text" class="form-input" placeholder="#2563eb" aria-label="Period filter accent value" />
            </label>
          </div>
          <button type="button" class="secondary-button mt-2" @click="setPeriodNoBackground">No Background</button>
          <small class="form-help">Use transparent for no filter background, or leave blank to inherit the dashboard theme.</small>
          <label class="form-label mt-2" for="filter-editor-period-navigation">Navigation</label>
          <select id="filter-editor-period-navigation" v-model="form.periodNavigationStyle" class="form-select mb-2">
            <option value="text">Text buttons</option>
            <option value="icons">Icon buttons</option>
          </select>
          <label class="form-label mt-2" for="filter-editor-period-date-picker-theme">Date Picker Theme</label>
          <select id="filter-editor-period-date-picker-theme" v-model="form.periodDatePickerTheme" class="form-select mb-2">
            <option value="default">Default</option>
            <option value="legacy">Legacy report</option>
            <option value="minimal">Minimal</option>
          </select>
          <small class="form-help">Controls the selected-date input styling inside the period filter.</small>
          <label class="form-label filter-checkbox-label mt-2"><input v-model="form.periodShowTabIcons" type="checkbox" class="form-checkbox" /> Show tab icons</label>
          <label v-if="form.periodShowTabIcons" class="compact-field mt-2">
            <span>Tab icon</span>
            <input v-model="form.periodTabIcon" type="text" class="form-input" placeholder="Optional shared icon" aria-label="Period tab icon" />
          </label>
          <label class="form-label filter-checkbox-label mt-2"><input v-model="form.showPeriodBottomDivider" type="checkbox" class="form-checkbox" /> Show bottom divider</label>
          <small class="form-help">Controls the horizontal line below the toolbar date controls.</small>
          <label class="form-label mt-2" for="filter-editor-default-period">Default Period</label>
          <select id="filter-editor-default-period" v-model="form.defaultPeriod" class="form-select mb-2">
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
            <option value="range">Range</option>
          </select>
          <label class="form-label" for="filter-editor-period-options">Period Tabs</label>
          <textarea
            id="filter-editor-period-options"
            v-model="form.periodOptionsText"
            class="form-input period-options-textarea"
            rows="5"
            spellcheck="false"
          />
          <small class="form-help">One tab per line: id|Label|unit|rangeType|rangeFrequency|icon. The icon column is optional and overrides the shared tab icon.</small>
          <div class="date-range-inputs mt-2">
            <label class="compact-field">
              <span>Week starts on</span>
              <select v-model.number="form.weekStartsOn" class="form-select">
                <option :value="0">Sunday</option>
                <option :value="1">Monday</option>
                <option :value="6">Saturday</option>
              </select>
            </label>
            <label class="compact-field">
              <span>Fiscal month</span>
              <input v-model.number="form.fiscalStartMonth" type="number" class="form-input" min="1" max="12" />
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-mode-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.filter-mode-option {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 6px 12px;
}
.filter-mode-option input[type="radio"] {
  display: none;
}
.filter-mode-option.active {
  border-color: #2563eb;
  background: color-mix(in srgb, #2563eb 10%, var(--surface));
  color: #2563eb;
}
.form-label.filter-checkbox-label,
.inline-checkbox.filter-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  line-height: 1.25;
}
.form-label.filter-checkbox-label input[type="checkbox"],
.inline-checkbox.filter-checkbox-label input[type="checkbox"] {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  min-height: 16px;
  margin: 0;
  transform: none;
}
.parameter-binding-help {
  border: 1px solid #fde68a;
  border-radius: 6px;
  background: #fffbeb;
  color: #92400e;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 10px;
  padding: 8px 10px;
}
.period-options-textarea {
  min-height: 118px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  resize: vertical;
}
.compact-field {
  display: grid;
  gap: 4px;
  min-width: 0;
  flex: 1 1 160px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.color-input {
  min-height: 34px;
  padding: 2px;
}
</style>
