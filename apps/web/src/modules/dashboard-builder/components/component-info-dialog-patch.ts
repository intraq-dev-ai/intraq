import type { DashboardElement } from '../types';
import type { ComponentInfoDraft } from './component-info-dialog-draft';
import type { ComponentKind, ComponentSettingsPatch, TableFieldDraft } from './component-info-dialog-options';

interface ComponentInfoPatchInput {
  componentKind: ComponentKind;
  draft: ComponentInfoDraft;
  element: DashboardElement;
  onError: (message: string) => void;
  supportsViewActions: boolean;
  tableFields: TableFieldDraft[];
}

export function buildComponentInfoSettingsPatch(input: ComponentInfoPatchInput): ComponentSettingsPatch | null {
  const rowsPerPage = parseOptionalNumber(input.draft.rowsPerPage, 'Rows per page', input.onError);
  if (rowsPerPage === null) return null;
  const topN = parseOptionalNumber(input.draft.topN, 'Top N', input.onError);
  if (topN === null) return null;
  const gridColumns = parseOptionalNumber(input.draft.gridColumns, 'Grid columns', input.onError);
  if (gridColumns === null) return null;
  const lineTension = parseOptionalNumber(input.draft.lineTension, 'Curve tension', input.onError);
  if (lineTension === null) return null;
  const mixedAxisPrimaryHeadroomRatio = parseOptionalNumber(input.draft.mixedAxisPrimaryHeadroomRatio, 'Mixed-axis primary headroom', input.onError);
  if (mixedAxisPrimaryHeadroomRatio === null) return null;
  const timeBucketFillValue = parseOptionalNumber(input.draft.timeBucketFillValue, 'Missing bucket value', input.onError);
  if (timeBucketFillValue === null) return null;
  const yAxisPaddingRatio = parseOptionalNumber(input.draft.yAxisPaddingRatio, 'Y padding ratio', input.onError);
  if (yAxisPaddingRatio === null) return null;
  const y2AxisPaddingRatio = parseOptionalNumber(input.draft.y2AxisPaddingRatio, 'Y2 padding ratio', input.onError);
  if (y2AxisPaddingRatio === null) return null;

  const baseConfig = input.element.config ?? {};
  const config: Record<string, unknown> = {
    title: input.draft.title.trim() || input.element.name
  };
  setString(config, 'backgroundColor', input.draft.componentBackgroundColor);
  applyFieldDisplayNames(config, baseConfig, input.tableFields);
  setString(config, 'titlePosition', input.draft.titlePosition);
  applyViewActionSettings(config, baseConfig, input);
  applyComponentSpecificSettings(config, baseConfig, input, {
    gridColumns,
    lineTension,
    mixedAxisPrimaryHeadroomRatio,
    rowsPerPage,
    timeBucketFillValue,
    topN,
    y2AxisPaddingRatio,
    yAxisPaddingRatio
  });

  return {
    ...(input.draft.chartType.trim() ? { chartType: input.draft.chartType.trim() } : {}),
    config,
    name: config.title as string
  };
}

function applyViewActionSettings(
  config: Record<string, unknown>,
  baseConfig: Record<string, unknown>,
  input: ComponentInfoPatchInput
): void {
  if (!input.supportsViewActions) return;
  setBoolean(config, baseConfig, 'showDownloadAction', input.draft.showDownloadAction, true);
  setBoolean(config, baseConfig, 'showExpandAction', input.draft.showExpandAction, true);
}

