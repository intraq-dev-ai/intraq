import type { DashboardElement, VisualizationData, VisualizationSpec } from '../types';
import { readCardLayoutModeConfig } from '../card-layout-config';
import { formatMetric, labelFor, type MetricDisplayFormat, type MetricFormat, type MetricFormatOptions, numericMetricValue } from './formatting';
import { measureEncodings, primaryNumberFormat } from './spec';
import { aggregateNumbers, aggregateRows, type AggregationType, readAggregationType, readBoolean, readString } from './view-model-config';
import { readConfiguredFormats } from './view-model-runtime';
import { cardDisplayOptions } from './card-view-display-options';
import { cardSupportingMetric } from './card-supporting-metric';
import type {
  DashboardCardContentToken,
  DashboardCardComparisonDirection,
  DashboardCardComparisonDisplayMode,
  DashboardCardLayoutMode,
  DashboardCardModel,
  DashboardCardSegment,
  DashboardCardSparklineType,
  DashboardStatusTone,
  TrendDirection
} from './view-model-types';

type CardStatusIndicatorConfig = {
  mode: 'threshold';
  polarity: 'higher-is-better' | 'lower-is-better';
  goodThreshold: number;
  warningThreshold: number;
};

type CardTrendDetails = ReturnType<typeof trendDetails>;

type CardComparisonConfig = {
  direction: DashboardCardComparisonDirection;
  displayMode: DashboardCardComparisonDisplayMode;
};

export function buildCardViewModel(
  spec: VisualizationSpec,
  data: VisualizationData,
  element?: DashboardElement
): DashboardCardModel {
  const measure = measureEncodings(spec)[0];
  const config = element?.config ?? {};
  if (isUnconfiguredCardHusk(spec, data)) return cardHuskModel(spec, config, element);
  const valueField = readString(config.yField) ?? readString(config.valueField) ?? readString(config.field) ?? measure?.field ?? data.datasets[0]?.label ?? 'value';
  const aggregationType = readAggregationType(config.aggregationType) ?? readAggregationType(measure?.aggregation) ?? 'sum';
  const format = readCardFormat(config) ?? readConfiguredFormat(config.fieldFormats, valueField) ?? measure?.format ?? primaryNumberFormat(spec);
  const formatOptions = readCardFormatOptions(config);
  const statusConfig = readCardStatusConfig(config);
  const comparisonConfig = readCardComparisonConfig(config);
  const rawModel = data.rawData?.length
    ? rawCardValues(data.rawData, valueField, format, formatOptions, aggregationType, config, statusConfig, comparisonConfig)
    : null;
  const values = data.datasets[0]?.data ?? [];
  const total = rawModel?.total ?? aggregateNumbers(values, aggregationType);
  const trend = rawModel?.trend ?? trendDetails(numericMetricValue(values[0]), numericMetricValue(values.at(-1)), format, formatOptions);
  const segments = rawModel?.segments ?? data.labels.map((label, index) => {
    const numericValue = numericMetricValue(values[index] ?? 0);
    const status = resolveCardStatus(numericValue, null, statusConfig);
    return {
      label: String(label),
      ...(status ? { statusLabel: status.label, statusTone: status.tone } : {}),
      value: formatMetric(values[index] ?? 0, format, { ...formatOptions, compact: true, maximumFractionDigits: 2 })
    };
  });
  const layoutMode = readCardLayoutMode(config);
  const twoRowModel = layoutMode === 'two-row' ? readTwoRowModel(config) : undefined;
  const showTrend = layoutMode && layoutMode !== 'two-row' ? layoutMode.includes('trend') : (readBoolean(config.showTrend) ?? true);
  const configuredShowIndicator = readBoolean(config.showIndicator) ?? (twoRowModel ? false : true);
  const showIndicator = layoutMode && layoutMode !== 'two-row' ? showTrend && configuredShowIndicator : configuredShowIndicator;
  const showSparkline = layoutMode && layoutMode !== 'two-row'
    ? layoutMode.includes('sparkline')
    : (readBoolean(config.showSparkline) ?? Boolean(twoRowModel && hasContentToken(twoRowModel, 'sparkline')));
  const sparklineType = readSparklineType(config.sparklineType);
  const comparisonTone = trendStatusTone(trend.direction, comparisonConfig.direction);
  const status = resolveCardStatus(total, trend, statusConfig, comparisonConfig.direction);
  return {
    label: readString(config.title) ?? (measure?.field === valueField ? (measure.label ?? labelFor(valueField)) : labelFor(valueField || spec.title)),
    value: formatMetric(total, format, { ...formatOptions, compact: true, maximumFractionDigits: 2 }),
    segments,
    isMulti: Boolean(readString(config.xField) && segments.length > 1),
    trendLabel: showTrend ? trend.label : '',
    trendDirection: trend.direction,
    comparisonContext: readString(config.comparisonContext),
    comparisonDisplayMode: comparisonConfig.displayMode,
    comparisonTone,
    statusLabel: showIndicator ? (status?.label ?? '') : '',
    ...(showIndicator && status ? { statusTone: status.tone } : {}),
    trendDeltaLabel: showTrend ? trend.deltaLabel : '',
    helper: `${segments.length} segment${segments.length === 1 ? '' : 's'}`,
    ...(layoutMode ? { layoutMode } : {}),
    ...(twoRowModel ? { cardType: 'two-row' as const, twoRow: twoRowModel } : {}),
    showTrend,
    showIndicator,
    showSparkline,
    sparkline: showSparkline ? (rawModel?.sparkline ?? values.map(numericMetricValue)) : [],
    ...(sparklineType ? { sparklineType } : {}),
    ...sparklineOptions(rawModel?.sparkline ?? values.map(numericMetricValue), config, format, formatOptions),
    ...cardDisplayOptions(config),
    ...cardSupportingMetric(data.rawData, config),
    ...comparisonLabelPatch(data.rawData, config, format, formatOptions, aggregationType)
  };
}

