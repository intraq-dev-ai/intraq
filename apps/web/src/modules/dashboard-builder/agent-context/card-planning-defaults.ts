import type { BuilderActionPlan } from '../types';

const INDICATOR_TERMS = [
  'indicator',
  'indicators',
  String.raw`traffic[-\s]?light`,
  'status',
  'trend',
  'trending',
  'sparkline',
  'delta',
  'variance',
  String.raw`up\/down`,
  'up down',
  'arrow',
].join('|');
const INDICATOR_REQUEST_PATTERN = new RegExp(`\\b(${INDICATOR_TERMS})\\b`, 'i');

type CardDefaultsInput = {
  config?: Record<string, unknown>;
  plan: BuilderActionPlan | null;
  prompt: string;
};

export function cardPresentationDefaults(
  input: CardDefaultsInput,
): Record<string, unknown> {
  const config = input.config ?? {};
  const indicatorRequested = indicatorKpiRequested(input.prompt, input.plan, config);
  const supportingRequested = Boolean(readString(config.supportingField) || readString(config.supportingLabel));

  if (indicatorRequested || supportingRequested) {
    const layoutDesign =
      readString(config.layoutDesign) ??
      readString(config.designLayout) ??
      'value-trend-stacked';
    const layout = readString(config.layout);

    return {
      cardType: readString(config.cardType) ?? 'kpi',
      designLayout: layoutDesign,
      enableTwoRowLayout: false,
      layout: layout === 'two-row' ? 'standard' : layout ?? 'standard',
      layoutDesign,
      showIndicator: readBoolean(config.showIndicator) ?? indicatorRequested,
      showSparkline: readBoolean(config.showSparkline) ?? false,
      showTrend: readBoolean(config.showTrend) ?? indicatorRequested,
    };
  }

  return twoRowKpiCardDefaults();
}

export function twoRowKpiCardDefaults(): Record<string, unknown> {
  return {
    bottomRowContent: ['value'],
    cardLayout: 'two-row',
    cardType: 'two-row',
    enableTwoRowLayout: true,
    layout: 'two-row',
    outerGap: 'none',
    rowHeightRatio: '1:1',
    showIndicator: false,
    showSparkline: false,
    showTrend: false,
    showWrapperTitle: false,
    topRowContent: ['title'],
  };
}

function indicatorKpiRequested(
  prompt: string,
  plan: BuilderActionPlan | null,
  config: Record<string, unknown>,
): boolean {
  if (readBoolean(config.showIndicator) === true) {
    return true;
  }

  const promptText = prompt.trim();
  if (promptText && INDICATOR_REQUEST_PATTERN.test(promptText)) {
    return true;
  }

  return (
    plan?.actions?.some((action) => {
      const name = action.action.toLowerCase();
      if (name.includes('indicator') || name.includes('status')) {
        return true;
      }

      return readBoolean(action.params.showIndicator) === true;
    }) ?? false
  );
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
