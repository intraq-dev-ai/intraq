<script setup lang="ts">
import type { DashboardTableColumn } from '../../visualization/view-model-types';
import type { TableFilterOption } from '../../visualization/table-filter-runtime';
import DashboardTableColumnFilter from './DashboardTableColumnFilter.vue';
import { tableColumnStyle, tableHeaderContentStyle } from './dashboard-table-renderer-utils';
import type { TableFilterDraftState, TableFilterMode } from './dashboard-table-renderer-types';

const filterDraft = defineModel<TableFilterDraftState>('filterDraft', { required: true });

defineProps<{
  allVisibleFilterOptionsSelected: boolean;
  allVisibleRowsSelected: boolean;
  canClearTableFilter: (columnKey: string) => boolean;
  columnSortDirection: (column: DashboardTableColumn) => 'asc' | 'desc' | null;
  columns: DashboardTableColumn[];
  elementName: string;
  hasLeadingControls: boolean;
  hasTableColumnFilter: (column: DashboardTableColumn) => boolean;
  isTableColumnFilterable: (column: DashboardTableColumn) => boolean;
  isTableColumnFilterOpen: (column: DashboardTableColumn) => boolean;
  selectAllAriaChecked: 'false' | 'mixed' | 'true';
  someVisibleFilterOptionsSelected: boolean;
  spreadsheetColumnLetters: string[];
  spreadsheetMode: boolean;
  tableAriaSort: (column: DashboardTableColumn) => 'ascending' | 'descending' | 'none' | 'other';
  tableColumnFilterId: (column: DashboardTableColumn) => string;
  tableColumnFilterStatusText: (column: DashboardTableColumn) => string;
  tableFilterPopoverStyle: Record<string, string>;
  tableRowSelectionEnabled: boolean;
  visibleTableFilterOptions: TableFilterOption[];
}>();

const emit = defineEmits<{
  applyFilter: [columnKey: string];
  clearFilter: [columnKey: string];
  closeFilter: [];
  setFilterMode: [mode: TableFilterMode];
  sort: [column: DashboardTableColumn, event: MouseEvent];
  toggleFilter: [column: DashboardTableColumn, event: MouseEvent];
  toggleFilterValue: [value: string, checked: boolean];
  toggleVisibleFilterOptions: [checked: boolean];
  toggleVisibleRows: [event: Event];
}>();
</script>

<template>
  <thead>
    <tr v-if="spreadsheetMode" class="dashboard-table-spreadsheet-column-row">
      <th scope="col" class="dashboard-table-control-cell dashboard-table-spreadsheet-corner"></th>
      <th
        v-for="(column, columnIndex) in columns"
        :key="`spreadsheet-column-${column.key}-${columnIndex}`"
        scope="col"
        class="dashboard-table-spreadsheet-column-letter"
        :style="tableColumnStyle(column)"
      >
        {{ spreadsheetColumnLetters[columnIndex] }}
      </th>
    </tr>
    <tr>
      <th
        v-if="hasLeadingControls"
        scope="col"
        class="dashboard-table-control-cell"
        :aria-label="spreadsheetMode ? 'Spreadsheet row numbers' : tableRowSelectionEnabled ? 'Row selection controls' : 'Group controls'"
      >
        <span v-if="spreadsheetMode" class="dashboard-table-spreadsheet-row-number">1</span>
        <input
          v-else-if="tableRowSelectionEnabled"
          type="checkbox"
          :aria-label="`Select visible rows for ${elementName}`"
          :aria-checked="selectAllAriaChecked"
          :checked="allVisibleRowsSelected"
          @change="emit('toggleVisibleRows', $event)"
        >
      </th>
      <th
        v-for="(column, columnIndex) in columns"
        :key="`${column.key}-${columnIndex}`"
        scope="col"
        :aria-sort="tableAriaSort(column)"
        :style="tableColumnStyle(column)"
      >
        <div class="dashboard-table-header-content" :style="tableHeaderContentStyle(column)">
          <button v-if="column.sortable !== false" class="dashboard-table-sort-button" type="button" :aria-label="`Sort by ${column.label}`" @click="emit('sort', column, $event)">
            <span>{{ column.label }}</span>
            <svg v-if="columnSortDirection(column) === 'asc'" aria-hidden="true" class="dashboard-table-sort-icon dashboard-table-sort-icon--active" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
            </svg>
            <svg v-else-if="columnSortDirection(column) === 'desc'" aria-hidden="true" class="dashboard-table-sort-icon dashboard-table-sort-icon--active" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
            <svg v-else aria-hidden="true" class="dashboard-table-sort-icon dashboard-table-sort-icon--idle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/>
            </svg>
          </button>
          <span v-else class="dashboard-table-header-label">{{ column.label }}</span>
          <button
            v-if="isTableColumnFilterable(column)"
            class="dashboard-table-column-filter-button"
            :class="{ 'is-active': hasTableColumnFilter(column) }"
            type="button"
            :aria-controls="tableColumnFilterId(column)"
            :aria-expanded="isTableColumnFilterOpen(column)"
            :aria-label="hasTableColumnFilter(column) ? `Filter ${column.label} active` : `Filter ${column.label}`"
            @click.stop="emit('toggleFilter', column, $event)"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M3 4h14l-5.2 6v4.2l-3.6 1.8V10L3 4Z" fill="currentColor"></path>
            </svg>
          </button>
        </div>
        <DashboardTableColumnFilter
          v-if="isTableColumnFilterOpen(column)"
          v-model:filter-draft="filterDraft"
          :all-visible-options-selected="allVisibleFilterOptionsSelected"
          :can-clear="canClearTableFilter(column.key)"
          :column="column"
          :filter-id="tableColumnFilterId(column)"
          :popover-style="tableFilterPopoverStyle"
          :some-visible-options-selected="someVisibleFilterOptionsSelected"
          :status-text="tableColumnFilterStatusText(column)"
          :visible-options="visibleTableFilterOptions"
          @apply="emit('applyFilter', $event)"
          @clear="emit('clearFilter', $event)"
          @close="emit('closeFilter')"
          @set-mode="emit('setFilterMode', $event)"
          @toggle-value="(value, checked) => emit('toggleFilterValue', value, checked)"
          @toggle-visible-options="emit('toggleVisibleFilterOptions', $event)"
        />
      </th>
    </tr>
  </thead>
</template>
