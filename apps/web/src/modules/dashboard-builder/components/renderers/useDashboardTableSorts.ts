import { ref, watch, type ComputedRef } from 'vue';
import type { DashboardTableColumn, DashboardTableModel } from '../../visualization/view-model-types';
import { normalizeTableSorts, type TableSortState } from '../../visualization/table-filter-runtime';

export function useDashboardTableSorts(
  model: ComputedRef<DashboardTableModel>,
  displayColumns: ComputedRef<DashboardTableColumn[]>
) {
  const tableSorts = ref<TableSortState[]>([]);

  watch(() => {
    const modelSorts = 'sorts' in model.value && Array.isArray((model.value as DashboardTableModel & { sorts?: TableSortState[] }).sorts)
      ? (model.value as DashboardTableModel & { sorts?: TableSortState[] }).sorts ?? []
      : model.value.sort ? [model.value.sort] : [];
    return JSON.stringify(modelSorts);
  }, () => {
    const modelSorts = 'sorts' in model.value && Array.isArray((model.value as DashboardTableModel & { sorts?: TableSortState[] }).sorts)
      ? (model.value as DashboardTableModel & { sorts?: TableSortState[] }).sorts ?? []
      : model.value.sort ? [model.value.sort] : [];
    tableSorts.value = normalizeTableSorts(modelSorts);
  }, { immediate: true });

  watch(() => displayColumns.value.map(column => column.key).join('|'), () => {
    tableSorts.value = tableSorts.value.filter(sort => displayColumns.value.some(column => column.key === sort.key));
  }, { immediate: true });

  function sortTableBy(column: DashboardTableColumn, event: MouseEvent): void {
    if (column.sortable === false) return;
    const existingIndex = tableSorts.value.findIndex(sort => sort.key === column.key);
    const existing = tableSorts.value.find(sort => sort.key === column.key);
    const next = !existing ? { key: column.key, direction: 'asc' as const } : existing.direction === 'asc' ? { key: column.key, direction: 'desc' as const } : null;
    if (!event.shiftKey) {
      tableSorts.value = next ? [next] : [];
      return;
    }
    const nextSorts = [...tableSorts.value];
    if (existingIndex >= 0) {
      if (next) nextSorts.splice(existingIndex, 1, next);
      else nextSorts.splice(existingIndex, 1);
    } else if (next) {
      nextSorts.push(next);
    }
    tableSorts.value = nextSorts;
  }

  function tableAriaSort(column: DashboardTableColumn): 'ascending' | 'descending' | 'none' | 'other' {
    const index = tableSorts.value.findIndex(sort => sort.key === column.key);
    if (index < 0) return 'none';
    if (index > 0) return 'other';
    return tableSorts.value[index]?.direction === 'asc' ? 'ascending' : 'descending';
  }

  function columnSortDirection(column: DashboardTableColumn): 'asc' | 'desc' | null {
    const sort = tableSorts.value.find(s => s.key === column.key);
    return sort?.direction ?? null;
  }

  return {
    columnSortDirection,
    sortTableBy,
    tableAriaSort,
    tableSorts
  };
}
