export function applyCardSupportingPlanConfig(
  config: Record<string, unknown>,
  params: Record<string, unknown>,
  fieldFormats: Record<string, string>,
  aggregations: Record<string, string>
): void {
  const field = readString(params.supportingField);
  const aggregation = readEnum(params.supportingAggregation, ['avg', 'count', 'first', 'last', 'max', 'min', 'sum']);
  const format = readEnum(params.supportingFormat, ['currency', 'number', 'percentage']);
  setString(config, 'supportingField', field);
  setString(config, 'supportingAggregation', aggregation);
  setString(config, 'supportingFormat', format);
  setString(config, 'supportingLabel', readString(params.supportingLabel));
  setString(config, 'supportingTone', readEnum(params.supportingTone, ['danger', 'default', 'info', 'success', 'warning']));
  setString(config, 'supportingCurrencySymbol', readString(params.supportingCurrencySymbol));

  const precision = readNumber(params.supportingPrecision);
  if (precision !== undefined && precision >= 0 && precision <= 6) config.supportingPrecision = precision;
  if (field && aggregation) aggregations[field] = aggregation;
  if (field && format) fieldFormats[field] = format;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const normalized = readString(value);
  return normalized && allowed.includes(normalized as T) ? normalized as T : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function setString(config: Record<string, unknown>, key: string, value: string | undefined): void {
  if (value) config[key] = value;
}
