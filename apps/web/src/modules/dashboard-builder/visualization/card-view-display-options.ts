import type { DashboardCardModel } from './view-model-types';
import { readString } from './view-model-config';
import { readCssLength, safeClassToken } from './view-model-runtime';

const CARD_SURFACE = 'var(--surface)';
const CARD_TITLE_SURFACE = 'var(--bg-secondary)';
const CARD_TEXT = 'var(--text-primary)';
const CARD_MUTED_TEXT = 'var(--text-secondary)';

export function cardDisplayOptions(config: Record<string, unknown>): Partial<DashboardCardModel> {
  const backgroundColor = readString(config.backgroundColor) ?? readString(config.background) ?? readString(config.cardBackground);
  const colorScheme = readCardColorScheme(config.colorScheme);
  const designOptions = cardLayoutDesignOptions(config);
  return {
    ...designOptions,
    gridColumns: boundedGridColumns(config.gridColumns),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(readCardBorderRadius(config.borderRadius) ? { borderRadius: readCardBorderRadius(config.borderRadius) as string } : {}),
    ...(colorScheme ? { colorScheme } : {}),
    ...(readCardCustomClass(config.className ?? config.customClassName ?? config.class) ? { customClassName: readCardCustomClass(config.className ?? config.customClassName ?? config.class) as string } : {}),
    ...(readGap(config.innerGap) ? { innerGap: readGap(config.innerGap) as string } : {}),
    ...(readGap(config.outerGap) ? { outerGap: readGap(config.outerGap) as string } : {}),
    ...(readCardShadow(config.shadow) ? { shadow: readCardShadow(config.shadow) as DashboardCardModel['shadow'] } : {}),
    ...(readString(config.titleBackground) ? { titleBackground: readString(config.titleBackground) as string } : {}),
    ...(readString(config.titleColor) ? { titleColor: readString(config.titleColor) as string } : {}),
    ...(readString(config.titlePosition) ? { titlePosition: readString(config.titlePosition) as string } : {}),
    ...(readString(config.valueBackground) ? { valueBackground: readString(config.valueBackground) as string } : {}),
    ...(readString(config.valueColor) ? { valueColor: readString(config.valueColor) as string } : {}),
    ...(readString(config.valueFontSize) ? { valueFontSize: readString(config.valueFontSize) as string } : {}),
    ...(readString(config.titleFontSize) ? { titleFontSize: readString(config.titleFontSize) as string } : {})
  };
}

function readCardColorScheme(value: unknown): DashboardCardModel['colorScheme'] | undefined {
  const scheme = readString(value);
  if (scheme === 'blue' || scheme === 'purple') return 'info';
  if (scheme === 'green') return 'success';
  if (scheme === 'orange') return 'warning';
  if (scheme === 'red') return 'danger';
  return scheme === 'danger' || scheme === 'default' || scheme === 'info' || scheme === 'success' || scheme === 'warning' ? scheme : undefined;
}

function cardLayoutDesignOptions(config: Record<string, unknown>): Partial<DashboardCardModel> {
  const design = readString(config.layoutDesign) ?? readString(config.designLayout) ?? readString(config.layoutPreset);
  if (!design) return {};
  const designs: Record<string, Partial<DashboardCardModel>> = {
    card: {
      backgroundColor: CARD_SURFACE,
      titleBackground: CARD_TITLE_SURFACE,
      titleColor: CARD_TEXT,
      titlePosition: 'top',
      valueFontSize: '3xl'
    },
    compact: {
      backgroundColor: CARD_SURFACE,
      titleBackground: 'transparent',
      titleColor: CARD_MUTED_TEXT,
      titlePosition: 'none',
      valueFontSize: 'xl'
    },
    executive: {
      backgroundColor: CARD_SURFACE,
      titleBackground: CARD_TITLE_SURFACE,
      titleColor: CARD_TEXT,
      titlePosition: 'top',
      valueFontSize: '4xl'
    },
    flat: {
      backgroundColor: CARD_SURFACE,
      titleBackground: 'transparent',
      titleColor: CARD_MUTED_TEXT,
      titlePosition: 'middle',
      valueFontSize: '2xl'
    },
    hero: {
      backgroundColor: CARD_SURFACE,
      titleBackground: CARD_TITLE_SURFACE,
      titleColor: CARD_TEXT,
      titlePosition: 'top',
      valueFontSize: '4xl'
    },
    minimal: {
      backgroundColor: CARD_SURFACE,
      titleBackground: 'transparent',
      titlePosition: 'none',
      valueFontSize: 'xl'
    },
    modern: {
      backgroundColor: CARD_SURFACE,
      titleBackground: CARD_TITLE_SURFACE,
      titleColor: CARD_MUTED_TEXT,
      titlePosition: 'top',
      valueFontSize: '2xl'
    },
    operational: {
      backgroundColor: CARD_SURFACE,
      titleBackground: CARD_TITLE_SURFACE,
      titleColor: CARD_MUTED_TEXT,
      titlePosition: 'top',
      valueFontSize: '3xl'
    },
    simple: {
      backgroundColor: CARD_SURFACE,
      titleBackground: 'transparent',
      titlePosition: 'none',
      valueFontSize: '2xl'
    },
    tile: {
      backgroundColor: '#2563eb',
      titleBackground: 'rgba(0, 0, 0, 0.1)',
      titleColor: '#ffffff',
      titlePosition: 'top',
      valueColor: '#ffffff',
      valueFontSize: '3xl'
    }
  };
  return designs[design] ?? {};
}

function boundedGridColumns(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 3;
  return Math.min(Math.max(Math.floor(value), 1), 6);
}

function readGap(value: unknown): string | null {
  const gap = readString(value);
  return gap === 'large' || gap === 'medium' || gap === 'none' || gap === 'small' ? gap : null;
}

function readCardBorderRadius(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return `${value}px`;
  if (value === '0') return '0';
  return readCssLength(value);
}

function readCardCustomClass(value: unknown): string | undefined {
  const className = readString(value);
  if (!className) return undefined;
  if (!/[a-z0-9]/i.test(className)) return undefined;
  return safeClassToken(className);
}

function readCardShadow(value: unknown): DashboardCardModel['shadow'] | undefined {
  const shadow = readString(value)?.toLowerCase();
  if (!shadow || shadow === 'default') return undefined;
  if (shadow === 'sm' || shadow === 'subtle') return 'subtle';
  if (shadow === 'md' || shadow === 'medium') return 'medium';
  if (shadow === 'lg' || shadow === 'strong' || shadow === 'xl' || shadow === 'deep') return 'strong';
  return shadow === 'none' ? 'none' : undefined;
}
