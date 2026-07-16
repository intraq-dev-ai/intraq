import {
  parseConfigRecord,
  parseOptionalJson,
  setStringConfig
} from './dashboardElementEditorConfig';
import type { DashboardElementEditorState } from './dashboardElementEditorState';
import {
  chartUsesSingleValue,
  setNullableNumberConfig,
  setOptionalConfig,
  setRecordConfig
} from './dashboardElementEditorUtils';

export function applyChartConfig(
  config: Record<string, unknown>,
  state: DashboardElementEditorState,
  setConfigError: (message: string) => void
): boolean {
  const {
    calculatedFieldsText, cardAggregationType, cardFormatType, chartBooleanFalseLabel,
    chartBooleanTrueLabel, chartColorTheme, chartDataLabelPosition, chartEnableY2, chartExportJpeg,
    chartExportPdf, chartExportPng, chartExportPrint, chartExportSvg, chartFillMissingTimeBuckets,
    chartLegendItemsPerPage, chartLegendMarkerStyle, chartLegendPosition, chartLineInterpolation,
    chartLineTension, chartMixedAxisPrimaryHeadroomRatio, chartPaddingBottom, chartPaddingLeft,
    chartPaddingRight, chartPaddingTop, chartRangeSize, chartRangeStart, chartSeriesAxesText,
    chartSeriesChartTypesText, chartSeriesColorsText, chartSeriesCurrencySymbolText,
    chartSeriesDecimalsText, chartSeriesFormatText, chartSeriesLabelsText, chartSeriesPrefixText,
    chartSeriesThousandsSeparatorText, chartSeriesTypesText, chartShowDataLabels, chartShowExportMenu,
    chartShowGrid, chartShowXAxis, chartShowYAxis, chartSortBy, chartSortDirection, chartSpacingPreset,
    chartStackBars, chartTheme, chartTimeBucketFillValue, chartTimeBucketInterval, chartTimeZone,
    chartTopN, chartValueDisplay, chartWeekNumbering, chartWeekStartDay, chartXAxisDateFormat,
    chartXAxisDateFormatParameter, chartXAxisDateFormatsText, chartXAxisDateMidnightFormat,
    chartXAxisDateMidnightFormatsText, chartXAxisDisplayField, chartXAxisFiscalStart,
    chartXAxisFormat, chartXAxisGrouping, chartXAxisLabel, chartXAxisLabelAlignment,
    chartXAxisLabelDisplay, chartXAxisLabelRotation, chartXAxisSortField, chartXAxisSortOrder,
    chartXAxisValueField, chartXAxisYearType, chartXValueColorsText, chartY2AxisLabel,
    chartY2AxisPaddingMode, chartY2AxisPaddingRatio, chartY2AxisStartMode, chartYAxisLabel,
    chartYAxisPaddingMode, chartYAxisPaddingRatio, chartYAxisStartMode, chartYAxisTickPadding,
    chartYAxisTitlePadding, elementChartType, valueField
  } = state;

  const seriesLabels = parseConfigRecord(chartSeriesLabelsText.value, 'Series labels', setConfigError);
  const seriesColors = parseConfigRecord(chartSeriesColorsText.value, 'Series colors', setConfigError);
  const seriesTypes = parseConfigRecord(chartSeriesTypesText.value, 'Series aggregations', setConfigError);
  const seriesChartTypes = parseConfigRecord(chartSeriesChartTypesText.value, 'Series chart types', setConfigError);
  const seriesAxes = parseConfigRecord(chartSeriesAxesText.value, 'Series axes', setConfigError);
  const seriesFormats = parseConfigRecord(chartSeriesFormatText.value, 'Series format types', setConfigError);
  const seriesDecimals = parseConfigRecord(chartSeriesDecimalsText.value, 'Series decimal places', setConfigError);
  const seriesCurrencySymbols = parseConfigRecord(chartSeriesCurrencySymbolText.value, 'Series currency symbols', setConfigError);
  const seriesPrefixes = parseConfigRecord(chartSeriesPrefixText.value, 'Series prefixes', setConfigError);
  const seriesThousandsSeparators = parseConfigRecord(chartSeriesThousandsSeparatorText.value, 'Series thousands separators', setConfigError);
  const xAxisDateFormats = parseConfigRecord(chartXAxisDateFormatsText.value, 'X-axis date formats', setConfigError);
  const xAxisDateMidnightFormats = parseConfigRecord(chartXAxisDateMidnightFormatsText.value, 'X-axis midnight date formats', setConfigError);
  const calculatedFields = parseOptionalJson(calculatedFieldsText.value, 'Calculated fields', setConfigError);
  if (!seriesLabels || !seriesColors || !seriesTypes || !seriesChartTypes || !seriesAxes
    || !seriesFormats || !seriesDecimals || !seriesCurrencySymbols || !seriesPrefixes || !seriesThousandsSeparators
    || !xAxisDateFormats || !xAxisDateMidnightFormats || calculatedFields === null) return false;
  config.showGrid = chartShowGrid.value;
  setStringConfig(config, 'type', elementChartType.value);
  setStringConfig(config, 'chartType', elementChartType.value);
  setStringConfig(config, 'colorTheme', chartColorTheme.value);
  setStringConfig(config, 'theme', chartTheme.value);
  config.showXAxis = chartShowXAxis.value;
  config.showYAxis = chartShowYAxis.value;
  config.showDataLabels = chartShowDataLabels.value;
  if (chartUsesSingleValue(elementChartType.value)) {
    delete config.dataLabelPosition;
    const pieMeasure = valueField.value.trim();
    config.ySeries = pieMeasure ? [pieMeasure] : [];
    config.valueField = pieMeasure;
    if (pieMeasure) {
      config.aggregations = { [pieMeasure]: cardAggregationType.value };
      config.ySeriesSummarize = { [pieMeasure]: cardAggregationType.value };
    } else {
      delete config.aggregations;
      delete config.ySeriesSummarize;
    }
    setStringConfig(config, 'dataLabelFormat', cardFormatType.value);
    setNullableNumberConfig(config, 'legendItemsPerPage', chartLegendItemsPerPage.value);
    setStringConfig(config, 'valueDisplay', chartValueDisplay.value);
    const xValueColors = parseConfigRecord(chartXValueColorsText.value, 'Slice colors', setConfigError);
    if (!xValueColors) return false;
    setRecordConfig(config, 'xValueColors', xValueColors);
  } else {
    setStringConfig(config, 'dataLabelPosition', chartDataLabelPosition.value);
    config.aggregations = seriesTypes;
    config.ySeriesSummarize = seriesTypes;
    delete config.legendItemsPerPage;
    delete config.valueDisplay;
    delete config.xValueColors;
  }
  setStringConfig(config, 'xAxisFormat', chartXAxisFormat.value);
  setStringConfig(config, 'xAxisDateFormat', chartXAxisDateFormat.value);
  setStringConfig(config, 'xAxisDateFormatParameter', chartXAxisDateFormatParameter.value);
  setStringConfig(config, 'timeZone', chartTimeZone.value);
  setRecordConfig(config, 'xAxisDateFormats', xAxisDateFormats);
  setStringConfig(config, 'xAxisDateMidnightFormat', chartXAxisDateMidnightFormat.value);
  setRecordConfig(config, 'xAxisDateMidnightFormats', xAxisDateMidnightFormats);
  setStringConfig(config, 'xAxisGrouping', chartXAxisGrouping.value);
  setStringConfig(config, 'xAxisSortOrder', chartXAxisSortOrder.value);
  setStringConfig(config, 'booleanFalseLabel', chartBooleanFalseLabel.value);
  setStringConfig(config, 'booleanTrueLabel', chartBooleanTrueLabel.value);
  setNullableNumberConfig(config, 'rangeSize', chartRangeSize.value);
  setNullableNumberConfig(config, 'rangeStart', chartRangeStart.value);
  setStringConfig(config, 'weekNumbering', chartWeekNumbering.value);
  setStringConfig(config, 'weekStartDay', chartWeekStartDay.value);
  setStringConfig(config, 'xAxisDisplayField', chartXAxisDisplayField.value);
  setNullableNumberConfig(config, 'xAxisFiscalStart', chartXAxisFiscalStart.value);
  setStringConfig(config, 'xAxisLabelAlignment', chartXAxisLabelAlignment.value);
  setStringConfig(config, 'xAxisLabelDisplay', chartXAxisLabelDisplay.value);
  setNullableNumberConfig(config, 'xAxisLabelRotation', chartXAxisLabelRotation.value);
  setStringConfig(config, 'xAxisSortField', chartXAxisSortField.value);
  setStringConfig(config, 'xAxisValueField', chartXAxisValueField.value);
  setStringConfig(config, 'xAxisYearType', chartXAxisYearType.value);
  setStringConfig(config, 'legendPosition', chartLegendPosition.value);
  setStringConfig(config, 'legendMarkerStyle', chartLegendMarkerStyle.value);
  config.showChartExportMenu = chartShowExportMenu.value;
  config.chartExportPrint = chartExportPrint.value;
  config.chartExportPng = chartExportPng.value;
  config.chartExportJpeg = chartExportJpeg.value;
  config.chartExportPdf = chartExportPdf.value;
  config.chartExportSvg = chartExportSvg.value;
  setStringConfig(config, 'chartSpacingPreset', chartSpacingPreset.value);
  setNullableNumberConfig(config, 'chartPaddingTop', chartPaddingTop.value);
  setNullableNumberConfig(config, 'chartPaddingRight', chartPaddingRight.value);
  setNullableNumberConfig(config, 'chartPaddingBottom', chartPaddingBottom.value);
  setNullableNumberConfig(config, 'chartPaddingLeft', chartPaddingLeft.value);
  delete config.customColors;
  config.stackBars = elementChartType.value === 'stacked' || chartStackBars.value;
  setStringConfig(config, 'sortBy', chartSortBy.value);
  setStringConfig(config, 'sortDirection', chartSortDirection.value);
  config.enableY2 = chartEnableY2.value;
  setStringConfig(config, 'xAxisLabel', chartXAxisLabel.value);
  setStringConfig(config, 'yAxisLabel', chartYAxisLabel.value);
  setStringConfig(config, 'y2AxisLabel', chartY2AxisLabel.value);
  setStringConfig(config, 'yAxisStartMode', chartYAxisStartMode.value);
  setStringConfig(config, 'yAxisPaddingMode', chartYAxisPaddingMode.value === 'none' ? '' : chartYAxisPaddingMode.value);
  setNullableNumberConfig(config, 'yAxisPaddingRatio', chartYAxisPaddingRatio.value);
  setNullableNumberConfig(config, 'yAxisTickPadding', chartYAxisTickPadding.value);
  setNullableNumberConfig(config, 'yAxisTitlePadding', chartYAxisTitlePadding.value);
  setNullableNumberConfig(config, 'mixedAxisPrimaryHeadroomRatio', chartMixedAxisPrimaryHeadroomRatio.value);
  setStringConfig(config, 'lineInterpolation', chartLineInterpolation.value);
  setNullableNumberConfig(config, 'lineTension', chartLineTension.value);
  if (chartFillMissingTimeBuckets.value) {
    config.fillMissingTimeBuckets = true;
    setStringConfig(config, 'timeBucketInterval', chartTimeBucketInterval.value === 'auto' ? '' : chartTimeBucketInterval.value);
    setNullableNumberConfig(config, 'timeBucketFillValue', chartTimeBucketFillValue.value);
  } else {
    delete config.fillMissingTimeBuckets;
    delete config.timeBucketInterval;
    delete config.timeBucketFillValue;
  }
  if (chartEnableY2.value) {
    setStringConfig(config, 'y2AxisStartMode', chartY2AxisStartMode.value);
    setStringConfig(config, 'y2AxisPaddingMode', chartY2AxisPaddingMode.value === 'none' ? '' : chartY2AxisPaddingMode.value);
    setNullableNumberConfig(config, 'y2AxisPaddingRatio', chartY2AxisPaddingRatio.value);
  } else {
    delete config.y2AxisStartMode;
    delete config.y2AxisPaddingMode;
    delete config.y2AxisPaddingRatio;
  }
  config.ySeriesLabels = seriesLabels;
  config.ySeriesColors = seriesColors;
  config.ySeriesAxis = seriesAxes;
  setRecordConfig(config, 'ySeriesFormat', seriesFormats);
  setRecordConfig(config, 'ySeriesDecimals', seriesDecimals);
  setRecordConfig(config, 'ySeriesCurrencySymbol', seriesCurrencySymbols);
  setRecordConfig(config, 'ySeriesPrefix', seriesPrefixes);
  setRecordConfig(config, 'ySeriesThousandsSeparator', seriesThousandsSeparators);
  setRecordConfig(config, 'ySeriesType', seriesChartTypes);
  setRecordConfig(config, 'ySeriesTypes', seriesChartTypes);
  setOptionalConfig(config, 'calculatedFields', calculatedFields);
  if (chartTopN.value && chartTopN.value > 0) {
    config.topN = chartTopN.value;
  } else {
    delete config.topN;
  }
  return true;
}
