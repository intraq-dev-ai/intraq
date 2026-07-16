<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DashboardMatrixModel, DashboardMatrixRow } from '../../visualization/element-view-model';
import type { DashboardMatrixColumnHeaderCell, DashboardMatrixColumnHeaderRow, DashboardMatrixRowHeaderCell, DashboardMatrixValueHeader } from '../../visualization/view-model-types';
import type { DashboardMatrixCellMeta } from '../../visualization/view-model-types';
import { visibleMatrixColumnIndexes } from './matrix-collapse';

const props = defineProps<{
  elementName: string;
  hasStateMessage: boolean;
  isLoading: boolean;
  model: DashboardMatrixModel;
  stateDetail: string;
  stateTitle: string;
}>();

const collapsedRowGroups = ref(new Set<string>());
const collapsedColumnGroups = ref(new Set<string>());
const showAllColumns = ref(false);
const showAllRows = ref(false);
const rowHeaderFields = computed(() => props.model.rowHeaderFields?.length
  ? props.model.rowHeaderFields
  : [{ field: '__row__', label: props.model.rowHeaderLabel ?? '' }]
);
const valueHeaders = computed<DashboardMatrixValueHeader[]>(() => props.model.valueHeaders?.length
  ? props.model.valueHeaders
  : [{ field: '__value__', key: '__value__', label: props.model.valueHeaderLabel ?? 'Value' }]
);
const rowTotalHeaders = computed<DashboardMatrixValueHeader[]>(() => {
  if (!props.model.showRowTotals) return [];
  return valueHeaders.value.length > 1 ? valueHeaders.value : [{ field: '__total__', key: '__total__', label: 'Total' }];
});
const valueHeaderCount = computed(() => Math.max(valueHeaders.value.length, 1));
const hasMultipleValueHeaders = computed(() => valueHeaders.value.length > 1);
const matrixColumnSpan = computed(() => Math.max(
  visibleColumnIndexes.value.length + rowHeaderFields.value.length + rowTotalHeaders.value.length,
  1
));
const matrixHeaderRows = computed(() => props.model.columnHeaderRows ?? []);
const hasGroupedHeaders = computed(() => matrixHeaderRows.value.length > 0);
const groupedHeaderRowSpan = computed(() => Math.max(matrixHeaderRows.value.length, 1));
const canCollapseRows = computed(() => props.model.enableRowExpandCollapse === true && props.model.rowDataDisplayMode === 'merge');
const canCollapseColumns = computed(() =>
  props.model.enableColumnExpandCollapse === true
  && props.model.columnDataDisplayMode === 'merge'
  && hasGroupedHeaders.value
);
const defaultCollapseSignature = computed(() => JSON.stringify({
  column: props.model.defaultColumnCollapseState,
  columnGroups: defaultCollapsedColumnGroups(),
  row: props.model.defaultRowCollapseState,
  rowGroups: defaultCollapsedRowGroups()
}));
const allVisibleColumnIndexes = computed(() => {
  if (!canCollapseColumns.value) return props.model.columns.map((_, index) => index);
  const columnGroupIds = props.model.columnGroupIds;
  return columnGroupIds?.length === props.model.columns.length
    ? visibleMatrixColumnIndexes(columnGroupIds, collapsedColumnGroups.value)
    : props.model.columns.map((_, index) => index);
});
const matrixColumnLimit = computed(() => props.model.maxVisibleColumns ?? 50);
const matrixRowLimit = computed(() => props.model.maxVisibleRows ?? 1000);
const visibleColumnIndexes = computed(() => showAllColumns.value
  ? allVisibleColumnIndexes.value
  : allVisibleColumnIndexes.value.slice(0, matrixColumnLimit.value)
);
const visibleColumns = computed(() => visibleColumnIndexes.value.map(index => props.model.columns[index] ?? ''));
const visibleHeaderRows = computed<DashboardMatrixColumnHeaderRow[]>(() => matrixHeaderRows.value.map(row => ({
  cells: row.cells.flatMap(cell => visibleHeaderCell(cell))
})));
const displayRows = computed(() => {
  const rows = !canCollapseRows.value ? props.model.rows : collapsedDisplayRows();
  return showAllRows.value ? rows : rows.slice(0, matrixRowLimit.value);
});
const hasLimitedColumns = computed(() => allVisibleColumnIndexes.value.length > matrixColumnLimit.value);
const hasLimitedRows = computed(() => baseDisplayRows.value.length > matrixRowLimit.value);
const baseDisplayRows = computed(() => canCollapseRows.value ? collapsedDisplayRows() : props.model.rows);

