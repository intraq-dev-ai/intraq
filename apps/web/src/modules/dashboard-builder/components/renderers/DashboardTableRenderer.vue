<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DashboardElement } from '../../types';
import type { VisualizationDataRequestContext } from '../../visualization/data';
import type { DashboardTableModel } from '../../visualization/element-view-model';
import {
  sortTableRows,
  tableCellSearchText
} from '../../visualization/table-filter-runtime';
import DashboardTableActionDialog from './DashboardTableActionDialog.vue';
import DashboardTableBody from './DashboardTableBody.vue';
import DashboardTableDrillBanner from './DashboardTableDrillBanner.vue';
import DashboardTableFooter from './DashboardTableFooter.vue';
import DashboardTableHeader from './DashboardTableHeader.vue';
import DashboardTablePagination from './DashboardTablePagination.vue';
import DashboardTableSpreadsheetToolbar from './DashboardTableSpreadsheetToolbar.vue';
import DashboardTableToolbar from './DashboardTableToolbar.vue';
import { csvCell, isGroupRow, rowKey, spreadsheetColumnLabel } from './dashboard-table-renderer-utils';
import { useDashboardTableDrill } from './useDashboardTableDrill';
import { useDashboardTableExpansion } from './useDashboardTableExpansion';
import { useDashboardTableFilters } from './useDashboardTableFilters';
import { useDashboardTableGrouping } from './useDashboardTableGrouping';
import { useDashboardTableSelection } from './useDashboardTableSelection';
import { useDashboardTableSorts } from './useDashboardTableSorts';

