import type { DashboardTableColumn, DashboardTableGroupRow, DashboardTableGroupTotalRow, DashboardTableRow } from '../../visualization/view-model-types';
import { dashboardTableRowKey } from '../../visualization/table-filter-runtime';
import type { DashboardTableRenderableRow } from './dashboard-table-renderer-types';

export function rowKey(row: DashboardTableRenderableRow, index: number): string {
  return dashboardTableRowKey(row, index);
}

export function isGroupRow(row: DashboardTableRenderableRow): row is DashboardTableGroupRow {
  return 'isGroup' in row && row.isGroup === true;
}

export function isGroupTotalRow(row: DashboardTableRenderableRow): row is DashboardTableGroupTotalRow {
  return 'isGroupTotal' in row && row.isGroupTotal === true;
}

export function isDashboardTableRow(value: unknown): value is DashboardTableRow {
  return typeof value === 'object' && value !== null && 'cells' in value && Array.isArray((value as DashboardTableRow).cells);
}

export function isGroupedChildRow(row: DashboardTableRenderableRow): boolean {
  return isDashboardTableRow(row) && (row.groupValues?.some(value => value.trim()) ?? false);
}

export function tableColumnStyle(column: DashboardTableColumn): Record<string, string> {
  return {
    ...(column.width ? { width: column.width } : {}),
    ...(column.align ? { textAlign: column.align } : {})
  };
}

export function tableHeaderContentStyle(column: DashboardTableColumn): Record<string, string> {
  if (column.align === 'right') return { justifyContent: 'flex-end' };
  if (column.align === 'center') return { justifyContent: 'center' };
  return {};
}

export function spreadsheetColumnLabel(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

export function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
