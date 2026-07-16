import type { DashboardElement } from '../../types';
import { isTwoRowCardConfig } from '../../card-layout-config';
import {
  chartTypeForElement,
  editorTypeForElement
} from '../../dashboard-element-normalization';
import { readStoredVisualizationLimit } from '../../visualization/limit-config';
import { matrixTableFormats } from '../manual-sidebar/manualMatrixSidebarConfig';
import {
  formatConfigJson,
  formatConfigList,
  formatConfigRecord,
  formatFilterValue,
  readBoolean,
  readNullableNumber,
  readNumber,
  readString,
  readStringArray
} from './dashboardElementEditorConfig';
import type { DashboardElementEditorState } from './dashboardElementEditorState';
import {
  aggregationForField,
  aggregationRecordFallback,
  cardLayoutDesignForEditor,
  chartUsesSingleValue,
  formatRowContent,
  formatRowRatio,
  isRecord,
  multiSortFallback,
  normalizeFilterInputTypeForEditor,
  readAxisPaddingMode,
  readAxisStartMode,
  readCardComparisonDirection,
  readCardComparisonDisplayMode,
  readDatePickerDisplayMode,
  readDateRangeDisplayMode,
  readHeaderWidthMode,
  readHeaderWidthValue,
  readLineInterpolation,
  readPeriodDatePickerTheme,
  readPeriodNavigationStyle,
  readTableDataMode,
  readTableHeightMode,
  readTimeBucketInterval,
  readWidthNumberString,
  seriesTypeRecord,
  splitSeriesFallback
} from './dashboardElementEditorUtils';

