import { readString } from './view-model-config';
import type { DashboardMatrixModel } from './view-model-types';

export function matrixStyles(
  config: Record<string, unknown>,
  styling: Record<string, unknown>
): DashboardMatrixModel['styles'] | undefined {
  const styles: NonNullable<DashboardMatrixModel['styles']> = {};
  const presetDrivenColors = usesNamedThemePreset(config.tableFormat ?? config.tableStyle);
  const borderColor = presetDrivenColors ? undefined : readThemeColor(config.borderColor ?? styling.borderColor, ['#d1d5db']);
  if (borderColor) styles.borderColor = borderColor;
  const headerBackgroundColor = presetDrivenColors ? undefined : readThemeColor(config.headerBg ?? styling.headerBackgroundColor, ['#f8fafc']);
  const headerTextColor = presetDrivenColors ? undefined : readThemeColor(config.headerText ?? styling.headerTextColor, ['#111827']);
  const rowHeaderBackgroundColor = presetDrivenColors ? undefined : readThemeColor(config.rowHeaderBg, ['#ffffff']);
  const rowHeaderTextColor = presetDrivenColors ? undefined : readThemeColor(config.rowHeaderText, ['#111827']);
  const cellBackgroundColor = presetDrivenColors ? undefined : readThemeColor(config.rowBg ?? styling.rowBackgroundColor, ['#ffffff']);
  const cellTextColor = presetDrivenColors ? undefined : readThemeColor(config.rowText ?? styling.rowTextColor, ['#111827']);
  const header = {
    ...fontWeightStyle(config.headerFontWeight),
    ...textAlignStyle(config.headerAlign),
    ...(headerBackgroundColor ? { backgroundColor: headerBackgroundColor } : {}),
    ...(headerTextColor ? { color: headerTextColor } : {})
  };
  const rowHeader = {
    ...fontWeightStyle(config.rowHeaderFontWeight),
    ...textAlignStyle(config.rowHeaderAlign),
    ...(rowHeaderBackgroundColor ? { backgroundColor: rowHeaderBackgroundColor } : {}),
    ...(rowHeaderTextColor ? { color: rowHeaderTextColor } : {})
  };
  const cell = {
    ...fontWeightStyle(config.rowFontWeight),
    ...textAlignStyle(config.rowAlign),
    ...(cellBackgroundColor ? { backgroundColor: cellBackgroundColor } : {}),
    ...(cellTextColor ? { color: cellTextColor } : {})
  };
  const root = {
    ...fontFamilyStyle(config.fontFamily),
    ...fontSizeStyle(config.fontSize)
  };
  if (Object.keys(header).length > 0) styles.header = header;
  if (Object.keys(rowHeader).length > 0) styles.rowHeader = rowHeader;
  if (Object.keys(cell).length > 0) styles.cell = cell;
  if (Object.keys(root).length > 0) styles.root = root;
  return Object.keys(styles).length > 0 ? styles : undefined;
}

function readColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(trimmed) || /^rgba?\([^)]+\)$/i.test(trimmed) ? trimmed : undefined;
}

function readThemeColor(value: unknown, themeDefaults: string[]): string | undefined {
  const color = readColor(value);
  if (!color) return undefined;
  return themeDefaults.some(defaultColor => defaultColor.toLowerCase() === color.toLowerCase()) ? undefined : color;
}

function usesNamedThemePreset(value: unknown): boolean {
  const normalized = readString(value)?.trim().toLowerCase();
  return Boolean(normalized && normalized !== 'custom');
}

function textAlignStyle(value: unknown): Record<string, string> {
  const normalized = readString(value)?.replace('text-', '');
  return normalized === 'left' || normalized === 'center' || normalized === 'right' ? { textAlign: normalized } : {};
}

function fontWeightStyle(value: unknown): Record<string, string> {
  const normalized = readString(value);
  const map: Record<string, string> = { 'font-bold': '700', 'font-medium': '500', 'font-normal': '400', 'font-semibold': '600' };
  return normalized && map[normalized] ? { fontWeight: map[normalized] } : {};
}

function fontFamilyStyle(value: unknown): Record<string, string> {
  const normalized = readString(value);
  const map: Record<string, string> = { 'font-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace', 'font-sans': 'Inter, ui-sans-serif, system-ui, sans-serif', 'font-serif': 'ui-serif, Georgia, serif' };
  return normalized && map[normalized] ? { fontFamily: map[normalized] } : {};
}

function fontSizeStyle(value: unknown): Record<string, string> {
  const normalized = readString(value);
  const map: Record<string, string> = { 'text-base': '14px', 'text-lg': '15px', 'text-sm': '12px', 'text-xs': '11px' };
  return normalized && map[normalized] ? { fontSize: map[normalized] } : {};
}
