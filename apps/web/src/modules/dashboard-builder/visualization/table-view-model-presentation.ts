import { cssVariable, readCssColor } from './table-view-model-format-utils';
import { readString } from './view-model-config';
import { readCssLength, readDisplayMode } from './view-model-runtime';
import type { DashboardTableModel } from './view-model-types';

export function displayModePatch(config: Record<string, unknown>): Pick<DashboardTableModel, 'displayMode'> {
  const displayMode = readDisplayMode(config.tableDisplayMode ?? config.displayMode);
  return displayMode ? { displayMode } : {};
}

export function tablePresentationPatch(config: Record<string, unknown>): Pick<DashboardTableModel, 'rootStyle' | 'tableFormat'> {
  const tableFormat = readTableFormat(config.tableFormat ?? config.tableStyle);
  const rootStyle = tableRootStyle(config);
  return {
    ...(rootStyle ? { rootStyle } : {}),
    ...(tableFormat ? { tableFormat } : {})
  };
}

function tableRootStyle(config: Record<string, unknown>): Record<string, string> | undefined {
  const presetDrivenColors = usesNamedThemePreset(config.tableFormat ?? config.tableStyle);
  const style = {
    ...cssVariable('--dashboard-table-header-bg', presetDrivenColors ? undefined : readThemeColor(config.headerBg, ['#f8fafc'])),
    ...cssVariable('--dashboard-table-header-text', presetDrivenColors ? undefined : readThemeColor(config.headerTextColor ?? config.headerText, ['#111827'])),
    ...cssVariable('--dashboard-table-row-bg', presetDrivenColors ? undefined : readThemeColor(config.rowBg, ['#ffffff'])),
    ...cssVariable('--dashboard-table-row-text', presetDrivenColors ? undefined : readThemeColor(config.rowTextColor ?? config.rowText, ['#111827'])),
    ...cssVariable('--dashboard-table-alt-row-bg', presetDrivenColors ? undefined : readThemeColor(config.alternateRowBg, ['#f9fafb'])),
    ...cssVariable('--dashboard-table-border', presetDrivenColors ? undefined : readThemeColor(config.borderColor, ['#e5e7eb'])),
    ...cssVariable('--dashboard-table-group-total-bg', readThemeColor(config.groupTotalBg ?? config.subtotalBg ?? config.subtotalBackgroundColor, [])),
    ...cssVariable('--dashboard-table-group-total-text', readThemeColor(config.groupTotalTextColor ?? config.subtotalTextColor ?? config.subtotalColor, [])),
    ...cssVariable('--dashboard-table-group-total-border', readThemeColor(config.groupTotalBorderColor ?? config.subtotalBorderColor, [])),
    ...cssVariable('--dashboard-table-group-total-border-width', readCssLength(config.groupTotalBorderWidth ?? config.subtotalBorderWidth)),
    ...cssVariable('--dashboard-table-group-total-font-weight', readString(config.groupTotalFontWeight ?? config.subtotalFontWeight) ?? undefined),
    ...cssVariable('--dashboard-table-group-total-font-size', readCssLength(config.groupTotalFontSize ?? config.subtotalFontSize)),
    ...cssVariable('--dashboard-table-total-bg', readThemeColor(config.totalBg ?? config.footerTotalBg ?? config.totalBackgroundColor, [])),
    ...cssVariable('--dashboard-table-total-text', readThemeColor(config.totalTextColor ?? config.footerTotalTextColor ?? config.totalColor, [])),
    ...cssVariable('--dashboard-table-total-border', readThemeColor(config.totalBorderColor ?? config.footerTotalBorderColor, [])),
    ...cssVariable('--dashboard-table-total-border-width', readCssLength(config.totalBorderWidth ?? config.footerTotalBorderWidth)),
    ...cssVariable('--dashboard-table-total-font-weight', readString(config.totalFontWeight ?? config.footerTotalFontWeight) ?? undefined),
    ...cssVariable('--dashboard-table-total-font-size', readCssLength(config.totalFontSize ?? config.footerTotalFontSize)),
    ...cssVariable('--dashboard-table-radius', readCssLength(config.borderRadius)),
    ...cssVariable('--dashboard-table-shadow', tableShadowValue(readString(config.shadow) ?? undefined)),
    ...tablePaddingVariables(readString(config.cellPadding) ?? undefined)
  };
  return Object.keys(style).length > 0 ? style : undefined;
}

function readThemeColor(value: unknown, themeDefaults: string[]): string | undefined {
  const color = readCssColor(value);
  if (!color) return undefined;
  return themeDefaults.some(defaultColor => defaultColor.toLowerCase() === color.toLowerCase()) ? undefined : color;
}

function usesNamedThemePreset(value: unknown): boolean {
  const normalized = readString(value)?.trim().toLowerCase();
  return Boolean(normalized && normalized !== 'custom');
}

function tablePaddingVariables(value: string | undefined): Record<string, string> {
  if (value === 'compact') return { '--dashboard-table-cell-padding-y': '5px', '--dashboard-table-cell-padding-x': '8px' };
  if (value === 'comfortable') return { '--dashboard-table-cell-padding-y': '10px', '--dashboard-table-cell-padding-x': '14px' };
  return {};
}

function tableShadowValue(value: string | undefined): string | undefined {
  if (value === 'sm') return '0 4px 12px rgba(15, 23, 42, 0.08)';
  if (value === 'md') return '0 10px 24px rgba(15, 23, 42, 0.12)';
  if (value === 'lg') return '0 18px 42px rgba(15, 23, 42, 0.18)';
  return undefined;
}

function readTableFormat(value: unknown): string | undefined {
  const normalized = readString(value)?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'clean') return 'default';
  if (normalized === 'formal report') return 'report';
  if (
    normalized === 'default'
    || normalized === 'striped'
    || normalized === 'bordered'
    || normalized === 'minimal'
    || normalized === 'modern'
    || normalized === 'corporate'
    || normalized === 'dark'
    || normalized === 'colorful'
    || normalized === 'compact'
    || normalized === 'spacious'
    || normalized === 'report'
    || normalized === 'report-grid'
    || normalized === 'report-blue-grid'
    || normalized === 'spreadsheet'
    || normalized === 'custom'
  ) return normalized;
  return undefined;
}