export function hydrateDashboardElementEditorState(
  state: DashboardElementEditorState,
  element: DashboardElement | null
): void {
  const {
    calculatedFieldsText, cardAggregationType, cardBackgroundColor, cardBorderRadius,
    cardBottomRowContent, cardColorScheme, cardComparisonDirection, cardComparisonDisplayMode,
    cardComparisonContext, cardComparisonField, cardCurrencySymbol, cardCustomClassName, cardFormatType, cardGridColumns,
    cardSupportingAggregation, cardSupportingField, cardSupportingFormat, cardSupportingLabel, cardSupportingPrecision, cardSupportingTone,
    cardInnerGap, cardLayout, cardLayoutDesign, cardLayoutPreset, cardOuterGap, cardPrecision,
    cardPrefix, cardRowHeightRatio, cardShadow, cardShowIndicator, cardShowMinMaxAvg,
    cardShowSparkline, cardShowTrend, cardShowWrapperTitle, cardSparklineColor, cardSparklineField,
    cardSparklineType, cardStatusIndicatorGoodThreshold, cardStatusIndicatorMode,
    cardStatusIndicatorPolarity, cardStatusIndicatorWarningThreshold, cardSuffix, cardTitle,
    cardTitleBackground, cardTitleColor, cardTitleFontSize, cardTitlePosition, cardTopRowContent,
    cardTrendField, cardType, cardUnit, cardValueBackground, cardValueColor, cardValueFontSize,
    cardWrapperTitle, cardYField, chartBooleanFalseLabel, chartBooleanTrueLabel, chartColorTheme,
    chartCustomColorsText, chartDataLabelPosition, chartEnableY2, chartExportJpeg, chartExportPdf,
    chartExportPng, chartExportPrint, chartExportSvg, chartFillMissingTimeBuckets,
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
    chartYAxisTitlePadding, columnsText, configError, containerBackgroundColor, containerBorderColor,
    containerBorderRadius, containerBorderWidth, containerColumns, containerGap, containerPadding,
    containerShowTitle, elementChartType, elementName, elementType, filterChrome, filterContainerId,
    filterDatePickerDisplayMode, filterDateRangeDisplayMode, filterField, filterInputType,
    filterOperator, filterPeriodActiveColor, filterPeriodBackgroundColor, filterPeriodDatePickerTheme,
    filterPeriodNavigationStyle, filterShowPeriodBottomDivider, filterTarget, filterValue,
    matrixBorderColor, matrixColumnCollapseFieldsText, matrixColumnDataDisplayMode,
    matrixColumnFieldsText, matrixColumnHeaderLabel, matrixColumnHeaderWidth,
    matrixColumnHeaderWidthType, matrixColumnWidthsText,
    matrixConditionalFormattingText, matrixDefaultColumnCollapseState, matrixDefaultRowCollapseState,
    matrixDisplayMode, matrixEnableColumnCollapse, matrixEnableRowCollapse, matrixFiltersText,
    matrixFontFamily, matrixFontSize, matrixHeaderAlign, matrixHeaderBg, matrixHeaderFontWeight,
    matrixHeaderText, matrixMultiSortText, matrixRowAlign, matrixRowBg,
    matrixRowCollapseFieldsText, matrixRowDataDisplayMode, matrixRowFieldsText, matrixRowFontWeight,
    matrixRowHeaderAlign, matrixRowHeaderBg, matrixRowHeaderFontWeight, matrixRowHeaderLabel,
    matrixRowHeaderText, matrixRowHeaderWidth, matrixRowHeaderWidthType, matrixRowText,
    matrixShowBorders, matrixShowColumnSubtotals, matrixShowColumnTotals, matrixShowRowSubtotals,
    matrixShowRowTotals, matrixShowTitle, matrixShowValueHeaders, matrixSortBy, matrixSortDirection,
    matrixTitleColor, matrixTitleFontSize, matrixTitleFontWeight, matrixValueFieldsText,
    matrixValueHeaderLabel, matrixValueHeaderWidth, measureFields, resultLimit, resultLimitExplicit,
    showLegend, showTooltip, tableActionsText, tableAlternateRowBg, tableBorderColor,
    tableBorderRadius, tableCellPadding, tableConditionalFormattingText, tableDataMode,
    tableDisplayMode, tableEnableExport, tableEnableFilters, tableEnablePagination,
    tableEnableRowSelection, tableEnableSearch, tableEnableSorting, tableFillMissingTimeBuckets,
    tableFiltersText, tableFormat, tableGroupCollapsed, tableGroupFieldsText, tableGroupShowTotals,
    tableHeaderBg, tableHeaderText, tableHeightMode, tableHideTitle, tablePageSize, tableRowBg,
    tableRowText, tableShadow, tableShowBorders, tableShowTotal, tableTimeBucketFillValue,
    tableTimeBucketInterval, tableTotalColumnsText, tableTotalLabel, tableTotalLabelColumn, valueField,
    xField
  } = state;
  const config = element?.config ?? {};
  const rowGrouping = config.rowGrouping && typeof config.rowGrouping === 'object'
    ? config.rowGrouping as Record<string, unknown>
    : {};
  const tableStyling = config.styling && typeof config.styling === 'object'
    ? config.styling as Record<string, unknown>
    : {};
  const ySeriesFields = readStringArray(config.ySeries);
  const selectedChartType = chartTypeForElement(element, 'line');
  const configuredValueField = readString(config.valueField);
  configError.value = '';
  elementName.value = element?.name ?? '';
  elementType.value = editorTypeForElement(element);
  elementChartType.value = selectedChartType;
  xField.value = readString(config.xField) ?? '';
  measureFields.value = ySeriesFields.join(', ');
  valueField.value = chartUsesSingleValue(selectedChartType)
    ? configuredValueField ?? ySeriesFields[0] ?? ''
    : readString(config.seriesBy) ?? splitSeriesFallback(configuredValueField, ySeriesFields);
  resultLimit.value = readStoredVisualizationLimit(config);
  resultLimitExplicit.value = config.limitExplicit === true || readNumber(config.limit, 25) !== 25;
  showLegend.value = readBoolean(config.showLegend, true);
  showTooltip.value = readBoolean(config.showTooltip, true);
  columnsText.value = formatConfigList(config.columns);
  tableDisplayMode.value = readString(config.tableDisplayMode) ?? readString(config.displayMode) ?? '';
  tablePageSize.value = readNumber(config.rowsPerPage ?? config.pageSize, readNumber((config.pagination as Record<string, unknown> | undefined)?.pageSize, 25));
  tableGroupFieldsText.value = formatConfigList(rowGrouping.fields ?? config.groupByFields);
  tableFiltersText.value = formatConfigJson(config.tableFilters ?? config.filterConfig ?? config.filters);
  tableActionsText.value = formatConfigJson(config.actions);
  tableEnableSearch.value = readBoolean(config.enableSearch, false);
  tableEnableFilters.value = readBoolean(config.enableFilters, false);
  tableEnableSorting.value = readBoolean(config.enableSorting, true);
  tableEnableRowSelection.value = readBoolean(config.enableRowSelection ?? config.rowSelection, false);
  tableEnableExport.value = readBoolean(config.enableExport, false);
  tableEnablePagination.value = readBoolean(config.enablePagination, false);
  tableShowTotal.value = readBoolean(config.showTotal, false);
  tableHeightMode.value = readTableHeightMode(config.tableHeightMode ?? config.heightMode);
  tableTotalColumnsText.value = formatConfigList(config.totalColumns ?? config.footerTotalColumns ?? config.totalFields);
  tableTotalLabel.value = readString(config.totalLabel ?? config.footerTotalLabel ?? config.grandTotalLabel) ?? 'Total';
  tableTotalLabelColumn.value = readString(config.totalLabelColumn ?? config.footerTotalLabelColumn ?? config.totalLabelColumnKey) ?? '';
  tableDataMode.value = readTableDataMode(config);
  tableFillMissingTimeBuckets.value = readBoolean(config.fillMissingTimeBuckets ?? config.fillMissingBuckets ?? config.timeBucketFill, false);
  tableTimeBucketInterval.value = readTimeBucketInterval(config.timeBucketInterval ?? config.fillMissingTimeBucketInterval);
  tableTimeBucketFillValue.value = readNullableNumber(config.timeBucketFillValue ?? config.fillMissingTimeBucketValue);
  tableHeaderBg.value = readString(config.headerBg ?? tableStyling.headerBackgroundColor) ?? '#f8fafc';
  tableHeaderText.value = readString(config.headerText ?? tableStyling.headerTextColor) ?? '#111827';
  tableRowBg.value = readString(config.rowBg ?? tableStyling.rowBackgroundColor) ?? '#ffffff';
  tableRowText.value = readString(config.rowText ?? tableStyling.rowTextColor) ?? '#111827';
  tableShowBorders.value = readBoolean(config.showBorders ?? tableStyling.showBorders, false);
  tableAlternateRowBg.value = readString(config.alternateRowBg) ?? '#f9fafb';
  tableBorderColor.value = readString(config.borderColor) ?? '#e5e7eb';
  tableBorderRadius.value = readString(config.borderRadius) ?? '0';
  tableCellPadding.value = readString(config.cellPadding) ?? 'medium';
  tableFormat.value = readString(config.tableFormat) ?? '';
  tableHideTitle.value = readBoolean(config.hideTitle, false);
  tableShadow.value = readString(config.shadow) ?? 'none';
  tableGroupShowTotals.value = readBoolean(rowGrouping.showTotals ?? config.groupShowTotals ?? config.showGroupTotals, false);
  tableGroupCollapsed.value = readBoolean(
    rowGrouping.collapsedByDefault
      ?? rowGrouping.defaultCollapsed
      ?? (rowGrouping.defaultExpanded === false ? true : undefined)
      ?? config.groupCollapseByDefault,
    false
  );
  tableConditionalFormattingText.value = formatConfigJson(config.conditionalFormatting ?? config.conditionalFormats);
  calculatedFieldsText.value = formatConfigJson(config.calculatedFields);
  const usesTwoRowCardLayout = isTwoRowCardConfig(config);
  cardYField.value = readString(config.yField) ?? readString(config.valueField) ?? readString(config.field) ?? '';
  cardTrendField.value = readString(config.trendField) ?? '';
  cardComparisonField.value = readString(config.comparisonField) ?? '';
  cardComparisonContext.value = readString(config.comparisonContext) ?? '';
  cardSupportingField.value = readString(config.supportingField) ?? '';
  cardSupportingAggregation.value = readString(config.supportingAggregation) ?? 'avg';
  cardSupportingFormat.value = readString(config.supportingFormat) ?? 'number';
  cardSupportingPrecision.value = readNullableNumber(config.supportingPrecision);
  cardSupportingLabel.value = readString(config.supportingLabel) ?? '';
  cardSupportingTone.value = readString(config.supportingTone) ?? 'default';
  cardComparisonDisplayMode.value = readCardComparisonDisplayMode(config.comparisonDisplayMode ?? config.comparisonDisplay ?? config.trendDisplayFormat);
  cardComparisonDirection.value = readCardComparisonDirection(config.comparisonDirection ?? config.comparisonPolarity ?? config.favorableTrend);
  cardLayout.value = usesTwoRowCardLayout ? 'two-row' : readString(config.layout) ?? readString(config.cardLayout) ?? 'single';
  cardType.value = usesTwoRowCardLayout ? 'two-row' : readString(config.cardType) ?? 'standard';
  cardLayoutDesign.value = cardLayoutDesignForEditor(config);
  cardLayoutPreset.value = readString(config.layoutPreset) ?? 'default';
  cardWrapperTitle.value = readString(config.wrapperTitle) ?? '';
  cardShowWrapperTitle.value = readBoolean(config.showWrapperTitle, false);
  cardTitle.value = readString(config.title) ?? element?.name ?? '';
  cardBackgroundColor.value = readString(config.backgroundColor) ?? readString(config.cardBackground) ?? readString(config.background) ?? '';
  cardTitleBackground.value = readString(config.titleBackground) ?? '';
  cardTitleColor.value = readString(config.titleColor) ?? '';
  cardValueBackground.value = readString(config.valueBackground) ?? '';
  cardValueColor.value = readString(config.valueColor ?? config.color) ?? '';
  cardBorderRadius.value = readString(config.borderRadius) ?? '';
  cardColorScheme.value = readString(config.colorScheme) ?? '';
  cardCustomClassName.value = readString(config.className ?? config.customClassName ?? config.class) ?? '';
  cardInnerGap.value = readString(config.innerGap) ?? '';
  cardOuterGap.value = readString(config.outerGap) ?? '';
  cardShadow.value = readString(config.shadow) ?? '';
  cardShowTrend.value = readBoolean(config.showTrend, false);
  cardShowIndicator.value = readBoolean(config.showIndicator, false);
  cardShowSparkline.value = readBoolean(config.showSparkline, false);
  const statusIndicator = isRecord(config.statusIndicator) ? config.statusIndicator : null;
  cardStatusIndicatorMode.value = readString(statusIndicator?.mode) === 'threshold' ? 'threshold' : 'trend';
  cardStatusIndicatorPolarity.value = readString(statusIndicator?.polarity) === 'lower-is-better' ? 'lower-is-better' : 'higher-is-better';
  cardStatusIndicatorGoodThreshold.value = readNullableNumber(statusIndicator?.goodThreshold ?? statusIndicator?.successThreshold);
  cardStatusIndicatorWarningThreshold.value = readNullableNumber(statusIndicator?.warningThreshold);
  cardTopRowContent.value = formatRowContent(config.topRowContent, 'title');
  cardBottomRowContent.value = formatRowContent(config.bottomRowContent, 'value');
  cardRowHeightRatio.value = formatRowRatio(config.rowHeightRatio);
  cardGridColumns.value = readNumber(config.gridColumns, 2);
  cardTitlePosition.value = readString(config.titlePosition) ?? 'top';
  cardTitleFontSize.value = readString(config.titleFontSize) ?? 'sm';
  if (cardType.value === 'two-row') {
    cardTitleFontSize.value = readString(config.titleFontSize) ?? 'medium';
    cardValueFontSize.value = readString(config.valueFontSize) ?? 'medium';
  } else {
    cardValueFontSize.value = readString(config.valueFontSize) ?? '3xl';
  }
  cardSparklineField.value = readString(config.sparklineField) ?? '';
  cardSparklineColor.value = readString(config.sparklineColor) ?? '';
  cardSparklineType.value = readString(config.sparklineType) ?? 'area';
  cardShowMinMaxAvg.value = readBoolean(config.showMinMaxAvg, false);
  cardFormatType.value = readString(config.formatType ?? config.dataLabelFormat) ?? 'number';
  cardUnit.value = readString(config.unit) ?? 'auto';
  cardPrecision.value = readNullableNumber(config.precision);
  cardPrefix.value = typeof config.prefix === 'string' ? config.prefix : '';
  cardSuffix.value = typeof config.suffix === 'string' ? config.suffix : '';
  cardCurrencySymbol.value = readString(config.currencySymbol) ?? '';
  cardAggregationType.value = readString(config.aggregationType)
    ?? aggregationForField(config, valueField.value || ySeriesFields[0] || cardYField.value)
    ?? 'sum';
  matrixRowFieldsText.value = formatConfigList(config.rowFields);
  matrixColumnFieldsText.value = formatConfigList(config.columnFields);
  matrixValueFieldsText.value = formatConfigList(config.valueFields);
  matrixDisplayMode.value = readString(config.displayMode) ?? '';
  matrixShowValueHeaders.value = readBoolean(config.showValueHeaders, false);
  matrixRowHeaderLabel.value = readString(config.rowHeaderLabel) ?? '';
  matrixColumnHeaderLabel.value = readString(config.columnHeaderLabel) ?? '';
  matrixValueHeaderLabel.value = readString(config.valueHeaderLabel) ?? '';
  matrixRowHeaderWidthType.value = readHeaderWidthMode(config.rowHeaderWidthType, config.rowHeaderWidth);
  matrixColumnHeaderWidthType.value = readHeaderWidthMode(
    config.columnHeaderWidthType,
    config.columnHeaderWidth ?? config.columnWidth ?? readHeaderWidthValue(config)
  );
  matrixRowHeaderWidth.value = readWidthNumberString(config.rowHeaderWidth);
  matrixColumnHeaderWidth.value = readWidthNumberString(config.columnHeaderWidth ?? config.columnWidth ?? readHeaderWidthValue(config));
  matrixValueHeaderWidth.value = readString(config.valueHeaderWidth) ?? '';
  matrixColumnWidthsText.value = formatConfigJson(config.columnWidths);
  matrixRowDataDisplayMode.value = readString(config.rowDataDisplayMode) ?? 'repeat';
  matrixColumnDataDisplayMode.value = readString(config.columnDataDisplayMode) ?? 'repeat';
  matrixFiltersText.value = formatConfigJson(config.matrixFilters ?? config.filterConfig ?? config.filters);
  matrixConditionalFormattingText.value = formatConfigJson(config.conditionalFormatting ?? config.conditionalFormats);
  matrixMultiSortText.value = formatConfigJson(config.multiSort ?? multiSortFallback(config));
  matrixDefaultRowCollapseState.value = readString(config.defaultRowCollapseState) ?? '';
  matrixDefaultColumnCollapseState.value = readString(config.defaultColumnCollapseState) ?? '';
  matrixSortBy.value = readString(config.sortBy) ?? '';
  matrixSortDirection.value = readString(config.sortDirection) ?? 'asc';
  matrixRowCollapseFieldsText.value = formatConfigList(config.rowCollapseFields);
  matrixColumnCollapseFieldsText.value = formatConfigList(config.columnCollapseFields);
  matrixShowRowTotals.value = readBoolean(config.showRowTotals, false);
  matrixShowColumnTotals.value = readBoolean(config.showColumnTotals, false);
  matrixShowRowSubtotals.value = readBoolean(config.showRowSubtotals, false);
  matrixShowColumnSubtotals.value = readBoolean(config.showColumnSubtotals, false);
  matrixEnableRowCollapse.value = readBoolean(config.enableRowExpandCollapse, false);
  matrixEnableColumnCollapse.value = readBoolean(config.enableColumnExpandCollapse, false);
  const matrixPreset = matrixTableFormats[readString(config.tableFormat) ?? ''];
  matrixShowBorders.value = readBoolean(config.showBorders ?? (config.styling as Record<string, unknown> | undefined)?.showBorders, matrixPreset?.showBorders ?? false);
  matrixBorderColor.value = readString(config.borderColor ?? (config.styling as Record<string, unknown> | undefined)?.borderColor) ?? matrixPreset?.borderColor ?? '#d1d5db';
  matrixHeaderBg.value = readString(config.headerBg ?? (config.styling as Record<string, unknown> | undefined)?.headerBackgroundColor) ?? matrixPreset?.headerBg ?? '#f8fafc';
  matrixHeaderText.value = readString(config.headerText ?? (config.styling as Record<string, unknown> | undefined)?.headerTextColor) ?? matrixPreset?.headerText ?? '#111827';
  matrixRowHeaderBg.value = readString(config.rowHeaderBg) ?? matrixPreset?.headerBg ?? '#ffffff';
  matrixRowHeaderText.value = readString(config.rowHeaderText) ?? matrixPreset?.headerText ?? '#111827';
  matrixRowBg.value = readString(config.rowBg ?? (config.styling as Record<string, unknown> | undefined)?.rowBackgroundColor) ?? matrixPreset?.rowBg ?? '#ffffff';
  matrixRowText.value = readString(config.rowText ?? (config.styling as Record<string, unknown> | undefined)?.rowTextColor) ?? matrixPreset?.rowText ?? '#111827';
  matrixFontFamily.value = readString(config.fontFamily) ?? '';
  matrixFontSize.value = readString(config.fontSize) ?? '';
  matrixShowTitle.value = readBoolean(config.showTitle, true);
  matrixTitleFontSize.value = readString(config.titleFontSize) ?? 'text-base';
  matrixTitleFontWeight.value = readString(config.titleFontWeight) ?? 'font-semibold';
  matrixTitleColor.value = readString(config.titleColor) ?? '#111827';
  matrixHeaderAlign.value = readString(config.headerAlign) ?? 'text-left';
  matrixHeaderFontWeight.value = readString(config.headerFontWeight) ?? 'font-semibold';
  matrixRowHeaderAlign.value = readString(config.rowHeaderAlign) ?? 'text-left';
  matrixRowHeaderFontWeight.value = readString(config.rowHeaderFontWeight) ?? 'font-medium';
  matrixRowAlign.value = readString(config.rowAlign) ?? 'text-left';
  matrixRowFontWeight.value = readString(config.rowFontWeight) ?? 'font-normal';
  chartShowGrid.value = readBoolean(config.showGrid, true);
  chartShowXAxis.value = readBoolean(config.showXAxis, true);
  chartShowYAxis.value = readBoolean(config.showYAxis, true);
  chartShowDataLabels.value = readBoolean(config.showDataLabels, false);
  chartColorTheme.value = readString(config.colorTheme) ?? '';
  chartCustomColorsText.value = formatConfigRecord(config.customColors);
  chartDataLabelPosition.value = readString(config.dataLabelPosition) ?? '';
  chartXAxisFormat.value = readString(config.xAxisFormat) ?? '';
  chartXAxisGrouping.value = readString(config.xAxisGrouping) ?? '';
  chartXAxisSortOrder.value = readString(config.xAxisSortOrder) ?? 'asc';
  chartXAxisDateFormat.value = readString(config.xAxisDateFormat ?? config.xAxisTickFormat ?? config.dateTickFormat) ?? '';
  chartXAxisDateFormatParameter.value = readString(config.xAxisDateFormatParameter ?? config.xAxisDateFormatParam ?? config.dateFormatParameter) ?? '';
  chartXAxisDateFormatsText.value = formatConfigRecord(config.xAxisDateFormats ?? config.xAxisDateFormatByValue ?? config.xAxisDateFormatByParameter);
  chartXAxisDateMidnightFormat.value = readString(config.xAxisDateMidnightFormat ?? config.xAxisMidnightDateFormat) ?? '';
  chartXAxisDateMidnightFormatsText.value = formatConfigRecord(config.xAxisDateMidnightFormats ?? config.xAxisDateMidnightFormatByValue ?? config.xAxisDateMidnightFormatByParameter);
  chartBooleanFalseLabel.value = readString(config.booleanFalseLabel) ?? '';
  chartBooleanTrueLabel.value = readString(config.booleanTrueLabel) ?? '';
  chartRangeSize.value = readNullableNumber(config.rangeSize);
  chartRangeStart.value = readNullableNumber(config.rangeStart);
  chartWeekNumbering.value = readString(config.weekNumbering) ?? '';
  chartWeekStartDay.value = readString(config.weekStartDay) ?? '';
  chartXAxisDisplayField.value = readString(config.xAxisDisplayField) ?? '';
  chartXAxisFiscalStart.value = readNullableNumber(config.xAxisFiscalStart);
  chartXAxisLabelAlignment.value = readString(config.xAxisLabelAlignment) ?? '';
  chartXAxisLabelDisplay.value = readString(config.xAxisLabelDisplay) ?? '';
  chartXAxisLabelRotation.value = readNullableNumber(config.xAxisLabelRotation);
  chartXAxisSortField.value = readString(config.xAxisSortField) ?? '';
  chartXAxisValueField.value = readString(config.xAxisValueField) ?? '';
  chartXAxisYearType.value = readString(config.xAxisYearType) ?? '';
  chartLegendPosition.value = readString(config.legendPosition) ?? 'top';
  chartLegendMarkerStyle.value = readString(config.legendMarkerStyle ?? config.legendSymbolStyle) ?? '';
  chartStackBars.value = readBoolean(config.stackBars, selectedChartType === 'stacked');
  chartTopN.value = readNullableNumber(config.topN);
  chartLegendItemsPerPage.value = readNullableNumber(config.legendItemsPerPage);
  chartShowExportMenu.value = readBoolean(config.showChartExportMenu ?? config.chartExportMenuEnabled ?? config.showChartContextMenu, false);
  chartExportPrint.value = readBoolean(config.chartExportPrint, true);
  chartExportPng.value = readBoolean(config.chartExportPng ?? config.chartExportPNG, true);
  chartExportJpeg.value = readBoolean(config.chartExportJpeg ?? config.chartExportJPEG, true);
  chartExportPdf.value = readBoolean(config.chartExportPdf ?? config.chartExportPDF, true);
  chartExportSvg.value = readBoolean(config.chartExportSvg ?? config.chartExportSVG, true);
  chartSpacingPreset.value = readString(config.chartSpacingPreset ?? config.chartPaddingPreset) ?? '';
  chartPaddingTop.value = readNullableNumber(config.chartPaddingTop ?? config.chartLayoutPaddingTop);
  chartPaddingRight.value = readNullableNumber(config.chartPaddingRight ?? config.chartLayoutPaddingRight);
  chartPaddingBottom.value = readNullableNumber(config.chartPaddingBottom ?? config.chartLayoutPaddingBottom);
  chartPaddingLeft.value = readNullableNumber(config.chartPaddingLeft ?? config.chartLayoutPaddingLeft);
  chartTheme.value = readString(config.theme) ?? '';
  chartValueDisplay.value = readString(config.valueDisplay) ?? '';
  chartXValueColorsText.value = formatConfigRecord(config.xValueColors);
  chartSortBy.value = readString(config.sortBy) ?? '';
  chartSortDirection.value = readString(config.sortDirection) ?? 'asc';
  chartEnableY2.value = readBoolean(config.enableY2, false);
  chartXAxisLabel.value = readString(config.xAxisLabel) ?? '';
  chartYAxisLabel.value = readString(config.yAxisLabel) ?? '';
  chartY2AxisLabel.value = readString(config.y2AxisLabel) ?? '';
  chartYAxisStartMode.value = readAxisStartMode(config.yAxisStartMode) ?? 'zero';
  chartYAxisPaddingMode.value = readAxisPaddingMode(config.yAxisPaddingMode);
  chartYAxisPaddingRatio.value = readNullableNumber(config.yAxisPaddingRatio);
  chartYAxisTickPadding.value = readNullableNumber(config.yAxisTickPadding ?? config.valueAxisTickPadding);
  chartYAxisTitlePadding.value = readNullableNumber(config.yAxisTitlePadding ?? config.valueAxisTitlePadding);
  chartMixedAxisPrimaryHeadroomRatio.value = readNullableNumber(config.mixedAxisPrimaryHeadroomRatio ?? config.dualAxisPrimaryHeadroomRatio);
  chartY2AxisStartMode.value = readAxisStartMode(config.y2AxisStartMode) ?? 'zero';
  chartY2AxisPaddingMode.value = readAxisPaddingMode(config.y2AxisPaddingMode);
  chartY2AxisPaddingRatio.value = readNullableNumber(config.y2AxisPaddingRatio);
  chartLineInterpolation.value = readLineInterpolation(config.lineInterpolation ?? config.lineStyle ?? config.lineCurve);
  chartLineTension.value = readNullableNumber(config.lineTension ?? config.curveTension);
  chartFillMissingTimeBuckets.value = readBoolean(config.fillMissingTimeBuckets ?? config.fillMissingBuckets ?? config.timeBucketFill, false);
  chartTimeBucketInterval.value = readTimeBucketInterval(config.timeBucketInterval ?? config.fillMissingTimeBucketInterval);
  chartTimeBucketFillValue.value = readNullableNumber(config.timeBucketFillValue ?? config.fillMissingTimeBucketValue);
  chartTimeZone.value = readString(config.timeZone ?? config.xAxisTimeZone ?? config.reportTimeZone) ?? '';
  chartSeriesLabelsText.value = formatConfigRecord(config.ySeriesLabels);
  chartSeriesColorsText.value = formatConfigRecord(config.ySeriesColors);
  chartSeriesTypesText.value = formatConfigRecord(config.ySeriesSummarize ?? config.aggregations ?? aggregationRecordFallback(config.ySeriesType));
  chartSeriesChartTypesText.value = formatConfigRecord(seriesTypeRecord(config));
  chartSeriesAxesText.value = formatConfigRecord(config.ySeriesAxis);
  chartSeriesFormatText.value = formatConfigRecord(config.ySeriesFormat);
  chartSeriesDecimalsText.value = formatConfigRecord(config.ySeriesDecimals);
  chartSeriesCurrencySymbolText.value = formatConfigRecord(config.ySeriesCurrencySymbol);
  chartSeriesPrefixText.value = formatConfigRecord(config.ySeriesPrefix);
  chartSeriesThousandsSeparatorText.value = formatConfigRecord(config.ySeriesThousandsSeparator);
  filterField.value = readString(config.field ?? config.filterField ?? config.xField) ?? '';
  filterInputType.value = normalizeFilterInputTypeForEditor(readString(config.inputType ?? config.filterType ?? config.type));
  filterOperator.value = readString(config.operator) ?? 'equals';
  filterTarget.value = readString(config.targetType ?? config.applyTo ?? config.target) ?? 'all';
  filterValue.value = formatFilterValue(config.defaultValue ?? config.value ?? config.filterValue ?? config.valueField);
  filterDatePickerDisplayMode.value = readDatePickerDisplayMode(config.datePickerDisplayMode ?? config.datePickerStyle ?? config.datePickerTheme);
  filterDateRangeDisplayMode.value = readDateRangeDisplayMode(config.dateRangeDisplayMode ?? config.rangeDisplayMode ?? config.dateRangeMode);
  filterPeriodActiveColor.value = readString(config.periodActiveColor ?? config.periodAccentColor) ?? '';
  filterPeriodBackgroundColor.value = readString(config.periodBackgroundColor ?? config.backgroundColor ?? config.background) ?? '';
  filterPeriodDatePickerTheme.value = readPeriodDatePickerTheme(config.periodDatePickerTheme ?? config.datePickerTheme ?? config.periodDateInputTheme);
  filterPeriodNavigationStyle.value = readPeriodNavigationStyle(config.periodNavigationStyle ?? config.periodToolbarNavigationStyle);
  filterShowPeriodBottomDivider.value = config.showPeriodBottomDivider !== false;
  filterChrome.value = readString(config.filterChrome ?? config.canvasChrome ?? config.componentChrome ?? config.chrome) ?? 'card';
  filterContainerId.value = readString(config.containerId) ?? '';
  containerBackgroundColor.value = readString(config.backgroundColor ?? config.background) ?? '';
  containerBorderColor.value = readString(config.borderColor) ?? '';
  containerBorderRadius.value = readString(config.borderRadius) ?? '8';
  containerBorderWidth.value = readString(config.borderWidth) ?? '1';
  containerColumns.value = readNumber(config.columns, 4);
  containerGap.value = readString(config.gap) ?? '12';
  containerPadding.value = readString(config.padding) ?? '14';
  containerShowTitle.value = readBoolean(config.showTitle, false);
}
