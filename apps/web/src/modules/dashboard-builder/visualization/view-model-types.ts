import type { MetricFormat, ThousandsSeparatorStyle } from './formatting';
import type { AggregationType } from './view-model-config';

export type DashboardElementRenderKind = 'card' | 'chart' | 'chatbot' | 'container' | 'export' | 'filter' | 'matrix' | 'news' | 'table' | 'text';
export type DashboardTableCellType =
  | 'actions'
  | 'advanced-sparkline'
  | 'badge'
  | 'bar-in-cell'
  | 'bullet-chart'
  | 'delta'
  | 'mom-change'
  | 'moving-average'
  | 'percent-of-total'
  | 'progress'
  | 'running-total'
  | 'sparkline'
  | 'text'
  | 'trend-indicator'
  | 'yoy-change';
export type DashboardDisplayMode = 'comfortable' | 'compact' | 'dense' | 'heatmap' | 'plain';
export type DashboardCardContentToken = 'comparison' | 'delta' | 'empty' | 'sparkline' | 'status' | 'title' | 'trend' | 'value';
export type DashboardCardComparisonDirection = 'higher-is-better' | 'lower-is-better' | 'none';
export type DashboardCardComparisonDisplayMode = 'amount' | 'both' | 'percentage' | 'value';
export type DashboardCardLayoutMode = 'two-row' | 'value-only' | 'value-sparkline' | 'value-trend-inline' | 'value-trend-sparkline' | 'value-trend-stacked';
export type DashboardCardSparklineType = 'area' | 'column' | 'line';
export type DashboardMatrixRowDataDisplayMode = 'merge' | 'repeat';
export type DashboardMatrixColumnDataDisplayMode = 'merge' | 'repeat';
export type DashboardStatusTone = 'danger' | 'default' | 'info' | 'success' | 'warning';
export type SortDirection = 'asc' | 'desc';
export type TrendDirection = 'down' | 'neutral' | 'up';

export interface DashboardTableColumn {
  actions?: DashboardTableAction[];
  align?: 'center' | 'left' | 'right';
  cellType: DashboardTableCellType;
  cellConfig?: DashboardTableCellConfig;
  displayConfig?: DashboardTableColumnDisplayConfig;
  format?: MetricFormat;
  key: string;
  label: string;
  link?: DashboardTableCellLinkConfig;
  maxValue?: number;
  runtimeOverrides?: Record<string, unknown>;
  sortable?: boolean;
  target?: number;
  totalAggregation?: AggregationType;
  width?: string;
}

export interface DashboardTableCellLinkConfig {
  ariaLabelTemplate?: string;
  hrefTemplate: string;
  rel?: string;
  target?: '_blank' | '_self' | '_parent' | '_top';
}

export interface DashboardTableColumnDisplayConfig {
  currencySymbol?: string;
  dateFormat?: string;
  emptyValue?: string;
  falseLabel?: string;
  formatter?: 'json-list' | 'structured-list';
  itemCurrencyField?: string;
  itemLabelValueSeparator?: string;
  itemLabelField?: string;
  itemPrecision?: number;
  itemSeparator?: string;
  itemValueField?: string;
  linkUnderline?: 'always' | 'never';
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  negativeStyle?: 'absolute' | 'minus' | 'parentheses';
  precision?: number;
  skipZeroItems?: boolean;
  prefix?: string;
  suffix?: string;
  thousandsSeparator?: ThousandsSeparatorStyle;
  timeZone?: string;
  trueLabel?: string;
}

export interface DashboardTableAction {
  actionId: string;
  label: string;
}

export interface DashboardTableCellConfig {
  badgeMapping?: Record<string, string>;
  barColor?: string;
  bulletRanges?: DashboardTableBulletRange[];
  deltaColorScheme?: string;
  deltaCompareField?: string;
  deltaDisplayMode?: 'absolute' | 'both' | 'percentage';
  progressColor?: string;
  showArea?: boolean;
  showDeltaArrow?: boolean;
  showDots?: boolean;
  showMinMaxAvg?: boolean;
  sparklineColor?: string;
  sparklineFields?: string[];
  sparklineSize?: 'large' | 'medium' | 'small';
}

export interface DashboardTableBulletRange {
  color: string;
  max: number;
  min?: number;
}

export interface DashboardTableCell {
  delta?: DashboardTableDelta;
  sparkline: number[];
  formatClasses?: string[];
  display: string;
  isTotal?: boolean;
  link?: DashboardTableCellLink;
  numeric: number | null;
  ratio: number | null;
  raw: unknown;
  style?: Record<string, string>;
  tone: 'danger' | 'neutral' | 'success' | 'warning';
}

export interface DashboardTableCellLink {
  ariaLabel?: string;
  href: string;
  rel?: string;
  target?: '_blank' | '_self' | '_parent' | '_top';
}

export interface DashboardTableDelta {
  absolute: number;
  direction: TrendDirection;
  percentage: number | null;
  showArrow: boolean;
}

export interface DashboardTableRow {
  cells: DashboardTableCell[];
  groupValues?: string[];
  key: string;
  raw?: Record<string, unknown>;
}

export interface DashboardTableGroupRow {
  cells: DashboardTableCell[];
  count: number;
  depth: number;
  isGroup: true;
  key: string;
  label: string;
  path: string[];
  totalSummary?: string;
}

export interface DashboardTableGroupTotalRow {
  cells: DashboardTableCell[];
  depth: number;
  groupKey: string;
  isGroupTotal: true;
  key: string;
  label: string;
  path: string[];
}

