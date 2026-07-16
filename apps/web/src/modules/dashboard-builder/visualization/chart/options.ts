import type { VisualizationSpec } from '../../types';
import type { ThousandsSeparatorStyle } from '../formatting';
import { labelFor } from '../formatting';

export type ChartIntent = 'area' | 'bar' | 'column' | 'doughnut' | 'line' | 'pie' | 'stacked';
export type AxisStartMode = 'auto' | 'zero';
export type AxisPaddingMode = 'none' | 'auto' | 'zero-centered';
export type LegendPosition = 'bottom' | 'left' | 'right' | 'top';
export type LegendMarkerStyle = 'box' | 'line-marker' | 'point';
export type LineInterpolation = 'curved' | 'straight';
export type PieValueDisplay = 'both' | 'chart' | 'legend' | 'none';
export type SortDirection = 'asc' | 'desc';
export type TimeBucketInterval = 'auto' | 'day' | 'hour' | 'month' | 'week';
export type XAxisDateLabelMode = 'auto-period' | 'date' | 'datetime' | 'time';
export type ChartSpacingPreset = 'highcharts' | 'legacy' | 'report';

export interface BaseChartOptions {
  chartIntent: ChartIntent;
  chartPaddingBottom: number | undefined;
  chartPaddingLeft: number | undefined;
  chartPaddingRight: number | undefined;
  chartPaddingTop: number | undefined;
  chartSpacingPreset: ChartSpacingPreset | undefined;
  colorTheme: string | undefined;
  dataLabelFormat: string | undefined;
  dataLabelPosition: string | undefined;
  defaultCurrencySymbol: string | undefined;
  enableY2: boolean;
  legendPosition: LegendPosition;
  legendMarkerStyle: LegendMarkerStyle;
  legendItemsPerPage: number | undefined;
  lineInterpolation: LineInterpolation;
  lineTension: number | undefined;
  mixedAxisPrimaryHeadroomRatio: number | undefined;
  fillMissingTimeBuckets: boolean;
  showDataLabels: boolean;
  showGrid: boolean;
  showLegend: boolean;
  showTooltip: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
  sortBy: string | undefined;
  sortDirection: SortDirection;
  stackBars: boolean;
  themePreset: string | undefined;
  timeBucketFallbackSeriesLabel: string | undefined;
  timeBucketFillValue: number;
  timeBucketInterval: TimeBucketInterval;
  timeZone: string | undefined;
  topN: number | undefined;
  valueDisplay: PieValueDisplay | undefined;
  xAxisLabel: string | undefined;
  xAxisLabelAlignment: 'center' | 'end' | 'inner' | 'start' | undefined;
  xAxisDateFormat: string | undefined;
  xAxisDateFormatParameter: string | undefined;
  xAxisDateFormats: Record<string, string>;
  xAxisDateMidnightFormat: string | undefined;
  xAxisDateMidnightFormats: Record<string, string>;
  xAxisDateLabelMode: XAxisDateLabelMode | undefined;
  xAxisLabelRotation: number | undefined;
  xValueColors: Record<string, string>;
  y2AxisLabel: string | undefined;
  y2AxisPaddingMode: AxisPaddingMode;
  y2AxisPaddingRatio: number | undefined;
  y2AxisStartMode: AxisStartMode;
  y2AxisTickPadding: number | undefined;
  y2AxisTitlePadding: number | undefined;
  yAxisLabel: string | undefined;
  yAxisPaddingMode: AxisPaddingMode;
  yAxisPaddingRatio: number | undefined;
  yAxisStartMode: AxisStartMode;
  yAxisTickPadding: number | undefined;
  yAxisTitlePadding: number | undefined;
  ySeriesAxis: Record<string, string>;
  ySeriesColors: Record<string, string>;
  ySeriesCurrencySymbol: Record<string, string>;
  ySeriesDecimals: Record<string, string>;
  ySeriesFormat: Record<string, string>;
  ySeriesLabels: Record<string, string>;
  ySeriesPrefix: Record<string, string>;
  ySeriesThousandsSeparator: Record<string, ThousandsSeparatorStyle>;
  ySeriesType: Record<string, string>;
}

type SpecRecord = VisualizationSpec & Record<string, unknown>;

