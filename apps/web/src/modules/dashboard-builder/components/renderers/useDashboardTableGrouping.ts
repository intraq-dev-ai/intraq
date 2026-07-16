import { computed, ref, watch, type ComputedRef } from 'vue';
import type { DashboardTableColumn, DashboardTableGroupRow, DashboardTableGroupTotalRow, DashboardTableModel, DashboardTableRow } from '../../visualization/view-model-types';
import { groupedTableRows, type TableGroupRenderOptions } from '../../visualization/table-filter-runtime';
import type { DashboardTableRenderableRow, TableDrillState } from './dashboard-table-renderer-types';
import { isGroupRow, isGroupTotalRow } from './dashboard-table-renderer-utils';

interface UseDashboardTableGroupingParams {
  displayColumns: ComputedRef<DashboardTableColumn[]>;
  drillState: ComputedRef<TableDrillState | null>;
  model: ComputedRef<DashboardTableModel>;
  pagedTableRows: ComputedRef<DashboardTableRow[]>;
}

export function useDashboardTableGrouping(params: UseDashboardTableGroupingParams) {
  const collapsedGroupKeys = ref<Set<string>>(new Set());
  const tableGroupingControlsEnabled = computed(() =>
    Boolean(params.model.value.grouping && params.model.value.grouping.showControls !== false && !params.drillState.value)
  );
  const visibleTableItems = computed(() => {
    if (!params.model.value.grouping || params.drillState.value) return params.pagedTableRows.value;
    return groupedTableRows(
      params.pagedTableRows.value,
      params.displayColumns.value,
      params.model.value.grouping.showTotals,
      groupRenderOptions()
    ).filter(item => !isGroupChildCollapsed(item));
  });
  const tableGroupCollapseSignature = computed(() =>
    [
      params.model.value.grouping?.fields.join('|') ?? '',
      params.model.value.grouping?.defaultCollapsed === true ? 'collapsed' : 'expanded',
      params.pagedTableRows.value.map(row => row.groupValues?.join('/') ?? '').join('|')
    ].join('::')
  );

  watch(tableGroupCollapseSignature, () => {
    if (!params.model.value.grouping?.defaultCollapsed) {
      collapsedGroupKeys.value = new Set();
      return;
    }
    const defaultCollapsedKeys = groupedTableRows(
      params.pagedTableRows.value,
      params.displayColumns.value,
      params.model.value.grouping.showTotals,
      groupRenderOptions()
    ).flatMap(row => isGroupRow(row) ? [row.key] : []);
    collapsedGroupKeys.value = new Set(defaultCollapsedKeys);
  }, { immediate: true });

  function clearCollapsedGroups(): void {
    collapsedGroupKeys.value = new Set();
  }

  function isGroupCollapsed(row: DashboardTableGroupRow): boolean {
    return collapsedGroupKeys.value.has(row.key);
  }

  function toggleGroup(row: DashboardTableGroupRow): void {
    const next = new Set(collapsedGroupKeys.value);
    if (next.has(row.key)) next.delete(row.key);
    else next.add(row.key);
    collapsedGroupKeys.value = next;
  }

  function isGroupChildCollapsed(row: DashboardTableRenderableRow): boolean {
    const ancestorKeys = groupAncestorKeys(row);
    return ancestorKeys.some(key => collapsedGroupKeys.value.has(key));
  }

  function groupAncestorKeys(row: DashboardTableRenderableRow): string[] {
    if (isGroupRow(row)) return row.path.slice(0, -1).map((_value, index) => `group:${row.path.slice(0, index + 1).join(' / ')}`);
    if (isGroupTotalRow(row)) return row.path.map((_value, index) => `group:${row.path.slice(0, index + 1).join(' / ')}`);
    const path = normalizedGroupPath(row);
    return path.map((_value, index) => `group:${path.slice(0, index + 1).join(' / ')}`);
  }

  function normalizedGroupPath(row: DashboardTableRow): string[] {
    const path = row.groupValues?.map(value => value.trim()).filter(Boolean) ?? [];
    return path.length > 0 ? path : ['Ungrouped'];
  }

  function groupLabelStyle(row: DashboardTableGroupRow): Record<string, string> {
    return { paddingInlineStart: `${Math.max(row.depth, 0) * 14}px` };
  }

  function groupLabelText(row: DashboardTableGroupRow): string {
    return params.model.value.grouping?.hideCount === true ? row.label : `${row.label} (${row.count} rows)`;
  }

  function groupSummaryText(row: DashboardTableGroupRow): string {
    return params.model.value.grouping?.hideSummary === true ? '' : row.totalSummary ?? '';
  }

  function groupRowStyle(row: DashboardTableGroupRow | DashboardTableGroupTotalRow): Record<string, string> {
    return { '--dashboard-table-group-depth': String(Math.max(row.depth, 0)) };
  }

  function groupRenderOptions(): TableGroupRenderOptions {
    const grouping = params.model.value.grouping;
    if (!grouping) return {};
    return {
      ...(grouping.emptyGroupBehavior ? { emptyGroupBehavior: grouping.emptyGroupBehavior } : {}),
      ...(grouping.emptyGroupLabel ? { emptyGroupLabel: grouping.emptyGroupLabel } : {}),
      ...(grouping.showHeaderTotals !== undefined ? { showHeaderTotals: grouping.showHeaderTotals } : {}),
      ...(grouping.subtotalLabel ? { subtotalLabel: grouping.subtotalLabel } : {})
    };
  }

  return {
    clearCollapsedGroups,
    groupLabelStyle,
    groupLabelText,
    groupRowStyle,
    groupSummaryText,
    isGroupCollapsed,
    tableGroupingControlsEnabled,
    toggleGroup,
    visibleTableItems
  };
}