function applyComponentSpecificSettings(
  config: Record<string, unknown>,
  baseConfig: Record<string, unknown>,
  input: ComponentInfoPatchInput,
  parsed: {
    gridColumns: number | undefined;
    lineTension: number | undefined;
    mixedAxisPrimaryHeadroomRatio: number | undefined;
    rowsPerPage: number | undefined;
    timeBucketFillValue: number | undefined;
    topN: number | undefined;
    y2AxisPaddingRatio: number | undefined;
    yAxisPaddingRatio: number | undefined;
  }
): void {
  const { componentKind, draft } = input;
  if (componentKind === 'chart') {
    setString(config, 'legendMarkerStyle', draft.legendMarkerStyle);
    setString(config, 'legendPosition', draft.legendPosition);
    setString(config, 'lineInterpolation', draft.lineInterpolation);
    setNumber(config, baseConfig, 'lineTension', parsed.lineTension, 0.35);
    setNumber(config, baseConfig, 'mixedAxisPrimaryHeadroomRatio', parsed.mixedAxisPrimaryHeadroomRatio, 0.6);
    setBoolean(config, baseConfig, 'fillMissingTimeBuckets', draft.fillMissingTimeBuckets, false);
    if (draft.fillMissingTimeBuckets) {
      setString(config, 'timeBucketInterval', draft.timeBucketInterval === 'auto' ? '' : draft.timeBucketInterval);
      setNumber(config, baseConfig, 'timeBucketFillValue', parsed.timeBucketFillValue, 0);
    }
    setString(config, 'sortBy', draft.sortBy);
    setString(config, 'sortDirection', draft.sortDirection);
    setString(config, 'yAxisStartMode', draft.yAxisStartMode);
    setString(config, 'yAxisPaddingMode', draft.yAxisPaddingMode === 'none' ? '' : draft.yAxisPaddingMode);
    setNumber(config, baseConfig, 'yAxisPaddingRatio', parsed.yAxisPaddingRatio, 0.5);
    setString(config, 'y2AxisStartMode', draft.y2AxisStartMode);
    setString(config, 'y2AxisPaddingMode', draft.y2AxisPaddingMode === 'none' ? '' : draft.y2AxisPaddingMode);
    setNumber(config, baseConfig, 'y2AxisPaddingRatio', parsed.y2AxisPaddingRatio, 0.5);
    setBoolean(config, baseConfig, 'showDataLabels', draft.showDataLabels, false);
    setBoolean(config, baseConfig, 'showGrid', draft.showGrid, true);
    setBoolean(config, baseConfig, 'showLegend', draft.showLegend, false);
    setBoolean(config, baseConfig, 'stackBars', draft.stackBars, false);
    if (parsed.topN !== undefined) config.topN = parsed.topN;
    return;
  }
  if (componentKind === 'table') {
    setTableLikeSettings(config, baseConfig, draft, parsed.rowsPerPage, parsed.topN);
    setString(config, 'tableFormat', draft.tableFormat);
    setBoolean(config, baseConfig, 'showBorders', draft.showBorders, true);
    return;
  }
  if (componentKind === 'matrix') {
    setString(config, 'displayMode', draft.displayMode);
    setString(config, 'sortBy', draft.sortBy);
    setString(config, 'sortDirection', draft.sortDirection);
    setBoolean(config, baseConfig, 'showColumnTotals', draft.showColumnTotals, true);
    setBoolean(config, baseConfig, 'showColumnSubtotals', draft.showColumnSubtotals, false);
    setBoolean(config, baseConfig, 'showBorders', draft.showBorders, true);
    setBoolean(config, baseConfig, 'showRowTotals', draft.showRowTotals, true);
    setBoolean(config, baseConfig, 'showRowSubtotals', draft.showRowSubtotals, false);
    setBoolean(config, baseConfig, 'showValueHeaders', draft.showValueHeaders, false);
    return;
  }
  if (componentKind === 'card') {
    setString(config, 'layout', draft.cardLayout);
    setString(config, 'cardType', draft.cardLayout);
    setString(config, 'colorScheme', draft.colorScheme);
    setBoolean(config, baseConfig, 'enableTwoRowLayout', draft.cardLayout === 'two-row' || draft.enableTwoRowLayout, false);
    setBoolean(config, baseConfig, 'showIndicator', draft.showIndicator, true);
    setBoolean(config, baseConfig, 'showSparkline', draft.showSparkline, false);
    setBoolean(config, baseConfig, 'showTrend', draft.showTrend, true);
    if (parsed.gridColumns !== undefined) config.gridColumns = parsed.gridColumns;
    return;
  }
  if (componentKind === 'filter') {
    setString(config, 'displayMode', draft.displayMode);
    return;
  }
  if (componentKind === 'export') {
    setString(config, 'targetElementId', draft.exportTargetElementId);
    setString(config, 'format', draft.exportFormat);
    setString(config, 'buttonLabel', draft.exportButtonLabel);
    setString(config, 'buttonStyle', draft.exportButtonStyle);
    setString(config, 'buttonBackgroundColor', draft.exportButtonBackgroundColor);
    setString(config, 'buttonBorderColor', draft.exportButtonBorderColor);
    setString(config, 'buttonTextColor', draft.exportButtonTextColor);
    setString(config, 'borderRadius', draft.exportButtonBorderRadius);
    setString(config, 'align', draft.exportAlign);
    setBoolean(config, baseConfig, 'showIcon', draft.exportShowIcon, true);
    return;
  }
  setString(config, 'displayMode', draft.displayMode);
}

