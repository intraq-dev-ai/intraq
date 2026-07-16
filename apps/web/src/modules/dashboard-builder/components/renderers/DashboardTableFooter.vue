<script setup lang="ts">
import type { DashboardTableColumn, DashboardTableRow } from '../../visualization/view-model-types';
import DashboardTableCellRenderer from '../DashboardTableCellRenderer.vue';
import type { TableRowActionPayload } from './dashboard-table-renderer-types';
import { rowKey } from './dashboard-table-renderer-utils';

defineProps<{
  columns: DashboardTableColumn[];
  footerRows: DashboardTableRow[];
  sortedRowCount: number;
  spreadsheetMode: boolean;
  tableHasLeadingControls: boolean;
}>();

const emit = defineEmits<{
  rowAction: [payload: TableRowActionPayload];
}>();
</script>

<template>
  <tfoot v-if="footerRows.length > 0">
    <tr v-for="(row, rowIndex) in footerRows" :key="`footer-${rowKey(row, rowIndex)}`" class="is-total dashboard-table-total-row">
      <td v-if="tableHasLeadingControls" class="dashboard-table-control-cell is-total">
        <span v-if="spreadsheetMode" class="dashboard-table-spreadsheet-row-number">{{ sortedRowCount + rowIndex + 2 }}</span>
      </td>
      <DashboardTableCellRenderer
        v-for="(cell, index) in row.cells"
        :key="`footer-${row.key}-${index}`"
        :cell="cell"
        :column="columns[index]"
        :row="row"
        :row-index="rowIndex"
        @action="emit('rowAction', $event)"
      />
    </tr>
  </tfoot>
</template>
