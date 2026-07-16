import type { DashboardElement, VisualizationSpec } from '../types';
import { labelFor, type MetricFormatOptions } from './formatting';
import { readMatrixConditionalRules } from './matrix-conditional-formatting';
import { matrixStyles } from './matrix-style-config';
import { measureEncodings } from './spec';
import { isRecord, readAggregationType, readBoolean, readConfiguredFields, readString } from './view-model-config';
import { readConfiguredFormats, readCssLength, readDisplayMode, readSortDirection, readWidthRecord, type RuntimeFilter } from './view-model-runtime';
import type { DashboardMatrixColumnDataDisplayMode, DashboardMatrixRowDataDisplayMode } from './view-model-types';
import type { MatrixDefaultCollapseState, MatrixFields, MatrixSort } from './matrix-view-model-types';

export function configuredMatrixFields(spec: VisualizationSpec, element?: DashboardElement): MatrixFields {
  const config = element?.config ?? {};
  const styling = isRecord(config.styling) ? config.styling : {};
  const valueFields = readConfiguredFields(config.valueFields);
  const effectiveValueFields = valueFields.length > 0
    ? valueFields
    : measureEncodings(spec).map(measure => {
      const aggregation = readAggregationType(measure.aggregation);
      return { ...(aggregation ? { aggregation } : {}), field: measure.field, label: measure.label ?? labelFor(measure.field) };
    });
  return {
    columnDataDisplayMode: readColumnDataDisplayMode(config.columnDataDisplayMode ?? config.columnDisplayMode),
    columnFields: readConfiguredFields(config.columnFields),
    columnHeaderLabel: readString(config.columnHeaderLabel) ?? undefined,
    columnSorts: readMatrixSorts(config.multiColumnSorting ?? config.columnSorting ?? multiSortPart(config.multiSort, 'columns'), 'column', config.sorting),
    columnWidths: readWidthRecord(config.columnWidths),
    conditionalRules: readMatrixConditionalRules(config),
    defaultColumnCollapseState: readDefaultCollapseState(config.defaultColumnCollapseState ?? config.defaultCollapseState),
    defaultColumnWidth: readCssLength(config.columnWidth ?? readHeaderWidth(config, 'column')),
    displayMode: readDisplayMode(config.matrixDisplayMode ?? config.displayMode),
    enableColumnExpandCollapse: readBoolean(config.enableColumnExpandCollapse ?? config.enableColumnExpand) ?? false,
    enableRowExpandCollapse: readBoolean(config.enableRowExpandCollapse ?? config.enableRowExpand) ?? false,
    fieldFormats: readConfiguredFormats(config.fieldFormats),
    filters: readRuntimeFilters(config),
    defaultRowCollapseState: readDefaultCollapseState(config.defaultRowCollapseState ?? config.defaultCollapseState),
    maxVisibleColumns: readPositiveInteger(config.maxVisibleColumns),
    maxVisibleRows: readPositiveInteger(config.maxVisibleRows),
    rowDataDisplayMode: readRowDataDisplayMode(config.rowDataDisplayMode ?? config.rowDisplayMode),
    rowFields: readConfiguredFields(config.rowFields),
    formatOptions: matrixFormatOptions(config),
    rowHeaderLabel: readString(config.rowHeaderLabel) ?? undefined,
    rowHeaderWidth: readCssLength(config.rowHeaderWidth ?? readHeaderWidth(config, 'rowHeader')),
    rowSorts: readMatrixSorts(config.multiRowSorting ?? config.rowSorting ?? multiSortPart(config.multiSort, 'rows'), 'row', config.sorting),
    sort: readMatrixSort(config),
    showBorders: readBoolean(config.showBorders ?? styling.showBorders),
    showColumnSubtotals: readBoolean(config.showColumnSubtotals) ?? false,
    showColumnTotals: readBoolean(config.showColumnTotals) ?? false,
    showRowSubtotals: readBoolean(config.showRowSubtotals ?? config.showSubtotals) ?? false,
    styles: matrixStyles(config, styling),
    tableFormat: readMatrixTableFormat(config.tableFormat ?? config.tableStyle),
    showRowTotals: readBoolean(config.showRowTotals) ?? true,
    showValueHeaders: effectiveMatrixShowValueHeaders(config, effectiveValueFields),
    valueFields: effectiveValueFields,
    valueHeaderLabel: readString(config.valueHeaderLabel) ?? undefined,
    valueHeaderWidth: readCssLength(config.valueHeaderWidth ?? readHeaderWidth(config, 'valueHeader'))
  };
}