function isUnconfiguredCardHusk(
  spec: VisualizationSpec,
  data: VisualizationData
): boolean {
  return spec.kind === 'card'
    && spec.encodings.length === 0
    && data.datasets.length > 0
    && data.datasets.every(dataset => dataset.placeholder === true);
}

function cardHuskModel(
  spec: VisualizationSpec,
  config: Record<string, unknown>,
  element?: DashboardElement
): DashboardCardModel {
  const layoutMode = readCardLayoutMode(config);
  const twoRowModel = layoutMode === 'two-row' ? readTwoRowModel(config) : undefined;
  return {
    label: readString(config.title) ?? element?.name ?? spec.title,
    value: '',
    segments: [],
    isMulti: false,
    trendLabel: '',
    trendDirection: 'neutral',
    statusLabel: '',
    trendDeltaLabel: '',
    helper: '',
    ...(layoutMode ? { layoutMode } : {}),
    ...(twoRowModel ? { cardType: 'two-row' as const, twoRow: twoRowModel } : {}),
    showTrend: false,
    showIndicator: false,
    showSparkline: false,
    sparkline: [],
    ...(readSparklineType(config.sparklineType) ? { sparklineType: readSparklineType(config.sparklineType) } : {}),
    ...cardDisplayOptions(config)
  };
}

function rawCardValues(
  rawRows: Array<Record<string, unknown>>,
  valueField: string,
  format: MetricDisplayFormat | undefined,
  formatOptions: MetricFormatOptions,
  aggregationType: AggregationType,
  config: Record<string, unknown>,
  statusConfig: CardStatusIndicatorConfig | null,
  comparisonConfig: CardComparisonConfig
): { segments: DashboardCardSegment[]; sparkline: number[]; total: number; trend: ReturnType<typeof trendDetails> } {
  const xField = readString(config.xField);
  const trendField = readString(config.trendField);
  const comparisonField = readString(config.comparisonField) ?? trendField;
  const trendComparisonField = trendField ?? comparisonField;
  const total = aggregateRows(rawRows, valueField, aggregationType);
  const groups = xField ? groupRowsByField(rawRows, xField) : new Map([[valueField, rawRows]]);
  const segments = Array.from(groups.entries()).map(([label, rows]) => {
    const value = aggregateRows(rows, valueField, aggregationType);
    const segmentSparkline = sparklineValues(rows, readString(config.sparklineField) ?? valueField);
    const comparison = trendComparisonField ? aggregateAvailableRows(rows, trendComparisonField, aggregationType, ['target_value']) : segmentSparkline[0] ?? numericMetricValue(rows[0]?.[valueField]);
    const trend = trendDetails(comparison, value, format, formatOptions);
    const status = resolveCardStatus(value, trend, statusConfig, comparisonConfig.direction);
    return {
      label,
      sparkline: segmentSparkline,
      ...(status ? { statusLabel: status.label, statusTone: status.tone } : {}),
      comparisonLabel: formatMetric(comparison, format, { ...formatOptions, compact: true, maximumFractionDigits: 2 }),
      trendDeltaLabel: trend.deltaLabel,
      trendDirection: trend.direction,
      trendLabel: trend.label,
      trendTone: trendStatusTone(trend.direction, comparisonConfig.direction),
      value: formatMetric(value, format, { ...formatOptions, compact: true, maximumFractionDigits: 2 })
    };
  });
  const comparison = trendComparisonField ? aggregateAvailableRows(rawRows, trendComparisonField, aggregationType, ['target_value']) : numericMetricValue(rawRows[0]?.[valueField]);
  return {
    total,
    segments,
    trend: trendDetails(comparison, total, format, formatOptions),
    sparkline: sparklineValues(rawRows, readString(config.sparklineField) ?? valueField)
  };
}