export function readBaseOptions(spec: VisualizationSpec): BaseChartOptions {
  const record = spec as SpecRecord;
  const chartIntent = readChartIntent(record);
  const legend = readRecord(record.legend);
  const dataLabels = readRecord(record.dataLabels);
  const styling = readRecord(record.styling);
  const y2Axis = readRecord(record.y2Axis);
  const chartSpacing = readRecord(record.chartSpacing ?? record.chartPadding ?? record.chartLayoutPadding);
  const chartSpacingPreset = readChartSpacingPreset(record.chartSpacingPreset ?? record.chartPaddingPreset ?? chartSpacing.preset);
  const seriesMaps = readSeriesMaps(record);
  const ySeriesLabels = mergeRecords(readStringRecord(record.ySeriesLabels ?? record.seriesLabels), seriesMaps.labels);
  return withSeriesLabelAliases({
    chartIntent,
    chartPaddingBottom: readRangeNumber(record.chartPaddingBottom ?? record.chartLayoutPaddingBottom ?? chartSpacing.bottom, 0, 80),
    chartPaddingLeft: readRangeNumber(record.chartPaddingLeft ?? record.chartLayoutPaddingLeft ?? chartSpacing.left, 0, 80),
    chartPaddingRight: readRangeNumber(record.chartPaddingRight ?? record.chartLayoutPaddingRight ?? chartSpacing.right, 0, 80),
    chartPaddingTop: readRangeNumber(record.chartPaddingTop ?? record.chartLayoutPaddingTop ?? chartSpacing.top, 0, 80),
    chartSpacingPreset,
    colorTheme: readString(record.colorTheme),
    dataLabelFormat: readString(record.dataLabelFormat ?? dataLabels.format),
    dataLabelPosition: readString(record.dataLabelPosition),
    defaultCurrencySymbol: readString(record.currencySymbol),
    enableY2: readBoolean(record.enableY2 ?? record.showY2Axis ?? y2Axis.enabled, false),
    fillMissingTimeBuckets: readBoolean(record.fillMissingTimeBuckets ?? record.fillMissingBuckets ?? record.timeBucketFill, false),
    legendPosition: readLegendPosition(record.legendPosition ?? legend.position) ?? 'top',
    legendMarkerStyle: readLegendMarkerStyle(record.legendMarkerStyle ?? record.legendSymbolStyle ?? legend.markerStyle ?? legend.symbolStyle)
      ?? (chartSpacingPreset ? 'line-marker' : 'box'),
    legendItemsPerPage: readNonNegativeInteger(record.legendItemsPerPage),
    lineInterpolation: readLineInterpolation(record.lineInterpolation ?? record.lineStyle ?? record.lineCurve) ?? 'curved',
    lineTension: readRangeNumber(record.lineTension ?? record.curveTension, 0, 1),
    mixedAxisPrimaryHeadroomRatio: readRangeNumber(record.mixedAxisPrimaryHeadroomRatio ?? record.dualAxisPrimaryHeadroomRatio, 0, 2),
    showDataLabels: readBoolean(record.showDataLabels ?? dataLabels.enabled, false),
    showGrid: readBoolean(record.showGrid ?? styling.showHorizontalGrid ?? styling.showVerticalGrid, true),
    showLegend: readBoolean(record.showLegend ?? legend.enabled, spec.interactions.legend),
    showTooltip: readBoolean(record.showTooltip ?? record.showTooltips ?? record.tooltip, spec.interactions.tooltip),
    showXAxis: readBoolean(record.showXAxis, true),
    showYAxis: readBoolean(record.showYAxis, true),
    sortBy: readString(record.sortBy ?? record.xAxisSortField),
    sortDirection: readSortDirection(record.sortDirection ?? record.xAxisSortOrder) ?? 'desc',
    stackBars: readBoolean(record.stackBars, chartIntent === 'stacked'),
    themePreset: readString(record.theme),
    timeBucketFallbackSeriesLabel: readString(record.timeBucketFallbackSeriesLabel ?? record.emptySeriesLabel),
    timeBucketFillValue: readNumber(record.timeBucketFillValue ?? record.fillMissingTimeBucketValue, 0),
    timeBucketInterval: readTimeBucketInterval(record.timeBucketInterval ?? record.fillMissingTimeBucketInterval) ?? 'auto',
    timeZone: readString(record.timeZone ?? record.xAxisTimeZone ?? record.reportTimeZone),
    topN: readPositiveInteger(record.topN ?? record.limit),
    valueDisplay: readPieValueDisplay(record.valueDisplay),
    xAxisLabel: readString(record.xAxisLabel),
    xAxisLabelAlignment: readAxisLabelAlignment(record.xAxisLabelAlignment),
    xAxisDateFormat: readString(record.xAxisDateFormat ?? record.xAxisTickFormat ?? record.dateTickFormat),
    xAxisDateFormatParameter: readString(record.xAxisDateFormatParameter ?? record.xAxisDateFormatParam ?? record.dateFormatParameter),
    xAxisDateFormats: readStringRecord(record.xAxisDateFormats ?? record.xAxisDateFormatByValue ?? record.xAxisDateFormatByParameter),
    xAxisDateMidnightFormat: readString(record.xAxisDateMidnightFormat ?? record.xAxisMidnightDateFormat),
    xAxisDateMidnightFormats: readStringRecord(record.xAxisDateMidnightFormats ?? record.xAxisDateMidnightFormatByValue ?? record.xAxisDateMidnightFormatByParameter),
    xAxisDateLabelMode: readXAxisDateLabelMode(record.xAxisDateLabelMode ?? record.xAxisLabelMode ?? record.dateLabelMode),
    xAxisLabelRotation: readRotation(record.xAxisLabelRotation),
    xValueColors: mergeRecords(indexedColors(record.colors), readStringRecord(record.xValueColors ?? record.sliceColors)),
    y2AxisLabel: readString(record.y2AxisLabel ?? record.y2Label ?? y2Axis.label),
    y2AxisPaddingMode: readAxisPaddingMode(record.y2AxisPaddingMode ?? y2Axis.paddingMode) ?? 'none',
    y2AxisPaddingRatio: readRangeNumber(record.y2AxisPaddingRatio ?? y2Axis.paddingRatio, 0, 2),
    y2AxisStartMode: readAxisStartMode(record.y2AxisStartMode) ?? 'zero',
    y2AxisTickPadding: readRangeNumber(record.y2AxisTickPadding ?? y2Axis.tickPadding, 0, 40),
    y2AxisTitlePadding: readRangeNumber(record.y2AxisTitlePadding ?? y2Axis.titlePadding, 0, 40),
    yAxisLabel: readString(record.yAxisLabel),
    yAxisPaddingMode: readAxisPaddingMode(record.yAxisPaddingMode ?? record.valueAxisPaddingMode),
    yAxisPaddingRatio: readRangeNumber(record.yAxisPaddingRatio ?? record.valueAxisPaddingRatio, 0, 2),
    yAxisStartMode: readAxisStartMode(record.yAxisStartMode) ?? 'zero',
    yAxisTickPadding: readRangeNumber(record.yAxisTickPadding ?? record.valueAxisTickPadding, 0, 40),
    yAxisTitlePadding: readRangeNumber(record.yAxisTitlePadding ?? record.valueAxisTitlePadding, 0, 40),
    ySeriesAxis: mergeRecords(readStringRecord(record.ySeriesAxis ?? record.seriesAxis), seriesMaps.axis),
    ySeriesColors: mergeRecords(readStringRecord(record.ySeriesColors ?? record.seriesColors), seriesMaps.colors),
    ySeriesCurrencySymbol: readStringRecord(record.ySeriesCurrencySymbol),
    ySeriesDecimals: readStringRecord(record.ySeriesDecimals),
    ySeriesFormat: readStringRecord(record.ySeriesFormat),
    ySeriesLabels,
    ySeriesPrefix: readStringRecord(record.ySeriesPrefix),
    ySeriesThousandsSeparator: readThousandsSeparatorRecord(record.ySeriesThousandsSeparator),
    ySeriesType: mergeRecords(readStringRecord(record.ySeriesType ?? record.ySeriesTypes ?? record.seriesTypes), seriesMaps.types)
  });
}

