import type { DashboardElement } from '../types';
import type { DashboardCanvasIndicatorSummary } from './canvas/dashboard-canvas-indicators';
import { fieldDraftsForComponentInfo } from './component-info-dialog-fields';
import type { TableFieldDraft } from './component-info-dialog-options';

export interface ComponentInfoDraft {
  cardLayout: string;
  componentBackgroundColor: string;
  colorScheme: string;
  chartType: string;
  displayMode: string;
  enableTwoRowLayout: boolean;
  enableExport: boolean;
  enableFilters: boolean;
  enablePagination: boolean;
  enableSearch: boolean;
  enableSorting: boolean;
  exportAlign: string;
  exportButtonBackgroundColor: string;
  exportButtonBorderColor: string;
  exportButtonBorderRadius: string;
  exportButtonLabel: string;
  exportButtonStyle: string;
  exportButtonTextColor: string;
  exportFormat: string;
  exportShowIcon: boolean;
  exportTargetElementId: string;
  gridColumns: string;
  legendMarkerStyle: string;
  legendPosition: string;
  lineInterpolation: 'curved' | 'straight';
  lineTension: string;
  mixedAxisPrimaryHeadroomRatio: string;
  fillMissingTimeBuckets: boolean;
  rowsPerPage: string;
  showColumnTotals: boolean;
  showColumnSubtotals: boolean;
  showBorders: boolean;
  showDataLabels: boolean;
  showDownloadAction: boolean;
  showExpandAction: boolean;
  showGrid: boolean;
  showIndicator: boolean;
  showLegend: boolean;
  showRowTotals: boolean;
  showRowSubtotals: boolean;
  showSparkline: boolean;
  showTotal: boolean;
  showTrend: boolean;
  showValueHeaders: boolean;
  sortBy: string;
  sortDirection: string;
  stackBars: boolean;
  tableFormat: string;
  timeBucketFillValue: string;
  timeBucketInterval: 'auto' | 'day' | 'hour' | 'month' | 'week';
  title: string;
  titlePosition: string;
  topN: string;
  y2AxisPaddingMode: 'auto' | 'none' | 'zero-centered';
  y2AxisPaddingRatio: string;
  y2AxisStartMode: 'auto' | 'zero';
  yAxisPaddingMode: 'auto' | 'none' | 'zero-centered';
  yAxisPaddingRatio: string;
  yAxisStartMode: 'auto' | 'zero';
}

export function createComponentInfoDraft(): ComponentInfoDraft {
  return {
    cardLayout: '',
    componentBackgroundColor: '',
    colorScheme: '',
    chartType: '',
    displayMode: '',
    enableTwoRowLayout: false,
    enableExport: true,
    enableFilters: true,
    enablePagination: false,
    enableSearch: true,
    enableSorting: true,
    exportAlign: 'right',
    exportButtonBackgroundColor: '',
    exportButtonBorderColor: '',
    exportButtonBorderRadius: '',
    exportButtonLabel: '',
    exportButtonStyle: '',
    exportButtonTextColor: '',
    exportFormat: 'csv',
    exportShowIcon: true,
    exportTargetElementId: '',
    gridColumns: '',
    legendMarkerStyle: '',
    legendPosition: '',
    lineInterpolation: 'curved',
    lineTension: '',
    mixedAxisPrimaryHeadroomRatio: '',
    fillMissingTimeBuckets: false,
    rowsPerPage: '25',
    showColumnTotals: true,
    showColumnSubtotals: false,
    showBorders: true,
    showDataLabels: false,
    showDownloadAction: true,
    showExpandAction: true,
    showGrid: true,
    showIndicator: true,
    showLegend: false,
    showRowTotals: true,
    showRowSubtotals: false,
    showSparkline: false,
    showTotal: false,
    showTrend: true,
    showValueHeaders: false,
    sortBy: '',
    sortDirection: '',
    stackBars: false,
    tableFormat: '',
    timeBucketFillValue: '',
    timeBucketInterval: 'auto',
    title: '',
    titlePosition: '',
    topN: '',
    y2AxisPaddingMode: 'none',
    y2AxisPaddingRatio: '',
    y2AxisStartMode: 'zero',
    yAxisPaddingMode: 'none',
    yAxisPaddingRatio: '',
    yAxisStartMode: 'zero'
  };
}

