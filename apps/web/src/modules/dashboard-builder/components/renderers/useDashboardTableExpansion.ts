import { computed, ref, watch, type ComputedRef } from 'vue';
import type { DashboardElement } from '../../types';
import type { DashboardTableRow } from '../../visualization/view-model-types';
import {
  canExpandTableRow,
  readTableRowExpansionConfig,
  tableRowExpansionKey
} from '../../visualization/table-row-expansion';
import type { DashboardTableRenderableRow, TableDrillState } from './dashboard-table-renderer-types';
import { isDashboardTableRow } from './dashboard-table-renderer-utils';

interface UseDashboardTableExpansionParams {
  drillState: ComputedRef<TableDrillState | null>;
  element: ComputedRef<DashboardElement>;
  rows: ComputedRef<DashboardTableRow[]>;
  runtimeParameterValues: ComputedRef<Record<string, unknown> | undefined>;
}

export function useDashboardTableExpansion(params: UseDashboardTableExpansionParams) {
  const expandedRowKeys = ref<Set<string>>(new Set());
  const rowExpansionConfig = computed(() => params.drillState.value ? null : readTableRowExpansionConfig(params.element.value.config));
  const tableRowExpansionEnabled = computed(() => Boolean(rowExpansionConfig.value));
  const tableRowExpansionShowsButton = computed(() => rowExpansionConfig.value?.triggerMode !== 'first-cell');
  const tableRowExpansionUsesFirstCell = computed(() =>
    rowExpansionConfig.value?.triggerMode === 'first-cell'
    || rowExpansionConfig.value?.triggerMode === 'first-cell-and-button'
  );
  const rowExpansionStyle = computed(() => rowExpansionPresentationStyle());

  watch(() => JSON.stringify({
    expansion: rowExpansionConfig.value,
    rows: params.rows.value.map(row => row.key),
    runtime: params.runtimeParameterValues.value
  }), () => {
    expandedRowKeys.value = new Set();
  });

  function expansionKey(row: DashboardTableRow, index: number): string {
    return tableRowExpansionKey(row, index, rowExpansionConfig.value?.rowKeyField);
  }

  function rowCanExpand(row: DashboardTableRow): boolean {
    return Boolean(rowExpansionConfig.value) && canExpandTableRow(row, rowExpansionConfig.value?.rowKeyField);
  }

  function rowIsExpanded(row: DashboardTableRow, index: number): boolean {
    return expandedRowKeys.value.has(expansionKey(row, index));
  }

  function toggleRowExpansion(row: DashboardTableRow, index: number): void {
    const key = expansionKey(row, index);
    const next = new Set(expandedRowKeys.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedRowKeys.value = next;
  }

  function isFirstCellExpansionTrigger(
    row: DashboardTableRenderableRow,
    cellIndex: number
  ): row is DashboardTableRow {
    return tableRowExpansionUsesFirstCell.value
      && cellIndex === 0
      && isDashboardTableRow(row)
      && rowCanExpand(row);
  }

  function expansionCellClass(row: DashboardTableRenderableRow, cellIndex: number): Record<string, boolean> {
    return {
      'dashboard-table-cell--expansion-trigger': isFirstCellExpansionTrigger(row, cellIndex)
    };
  }

  function expansionCellTabIndex(row: DashboardTableRenderableRow, cellIndex: number): number | undefined {
    return isFirstCellExpansionTrigger(row, cellIndex) ? 0 : undefined;
  }

  function expansionCellTitle(row: DashboardTableRenderableRow, rowIndex: number, cellIndex: number): string | undefined {
    if (!isFirstCellExpansionTrigger(row, cellIndex)) return undefined;
    return `${rowIsExpanded(row, rowIndex) ? 'Collapse' : 'Expand'} ${row.cells[0]?.display ?? 'row'}`;
  }

  function onExpansionCellClick(row: DashboardTableRenderableRow, rowIndex: number, cellIndex: number, event: MouseEvent): void {
    if (!isFirstCellExpansionTrigger(row, cellIndex)) return;
    const target = event.target;
    if (target instanceof Element && target.closest('a, button, input, select, textarea')) return;
    toggleRowExpansion(row, rowIndex);
  }

  function onExpansionCellKeydown(row: DashboardTableRenderableRow, rowIndex: number, cellIndex: number, event: KeyboardEvent): void {
    if (!isFirstCellExpansionTrigger(row, cellIndex)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleRowExpansion(row, rowIndex);
  }

  function rowExpansionPresentationStyle(): Record<string, string> {
    const config = rowExpansionConfig.value;
    if (!config) return {};
    return {
      ...(config.triggerTextColor ? { '--dashboard-table-expansion-trigger-color': config.triggerTextColor } : {}),
      ...(config.triggerTextHoverColor ? { '--dashboard-table-expansion-trigger-hover-color': config.triggerTextHoverColor } : {}),
      ...(config.triggerTextDecoration ? { '--dashboard-table-expansion-trigger-decoration': config.triggerTextDecoration } : {}),
      ...(config.triggerTextHoverDecoration ? { '--dashboard-table-expansion-trigger-hover-decoration': config.triggerTextHoverDecoration } : {})
    };
  }

  return {
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
  };
}
