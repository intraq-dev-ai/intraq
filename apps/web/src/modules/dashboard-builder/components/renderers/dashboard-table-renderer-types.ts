import type { DashboardTableColumn, DashboardTableGroupRow, DashboardTableGroupTotalRow, DashboardTableRow } from '../../visualization/view-model-types';
import type { TableFilterState } from '../../visualization/table-filter-runtime';

export type DashboardTableRenderableRow = DashboardTableRow | DashboardTableGroupRow | DashboardTableGroupTotalRow;

export type TableFilterMode = 'advanced' | 'excel';

export interface TableFilterDraftState extends TableFilterState {
  mode: TableFilterMode;
  selectedValues: string[];
  valueSearch: string;
}

export interface TableActionDialog {
  actionId: string;
  label: string;
  rowIndex: number;
  rows: Array<{ field: string; label: string; value: string }>;
  title: string;
}

export interface TableDrillState {
  field: string;
  label: string;
  levels: TableDrillLevel[];
  sourceRowIndex: number;
  value: string;
}

export interface TableDrillLevel {
  field: string;
  label: string;
  value: string;
}

export interface TableRowActionPayload {
  actionId: string;
  columnKey?: string;
  label: string;
  row: unknown;
  rowIndex: number;
}

export type TableColumnStyle = (column: DashboardTableColumn) => Record<string, string>;
export type TableHeaderContentStyle = (column: DashboardTableColumn) => Record<string, string>;