export function resetComponentInfoDraft(
  draft: ComponentInfoDraft,
  element: DashboardElement | null,
  summary: DashboardCanvasIndicatorSummary | null
): TableFieldDraft[] {
  const config = element?.config ?? {};
  draft.cardLayout = readString(config.layout ?? config.cardType ?? config.designLayout ?? config.layoutDesign);
  draft.componentBackgroundColor = readString(config.backgroundColor ?? config.background);
  draft.chartType = element?.chartType ?? '';
  draft.colorScheme = readString(config.colorScheme);
  draft.displayMode = readString(config.displayMode ?? config.rowDataDisplayMode ?? config.columnDataDisplayMode);
  draft.enableTwoRowLayout = readBoolean(config.enableTwoRowLayout, draft.cardLayout === 'two-row');
  draft.enableExport = readBoolean(config.enableExport, true);
  draft.enableFilters = readBoolean(config.enableFilters, true);
  draft.enablePagination = readBoolean(config.enablePagination, false);
  draft.enableSearch = readBoolean(config.enableSearch, true);
  draft.enableSorting = readBoolean(config.enableSorting, true);
  draft.exportAlign = readString(config.align ?? config.justify) || 'right';
  draft.exportButtonBackgroundColor = readString(config.buttonBackgroundColor ?? config.backgroundColor ?? config.background);
  draft.exportButtonBorderColor = readString(config.buttonBorderColor ?? config.borderColor);
  draft.exportButtonBorderRadius = readString(config.borderRadius);
  draft.exportButtonLabel = readString(config.buttonLabel ?? config.exportLabel ?? config.label) || element?.name || '';
  draft.exportButtonStyle = readString(config.buttonStyle ?? config.styleVariant ?? config.variant);
  draft.exportButtonTextColor = readString(config.buttonTextColor ?? config.textColor ?? config.color);
  draft.exportFormat = readString(config.format) || 'csv';
  draft.exportShowIcon = readBoolean(config.showIcon, true);
  draft.exportTargetElementId = readString(config.targetElementId ?? config.componentId ?? config.exportElementId);
  draft.gridColumns = optionalNumberText(config.gridColumns);
  draft.legendMarkerStyle = readString(config.legendMarkerStyle ?? config.legendSymbolStyle);
  draft.legendPosition = readString(config.legendPosition);
  draft.lineInterpolation = readLineInterpolation(config.lineInterpolation ?? config.lineStyle ?? config.lineCurve);
  draft.lineTension = optionalNumberText(config.lineTension ?? config.curveTension);
  draft.mixedAxisPrimaryHeadroomRatio = optionalNumberText(config.mixedAxisPrimaryHeadroomRatio ?? config.dualAxisPrimaryHeadroomRatio);
  draft.fillMissingTimeBuckets = readBoolean(config.fillMissingTimeBuckets ?? config.fillMissingBuckets ?? config.timeBucketFill, false);
  draft.rowsPerPage = String(readNumber(config.rowsPerPage, 25));
  draft.showColumnTotals = readBoolean(config.showColumnTotals, true);
  draft.showColumnSubtotals = readBoolean(config.showColumnSubtotals, false);
  draft.showBorders = readBoolean(config.showBorders, true);
  draft.showDataLabels = readBoolean(config.showDataLabels, false);
  draft.showDownloadAction = readBoolean(config.showDownloadAction ?? config.showComponentDownload ?? config.showExportAction, true);
  draft.showExpandAction = readBoolean(config.showExpandAction ?? config.showComponentExpand, true);
  draft.showGrid = readBoolean(config.showGrid, true);
  draft.showIndicator = readBoolean(config.showIndicator, true);
  draft.showLegend = readBoolean(config.showLegend, false);
  draft.showRowTotals = readBoolean(config.showRowTotals, true);
  draft.showRowSubtotals = readBoolean(config.showRowSubtotals, false);
  draft.showSparkline = readBoolean(config.showSparkline, false);
  draft.showTotal = readBoolean(config.showTotal, false);
  draft.showTrend = readBoolean(config.showTrend, true);
  draft.showValueHeaders = readBoolean(config.showValueHeaders, false);
  draft.sortBy = readString(config.sortBy ?? config.xAxisSortField);
  draft.sortDirection = readString(config.sortDirection ?? config.xAxisSortOrder);
  draft.stackBars = readBoolean(config.stackBars, false);
  draft.tableFormat = readString(config.tableFormat);
  draft.timeBucketFillValue = optionalNumberText(config.timeBucketFillValue ?? config.fillMissingTimeBucketValue);
  draft.timeBucketInterval = readTimeBucketInterval(config.timeBucketInterval ?? config.fillMissingTimeBucketInterval);
  draft.title = readString(config.title) || element?.name || '';
  draft.titlePosition = readString(config.titlePosition ?? config.wrapperTitlePosition);
  draft.topN = optionalNumberText(config.topN);
  draft.y2AxisPaddingMode = readAxisPaddingMode(config.y2AxisPaddingMode);
  draft.y2AxisPaddingRatio = optionalNumberText(config.y2AxisPaddingRatio);
  draft.y2AxisStartMode = readAxisStartMode(config.y2AxisStartMode);
  draft.yAxisPaddingMode = readAxisPaddingMode(config.yAxisPaddingMode);
  draft.yAxisPaddingRatio = optionalNumberText(config.yAxisPaddingRatio);
  draft.yAxisStartMode = readAxisStartMode(config.yAxisStartMode);
  return fieldDraftsForComponentInfo(element, summary);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readAxisStartMode(value: unknown): 'auto' | 'zero' {
  return value === 'auto' ? 'auto' : 'zero';
}

function readAxisPaddingMode(value: unknown): 'auto' | 'none' | 'zero-centered' {
  const normalized = readString(value).toLowerCase();
  if (normalized === 'auto') return 'auto';
  if (normalized === 'zero-centered' || normalized === 'zero-centred' || normalized === 'highcharts' || normalized === 'legacy') return 'zero-centered';
  return 'none';
}

function readLineInterpolation(value: unknown): 'curved' | 'straight' {
  if (value === false) return 'straight';
  const normalized = readString(value).toLowerCase();
  return normalized === 'straight' || normalized === 'linear' || normalized === 'none' ? 'straight' : 'curved';
}

function readTimeBucketInterval(value: unknown): 'auto' | 'day' | 'hour' | 'month' | 'week' {
  const normalized = readString(value).toLowerCase();
  if (normalized === 'hour' || normalized === 'hourly') return 'hour';
  if (normalized === 'day' || normalized === 'daily') return 'day';
  if (normalized === 'week' || normalized === 'weekly') return 'week';
  if (normalized === 'month' || normalized === 'monthly') return 'month';
  return 'auto';
}

function optionalNumberText(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}
