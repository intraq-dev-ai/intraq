interface ActionPlanLayout extends Record<string, unknown> {
  h: number;
  w: number;
  x: number;
  y: number;
}

const GRID_COLUMNS = 12;
const CARD_COLUMNS = 6;
const CARD_HEIGHT = 4;
const KPI_CARD_COLUMNS = 4;
const KPI_CARD_HEIGHT = 4;
const FEATURE_HEIGHT = 7;
const FILTER_HEIGHT = 3;
const TEXT_HEIGHT = 2;

export function defaultActionPlanLayout(componentType: string, elementCount: number): ActionPlanLayout {
  if (componentType === 'filter') {
    return { x: 0, y: 0, w: GRID_COLUMNS, h: FILTER_HEIGHT };
  }
  if (componentType === 'export') {
    return { x: 9, y: 0, w: 3, h: FILTER_HEIGHT };
  }
  if (componentType === 'text') {
    return { x: 0, y: elementCount * TEXT_HEIGHT, w: GRID_COLUMNS, h: TEXT_HEIGHT };
  }

  if (componentType === 'card') {
    return {
      x: (elementCount % 2) * CARD_COLUMNS,
      y: Math.floor(elementCount / 2) * CARD_HEIGHT,
      w: CARD_COLUMNS,
      h: CARD_HEIGHT
    };
  }

  if (elementCount === 1) {
    return { x: CARD_COLUMNS, y: 0, w: GRID_COLUMNS - CARD_COLUMNS, h: FEATURE_HEIGHT };
  }

  const y = elementCount === 0 ? 0 : FEATURE_HEIGHT + Math.max(0, elementCount - 2) * FEATURE_HEIGHT;
  return { x: 0, y, w: GRID_COLUMNS, h: FEATURE_HEIGHT };
}

export function defaultCardActionPlanLayout(
  elementCount: number,
  config: Record<string, unknown> = {}
): ActionPlanLayout {
  if (isTwoRowCardConfig(config)) return defaultActionPlanLayout('card', elementCount);
  return {
    x: (elementCount % 3) * KPI_CARD_COLUMNS,
    y: Math.floor(elementCount / 3) * KPI_CARD_HEIGHT,
    w: KPI_CARD_COLUMNS,
    h: KPI_CARD_HEIGHT
  };
}

function isTwoRowCardConfig(config: Record<string, unknown>): boolean {
  return readBoolean(config.enableTwoRowLayout) === true
    || readString(config.cardType) === 'two-row'
    || readString(config.cardLayout) === 'two-row'
    || readString(config.layout) === 'two-row'
    || readString(config.layoutDesign) === 'two-row'
    || readString(config.designLayout) === 'two-row';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