function collapsedDisplayRows(): DashboardMatrixRow[] {
  const seen = new Set<string>();
  return props.model.rows.filter(row => {
    const collapsedParent = collapsedParentCell(row);
    if (!collapsedParent) return true;
    const visible = !seen.has(collapsedParent.groupId);
    seen.add(collapsedParent.groupId);
    return visible;
  });
}

watch(defaultCollapseSignature, () => {
  collapsedRowGroups.value = props.model.defaultRowCollapseState === 'collapsed'
    ? new Set(defaultCollapsedRowGroups())
    : new Set<string>();
  collapsedColumnGroups.value = props.model.defaultColumnCollapseState === 'collapsed'
    ? new Set(defaultCollapsedColumnGroups())
    : new Set<string>();
}, { immediate: true });

function matrixColumnStyle(column: string): Record<string, string> {
  const width = props.model.columnWidths?.[column];
  return fixedWidthStyle(width);
}

function visibleHeaderCell(cell: DashboardMatrixColumnHeaderCell): DashboardMatrixColumnHeaderCell[] {
  const indexes = (cell.columnIndexes ?? []).filter(index => visibleColumnIndexes.value.includes(index));
  return indexes.length ? [{ ...cell, columnIndexes: indexes, colspan: indexes.length }] : [];
}

function matrixHeaderStyle(kind: 'row' | 'value'): Record<string, string> {
  const width = kind === 'row' ? props.model.rowHeaderWidth : props.model.valueHeaderWidth;
  return { ...(props.model.styles?.header ?? {}), ...fixedWidthStyle(width) };
}

function matrixColumnHeaderStyle(column: string, index: number): Record<string, string> {
  return {
    ...(props.model.styles?.header ?? {}),
    ...matrixColumnStyle(column),
    ...(props.model.columnHeaderMeta?.[index]?.style ?? {})
  };
}

function matrixGroupedColumnHeaderStyle(cell: DashboardMatrixColumnHeaderCell): Record<string, string> {
  return { ...(props.model.styles?.header ?? {}), ...(cell.meta?.style ?? {}) };
}

function matrixHeaderClass(meta: DashboardMatrixCellMeta | undefined): Array<Record<string, boolean> | string> {
  return [{ [`tone-${meta?.tone ?? 'neutral'}`]: Boolean(meta), 'is-formatted': Boolean(meta) }, ...(meta?.formatClasses ?? [])];
}

function rowHeaderCellClass(row: DashboardMatrixRow, rowIndex: number, cellIndex: number): Record<string, boolean> {
  return {
    'is-empty': rowHeaderText(row, rowIndex, cellIndex).length === 0,
    'is-grouped': rowHeaderCell(row, cellIndex).hasChildren
  };
}

function rowHeaderCellStyle(row: DashboardMatrixRow, cellIndex: number): Record<string, string> {
  const cell = rowHeaderCell(row, cellIndex);
  return {
    ...matrixHeaderStyle('row'),
    ...(props.model.styles?.rowHeader ?? {}),
    ...(cell.meta?.style ?? {}),
    '--matrix-row-depth': String(cell.depth)
  };
}

function fallbackRowHeaderCell(row: DashboardMatrixRow): DashboardMatrixRowHeaderCell {
  return { depth: 0, field: '__row__', groupId: row.groupLabel ?? row.label, hasChildren: false, isGroupStart: true, label: row.label };
}

