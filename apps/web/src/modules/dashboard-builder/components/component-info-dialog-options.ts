import type { DashboardCanvasInfoTab } from './canvas/dashboard-canvas-indicators';

export interface TableFieldDraft {
  columnName: string;
  displayName: string;
}

export type BooleanDraftKey =
  | 'enableTwoRowLayout'
  | 'enableExport'
  | 'enableFilters'
  | 'enablePagination'
  | 'enableSearch'
  | 'enableSorting'
  | 'fillMissingTimeBuckets'
  | 'showDownloadAction'
  | 'showColumnTotals'
  | 'showBorders'
  | 'showDataLabels'
  | 'showGrid'
  | 'showIndicator'
  | 'showLegend'
  | 'showRowTotals'
  | 'showRowSubtotals'
  | 'showSparkline'
  | 'showExpandAction'
  | 'showTotal'
  | 'showTrend'
  | 'showValueHeaders'
  | 'showColumnSubtotals'
  | 'stackBars';

export type ComponentKind = 'card' | 'chart' | 'export' | 'filter' | 'matrix' | 'table' | 'component';

export interface ComponentSettingsPatch {
  chartType?: string;
  config: Record<string, unknown>;
  name?: string;
}

export const tabsByKind: Record<ComponentKind, Array<{ id: DashboardCanvasInfoTab; label: string }>> = {
  card: [
    { id: 'filters', label: 'Filters' },
    { id: 'fields', label: 'Metric' },
    { id: 'formatting', label: 'Formatting' },
    { id: 'layout', label: 'Card Layout' },
    { id: 'additional', label: 'Options' }
  ],
  chart: [
    { id: 'filters', label: 'Filters' },
    { id: 'fields', label: 'Series' },
    { id: 'formatting', label: 'Formatting' },
    { id: 'sorting', label: 'Sorting' },
    { id: 'layout', label: 'Chart Layout' },
    { id: 'additional', label: 'Options' }
  ],
  component: [
    { id: 'filters', label: 'Filters' },
    { id: 'fields', label: 'Fields' },
    { id: 'formatting', label: 'Formatting' },
    { id: 'layout', label: 'Layout' },
    { id: 'additional', label: 'Options' }
  ],
  export: [
    { id: 'fields', label: 'Target' },
    { id: 'layout', label: 'Button' },
    { id: 'additional', label: 'Options' }
  ],
  filter: [
    { id: 'fields', label: 'Field' },
    { id: 'layout', label: 'Filter Layout' },
    { id: 'additional', label: 'Options' }
  ],
  matrix: [
    { id: 'filters', label: 'Filters' },
    { id: 'fields', label: 'Matrix Fields' },
    { id: 'formatting', label: 'Formatting' },
    { id: 'sorting', label: 'Sorting' },
    { id: 'layout', label: 'Matrix Layout' },
    { id: 'additional', label: 'Options' }
  ],
  table: [
    { id: 'filters', label: 'Filters' },
    { id: 'fields', label: 'Columns' },
    { id: 'formatting', label: 'Formatting' },
    { id: 'sorting', label: 'Sorting' },
    { id: 'layout', label: 'Table Layout' },
    { id: 'additional', label: 'Options' }
  ]
};

export const tableFormatOptions = [
  { value: 'custom', label: 'Custom - Manual Styling' },
  { value: 'default', label: 'Default - Clean & Simple' },
  { value: 'striped', label: 'Striped - Alternating Row Colors' },
  { value: 'bordered', label: 'Bordered - Full Grid Lines' },
  { value: 'minimal', label: 'Minimal - No Borders' },
  { value: 'modern', label: 'Modern - Rounded & Shadowed' },
  { value: 'corporate', label: 'Corporate - Professional Blue' },
  { value: 'dark', label: 'Dark Theme - Black & Gray' },
  { value: 'colorful', label: 'Colorful - Vibrant Headers' },
  { value: 'compact', label: 'Compact - Dense Layout' },
  { value: 'spacious', label: 'Spacious - Extra Padding' },
  { value: 'report', label: 'Report - Header Rule Only' },
  { value: 'report-grid', label: 'Report Grid - Green Summary Grid' },
  { value: 'report-blue-grid', label: 'Report Grid - Blue Summary Grid' },
  { value: 'spreadsheet', label: 'Spreadsheet - Sheet Toolbar & Grid' }
];

export const chartTypeOptions = ['bar', 'column', 'line', 'area'];
export const pieChartTypeOptions = ['pie', 'doughnut'];

export function chartTypeOptionsFor(chartType: string | undefined): string[] {
  const normalized = chartType?.trim().toLowerCase();
  return normalized === 'pie' || normalized === 'doughnut' || normalized === 'donut'
    ? pieChartTypeOptions
    : chartTypeOptions;
}
export const colorSchemeOptions = ['', 'default', 'success', 'warning', 'danger', 'info'];
export const displayModeOptions = ['', 'default', 'list', 'dropdown', 'compact', 'comfortable', 'grouped'];
export const filterDisplayModeOptions = [
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'buttons', label: 'Buttons' },
  { value: 'scroll-list', label: 'Scroll list' }
];
export const exportButtonStyleOptions = [
  { value: '', label: 'Default' },
  { value: 'legacy-toolbar', label: 'Legacy toolbar' }
];
export const titlePositionOptions = ['', 'top', 'none', 'left', 'right'];
export const legendPositionOptions = ['', 'top', 'right', 'bottom', 'left'];

export const cardLayoutOptions = [
  { value: '', label: 'Default' },
  { value: 'two-row', label: 'Two row' },
  { value: 'value-only', label: 'Value only' },
  { value: 'value-trend-inline', label: 'Value with trend' },
  { value: 'value-sparkline', label: 'Value with sparkline' },
  { value: 'value-trend-sparkline', label: 'Trend and sparkline' }
];
