export interface TableGroupRenderOptions {
  emptyGroupBehavior?: 'group' | 'flatten';
  emptyGroupLabel?: string;
  showHeaderTotals?: boolean;
  subtotalLabel?: string;
}

export function readTableGroupFields(config: Record<string, unknown>): string[] {
  const rowGrouping = isRecord(config.rowGrouping) ? config.rowGrouping : {};
  if (rowGrouping.enabled === false) return [];
  return stringList(rowGrouping.fields ?? config.groupByFields);
}

export function readTableGroupTotalsEnabled(config: Record<string, unknown>): boolean {
  const rowGrouping = isRecord(config.rowGrouping) ? config.rowGrouping : {};
  const value = rowGrouping.showTotals ?? rowGrouping.showGroupTotals ?? config.showGroupTotals;
  return typeof value === 'boolean' ? value : false;
}

export function readTableGroupDefaultCollapsed(config: Record<string, unknown>): boolean {
  const rowGrouping = isRecord(config.rowGrouping) ? config.rowGrouping : {};
  return rowGrouping.collapsedByDefault === true
    || rowGrouping.defaultCollapsed === true
    || rowGrouping.defaultExpanded === false;
}

export function readTableGroupHideColumns(config: Record<string, unknown>): boolean {
  const rowGrouping = isRecord(config.rowGrouping) ? config.rowGrouping : {};
  return rowGrouping.hideGroupedColumns !== false;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
    if (!isRecord(item)) return [];
    return stringList([item.field ?? item.key ?? item.name]);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