function rowHeaderCell(row: DashboardMatrixRow, index: number): DashboardMatrixRowHeaderCell {
  return row.rowHeaderCells?.[index] ?? fallbackRowHeaderCell(row);
}

function matrixRowClass(row: DashboardMatrixRow): Record<string, boolean> {
  return { 'is-subtotal': row.isSubtotal === true, 'is-total': row.isTotal === true };
}

function matrixCellClass(row: DashboardMatrixRow, index: number): Array<Record<string, boolean> | string> {
  const meta = row.cellMeta?.[index];
  return [{ 'dashboard-matrix-value-divider': hasValueDivider(index), 'is-numeric': true }, ...matrixHeaderClass(meta)];
}

function matrixCellStyle(row: DashboardMatrixRow, index: number): Record<string, string> {
  return { ...(props.model.styles?.cell ?? {}), ...(row.cellMeta?.[index]?.style ?? {}) };
}

function visibleRowCells(row: DashboardMatrixRow): Array<{ cell: string; index: number }> {
  return visibleColumnIndexes.value.map(index => ({ cell: row.cells[index] ?? '', index }));
}

function visibleRowTotals(row: DashboardMatrixRow): string[] {
  if (!props.model.showRowTotals) return [];
  if (row.rowTotals?.length) return row.rowTotals;
  return [row.total];
}

function hasValueDivider(index: number): boolean {
  return hasMultipleValueHeaders.value && (index % valueHeaderCount.value) > 0;
}

function collapsedParentCell(row: DashboardMatrixRow): DashboardMatrixRowHeaderCell | null {
  return row.rowHeaderCells?.slice(0, -1).find(cell => collapsedRowGroups.value.has(cell.groupId)) ?? null;
}

function rowHeaderText(row: DashboardMatrixRow, rowIndex: number, cellIndex: number): string {
  const cell = rowHeaderCell(row, cellIndex);
  if (row.isTotal) return cellIndex === 0 ? row.label : '';
  if (props.model.rowDataDisplayMode !== 'merge') return cell.label;
  const collapsedParent = collapsedParentCell(row);
  if (collapsedParent && cell.depth > collapsedParent.depth) return '';
  const previous = displayRows.value[rowIndex - 1];
  return previous && rowHeaderCell(previous, cellIndex).groupId === cell.groupId ? '' : cell.label;
}

function showRowToggle(row: DashboardMatrixRow, rowIndex: number, cellIndex: number): boolean {
  if (!canCollapseRows.value || row.isSubtotal || row.isTotal) return false;
  const cell = rowHeaderCell(row, cellIndex);
  return cell.hasChildren && rowHeaderText(row, rowIndex, cellIndex).length > 0;
}

function toggleRowGroup(groupId: string): void {
  const next = new Set(collapsedRowGroups.value);
  if (next.has(groupId)) next.delete(groupId);
  else next.add(groupId);
  collapsedRowGroups.value = next;
}

function defaultCollapsedRowGroups(): string[] {
  if (!canCollapseRows.value) return [];
  return Array.from(new Set(props.model.rows.flatMap(row =>
    (row.rowHeaderCells ?? []).filter(cell => cell.hasChildren).map(cell => cell.groupId)
  )));
}

function defaultCollapsedColumnGroups(): string[] {
  if (!canCollapseColumns.value) return [];
  return Array.from(new Set(matrixHeaderRows.value.flatMap(row =>
    row.cells.filter(cell => showColumnToggle(cell) && cell.groupId).map(cell => cell.groupId ?? '')
  ).filter(Boolean)));
}

function showColumnToggle(cell: DashboardMatrixColumnHeaderCell): boolean {
  return canCollapseColumns.value && cell.hasChildren === true && Boolean(cell.groupId);
}

function toggleColumnGroup(groupId: string): void {
  const next = new Set(collapsedColumnGroups.value);
  if (next.has(groupId)) next.delete(groupId);
  else next.add(groupId);
  collapsedColumnGroups.value = next;
}