function readCardFormat(config: Record<string, unknown>): MetricDisplayFormat | undefined {
  const formatType = readString(config.formatType);
  return formatType === 'currency' || formatType === 'date' || formatType === 'number' || formatType === 'percentage' || formatType === 'text'
    ? formatType
    : undefined;
}

function readCardFormatOptions(config: Record<string, unknown>): MetricFormatOptions {
  return {
    ...(typeof config.precision === 'number' && Number.isFinite(config.precision) ? { precision: config.precision } : {}),
    ...(readString(config.unit) ? { unit: readString(config.unit) as string } : {}),
    ...(readRawString(config.prefix) ? { prefix: readRawString(config.prefix) as string } : {}),
    ...(readRawString(config.suffix) ? { suffix: readRawString(config.suffix) as string } : {}),
    ...(readString(config.currencySymbol) ? { currencySymbol: readString(config.currencySymbol) as string } : {})
  };
}

function readSparklineType(value: unknown): DashboardCardSparklineType | undefined {
  return value === 'area' || value === 'column' || value === 'line' ? value : undefined;
}

function readRawString(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null;
}

function sparklineValues(rawRows: Array<Record<string, unknown>>, field: string): number[] {
  return rawRows.flatMap(row => {
    const value = row[field];
    if (Array.isArray(value)) return value.map(numericMetricValue);
    return [numericMetricValue(value)];
  });
}

function aggregateAvailableRows(
  rawRows: Array<Record<string, unknown>>,
  field: string,
  aggregationType: AggregationType,
  fallbackFields: string[] = []
): number {
  const availableField = [field, ...fallbackFields].find(candidate =>
    candidate && rawRows.some(row => Object.prototype.hasOwnProperty.call(row, candidate))
  );
  return availableField ? aggregateRows(rawRows, availableField, aggregationType) : 0;
}

function readConfiguredFormat(value: unknown, field: string): MetricFormat | undefined {
  return readConfiguredFormats(value)[field];
}

