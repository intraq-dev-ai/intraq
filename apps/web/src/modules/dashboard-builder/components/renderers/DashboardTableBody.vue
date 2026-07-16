<script setup lang="ts">
import type { DashboardElement } from '../../types';
import type { VisualizationDataRequestContext } from '../../visualization/data';
import type { DashboardTableColumn, DashboardTableGroupRow, DashboardTableGroupTotalRow, DashboardTableRow } from '../../visualization/view-model-types';
import type { DashboardTableRowExpansionConfig } from '../../visualization/table-row-expansion';
import DashboardTableCellRenderer from '../DashboardTableCellRenderer.vue';
import DashboardTableExpansionTable from './DashboardTableExpansionTable.vue';
import type { DashboardTableRenderableRow, TableRowActionPayload } from './dashboard-table-renderer-types';
import { isDashboardTableRow, isGroupedChildRow, isGroupRow, isGroupTotalRow, rowKey } from './dashboard-table-renderer-utils';

defineProps<{
  displayColumns: DashboardTableColumn[];
  element: DashboardElement;
  expansionCellClass: (row: DashboardTableRenderableRow, cellIndex: number) => Record<string, boolean>;
  expansionCellTabIndex: (row: DashboardTableRenderableRow, cellIndex: number) => number | undefined;
  expansionCellTitle: (row: DashboardTableRenderableRow, rowIndex: number, cellIndex: number) => string | undefined;
  groupLabelStyle: (row: DashboardTableGroupRow) => Record<string, string>;
  groupLabelText: (row: DashboardTableGroupRow) => string;
  groupRowStyle: (row: DashboardTableGroupRow | DashboardTableGroupTotalRow) => Record<string, string>;
  groupSummaryText: (row: DashboardTableGroupRow) => string;
  hasStateMessage: boolean;
  isGroupCollapsed: (row: DashboardTableGroupRow) => boolean;
  isLoading: boolean;
  isRowSelected: (row: DashboardTableRow, index: number) => boolean;
  onExpansionCellClick: (row: DashboardTableRenderableRow, rowIndex: number, cellIndex: number, event: MouseEvent) => void;
  onExpansionCellKeydown: (row: DashboardTableRenderableRow, rowIndex: number, cellIndex: number, event: KeyboardEvent) => void;
  onRowSelectionChange: (row: DashboardTableRow, index: number, event: Event) => void;
  rowCanExpand: (row: DashboardTableRow) => boolean;
  rowExpansionConfig: DashboardTableRowExpansionConfig | null;
  rowIsExpanded: (row: DashboardTableRow, index: number) => boolean;
  runtimeParameterValues?: Record<string, unknown> | undefined;
  sortedRowCount: number;
  spreadsheetMode: boolean;
  stateDetail: string;
  stateTitle: string;
  tableColumnSpan: number;
  tableHasLeadingControls: boolean;
  tableRowExpansionEnabled: boolean;
  tableRowExpansionShowsButton: boolean;
  tableRowSelectionEnabled: boolean;
  toggleGroup: (row: DashboardTableGroupRow) => void;
  toggleRowExpansion: (row: DashboardTableRow, index: number) => void;
  visibleTableItems: DashboardTableRenderableRow[];
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>();

const emit = defineEmits<{
  rowAction: [payload: TableRowActionPayload];
}>();
</script>

<template>
  <tbody>
    <tr v-if="hasStateMessage || sortedRowCount === 0">
      <td :colspan="tableColumnSpan">
        <div class="dashboard-render-state table-state">
          <span v-if="isLoading" class="dashboard-render-spinner" aria-hidden="true"></span>
          <p class="dashboard-render-state-title">{{ stateTitle }}</p>
          <p v-if="stateDetail" class="dashboard-render-state-detail">{{ stateDetail }}</p>
        </div>
      </td>
    </tr>
    <template v-else>
      <template v-for="(row, rowIndex) in visibleTableItems" :key="rowKey(row, rowIndex)">
        <tr
          :class="{ 'is-group': isGroupRow(row), 'is-group-total': isGroupTotalRow(row), 'is-group-child': isGroupedChildRow(row) }"
          :data-row-index="rowIndex"
          :style="isGroupRow(row) || isGroupTotalRow(row) ? groupRowStyle(row) : undefined"
        >
          <template v-if="isGroupRow(row)">
            <td v-if="tableHasLeadingControls" class="dashboard-table-control-cell">
              <span v-if="spreadsheetMode" class="dashboard-table-spreadsheet-row-number">{{ rowIndex + 2 }}</span>
              <button
                v-else
                type="button"
                :aria-expanded="!isGroupCollapsed(row)"
                :aria-label="`${isGroupCollapsed(row) ? 'Expand' : 'Collapse'} group ${row.label}`"
                @click="toggleGroup(row)"
              >
                <span aria-hidden="true">{{ isGroupCollapsed(row) ? '▶' : '▼' }}</span>
              </button>
            </td>
            <th scope="row">
              <span class="dashboard-table-group-label" :style="groupLabelStyle(row)">{{ groupLabelText(row) }}</span>
              <span v-if="groupSummaryText(row)" class="dashboard-table-group-total">{{ groupSummaryText(row) }}</span>
            </th>
            <DashboardTableCellRenderer
              v-for="(cell, index) in row.cells.slice(1)"
              :key="`${row.key}-${index + 1}`"
              :cell="cell"
              :column="displayColumns[index + 1]"
              :row="row"
              :row-index="rowIndex"
              @action="emit('rowAction', $event)"
            />
          </template>
          <template v-else-if="isGroupTotalRow(row)">
            <td v-if="tableHasLeadingControls" class="dashboard-table-control-cell">
              <span v-if="spreadsheetMode" class="dashboard-table-spreadsheet-row-number">{{ rowIndex + 2 }}</span>
            </td>
            <DashboardTableCellRenderer
              v-for="(cell, index) in row.cells"
              :key="`${row.key}-${index}`"
              :cell="cell"
              :column="displayColumns[index]"
              :row="row"
              :row-index="rowIndex"
              @action="emit('rowAction', $event)"
            />
          </template>
          <template v-else>
            <td v-if="tableHasLeadingControls" class="dashboard-table-control-cell">
              <span v-if="spreadsheetMode" class="dashboard-table-spreadsheet-row-number">{{ rowIndex + 2 }}</span>
              <button
                v-if="!spreadsheetMode && tableRowExpansionEnabled && tableRowExpansionShowsButton && rowCanExpand(row)"
                type="button"
                class="dashboard-table-expansion-toggle"
                :aria-expanded="rowIsExpanded(row, rowIndex)"
                :aria-label="`${rowIsExpanded(row, rowIndex) ? 'Collapse' : 'Expand'} ${row.cells[0]?.display ?? 'row'}`"
                @click="toggleRowExpansion(row, rowIndex)"
              >
                <span aria-hidden="true">{{ rowIsExpanded(row, rowIndex) ? '-' : '+' }}</span>
              </button>
              <input
                v-if="!spreadsheetMode && tableRowSelectionEnabled"
                type="checkbox"
                :aria-label="`Select row ${rowKey(row, rowIndex)}`"
                :checked="isRowSelected(row, rowIndex)"
                @change="onRowSelectionChange(row, rowIndex, $event)"
              >
            </td>
            <DashboardTableCellRenderer
              v-for="(cell, index) in row.cells"
              :key="`${row.key}-${index}`"
              :cell="cell"
              :column="displayColumns[index]"
              :row="row"
              :row-index="rowIndex"
              :class="expansionCellClass(row, index)"
              :tabindex="expansionCellTabIndex(row, index)"
              :title="expansionCellTitle(row, rowIndex, index)"
              @action="emit('rowAction', $event)"
              @click="onExpansionCellClick(row, rowIndex, index, $event)"
              @keydown="onExpansionCellKeydown(row, rowIndex, index, $event)"
            />
          </template>
        </tr>
        <tr
          v-if="tableRowExpansionEnabled && isDashboardTableRow(row) && rowIsExpanded(row, rowIndex) && rowExpansionConfig"
          class="dashboard-table-expanded-row"
        >
          <td :colspan="tableColumnSpan">
            <DashboardTableExpansionTable
              :base-parameter-values="runtimeParameterValues"
              :level-index="0"
              :levels="rowExpansionConfig.levels"
              :owner-element="element"
              :parent-row="row"
              :root-row="row"
              :visualization-request="visualizationRequest"
            />
          </td>
        </tr>
      </template>
    </template>
  </tbody>
</template>
