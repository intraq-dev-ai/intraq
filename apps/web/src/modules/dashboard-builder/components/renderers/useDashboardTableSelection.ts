import { computed, ref, type ComputedRef } from 'vue';
import type { DashboardElement } from '../../types';
import type { DashboardTableRow } from '../../visualization/view-model-types';
import { rowKey } from './dashboard-table-renderer-utils';

export function useDashboardTableSelection(
  element: ComputedRef<DashboardElement>,
  visibleRowKeys: ComputedRef<string[]>
) {
  const selectedRowKeys = ref<Set<string>>(new Set());
  const tableRowSelectionEnabled = computed(() => element.value.config?.enableRowSelection === true || element.value.config?.rowSelection === true);
  const selectedVisibleCount = computed(() => visibleRowKeys.value.filter(key => selectedRowKeys.value.has(key)).length);
  const allVisibleRowsSelected = computed(() => visibleRowKeys.value.length > 0 && selectedVisibleCount.value === visibleRowKeys.value.length);
  const selectAllAriaChecked = computed<'false' | 'mixed' | 'true'>(() => {
    if (allVisibleRowsSelected.value) return 'true';
    return selectedVisibleCount.value > 0 ? 'mixed' : 'false';
  });

  function clearSelection(): void {
    selectedRowKeys.value = new Set();
  }

  function isRowSelected(row: DashboardTableRow, index: number): boolean {
    return selectedRowKeys.value.has(rowKey(row, index));
  }

  function setRowSelection(row: DashboardTableRow, index: number, selected: boolean): void {
    const next = new Set(selectedRowKeys.value);
    const key = rowKey(row, index);
    if (selected) next.add(key);
    else next.delete(key);
    selectedRowKeys.value = next;
  }

  function toggleVisibleRows(selected: boolean): void {
    if (!tableRowSelectionEnabled.value) return;
    const next = new Set(selectedRowKeys.value);
    visibleRowKeys.value.forEach(key => {
      if (selected) next.add(key);
      else next.delete(key);
    });
    selectedRowKeys.value = next;
  }

  function onToggleVisibleRows(event: Event): void {
    toggleVisibleRows((event.target as HTMLInputElement).checked);
  }

  function onRowSelectionChange(row: DashboardTableRow, index: number, event: Event): void {
    if (!tableRowSelectionEnabled.value) return;
    setRowSelection(row, index, (event.target as HTMLInputElement).checked);
  }

  return {
    allVisibleRowsSelected,
    clearSelection,
    isRowSelected,
    onRowSelectionChange,
    onToggleVisibleRows,
    selectAllAriaChecked,
    tableRowSelectionEnabled
  };
}
