import { formatMetric, type MetricDisplayFormat, type MetricFormatOptions } from './formatting';
import { aggregateRows, readAggregationType, readString } from './view-model-config';
import { readConfiguredFormats } from './view-model-runtime';
import type { DashboardCardModel, DashboardStatusTone } from './view-model-types';

export function cardSupportingMetric(
  rawRows: Array<Record<string, unknown>> | undefined,
  config: Record<string, unknown>
): Pick<DashboardCardModel, 'supportingLabel' | 'supportingTone' | 'supportingValue'> {
  const field = readString(config.supportingField);
  const label = readString(config.supportingLabel);
  if (!field && !label) return {};

  const tone = supportingTone(config.supportingTone);
  const hasSupportingField = Boolean(field && rawRows?.some(row => Object.prototype.hasOwnProperty.call(row, field)));
  const value = field && hasSupportingField && rawRows?.length
    ? formatMetric(
        aggregateRows(rawRows, field, readAggregationType(config.supportingAggregation) ?? 'avg'),
        supportingFormat(config.supportingFormat, readConfiguredFormats(config.fieldFormats)[field]),
        supportingFormatOptions(config)
      )
    : undefined;

  return {
    ...(label ? { supportingLabel: label } : {}),
    ...(tone ? { supportingTone: tone } : {}),
    ...(value ? { supportingValue: value } : {})
  };
}

function supportingFormat(value: unknown, fallback: MetricDisplayFormat | undefined): MetricDisplayFormat {
  return value === 'currency' || value === 'number' || value === 'percentage' ? value : fallback ?? 'number';
}

function supportingFormatOptions(config: Record<string, unknown>): MetricFormatOptions {
  return {
    compact: true,
    maximumFractionDigits: 2,
    ...(typeof config.supportingPrecision === 'number' && Number.isFinite(config.supportingPrecision)
      ? { precision: config.supportingPrecision }
      : {}),
    ...(readString(config.supportingCurrencySymbol ?? config.currencySymbol)
      ? { currencySymbol: readString(config.supportingCurrencySymbol ?? config.currencySymbol) as string }
      : {})
  };
}

function supportingTone(value: unknown): DashboardStatusTone | undefined {
  return value === 'danger' || value === 'default' || value === 'info' || value === 'success' || value === 'warning'
    ? value
    : undefined;
}