function setTableLikeSettings(
  config: Record<string, unknown>,
  baseConfig: Record<string, unknown>,
  draft: ComponentInfoDraft,
  rowsPerPage: number | undefined,
  topN: number | undefined
): void {
  setString(config, 'displayMode', draft.displayMode);
  setString(config, 'sortBy', draft.sortBy);
  setString(config, 'sortDirection', draft.sortDirection);
  setBoolean(config, baseConfig, 'enableExport', draft.enableExport, true);
  setBoolean(config, baseConfig, 'enableFilters', draft.enableFilters, true);
  setBoolean(config, baseConfig, 'enablePagination', draft.enablePagination, false);
  setBoolean(config, baseConfig, 'enableSearch', draft.enableSearch, true);
  setBoolean(config, baseConfig, 'enableSorting', draft.enableSorting, true);
  setBoolean(config, baseConfig, 'showTotal', draft.showTotal, false);
  setNumber(config, baseConfig, 'rowsPerPage', rowsPerPage, 25);
  if (topN !== undefined) config.topN = topN;
}

function parseOptionalNumber(value: string, label: string, onError: (message: string) => void): number | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  onError(`${label} must be a positive number.`);
  return null;
}

function setString(target: Record<string, unknown>, key: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed) target[key] = trimmed;
}

function setBoolean(
  target: Record<string, unknown>,
  base: Record<string, unknown>,
  key: string,
  value: boolean,
  defaultValue: boolean
): void {
  if (Object.prototype.hasOwnProperty.call(base, key) || value !== defaultValue) target[key] = value;
}

function setNumber(
  target: Record<string, unknown>,
  base: Record<string, unknown>,
  key: string,
  value: number | undefined,
  defaultValue: number
): void {
  if (value === undefined) return;
  if (Object.prototype.hasOwnProperty.call(base, key) || value !== defaultValue) target[key] = value;
}

function applyFieldDisplayNames(
  target: Record<string, unknown>,
  base: Record<string, unknown>,
  fields: TableFieldDraft[]
): void {
  const labels = Object.fromEntries(fields.flatMap(field => {
    const label = field.displayName.trim();
    return label && label !== labelFor(field.columnName) ? [[field.columnName, label]] : [];
  }));
  if (Object.keys(labels).length > 0) {
    target.fieldLabels = { ...(isRecord(base.fieldLabels) ? base.fieldLabels : {}), ...labels };
    target.ySeriesLabels = { ...(isRecord(base.ySeriesLabels) ? base.ySeriesLabels : {}), ...labels };
  }
  patchFieldArrayLabels(target, base, 'columns', fields);
  patchFieldArrayLabels(target, base, 'rowFields', fields);
  patchFieldArrayLabels(target, base, 'columnFields', fields);
  patchFieldArrayLabels(target, base, 'valueFields', fields);
}

function patchFieldArrayLabels(
  target: Record<string, unknown>,
  base: Record<string, unknown>,
  key: string,
  fields: TableFieldDraft[]
): void {
  const source = base[key];
  if (!Array.isArray(source)) return;
  const labelByField = new Map(fields.map(field => [field.columnName, field.displayName.trim() || field.columnName]));
  const sourceByField = new Map<string, unknown>();
  source.forEach(item => {
    const field = typeof item === 'string' ? item : isRecord(item) ? readString(item.field ?? item.key ?? item.name) : '';
    if (field && !sourceByField.has(field)) sourceByField.set(field, item);
  });
  target[key] = fields.flatMap(fieldDraft => {
    const item = sourceByField.get(fieldDraft.columnName);
    if (item === undefined) return [];
    const label = labelByField.get(fieldDraft.columnName);
    if (!label) return [item];
    return isRecord(item)
      ? { ...item, label }
      : { field: fieldDraft.columnName, label };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function labelFor(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