function isColumnGroupCollapsed(groupId: string | undefined): boolean {
  return Boolean(groupId && collapsedColumnGroups.value.has(groupId));
}

function rootStyle(): Record<string, string> {
  return {
    ...(props.model.styles?.root ?? {}),
    ...(props.model.styles?.borderColor ? { '--dashboard-matrix-border-color': props.model.styles.borderColor } : {})
  };
}

function fixedWidthStyle(width: string | undefined): Record<string, string> {
  return width ? { maxWidth: width, minWidth: width, width } : {};
}

function matrixRowKey(row: DashboardMatrixRow, rowIndex: number): string {
  return `${row.label}:${row.isSubtotal === true ? 'subtotal' : row.isTotal === true ? 'total' : 'row'}:${rowIndex}`;
}
</script>

<template>
  <div
    class="dashboard-matrix-component"
    :data-display-mode="model.displayMode ?? 'comfortable'"
    :data-renderer-state="hasStateMessage ? 'state' : 'ready'"
    :data-show-borders="model.showBorders === true ? 'true' : 'false'"
    :data-table-format="model.tableFormat ?? 'default'"
    :style="rootStyle()"
  >
    <div v-if="hasLimitedRows || hasLimitedColumns" class="dashboard-matrix-size-warning" role="status">
      <span>Large matrix</span>
      <button v-if="hasLimitedRows" type="button" @click="showAllRows = !showAllRows">
        {{ showAllRows ? 'Show fewer rows' : `Show all ${baseDisplayRows.length} rows` }}
      </button>
      <button v-if="hasLimitedColumns" type="button" @click="showAllColumns = !showAllColumns">
        {{ showAllColumns ? 'Show fewer columns' : `Show all ${allVisibleColumnIndexes.length} columns` }}
      </button>
    </div>
    <table :aria-label="`Matrix component ${elementName}`">
      <thead>
        <template v-if="hasGroupedHeaders">
          <tr v-for="(headerRow, rowIndex) in visibleHeaderRows" :key="`matrix-header-${rowIndex}`">
            <th v-for="field in rowIndex === 0 ? rowHeaderFields : []" :key="field.field" scope="col" :rowspan="groupedHeaderRowSpan" :style="matrixHeaderStyle('row')" :title="field.label">{{ field.label }}</th>
            <th
              v-for="(cell, cellIndex) in headerRow.cells"
              :key="cell.key"
              class="dashboard-matrix-column-group"
              :colspan="cell.colspan"
              :class="[
                ...matrixHeaderClass(cell.meta),
                { 'dashboard-matrix-value-divider': rowIndex === groupedHeaderRowSpan - 1 && hasValueDivider(cellIndex) }
              ]"
              :scope="cell.scope"
              :style="matrixGroupedColumnHeaderStyle(cell)"
              :title="cell.label"
            >
              <button
                v-if="showColumnToggle(cell)"
                class="dashboard-matrix-toggle"
                type="button"
                :aria-expanded="!isColumnGroupCollapsed(cell.groupId)"
                :aria-label="`${isColumnGroupCollapsed(cell.groupId) ? 'Expand' : 'Collapse'} ${cell.label}`"
                @click="toggleColumnGroup(cell.groupId ?? '')"
              >
                {{ isColumnGroupCollapsed(cell.groupId) ? '+' : '-' }}
              </button>
              <span>{{ cell.label }}</span>
            </th>
            <th v-if="rowTotalHeaders.length === 1 && rowIndex === 0" scope="col" :rowspan="groupedHeaderRowSpan" title="Total">Total</th>
            <template v-else-if="rowTotalHeaders.length > 1">
              <th v-if="rowIndex === 0" scope="colgroup" :colspan="rowTotalHeaders.length" title="Total">Total</th>
              <th
                v-else-if="rowIndex === groupedHeaderRowSpan - 1"
                v-for="(header, totalIndex) in rowTotalHeaders"
                :key="`matrix-total-header-${header.key}`"
                scope="col"
                :class="{ 'dashboard-matrix-value-divider': hasValueDivider(totalIndex) }"
                :style="matrixHeaderStyle('value')"
                :title="header.label"
              >
                {{ header.label }}
              </th>
            </template>
          </tr>
        </template>
        <tr v-else>
          <th v-for="field in rowHeaderFields" :key="field.field" scope="col" :style="matrixHeaderStyle('row')" :title="field.label">{{ field.label }}</th>
          <th
            v-for="(column, columnIndex) in visibleColumns"
            :key="column"
            :class="matrixHeaderClass(model.columnHeaderMeta?.[visibleColumnIndexes[columnIndex] ?? columnIndex])"
            scope="col"
            :style="matrixColumnHeaderStyle(column, visibleColumnIndexes[columnIndex] ?? columnIndex)"
            :title="model.columnHeaderLabel"
          >
            {{ column }}
          </th>
          <th
            v-for="(header, totalIndex) in rowTotalHeaders"
            :key="`matrix-total-header-${header.key}`"
            scope="col"
            :class="{ 'dashboard-matrix-value-divider': hasValueDivider(totalIndex) }"
            :style="matrixHeaderStyle('value')"
            :title="header.label"
          >
            {{ rowTotalHeaders.length > 1 ? header.label : 'Total' }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="hasStateMessage || displayRows.length === 0">
          <td :colspan="matrixColumnSpan">
            <div class="dashboard-render-state table-state">
              <span v-if="isLoading" class="dashboard-render-spinner" aria-hidden="true"></span>
              <p class="dashboard-render-state-title">{{ stateTitle }}</p>
              <p v-if="stateDetail" class="dashboard-render-state-detail">{{ stateDetail }}</p>
            </div>
          </td>
        </tr>
        <template v-else>
          <tr v-for="(row, rowIndex) in displayRows" :key="matrixRowKey(row, rowIndex)" :class="matrixRowClass(row)">
            <th
              v-for="(_, cellIndex) in rowHeaderFields"
              :key="`${row.label}-row-${cellIndex}`"
              :class="[rowHeaderCellClass(row, rowIndex, cellIndex), ...matrixHeaderClass(rowHeaderCell(row, cellIndex).meta)]"
              :style="rowHeaderCellStyle(row, cellIndex)"
              :title="rowHeaderText(row, rowIndex, cellIndex)"
              scope="row"
            >
              <button
                v-if="showRowToggle(row, rowIndex, cellIndex)"
                class="dashboard-matrix-toggle"
                type="button"
                :aria-expanded="!collapsedRowGroups.has(rowHeaderCell(row, cellIndex).groupId)"
                :aria-label="`${collapsedRowGroups.has(rowHeaderCell(row, cellIndex).groupId) ? 'Expand' : 'Collapse'} ${rowHeaderText(row, rowIndex, cellIndex)}`"
                @click="toggleRowGroup(rowHeaderCell(row, cellIndex).groupId)"
              >
                {{ collapsedRowGroups.has(rowHeaderCell(row, cellIndex).groupId) ? '+' : '-' }}
              </button>
              <span>{{ rowHeaderText(row, rowIndex, cellIndex) }}</span>
            </th>
            <td
              v-for="{ cell, index } in visibleRowCells(row)"
              :key="`${row.label}-${index}`"
              :class="matrixCellClass(row, index)"
              :style="matrixCellStyle(row, index)"
              :title="cell"
            >
              {{ cell }}
            </td>
            <td
              v-for="(totalCell, totalIndex) in visibleRowTotals(row)"
              :key="`${row.label}-total-${totalIndex}`"
              :class="['dashboard-matrix-row-total', { 'dashboard-matrix-value-divider': hasValueDivider(totalIndex) }]"
              :title="totalCell"
            >
              {{ totalCell }}
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