export interface DashboardTableModel {
  columns: DashboardTableColumn[];
  displayMode?: DashboardDisplayMode;
  footerRows?: DashboardTableRow[];
  grouping?: {
    defaultCollapsed?: boolean;
    emptyGroupBehavior?: 'group' | 'flatten';
    emptyGroupLabel?: string;
    fields: string[];
    hideCount?: boolean;
    hideGroupedColumns?: boolean;
    hideSummary?: boolean;
    showHeaderTotals?: boolean;
    showControls?: boolean;
    showTotals: boolean;
    subtotalLabel?: string;
  };
  pagination?: { enabled: boolean; pageSize: number; pageSizeOptions: number[] };
  rootStyle?: Record<string, string>;
  rows: DashboardTableRow[];
  sort?: { direction: SortDirection; key: string };
  sorts?: Array<{ direction: SortDirection; key: string }>;
  tableFormat?: string;
}

export interface DashboardCardModel {
  backgroundColor?: string;
  borderRadius?: string;
  comparisonContext?: string;
  comparisonDisplayMode?: DashboardCardComparisonDisplayMode;
  comparisonLabel?: string;
  comparisonTone?: DashboardStatusTone;
  cardType?: 'two-row';
  colorScheme?: DashboardStatusTone;
  customClassName?: string;
  gridColumns?: number;
  helper: string;
  innerGap?: string;
  isMulti: boolean;
  label: string;
  layoutMode?: DashboardCardLayoutMode;
  outerGap?: string;
  segments: DashboardCardSegment[];
  shadow?: 'default' | 'medium' | 'none' | 'strong' | 'subtle';
  showIndicator: boolean;
  showSparkline: boolean;
  showTrend: boolean;
  sparkline: number[];
  sparklineColor?: string;
  sparklineType?: DashboardCardSparklineType;
  sparklineStats?: { avg: string; max: string; min: string };
  statusLabel: string;
  statusTone?: DashboardStatusTone;
  supportingLabel?: string;
  supportingTone?: DashboardStatusTone;
  supportingValue?: string;
  showMinMaxAvg?: boolean;
  titleBackground?: string;
  titleColor?: string;
  titleFontSize?: string;
  titlePosition?: string;
  trendDeltaLabel: string;
  trendDirection: TrendDirection;
  trendLabel: string;
  twoRow?: DashboardCardTwoRowModel;
  value: string;
  valueBackground?: string;
  valueColor?: string;
  valueFontSize?: string;
}

export interface DashboardCardTwoRowModel {
  bottomContent: DashboardCardContentToken[];
  rowHeightRatio: string;
  topContent: DashboardCardContentToken[];
}

export interface DashboardCardSegment {
  comparisonLabel?: string;
  label: string;
  sparkline?: number[];
  statusLabel?: string;
  statusTone?: DashboardStatusTone;
  trendDeltaLabel?: string;
  trendDirection?: TrendDirection;
  trendLabel?: string;
  trendTone?: DashboardStatusTone;
  value: string;
}

export interface DashboardMatrixRow {
  cells: string[];
  cellMeta?: Array<DashboardMatrixCellMeta | undefined>;
  groupLabel?: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
  label: string;
  rowHeaderCells?: DashboardMatrixRowHeaderCell[];
  rowTotals?: string[];
  total: string;
  valueField?: string;
  valueLabel?: string;
}

export interface DashboardMatrixRowHeaderCell {
  depth: number;
  field: string;
  groupId: string;
  hasChildren: boolean;
  isGroupStart: boolean;
  label: string;
  meta?: DashboardMatrixCellMeta;
}

export interface DashboardMatrixRowHeaderField {
  field: string;
  label: string;
}

export interface DashboardMatrixValueHeader {
  field: string;
  key: string;
  label: string;
}

export interface DashboardMatrixCellMeta {
  formatClasses?: string[];
  style?: Record<string, string>;
  tone: 'danger' | 'neutral' | 'success' | 'warning';
}

export interface DashboardMatrixColumnHeaderCell {
  columnIndexes?: number[];
  colspan: number;
  depth?: number;
  groupId?: string;
  hasChildren?: boolean;
  key: string;
  label: string;
  meta?: DashboardMatrixCellMeta;
  scope: 'col' | 'colgroup';
}

export interface DashboardMatrixColumnHeaderRow {
  cells: DashboardMatrixColumnHeaderCell[];
}

export interface DashboardMatrixModel {
  columns: string[];
  columnHeaderRows?: DashboardMatrixColumnHeaderRow[];
  columnHeaderMeta?: Array<DashboardMatrixCellMeta | undefined>;
  columnHeaderLabel?: string;
  columnWidths?: Record<string, string>;
  columnGroupIds?: string[][];
  columnSubtotalGroupIds?: Array<string | undefined>;
  defaultColumnCollapseState?: 'collapsed' | 'expanded';
  defaultRowCollapseState?: 'collapsed' | 'expanded';
  displayMode?: DashboardDisplayMode;
  columnDataDisplayMode?: DashboardMatrixColumnDataDisplayMode;
  enableColumnExpandCollapse?: boolean;
  enableRowExpandCollapse?: boolean;
  maxVisibleColumns?: number;
  maxVisibleRows?: number;
  rowDataDisplayMode?: DashboardMatrixRowDataDisplayMode;
  rowHeaderFields?: DashboardMatrixRowHeaderField[];
  rowHeaderLabel?: string;
  rowHeaderWidth?: string;
  rows: DashboardMatrixRow[];
  showBorders?: boolean;
  showColumnTotals: boolean;
  showRowTotals: boolean;
  showValueHeaders?: boolean;
  styles?: {
    borderColor?: string;
    cell?: Record<string, string>;
    header?: Record<string, string>;
    root?: Record<string, string>;
    rowHeader?: Record<string, string>;
  };
  tableFormat?: string;
  valueHeaders?: DashboardMatrixValueHeader[];
  valueHeaderLabel?: string;
  valueHeaderWidth?: string;
}
