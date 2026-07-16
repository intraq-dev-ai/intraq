import type { MetricDisplayFormat, MetricFormat, MetricFormatOptions } from './formatting';
import type { MatrixConditionalRule } from './matrix-conditional-formatting';
import type { ConfiguredField } from './view-model-config';
import type { RuntimeFilter } from './view-model-runtime';
import type {
  DashboardDisplayMode,
  DashboardMatrixColumnDataDisplayMode,
  DashboardMatrixModel,
  DashboardMatrixRow,
  DashboardMatrixRowDataDisplayMode,
  SortDirection
} from './view-model-types';

export type MatrixSort = {
  compareKey?: string;
  direction: SortDirection;
  key: string;
};

export type MatrixColumn = {
  displayValues?: string[];
  label: string;
  subtotalDepth?: number;
  values: string[];
};

export type MatrixGroup = {
  label: string;
  rows: Array<Record<string, unknown>>;
  values: string[];
};

export type MatrixDefaultCollapseState = 'collapsed' | 'expanded';

export type MatrixRowWithContext = DashboardMatrixRow & {
  __valueFormat?: MetricDisplayFormat | undefined;
  __valueFormatOptions?: MetricFormatOptions | undefined;
  __valueKey?: string | undefined;
};

export interface MatrixFields {
  columnDataDisplayMode: DashboardMatrixColumnDataDisplayMode;
  columnFields: ConfiguredField[];
  columnHeaderLabel: string | undefined;
  columnSorts: MatrixSort[];
  columnWidths: Record<string, string>;
  conditionalRules: MatrixConditionalRule[];
  defaultColumnCollapseState: MatrixDefaultCollapseState | undefined;
  defaultColumnWidth: string | undefined;
  defaultRowCollapseState: MatrixDefaultCollapseState | undefined;
  displayMode: DashboardDisplayMode | undefined;
  enableColumnExpandCollapse: boolean;
  enableRowExpandCollapse: boolean;
  fieldFormats: Record<string, MetricFormat>;
  filters: RuntimeFilter[];
  formatOptions: MetricFormatOptions;
  maxVisibleColumns: number | undefined;
  maxVisibleRows: number | undefined;
  rowDataDisplayMode: DashboardMatrixRowDataDisplayMode;
  rowFields: ConfiguredField[];
  rowHeaderLabel: string | undefined;
  rowHeaderWidth: string | undefined;
  rowSorts: MatrixSort[];
  showBorders: boolean | undefined;
  showColumnSubtotals: boolean;
  showColumnTotals: boolean;
  showRowSubtotals: boolean;
  showRowTotals: boolean;
  showValueHeaders: boolean;
  sort: MatrixSort | undefined;
  styles: DashboardMatrixModel['styles'] | undefined;
  tableFormat: string | undefined;
  valueFields: ConfiguredField[];
  valueHeaderLabel: string | undefined;
  valueHeaderWidth: string | undefined;
}