function readChartSpacingPreset(value: unknown): ChartSpacingPreset | undefined {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'highcharts' || normalized === 'legacy' || normalized === 'report') return normalized;
  return undefined;
}

function readSeriesMaps(record: SpecRecord) {
  const series = Array.isArray(record.ySeries) ? record.ySeries : [];
  const maps = { axis: {}, colors: {}, labels: {}, types: {} } as Record<'axis' | 'colors' | 'labels' | 'types', Record<string, string>>;
  for (const item of series) {
    if (typeof item === 'string') continue;
    const entry = readRecord(item);
    const field = readString(entry.field ?? entry.id);
    if (!field) continue;
    const label = readString(entry.label);
    const color = readString(entry.color);
    const type = readString(entry.type ?? entry.chartType);
    if (label) maps.labels[field] = label;
    if (color) maps.colors[field] = color;
    if (type) maps.types[field] = type;
    if (entry.useY2Axis === true) maps.axis[field] = 'y2';
  }
  return maps;
}

function withSeriesLabelAliases(options: BaseChartOptions): BaseChartOptions {
  const aliases = Object.entries(options.ySeriesLabels);
  const aliasRecord = <T extends string>(record: Record<string, T>): Record<string, T> => ({
    ...record,
    ...Object.fromEntries(aliases.flatMap(([field, label]) => record[field] ? [[label, record[field]]] : [])) as Record<string, T>,
    ...Object.fromEntries(Object.entries(record).flatMap(([field, value]) => {
      const defaultLabel = labelFor(field);
      return defaultLabel !== field ? [[defaultLabel, value]] : [];
    })) as Record<string, T>
  });
  return {
    ...options,
    ySeriesAxis: aliasRecord(options.ySeriesAxis),
    ySeriesColors: aliasRecord(options.ySeriesColors),
    ySeriesCurrencySymbol: aliasRecord(options.ySeriesCurrencySymbol),
    ySeriesDecimals: aliasRecord(options.ySeriesDecimals),
    ySeriesFormat: aliasRecord(options.ySeriesFormat),
    ySeriesPrefix: aliasRecord(options.ySeriesPrefix),
    ySeriesThousandsSeparator: aliasRecord(options.ySeriesThousandsSeparator),
    ySeriesType: aliasRecord(options.ySeriesType)
  };
}

