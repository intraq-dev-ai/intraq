import {
  parseOptionalJson,
  setStringConfig
} from './dashboardElementEditorConfig';
import type { DashboardElementEditorState } from './dashboardElementEditorState';
import {
  cardLayoutDesignForSave,
  cardLayoutForSave,
  cardTypeForSave,
  readStringRecord,
  setOptionalConfig,
  setRawStringConfig,
  setRowConfig
} from './dashboardElementEditorUtils';

export function applyCardConfig(
  config: Record<string, unknown>,
  state: DashboardElementEditorState,
  setConfigError: (message: string) => void,
  syncedTwoRowCardTitle: () => string
): boolean {
  const {
    calculatedFieldsText, cardAggregationType, cardBackgroundColor, cardBorderRadius,
    cardBottomRowContent, cardColorScheme, cardComparisonDirection, cardComparisonDisplayMode,
    cardComparisonContext, cardComparisonField, cardCurrencySymbol, cardCustomClassName, cardFormatType, cardGridColumns,
    cardInnerGap, cardLayout, cardLayoutDesign, cardLayoutPreset, cardOuterGap, cardPrecision,
    cardPrefix, cardRowHeightRatio, cardShadow, cardShowIndicator, cardShowMinMaxAvg,
    cardShowSparkline, cardShowTrend, cardShowWrapperTitle, cardSparklineColor, cardSparklineField,
    cardSparklineType, cardStatusIndicatorGoodThreshold, cardStatusIndicatorMode,
    cardStatusIndicatorPolarity, cardStatusIndicatorWarningThreshold, cardSuffix, cardTitle,
    cardSupportingAggregation, cardSupportingField, cardSupportingFormat, cardSupportingLabel,
    cardSupportingPrecision, cardSupportingTone,
    cardTitleBackground, cardTitleColor, cardTitleFontSize, cardTitlePosition, cardTopRowContent,
    cardTrendField, cardType, cardUnit, cardValueBackground, cardValueColor, cardValueFontSize,
    cardWrapperTitle, cardYField, xField
  } = state;

  const calculatedFields = parseOptionalJson(calculatedFieldsText.value, 'Calculated fields', setConfigError);
  if (calculatedFields === null) return false;
  const metricField = cardYField.value.trim();
  if (metricField) {
    config.yField = metricField;
    config.field = metricField;
    config.valueField = metricField;
  } else {
    delete config.yField;
    delete config.field;
    delete config.valueField;
  }
  config.trendField = cardTrendField.value.trim();
  config.comparisonField = cardComparisonField.value.trim();
  setStringConfig(config, 'comparisonContext', cardComparisonContext.value);
  setStringConfig(config, 'supportingField', cardSupportingField.value);
  setStringConfig(config, 'supportingAggregation', cardSupportingAggregation.value);
  setStringConfig(config, 'supportingFormat', cardSupportingFormat.value);
  setStringConfig(config, 'supportingLabel', cardSupportingLabel.value);
  setStringConfig(config, 'supportingTone', cardSupportingTone.value);
  if (typeof cardSupportingPrecision.value === 'number' && Number.isFinite(cardSupportingPrecision.value) && cardSupportingPrecision.value >= 0) {
    config.supportingPrecision = cardSupportingPrecision.value;
  } else {
    delete config.supportingPrecision;
  }
  setStringConfig(config, 'comparisonDisplayMode', cardComparisonDisplayMode.value);
  setStringConfig(config, 'comparisonDirection', cardComparisonDirection.value);
  const nextCardType = cardTypeForSave(cardType.value);
  const nextCardLayout = cardLayoutForSave(nextCardType, cardLayout.value);
  setStringConfig(config, 'layout', nextCardLayout);
  if ('cardLayout' in config || nextCardType === 'two-row') setStringConfig(config, 'cardLayout', nextCardLayout);
  setStringConfig(config, 'cardType', nextCardType);
  config.enableTwoRowLayout = nextCardType === 'two-row';
  config.hideTitle = !cardShowWrapperTitle.value;
  const nextLayoutDesign = cardLayoutDesignForSave(cardLayoutDesign.value);
  setStringConfig(config, 'layoutDesign', nextLayoutDesign);
  setStringConfig(config, 'designLayout', nextLayoutDesign);
  setStringConfig(config, 'layoutPreset', cardLayoutPreset.value);
  setStringConfig(config, 'wrapperTitle', cardWrapperTitle.value);
  config.showWrapperTitle = cardShowWrapperTitle.value;
  setStringConfig(config, 'title', nextCardType === 'two-row' ? syncedTwoRowCardTitle() : cardTitle.value);
  setStringConfig(config, 'backgroundColor', cardBackgroundColor.value);
  setStringConfig(config, 'cardBackground', cardBackgroundColor.value);
  setStringConfig(config, 'borderRadius', cardBorderRadius.value);
  setStringConfig(config, 'titleBackground', cardTitleBackground.value);
  setStringConfig(config, 'titleColor', cardTitleColor.value);
  setStringConfig(config, 'valueBackground', cardValueBackground.value);
  setStringConfig(config, 'valueColor', cardValueColor.value);
  setStringConfig(config, 'color', cardValueColor.value);
  setStringConfig(config, 'colorScheme', cardColorScheme.value);
  setStringConfig(config, 'className', cardCustomClassName.value);
  setStringConfig(config, 'customClassName', cardCustomClassName.value);
  if (xField.value.trim()) setStringConfig(config, 'innerGap', cardInnerGap.value);
  else delete config.innerGap;
  setStringConfig(config, 'outerGap', cardOuterGap.value);
  setStringConfig(config, 'shadow', cardShadow.value);
  config.showTrend = cardShowTrend.value;
  config.showIndicator = cardShowIndicator.value;
  config.showSparkline = cardShowSparkline.value;
  if (
    cardShowIndicator.value
    && cardStatusIndicatorMode.value === 'threshold'
    && typeof cardStatusIndicatorGoodThreshold.value === 'number'
    && Number.isFinite(cardStatusIndicatorGoodThreshold.value)
    && typeof cardStatusIndicatorWarningThreshold.value === 'number'
    && Number.isFinite(cardStatusIndicatorWarningThreshold.value)
  ) {
    config.statusIndicator = {
      enabled: true,
      goodThreshold: cardStatusIndicatorGoodThreshold.value,
      mode: 'threshold',
      polarity: cardStatusIndicatorPolarity.value,
      warningThreshold: cardStatusIndicatorWarningThreshold.value
    };
  } else {
    delete config.statusIndicator;
  }
  setRowConfig(config, 'topRowContent', cardTopRowContent.value, 'title');
  setRowConfig(config, 'bottomRowContent', cardBottomRowContent.value, 'value');
  setStringConfig(config, 'rowHeightRatio', cardRowHeightRatio.value);
  config.gridColumns = Math.min(Math.max(Math.floor(cardGridColumns.value), 1), 6);
  setStringConfig(config, 'titlePosition', cardTitlePosition.value);
  setStringConfig(config, 'titleFontSize', cardTitleFontSize.value);
  setStringConfig(config, 'valueFontSize', cardValueFontSize.value);
  setStringConfig(config, 'sparklineField', cardSparklineField.value);
  setStringConfig(config, 'sparklineColor', cardSparklineColor.value);
  setStringConfig(config, 'sparklineType', cardSparklineType.value);
  config.showMinMaxAvg = cardShowMinMaxAvg.value;
  setStringConfig(config, 'formatType', cardFormatType.value);
  setStringConfig(config, 'unit', cardUnit.value);
  setRawStringConfig(config, 'prefix', cardPrefix.value);
  setRawStringConfig(config, 'suffix', cardSuffix.value);
  setStringConfig(config, 'currencySymbol', cardCurrencySymbol.value);
  setStringConfig(config, 'aggregationType', cardAggregationType.value);
  syncCardMetricMetadata(config, state, metricField);
  setOptionalConfig(config, 'calculatedFields', calculatedFields);
  if (typeof cardPrecision.value !== 'number' || !Number.isFinite(cardPrecision.value) || cardPrecision.value < 0) {
    delete config.precision;
  } else {
    config.precision = cardPrecision.value;
  }
  return true;
}

function syncCardMetricMetadata(
  config: Record<string, unknown>,
  state: DashboardElementEditorState,
  metricField: string
): void {
  if (!metricField) return;
  const aggregation = state.cardAggregationType.value.trim();
  if (aggregation) {
    config.aggregations = {
      ...readStringRecord(config.aggregations),
      [metricField]: aggregation
    };
  }
  const formatType = state.cardFormatType.value.trim();
  if (formatType) {
    config.fieldFormats = {
      ...readStringRecord(config.fieldFormats),
      [metricField]: formatType
    };
  }
  const supportingField = state.cardSupportingField.value.trim();
  if (!supportingField) return;
  config.aggregations = {
    ...readStringRecord(config.aggregations),
    [supportingField]: state.cardSupportingAggregation.value.trim() || 'avg'
  };
  config.fieldFormats = {
    ...readStringRecord(config.fieldFormats),
    [supportingField]: state.cardSupportingFormat.value.trim() || 'number'
  };
}