function matrixFormatOptions(config: Record<string, unknown>): MetricFormatOptions {
  const currencySymbol = readString(config.currencySymbol);
  return currencySymbol ? { currencySymbol } : {};
}

function effectiveMatrixShowValueHeaders(
  config: Record<string, unknown>,
  valueFields: MatrixFields['valueFields']
): boolean {
  if (valueFields.length > 1) return true;
  if (valueFields.length === 1 && valueFields[0]?.hideTitle === true) return false;
  return readBoolean(config.showValueHeaders) ?? false;
}

function readRuntimeFilters(config: Record<string, unknown>): RuntimeFilter[] {
  const value = config.matrixFilters ?? config.filterConfig ?? config.filters;
  if (Array.isArray(value)) return value.flatMap(readRuntimeFilter);
  if (isRecord(value) && (readString(value.field) ?? readString(value.column))) return readRuntimeFilter(value);
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([field, filterValue]) => ({ field, operator: 'equals', value: filterValue }));
}

function readRuntimeFilter(value: unknown): RuntimeFilter[] {
  if (!isRecord(value)) return [];
  const field = readString(value.field) ?? readString(value.column) ?? readString(value.key);
  if (!field) return [];
  const logicOperator = readString(value.logicOperator);
  return [{
    field,
    ...(logicOperator ? { logicOperator } : {}),
    operator: readString(value.operator) ?? 'equals',
    value: value.value,
    valueTo: value.valueTo ?? value.max
  }];
}

function readHeaderWidth(config: Record<string, unknown>, key: string): unknown {
  return isRecord(config.headerWidths) ? config.headerWidths[key] : undefined;
}

function multiSortPart(value: unknown, key: 'columns' | 'rows'): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined;
  return parsed !== undefined && Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function readMatrixTableFormat(value: unknown): string | undefined {
  const normalized = readString(value)?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'clean') return 'default';
  if (normalized === 'formal report') return 'report';
  return normalized === 'default'
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
    || normalized === 'custom'
    ? normalized
    : undefined;
}

function readMatrixSort(config: Record<string, unknown>): MatrixSort | undefined {
  const key = readString(config.sortBy);
  return key ? { key, direction: readSortDirection(config.sortDirection) ?? 'asc' } : undefined;
}

function readMatrixSorts(value: unknown, legacyType: 'column' | 'row', legacyValue?: unknown): MatrixSort[] {
  const candidates = [
    ...(Array.isArray(value) ? value : isRecord(value) ? [value] : []),
    ...(Array.isArray(legacyValue) ? legacyValue.filter(item => isRecord(item) && readString(item.type) === legacyType) : [])
  ];
  return candidates.flatMap(item => {
    if (!isRecord(item)) return [];
    const sortOn = readString(item.sortOn) ?? readString(item.field) ?? readString(item.key);
    const sortBy = readString(item.sortBy);
    const key = sortOn ?? sortBy;
    if (!key) return [];
    return [{
      key,
      direction: readSortDirection(String(item.direction).toLowerCase()) ?? 'asc',
      ...(sortOn && sortBy && sortBy !== sortOn ? { compareKey: sortBy } : {})
    }];
  });
}

function readRowDataDisplayMode(value: unknown): DashboardMatrixRowDataDisplayMode {
  return value === 'merge' ? 'merge' : 'repeat';
}

function readColumnDataDisplayMode(value: unknown): DashboardMatrixColumnDataDisplayMode {
  return value === 'repeat' ? 'repeat' : 'merge';
}

function readDefaultCollapseState(value: unknown): MatrixDefaultCollapseState | undefined {
  return value === 'collapsed' || value === 'expanded' ? value : undefined;
}
