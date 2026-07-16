<script setup lang="ts">
import type { DashboardTableColumn } from '../../visualization/view-model-types';
import type { TableFilterOption } from '../../visualization/table-filter-runtime';
import {
  tableFilterOperators,
  tableFilterOperatorShowsCaseSensitive,
  tableFilterOperatorShowsRange,
  tableFilterOperatorShowsSingleValue,
  tableFilterOptionCountLabel
} from './dashboard-table-filter-helpers';
import type { TableFilterDraftState, TableFilterMode } from './dashboard-table-renderer-types';

const filterDraft = defineModel<TableFilterDraftState>('filterDraft', { required: true });

const props = defineProps<{
  allVisibleOptionsSelected: boolean;
  canClear: boolean;
  column: DashboardTableColumn;
  filterId: string;
  popoverStyle: Record<string, string>;
  someVisibleOptionsSelected: boolean;
  statusText: string;
  visibleOptions: TableFilterOption[];
}>();

const emit = defineEmits<{
  apply: [columnKey: string];
  clear: [columnKey: string];
  close: [];
  setMode: [mode: TableFilterMode];
  toggleValue: [value: string, checked: boolean];
  toggleVisibleOptions: [checked: boolean];
}>();

function setMode(mode: TableFilterMode): void {
  emit('setMode', mode);
}

function onToggleVisibleOptions(event: Event): void {
  emit('toggleVisibleOptions', (event.target as HTMLInputElement).checked);
}

function onToggleValue(value: string, event: Event): void {
  emit('toggleValue', value, (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <form
    :id="filterId"
    class="dashboard-table-column-filter"
    :style="popoverStyle"
    :aria-label="`Column filter for ${column.label}`"
    @click.stop
    @keydown.esc.stop.prevent="emit('close')"
    @submit.stop.prevent="emit('apply', column.key)"
  >
    <div class="dashboard-table-column-filter-modes" role="group" :aria-label="`Filter modes for ${column.label}`">
      <button type="button" :aria-pressed="filterDraft.mode === 'excel'" @click="setMode('excel')">Values</button>
      <button type="button" :aria-pressed="filterDraft.mode === 'advanced'" @click="setMode('advanced')">Advanced</button>
    </div>
    <template v-if="filterDraft.mode === 'excel'">
      <label>
        <span>Search values</span>
        <input v-model="filterDraft.valueSearch" type="search" placeholder="Search values">
      </label>
      <label class="dashboard-table-column-filter-checkbox">
        <input
          type="checkbox"
          :checked="allVisibleOptionsSelected"
          :aria-checked="someVisibleOptionsSelected ? 'mixed' : allVisibleOptionsSelected ? 'true' : 'false'"
          @change="onToggleVisibleOptions"
        >
        <span>Select all</span>
      </label>
      <div class="dashboard-table-column-filter-values" role="group" :aria-label="`Values for ${column.label}`">
        <label
          v-for="option in visibleOptions"
          :key="option.value"
          class="dashboard-table-column-filter-checkbox"
        >
          <input
            type="checkbox"
            :checked="filterDraft.selectedValues.includes(option.value)"
            @change="onToggleValue(option.value, $event)"
          >
          <span>{{ option.label }}</span>
          <small>{{ tableFilterOptionCountLabel(option) }}</small>
        </label>
        <p v-if="visibleOptions.length === 0" class="dashboard-table-filter-status">No values match search.</p>
      </div>
    </template>
    <template v-else>
      <label>
        <span>Operator</span>
        <select v-model="filterDraft.operator">
          <option v-for="operator in tableFilterOperators" :key="operator.value" :value="operator.value">{{ operator.label }}</option>
        </select>
      </label>
      <label v-if="tableFilterOperatorShowsSingleValue(filterDraft.operator ?? 'contains')">
        <span>Value</span>
        <input v-model="filterDraft.query" type="search" :placeholder="filterDraft.operator === 'in_list' ? 'Value 1, value 2' : 'Type to filter rows'">
      </label>
      <div v-else-if="tableFilterOperatorShowsRange(filterDraft.operator ?? 'contains')" class="dashboard-table-column-filter-range">
        <label>
          <span>Minimum</span>
          <input v-model="filterDraft.query" type="search" placeholder="Min">
        </label>
        <label>
          <span>Maximum</span>
          <input v-model="filterDraft.secondaryQuery" type="search" placeholder="Max">
        </label>
      </div>
      <label v-if="tableFilterOperatorShowsCaseSensitive(filterDraft.operator ?? 'contains')" class="dashboard-table-column-filter-checkbox">
        <input v-model="filterDraft.caseSensitive" type="checkbox">
        <span>Case sensitive</span>
      </label>
    </template>
    <div class="dashboard-table-column-filter-actions">
      <button
        type="button"
        :disabled="!canClear"
        @click="emit('clear', column.key)"
      >
        Clear
      </button>
      <button type="submit">Apply</button>
    </div>
    <p v-if="statusText" class="dashboard-table-filter-status">{{ statusText }}</p>
  </form>
</template>
