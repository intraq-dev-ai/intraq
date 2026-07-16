type CardLayoutMode =
  | 'two-row'
  | 'value-only'
  | 'value-sparkline'
  | 'value-trend-inline'
  | 'value-trend-sparkline'
  | 'value-trend-stacked';

const CARD_LAYOUT_CONFIG_KEYS = ['cardType', 'cardLayout', 'layout', 'layoutDesign', 'designLayout'] as const;

export function readCardLayoutModeConfig(config: Record<string, unknown>): CardLayoutMode | undefined {
  if (readConfigBoolean(config.enableTwoRowLayout) === true) return 'two-row';
  const mode = cardLayoutConfigValues(config).find((value): value is CardLayoutMode =>
    value === 'two-row'
    || value === 'value-only'
    || value === 'value-sparkline'
    || value === 'value-trend-inline'
    || value === 'value-trend-sparkline'
    || value === 'value-trend-stacked'
  );
  if (mode) return mode;
  return isLegacyPlainTwoRowCardConfig(config) ? 'two-row' : undefined;
}

export function isTwoRowCardConfig(config: Record<string, unknown>): boolean {
  return readCardLayoutModeConfig(config) === 'two-row';
}

function isLegacyPlainTwoRowCardConfig(config: Record<string, unknown>): boolean {
  if (readConfigBoolean(config.enableTwoRowLayout) === false) return false;
  const layoutValues = cardLayoutConfigEntries(config);
  const hasOnlyLegacyCardType = layoutValues.length === 1
    && layoutValues[0]?.key === 'cardType'
    && layoutValues[0].value === 'card';
  if (layoutValues.length > 0 && !hasOnlyLegacyCardType) return false;
  return !hasExplicitKpiEnhancement(config);
}

function hasExplicitKpiEnhancement(config: Record<string, unknown>): boolean {
  return readConfigBoolean(config.showIndicator) === true
    || readConfigBoolean(config.showTrend) === true
    || readConfigBoolean(config.showSparkline) === true
    || readConfigString(config.trendField).length > 0
    || readConfigString(config.comparisonField).length > 0
    || readConfigString(config.sparklineField).length > 0
    || isNonEmptyRecord(config.statusIndicator);
}

function cardLayoutConfigValues(config: Record<string, unknown>): string[] {
  return cardLayoutConfigEntries(config).map(entry => entry.value);
}

function cardLayoutConfigEntries(config: Record<string, unknown>): Array<{ key: typeof CARD_LAYOUT_CONFIG_KEYS[number]; value: string }> {
  return CARD_LAYOUT_CONFIG_KEYS.flatMap(key =>
    readConfigString(config[key]).map(value => ({ key, value: value.toLowerCase() }))
  );
}

function readConfigString(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function readConfigBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function isNonEmptyRecord(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0);
}