const props = defineProps<{
  element: DashboardElement;
  hasStateMessage: boolean;
  isLoading: boolean;
  model: DashboardTableModel;
  runtimeParameterValues?: Record<string, unknown> | undefined;
  stateDetail: string;
  stateTitle: string;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>();

const tableCurrentPage = ref(1);
const tableSearch = ref('');
const tableSelectedPageSize = ref<number | null>(null);
let clearSelection = (): void => {};
let clearCollapsedGroups = (): void => {};

const elementRef = computed(() => props.element);
const modelRef = computed(() => props.model);
const runtimeParameterValuesRef = computed(() => props.runtimeParameterValues);
const tableHasToolbar = computed(() =>
  Boolean(
    props.element.config?.enableSearch
    || props.element.config?.enableExport
    || props.element.config?.showExecutionTime
  )
);

const {
  actionDialog,
  clearDrill,
  closeRowAction,
  displayColumns,
  drillState,
  runRowAction,
  sourceRows
} = useDashboardTableDrill({
  elementName: computed(() => props.element.name),
  model: modelRef,
  onDrillChange: () => {
    clearSelection();
    clearCollapsedGroups();
    tableCurrentPage.value = 1;
  }
});
const currentDrillState = computed(() => drillState.value);

const {
  allVisibleFilterOptionsSelected,
  applyTableFilter,
  canClearTableFilter,
  clearTableFilter,
  closeTableColumnFilter,
  filteredTableRows,
  hasTableColumnFilter,
  isTableColumnFilterable,
  isTableColumnFilterOpen,
  setTableFilterMode,
  setTableFilterValueSelected,
  setVisibleTableFilterOptionsSelected,
  someVisibleFilterOptionsSelected,
  tableColumnFilterId,
  tableColumnFilterStatusText,
  tableFilterDraft,
  tableFilterPopoverStyle,
  tableFilters,
  toggleTableColumnFilter,
  visibleTableFilterOptions
} = useDashboardTableFilters({
  displayColumns,
  elementId: computed(() => props.element.id),
  filtersEnabled: computed(() => props.element.config?.enableFilters === true),
  sourceRows
});

const {
  columnSortDirection,
  sortTableBy,
  tableAriaSort,
  tableSorts
} = useDashboardTableSorts(modelRef, displayColumns);

const tableRows = computed(() => {
  const query = tableSearch.value.trim().toLowerCase();
  if (!query) return filteredTableRows.value;
  return filteredTableRows.value.filter(row => row.cells.some(cell => tableCellSearchText(cell.display, cell.raw).includes(query)));
});
const sortedTableRows = computed(() => sortTableRows(tableRows.value, displayColumns.value, tableSorts.value));
const tablePageSize = computed(() => tableSelectedPageSize.value ?? props.model.pagination?.pageSize ?? sortedTableRows.value.length);
const tableTotalPages = computed(() => props.model.pagination?.enabled ? Math.max(1, Math.ceil(sortedTableRows.value.length / tablePageSize.value)) : 1);
const tablePageOptions = computed(() => props.model.pagination?.pageSizeOptions ?? [tablePageSize.value]);
const tableVisiblePages = computed(() => Array.from({ length: tableTotalPages.value }, (_unused, index) => index + 1));
const tablePageStart = computed(() => sortedTableRows.value.length === 0 ? 0 : ((Math.min(tableCurrentPage.value, tableTotalPages.value) - 1) * tablePageSize.value) + 1);
const tablePageEnd = computed(() => Math.min(tablePageStart.value + tablePageSize.value - 1, sortedTableRows.value.length));
const tableRangeText = computed(() => props.model.pagination?.enabled
  ? `Showing ${tablePageStart.value}-${tablePageEnd.value} of ${sortedTableRows.value.length} rows`
  : `Showing ${sortedTableRows.value.length} rows`);
const pagedTableRows = computed(() => {
  if (!props.model.pagination?.enabled) return sortedTableRows.value;
  const page = Math.min(tableCurrentPage.value, tableTotalPages.value);
  const start = (page - 1) * tablePageSize.value;
  return sortedTableRows.value.slice(start, start + tablePageSize.value);
});
const tableFooterRows = computed(() => drillState.value ? [] : props.model.footerRows ?? []);
const visibleRowKeys = computed(() => pagedTableRows.value.map((row, index) => rowKey(row, index)));

const selection = useDashboardTableSelection(elementRef, visibleRowKeys);
clearSelection = selection.clearSelection;
const {
  allVisibleRowsSelected,
  isRowSelected,
  onRowSelectionChange,
  onToggleVisibleRows,
  selectAllAriaChecked,
  tableRowSelectionEnabled
} = selection;

const expansion = useDashboardTableExpansion({
  drillState: currentDrillState,
  element: elementRef,
  rows: computed(() => props.model.rows),
  runtimeParameterValues: runtimeParameterValuesRef
});
const {
  expansionCellClass,
  expansionCellTabIndex,
  expansionCellTitle,
  onExpansionCellClick,
  onExpansionCellKeydown,
  rowCanExpand,
  rowExpansionConfig,
  rowExpansionStyle,
  rowIsExpanded,
  tableRowExpansionEnabled,
  tableRowExpansionShowsButton,
  toggleRowExpansion
} = expansion;

const grouping = useDashboardTableGrouping({
  displayColumns,
  drillState: currentDrillState,
  model: modelRef,
  pagedTableRows
});
clearCollapsedGroups = grouping.clearCollapsedGroups;
const {
  groupLabelStyle,
  groupLabelText,
  groupRowStyle,
  groupSummaryText,
  isGroupCollapsed,
  tableGroupingControlsEnabled,
  toggleGroup,
  visibleTableItems
} = grouping;

const spreadsheetMode = computed(() => props.model.tableFormat === 'spreadsheet' || props.element.config?.tableFormat === 'spreadsheet');
const spreadsheetTabs = computed(() => {
  const configured = props.element.config?.spreadsheetToolbarTabs;
  if (Array.isArray(configured)) {
    const tabs = configured.flatMap(item => typeof item === 'string' && item.trim() ? [item.trim()] : []);
    if (tabs.length > 0) return tabs;
  }
  return ['HOME', 'INSERT', 'DATA'];
});
const spreadsheetColumnLetters = computed(() => displayColumns.value.map((_column, index) => spreadsheetColumnLabel(index)));
const tableHasLeadingControls = computed(() =>
  spreadsheetMode.value
  || tableRowSelectionEnabled.value
  || tableGroupingControlsEnabled.value
  || (tableRowExpansionEnabled.value && tableRowExpansionShowsButton.value)
);
const tableColumnSpan = computed(() => Math.max(displayColumns.value.length + (tableHasLeadingControls.value ? 1 : 0), 1));
const tableRootStyle = computed(() => ({
  ...(props.model.rootStyle ?? {}),
  ...rowExpansionStyle.value
}));

watch(() => props.model.pagination?.pageSize, pageSize => {
  tableSelectedPageSize.value = pageSize ?? null;
}, { immediate: true });

watch(() => `${tableSearch.value}:${JSON.stringify(tableFilters.value)}:${JSON.stringify(tableSorts.value)}:${drillState.value?.field ?? ''}:${drillState.value?.value ?? ''}:${sortedTableRows.value.length}:${tablePageSize.value}`, () => {
  tableCurrentPage.value = 1;
});

function downloadTableCsv(): void {
  const header = displayColumns.value.map(column => csvCell(column.label)).join(',');
  const rows = sortedTableRows.value.map(row => row.cells.map(cell => csvCell(cell.display)).join(','));
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${props.element.id}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function onTableClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('[data-action-id]');
  if (!button) return;
  const rowElement = button.closest<HTMLTableRowElement>('tr[data-row-index]');
  const rowIndex = Number(rowElement?.dataset.rowIndex ?? '-1');
  const row = rowIndex >= 0 ? visibleTableItems.value[rowIndex] : null;
  if (!row || isGroupRow(row)) return;
  runRowAction({
    actionId: button.dataset.actionId ?? '',
    label: button.dataset.actionLabel ?? button.textContent?.trim() ?? 'Action',
    row,
    rowIndex
  });
}
</script>

<template>
  <div
    class="dashboard-table-component"
    :data-display-mode="model.displayMode ?? 'comfortable'"
    :data-table-format="model.tableFormat ?? 'default'"
    :style="tableRootStyle"
  >
    <DashboardTableToolbar
      v-if="tableHasToolbar"
      v-model:search="tableSearch"
      :element="element"
      @export-csv="downloadTableCsv"
    />
    <DashboardTableDrillBanner
      v-if="drillState"
      :drill-state="drillState"
      :matching-row-count="sortedTableRows.length"
      @clear="clearDrill"
    />
    <DashboardTableSpreadsheetToolbar
      v-if="spreadsheetMode"
      :columns="displayColumns"
      :tabs="spreadsheetTabs"
    />
    <table :aria-label="`Table component ${element.name}`" @click="onTableClick">
      <DashboardTableHeader
        v-model:filter-draft="tableFilterDraft"
        :all-visible-filter-options-selected="allVisibleFilterOptionsSelected"
        :all-visible-rows-selected="allVisibleRowsSelected"
        :can-clear-table-filter="canClearTableFilter"
        :column-sort-direction="columnSortDirection"
        :columns="displayColumns"
        :element-name="element.name"
        :has-leading-controls="tableHasLeadingControls"
        :has-table-column-filter="hasTableColumnFilter"
        :is-table-column-filterable="isTableColumnFilterable"
        :is-table-column-filter-open="isTableColumnFilterOpen"
        :select-all-aria-checked="selectAllAriaChecked"
        :some-visible-filter-options-selected="someVisibleFilterOptionsSelected"
        :spreadsheet-column-letters="spreadsheetColumnLetters"
        :spreadsheet-mode="spreadsheetMode"
        :table-aria-sort="tableAriaSort"
        :table-column-filter-id="tableColumnFilterId"
        :table-column-filter-status-text="tableColumnFilterStatusText"
        :table-filter-popover-style="tableFilterPopoverStyle"
        :table-row-selection-enabled="tableRowSelectionEnabled"
        :visible-table-filter-options="visibleTableFilterOptions"
        @apply-filter="applyTableFilter"
        @clear-filter="clearTableFilter"
        @close-filter="closeTableColumnFilter"
        @set-filter-mode="setTableFilterMode"
        @sort="sortTableBy"
        @toggle-filter="toggleTableColumnFilter"
        @toggle-filter-value="setTableFilterValueSelected"
        @toggle-visible-filter-options="setVisibleTableFilterOptionsSelected"
        @toggle-visible-rows="onToggleVisibleRows"
      />
      <DashboardTableBody
        :display-columns="displayColumns"
        :element="element"
        :expansion-cell-class="expansionCellClass"
        :expansion-cell-tab-index="expansionCellTabIndex"
        :expansion-cell-title="expansionCellTitle"
        :group-label-style="groupLabelStyle"
        :group-label-text="groupLabelText"
        :group-row-style="groupRowStyle"
        :group-summary-text="groupSummaryText"
        :has-state-message="hasStateMessage"
        :is-group-collapsed="isGroupCollapsed"
        :is-loading="isLoading"
        :is-row-selected="isRowSelected"
        :on-expansion-cell-click="onExpansionCellClick"
        :on-expansion-cell-keydown="onExpansionCellKeydown"
        :on-row-selection-change="onRowSelectionChange"
        :row-can-expand="rowCanExpand"
        :row-expansion-config="rowExpansionConfig"
        :row-is-expanded="rowIsExpanded"
        :runtime-parameter-values="runtimeParameterValues"
        :sorted-row-count="sortedTableRows.length"
        :spreadsheet-mode="spreadsheetMode"
        :state-detail="stateDetail"
        :state-title="stateTitle"
        :table-column-span="tableColumnSpan"
        :table-has-leading-controls="tableHasLeadingControls"
        :table-row-expansion-enabled="tableRowExpansionEnabled"
        :table-row-expansion-shows-button="tableRowExpansionShowsButton"
        :table-row-selection-enabled="tableRowSelectionEnabled"
        :toggle-group="toggleGroup"
        :toggle-row-expansion="toggleRowExpansion"
        :visible-table-items="visibleTableItems"
        :visualization-request="visualizationRequest"
        @row-action="runRowAction"
      />
      <DashboardTableFooter
        :columns="displayColumns"
        :footer-rows="tableFooterRows"
        :sorted-row-count="sortedTableRows.length"
        :spreadsheet-mode="spreadsheetMode"
        :table-has-leading-controls="tableHasLeadingControls"
        @row-action="runRowAction"
      />
    </table>
    <DashboardTablePagination
      v-if="model.pagination?.enabled"
      v-model:current-page="tableCurrentPage"
      v-model:selected-page-size="tableSelectedPageSize"
      :element-name="element.name"
      :page-options="tablePageOptions"
      :range-text="tableRangeText"
      :total-pages="tableTotalPages"
      :visible-pages="tableVisiblePages"
    />
    <DashboardTableActionDialog
      v-if="actionDialog"
      :dialog="actionDialog"
      @close="closeRowAction"
    />
  </div>
</template>
