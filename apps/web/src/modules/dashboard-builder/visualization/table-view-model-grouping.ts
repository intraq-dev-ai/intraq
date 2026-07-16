import { readBoolean, readString } from './view-model-config';
import type { DashboardTableColumn, DashboardTableModel } from './view-model-types';

export function tableVisibleColumns(
  columns: DashboardTableColumn[],
  grouping: DashboardTableModel['grouping']
): DashboardTableColumn[] {
  if (!grouping?.hideGroupedColumns) return columns;
  const grouped = new Set(grouping.fields);
  const visible = columns.filter(column => !grouped.has(column.key));
  return visible.length > 0 ? visible : columns;
}

export function tableGroupPresentationPatch(
  rowGrouping: Record<string, unknown>,
  config: Record<string, unknown>
): Partial<NonNullable<DashboardTableModel['grouping']>> {
  const emptyGroupBehavior = readString(rowGrouping.emptyGroupBehavior ?? config.emptyGroupBehavior);
  const showControls = readBoolean(rowGrouping.showControls ?? rowGrouping.enableControls ?? config.showGroupControls ?? config.enableGroupControls);
  return {
    ...(emptyGroupBehavior === 'flatten' || emptyGroupBehavior === 'group' ? { emptyGroupBehavior } : {}),
    ...stringPatch('emptyGroupLabel', rowGrouping.emptyGroupLabel ?? config.emptyGroupLabel),
    ...stringPatch('subtotalLabel', rowGrouping.subtotalLabel ?? rowGrouping.groupSubtotalLabel ?? config.groupSubtotalLabel),
    ...(readBoolean(rowGrouping.hideCount ?? config.hideGroupCount) === true ? { hideCount: true } : {}),
    ...(readBoolean(rowGrouping.hideSummary ?? config.hideGroupSummary) === true ? { hideSummary: true } : {}),
    ...booleanPatch('showHeaderTotals', rowGrouping.showHeaderTotals ?? rowGrouping.showGroupHeaderTotals ?? config.showGroupHeaderTotals),
    ...(typeof showControls === 'boolean' ? { showControls } : {})
  };
}

function stringPatch<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  const text = readString(value);
  return text !== undefined ? { [key]: text } as Partial<Record<K, string>> : {};
}

function booleanPatch<K extends string>(key: K, value: unknown): Partial<Record<K, boolean>> {
  const parsed = readBoolean(value);
  return typeof parsed === 'boolean' ? { [key]: parsed } as Partial<Record<K, boolean>> : {};
}