function readChartIntent(record: SpecRecord): ChartIntent {
  const value = readString(record.chartType ?? record.type ?? record.kind)?.toLowerCase();
  if (value === 'donut') return 'doughnut';
  if (value === 'area' || value === 'bar' || value === 'column' || value === 'doughnut' || value === 'line' || value === 'pie' || value === 'stacked') {
    return value;
  }
  return 'bar';
}

function readLegendPosition(value: unknown): LegendPosition | undefined {
  return value === 'bottom' || value === 'left' || value === 'right' || value === 'top' ? value : undefined;
}

function readLegendMarkerStyle(value: unknown): LegendMarkerStyle | undefined {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'box' || normalized === 'default' || normalized === 'square') return 'box';
  if (normalized === 'line-marker' || normalized === 'line' || normalized === 'highcharts') return 'line-marker';
  if (normalized === 'point' || normalized === 'circle') return 'point';
  return undefined;
}

function readSortDirection(value: unknown): SortDirection | undefined {
  return value === 'asc' || value === 'desc' ? value : undefined;
}

function readPieValueDisplay(value: unknown): PieValueDisplay | undefined {
  return value === 'both' || value === 'chart' || value === 'legend' || value === 'none' ? value : undefined;
}

function readTimeBucketInterval(value: unknown): TimeBucketInterval | undefined {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'auto' || normalized === 'hour' || normalized === 'day' || normalized === 'week' || normalized === 'month') return normalized;
  if (normalized === 'daily') return 'day';
  if (normalized === 'hourly') return 'hour';
  if (normalized === 'weekly') return 'week';
  if (normalized === 'monthly') return 'month';
  return undefined;
}

function readAxisLabelAlignment(value: unknown): 'center' | 'end' | 'inner' | 'start' | undefined {
  return value === 'center' || value === 'end' || value === 'inner' || value === 'start' ? value : undefined;
}

function readXAxisDateLabelMode(value: unknown): XAxisDateLabelMode | undefined {
  return value === 'auto-period' || value === 'date' || value === 'datetime' || value === 'time' ? value : undefined;
}

function readAxisStartMode(value: unknown): AxisStartMode | undefined {
  return value === 'auto' || value === 'zero' ? value : undefined;
}

function readAxisPaddingMode(value: unknown): AxisPaddingMode {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'auto') return 'auto';
  if (normalized === 'zero-centered' || normalized === 'zero-centred' || normalized === 'highcharts' || normalized === 'legacy') return 'zero-centered';
  return 'none';
}

function readLineInterpolation(value: unknown): LineInterpolation | undefined {
  if (value === false) return 'straight';
  if (value === true) return 'curved';
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'straight' || normalized === 'linear' || normalized === 'none') return 'straight';
  if (normalized === 'curved' || normalized === 'smooth' || normalized === 'spline') return 'curved';
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readStringRecord(value: unknown): Record<string, string> {
  const record = readRecord(value);
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string' && entry[1].trim().length > 0
  ));
}

function readThousandsSeparatorRecord(value: unknown): Record<string, ThousandsSeparatorStyle> {
  const record = readStringRecord(value);
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, ThousandsSeparatorStyle] =>
    entry[1] === 'comma' || entry[1] === 'none' || entry[1] === 'space'
  ));
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

function readNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function readRangeNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}

function readRotation(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(90, Math.round(value)));
}

function indexedColors(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(value.flatMap((item, index) => typeof item === 'string' && item.trim() ? [[String(index), item.trim()]] : []));
}

function mergeRecords(...records: Array<Record<string, string>>): Record<string, string> {
  return Object.assign({}, ...records);
}