function groupRowsByField(rawRows: Array<Record<string, unknown>>, field: string): Map<string, Array<Record<string, unknown>>> {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rawRows) {
    const key = String(row[field] ?? 'Unassigned');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

function readCardComparisonConfig(config: Record<string, unknown>): CardComparisonConfig {
  return {
    direction: readCardComparisonDirection(config.comparisonDirection ?? config.comparisonPolarity ?? config.favorableTrend),
    displayMode: readCardComparisonDisplayMode(config.comparisonDisplayMode ?? config.comparisonDisplay ?? config.trendDisplayFormat)
  };
}

function readCardComparisonDirection(value: unknown): DashboardCardComparisonDirection {
  const direction = readString(value)?.toLowerCase();
  if (direction === 'lower-is-better' || direction === 'lower' || direction === 'descending') return 'lower-is-better';
  if (direction === 'none' || direction === 'neutral' || direction === 'off') return 'none';
  return 'higher-is-better';
}

function readCardComparisonDisplayMode(value: unknown): DashboardCardComparisonDisplayMode {
  const displayMode = readString(value)?.toLowerCase();
  if (displayMode === 'percentage' || displayMode === 'percent' || displayMode === '%') return 'percentage';
  if (displayMode === 'amount' || displayMode === 'absolute' || displayMode === 'difference' || displayMode === 'delta') return 'amount';
  if (displayMode === 'value' || displayMode === 'comparison' || displayMode === 'comparison-value') return 'value';
  return 'both';
}

function readCardLayoutMode(config: Record<string, unknown>): DashboardCardLayoutMode | undefined {
  return readCardLayoutModeConfig(config);
}

function readTwoRowModel(config: Record<string, unknown>): NonNullable<DashboardCardModel['twoRow']> {
  return {
    topContent: readContentTokens(config.topRowContent, ['title']),
    bottomContent: readContentTokens(config.bottomRowContent, ['value']),
    rowHeightRatio: readRowHeightRatio(config.rowHeightRatio)
  };
}

function hasContentToken(model: NonNullable<DashboardCardModel['twoRow']>, token: DashboardCardContentToken): boolean {
  return model.topContent.includes(token) || model.bottomContent.includes(token);
}

function readContentTokens(value: unknown, fallback: DashboardCardContentToken[]): DashboardCardContentToken[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const tokens = values.flatMap(token => contentToken(String(token).trim()));
  return tokens.length ? tokens : fallback;
}

function contentToken(value: string): DashboardCardContentToken[] {
  const normalized = value.toLowerCase();
  if (normalized === 'comparison' || normalized === 'compare') return ['comparison'];
  if (normalized === 'delta') return ['delta'];
  if (normalized === 'empty' || normalized === 'none') return ['empty'];
  if (normalized === 'sparkline') return ['sparkline'];
  if (normalized === 'status' || normalized === 'indicator') return ['status'];
  if (normalized === 'title') return ['title'];
  if (normalized === 'title-value' || normalized === 'title_value') return ['title', 'value'];
  if (normalized === 'trend') return ['trend'];
  if (normalized === 'trend-indicator') return ['trend', 'status'];
  if (normalized === 'value') return ['value'];
  if (normalized === 'value-sparkline') return ['value', 'sparkline'];
  return [];
}

function readRowHeightRatio(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return `${value}fr 1fr`;
  const ratio = readString(value);
  if (!ratio) return '1fr 1fr';
  const pair = ratio.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (pair) return `${pair[1]}fr ${pair[2]}fr`;
  const percentPair = ratio.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (percentPair) return `${percentPair[1]}fr ${percentPair[2]}fr`;
  return /^(\d+(?:\.\d+)?(?:fr|%|px|rem|em)\s+){1}\d+(?:\.\d+)?(?:fr|%|px|rem|em)$/.test(ratio) ? ratio : '1fr 1fr';
}

function comparisonLabelPatch(
  rawRows: Array<Record<string, unknown>> | undefined,
  config: Record<string, unknown>,
  format: MetricDisplayFormat | undefined,
  formatOptions: MetricFormatOptions,
  aggregationType: AggregationType
): Pick<DashboardCardModel, 'comparisonLabel'> {
  const comparisonField = readString(config.comparisonField);
  if (!rawRows?.length || !comparisonField) return {};
  const comparison = aggregateAvailableRows(rawRows, comparisonField, aggregationType, ['target_value']);
  return { comparisonLabel: formatMetric(comparison, format, { ...formatOptions, compact: true, maximumFractionDigits: 2 }) };
}

function sparklineOptions(
  sparkline: number[],
  config: Record<string, unknown>,
  format: MetricDisplayFormat | undefined,
  formatOptions: MetricFormatOptions
): Partial<DashboardCardModel> {
  const showMinMaxAvg = readBoolean(config.showMinMaxAvg) ?? true;
  const options: Partial<DashboardCardModel> = {
    ...(readString(config.sparklineColor) ? { sparklineColor: readString(config.sparklineColor) as string } : {}),
    showMinMaxAvg
  };
  if (showMinMaxAvg && sparkline.length) {
    options.sparklineStats = sparklineStats(sparkline, format, formatOptions);
  }
  return options;
}

function sparklineStats(
  sparkline: number[],
  format: MetricDisplayFormat | undefined,
  formatOptions: MetricFormatOptions
): NonNullable<DashboardCardModel['sparklineStats']> {
  const formatStat = (value: number) => formatMetric(value, format, { ...formatOptions, compact: true, maximumFractionDigits: 2 });
  return {
    avg: formatStat(aggregateNumbers(sparkline, 'avg')),
    max: formatStat(aggregateNumbers(sparkline, 'max')),
    min: formatStat(aggregateNumbers(sparkline, 'min'))
  };
}

function trendDetails(
  first: number,
  last: number,
  format?: MetricDisplayFormat,
  formatOptions: MetricFormatOptions = {}
): { deltaLabel: string; direction: TrendDirection; label: string; status: string } {
  const formattedZero = formatMetric(0, format, { ...formatOptions, compact: true, maximumFractionDigits: 1 });
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0 || first === last) {
    return { deltaLabel: formattedZero, direction: 'neutral', label: '0%', status: 'Stable' };
  }
  const direction = last > first ? 'up' : 'down';
  const absoluteDelta = last - first;
  const delta = ((last - first) / Math.abs(first)) * 100;
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
    signDisplay: 'exceptZero'
  }).format(delta);
  const deltaLabel = signedMetricLabel(formatMetric(absoluteDelta, format, {
    ...formatOptions,
    compact: true,
    maximumFractionDigits: 1
  }), absoluteDelta);
  return {
    deltaLabel,
    direction,
    label: `${formatted}%`,
    status: direction === 'up' ? 'Increasing' : 'Decreasing'
  };
}

function signedMetricLabel(label: string, value: number): string {
  if (value <= 0 || label.startsWith('-') || label.startsWith('+')) return label;
  return `+${label}`;
}

function readCardStatusConfig(config: Record<string, unknown>): CardStatusIndicatorConfig | null {
  const source = config.statusIndicator;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const values = source as Record<string, unknown>;
  const goodThreshold = readFiniteNumber(values.goodThreshold ?? values.successThreshold);
  const warningThreshold = readFiniteNumber(values.warningThreshold);
  if (goodThreshold === null || warningThreshold === null) return null;
  const polarity = readString(values.polarity) === 'lower-is-better' ? 'lower-is-better' : 'higher-is-better';
  return {
    goodThreshold,
    mode: 'threshold',
    polarity,
    warningThreshold
  };
}

function resolveCardStatus(
  value: number,
  trend: CardTrendDetails | null,
  statusConfig: CardStatusIndicatorConfig | null,
  comparisonDirection: DashboardCardComparisonDirection = 'higher-is-better'
): { label: string; tone: DashboardStatusTone } | null {
  if (statusConfig && Number.isFinite(value)) {
    return thresholdCardStatus(value, statusConfig);
  }
  if (!trend) return null;
  return {
    label: trend.status,
    tone: trendStatusTone(trend.direction, comparisonDirection)
  };
}

function thresholdCardStatus(
  value: number,
  statusConfig: CardStatusIndicatorConfig
): { label: string; tone: DashboardStatusTone } {
  const sorted = sortThresholds(statusConfig.goodThreshold, statusConfig.warningThreshold, statusConfig.polarity);
  if (statusConfig.polarity === 'lower-is-better') {
    if (value <= sorted.goodThreshold) return { label: 'Good', tone: 'success' };
    if (value <= sorted.warningThreshold) return { label: 'Warning', tone: 'warning' };
    return { label: 'Bad', tone: 'danger' };
  }
  if (value >= sorted.goodThreshold) return { label: 'Good', tone: 'success' };
  if (value >= sorted.warningThreshold) return { label: 'Warning', tone: 'warning' };
  return { label: 'Bad', tone: 'danger' };
}

function sortThresholds(
  goodThreshold: number,
  warningThreshold: number,
  polarity: CardStatusIndicatorConfig['polarity']
): { goodThreshold: number; warningThreshold: number } {
  if (polarity === 'lower-is-better') {
    return goodThreshold <= warningThreshold
      ? { goodThreshold, warningThreshold }
      : { goodThreshold: warningThreshold, warningThreshold: goodThreshold };
  }
  return goodThreshold >= warningThreshold
    ? { goodThreshold, warningThreshold }
    : { goodThreshold: warningThreshold, warningThreshold: goodThreshold };
}

function trendStatusTone(direction: TrendDirection, comparisonDirection: DashboardCardComparisonDirection = 'higher-is-better'): DashboardStatusTone {
  if (direction === 'neutral' || comparisonDirection === 'none') return 'default';
  if (comparisonDirection === 'lower-is-better') return direction === 'down' ? 'success' : 'danger';
  if (direction === 'up') return 'success';
  if (direction === 'down') return 'danger';
  return 'default';
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
