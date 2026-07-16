import type { MetricFormatOptions } from './formatting';
import { tableCell } from './table-view-model-cells';
import type { ConditionalRule } from './table-view-model-types';
import { aggregateRows, type AggregationType, isRecord, readAggregationType, readBoolean, readString } from './view-model-config';
import { numericValueOrNull } from './view-model-runtime';
import type { DashboardTableCell, DashboardTableColumn, DashboardTableModel, DashboardTableRow } from './view-model-types';

export function footerRowsPatch(
  rows: Array<Record<string, unknown>>,
  columns: DashboardTableColumn[],
  config: Record<string, unknown>,
  rules: ConditionalRule[],
  formatOptions: MetricFormatOptions
): Pick<DashboardTableModel, 'footerRows'> {
  const customSummaryRows = configuredSummaryRows(rows, columns, config, rules, formatOptions);
  const totalRows = standardFooterTotalRows(rows, columns, config, rules, formatOptions);
  const footerRows = [...customSummaryRows, ...totalRows];
  return footerRows.length > 0 ? { footerRows } : {};
}

function standardFooterTotalRows(
  rows: Array<Record<string, unknown>>,
  columns: DashboardTableColumn[],
  config: Record<string, unknown>,
  rules: ConditionalRule[],
  formatOptions: MetricFormatOptions
): DashboardTableRow[] {
  const showTotals = readBoolean(config.showTotals ?? config.showTotal ?? config.showFooterTotals ?? config.showColumnTotals) ?? false;
  if (!showTotals || rows.length === 0 || columns.length === 0) return [];
  const labelIndex = totalLabelColumnIndex(columns, config);
  const totalColumns = totalColumnKeys(config);
  const label = readString(config.totalLabel ?? config.footerTotalLabel ?? config.grandTotalLabel) ?? 'Total';
  return [{
    key: 'total',
    cells: columns.map((column, index) => {
      if (index === labelIndex) return tableTotalLabelCell(label, column);
      if (totalColumns && !totalColumns.has(column.key) && !totalColumns.has(column.label)) {
        return tableCell('', column, rules, formatOptions, true);
      }
      const hasNumericValues = rows.some(row => numericValueOrNull(row[column.key]) !== null);
      const raw = hasNumericValues ? aggregateRows(rows, column.key, column.totalAggregation ?? 'sum') : '';
      return tableCell(raw, column, rules, formatOptions, true);
    })
  }];
}

function configuredSummaryRows(
  rows: Array<Record<string, unknown>>,
  columns: DashboardTableColumn[],
  config: Record<string, unknown>,
  rules: ConditionalRule[],
  formatOptions: MetricFormatOptions
): DashboardTableRow[] {
  const configured = config.tableSummaryRows ?? config.summaryRows ?? config.footerSummaryRows ?? config.reportSummaryRows ?? config.customFooterRows;
  if (!Array.isArray(configured) || rows.length === 0 || columns.length === 0) return [];
  return configured.flatMap((item, index) => {
    if (!isRecord(item) || !summaryRowConditionMatches(item, rows)) return [];
    const label = readString(item.label ?? item.title ?? item.name) ?? '';
    const labelIndex = summaryLabelColumnIndex(columns, item, config);
    return [{
      key: readString(item.key ?? item.id) ?? `summary-${index}`,
      cells: columns.map((column, columnIndex) => {
        if (columnIndex === labelIndex && label) return summaryLabelCell(label, column, item);
        const cellConfig = summaryCellConfig(item.cells ?? item.values ?? item.columns, column, columnIndex);
        return summaryValueCell(cellConfig, rows, column, rules, formatOptions, item);
      })
    }];
  });
}

function summaryLabelColumnIndex(
  columns: DashboardTableColumn[],
  rowConfig: Record<string, unknown>,
  tableConfig: Record<string, unknown>
): number {
  const configured = readString(rowConfig.labelColumn ?? rowConfig.labelColumnKey ?? rowConfig.labelField);
  if (configured) {
    const match = columns.findIndex(column => column.key === configured || column.label === configured);
    if (match >= 0) return match;
    const numericIndex = Number(configured);
    if (Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < columns.length) return numericIndex;
  }
  return totalLabelColumnIndex(columns, tableConfig);
}

function summaryCellConfig(
  value: unknown,
  column: DashboardTableColumn,
  columnIndex: number
): unknown {
  if (Array.isArray(value)) {
    return value.find(item => isRecord(item) && summaryCellTargetsColumn(item, column, columnIndex));
  }
  if (!isRecord(value)) return undefined;
  return value[column.key] ?? value[column.label] ?? value[String(columnIndex)];
}

function summaryCellTargetsColumn(
  value: Record<string, unknown>,
  column: DashboardTableColumn,
  columnIndex: number
): boolean {
  const target = readString(value.column ?? value.columnKey ?? value.target ?? value.field);
  if (target && (target === column.key || target === column.label)) return true;
  const targetIndex = readNumber(value.columnIndex ?? value.index);
  return targetIndex !== null && Math.floor(targetIndex) === columnIndex;
}

function summaryValueCell(
  value: unknown,
  rows: Array<Record<string, unknown>>,
  column: DashboardTableColumn,
  rules: ConditionalRule[],
  formatOptions: MetricFormatOptions,
  rowConfig: Record<string, unknown>
): DashboardTableCell {
  const cellConfig = isRecord(value) ? value : undefined;
  const raw = summaryCellRaw(value, rows, column);
  const display = cellConfig ? readString(cellConfig.display ?? cellConfig.text) : null;
  const cell = tableCell(raw, column, rules, formatOptions, true);
  const style = summaryCellStyle(cellConfig ?? rowConfig, column);
  return {
    ...cell,
    ...(display !== null ? { display } : {}),
    ...(Object.keys(style).length > 0 ? { style: { ...(cell.style ?? {}), ...style } } : {})
  };
}

function summaryCellRaw(
  value: unknown,
  rows: Array<Record<string, unknown>>,
  column: DashboardTableColumn
): unknown {
  if (value === undefined || value === null) return '';
  if (!isRecord(value)) {
    if (typeof value === 'string' && value.trim() && rows.some(row => Object.prototype.hasOwnProperty.call(row, value.trim()))) {
      return summaryFieldValue(rows, value.trim(), undefined, undefined, value);
    }
    return value;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'value')) return applySummaryNumberTransform(value.value, value);
  const field = readString(value.field ?? value.key ?? value.name ?? value.sourceField) ?? column.key;
  return summaryFieldValue(rows, field, readAggregationType(value.aggregation ?? value.aggregate ?? value.summary), readString(value.source), value);
}

function summaryFieldValue(
  rows: Array<Record<string, unknown>>,
  field: string,
  aggregation: AggregationType | undefined,
  source: string | null | undefined,
  transformConfig?: unknown
): unknown {
  if (aggregation || source === 'aggregate' || source === 'rows') {
    return applySummaryNumberTransform(aggregateRows(rows, field, aggregation ?? 'sum'), transformConfig);
  }
  const sourceRow = source === 'last' || source === 'lastRow'
    ? [...rows].reverse().find(row => hasSummaryValue(row[field]))
    : rows.find(row => hasSummaryValue(row[field]));
  return applySummaryNumberTransform(sourceRow?.[field] ?? '', transformConfig);
}

function applySummaryNumberTransform(value: unknown, config: unknown): unknown {
  if (!isRecord(config)) return value;
  const multiplier = readNumber(config.multiplier ?? config.factor);
  const add = readNumber(config.add ?? config.offset);
  const numeric = numericValueOrNull(value);
  if (numeric === null) return value;
  return (numeric * (multiplier ?? 1)) + (add ?? 0);
}

function summaryLabelCell(label: string, column: DashboardTableColumn, rowConfig: Record<string, unknown>): DashboardTableCell {
  const cell = tableTotalLabelCell(label, column);
  const style = summaryCellStyle(rowConfig, column);
  return Object.keys(style).length > 0 ? { ...cell, style: { ...(cell.style ?? {}), ...style } } : cell;
}

function summaryCellStyle(config: Record<string, unknown>, column: DashboardTableColumn): Record<string, string> {
  const configuredStyle = isRecord(config.style) ? cssStylePatch(config.style) : {};
  return {
    ...(column.align ? { textAlign: column.align } : {}),
    ...colorStylePatch('color', config.color ?? config.textColor),
    ...colorStylePatch('background', config.background ?? config.backgroundColor),
    ...(readString(config.fontWeight ?? config.weight) ? { fontWeight: readString(config.fontWeight ?? config.weight) as string } : {}),
    ...(readString(config.fontSize) ? { fontSize: readString(config.fontSize) as string } : {}),
    ...configuredStyle
  };
}

function cssStylePatch(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === 'string' && entry.trim() ? [[key, entry.trim()]] : []
  ));
}

function colorStylePatch(key: 'background' | 'color', value: unknown): Record<string, string> {
  const color = readString(value);
  return color ? { [key]: color } : {};
}

function summaryRowConditionMatches(
  rowConfig: Record<string, unknown>,
  rows: Array<Record<string, unknown>>
): boolean {
  const condition = rowConfig.when ?? rowConfig.condition ?? rowConfig.showWhen;
  if (condition === undefined || condition === null) return true;
  if (Array.isArray(condition)) return condition.every(item => isRecord(item) && summaryConditionMatches(item, rows));
  return isRecord(condition) ? summaryConditionMatches(condition, rows) : true;
}

function summaryConditionMatches(
  condition: Record<string, unknown>,
  rows: Array<Record<string, unknown>>
): boolean {
  const field = readString(condition.field ?? condition.key ?? condition.name);
  if (!field) return true;
  const value = summaryFieldValue(rows, field, readAggregationType(condition.aggregation ?? condition.aggregate), readString(condition.source), undefined);
  const operator = readString(condition.operator ?? condition.op) ?? 'truthy';
  const expected = Object.prototype.hasOwnProperty.call(condition, 'value') ? condition.value : undefined;
  const numeric = numericValueOrNull(value);
  const expectedNumeric = numericValueOrNull(expected);
  if (operator === 'gt' || operator === 'greater_than' || operator === '>') return numeric !== null && numeric > (expectedNumeric ?? 0);
  if (operator === 'gte' || operator === 'greater_equal' || operator === '>=') return numeric !== null && numeric >= (expectedNumeric ?? 0);
  if (operator === 'lt' || operator === 'less_than' || operator === '<') return numeric !== null && numeric < (expectedNumeric ?? 0);
  if (operator === 'lte' || operator === 'less_equal' || operator === '<=') return numeric !== null && numeric <= (expectedNumeric ?? 0);
  if (operator === 'eq' || operator === 'equals' || operator === '=') return String(value ?? '') === String(expected ?? '');
  if (operator === 'ne' || operator === 'not_equals' || operator === '!=' || operator === 'not') return String(value ?? '') !== String(expected ?? '');
  if (operator === 'not_zero' || operator === 'notZero') return numeric !== null && numeric !== 0;
  if (operator === 'zero') return numeric !== null && numeric === 0;
  return hasSummaryValue(value) && value !== false;
}

function hasSummaryValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

function readNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function totalLabelColumnIndex(
  columns: DashboardTableColumn[],
  config: Record<string, unknown>
): number {
  const configured = readString(config.totalLabelColumn ?? config.footerTotalLabelColumn ?? config.totalLabelColumnKey);
  if (configured) {
    const match = columns.findIndex(column => column.key === configured || column.label === configured);
    if (match >= 0) return match;
    const numericIndex = Number(configured);
    if (Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < columns.length) return numericIndex;
  }
  const textIndex = columns.findIndex(column => column.cellType === 'text');
  return Math.max(textIndex, 0);
}

function totalColumnKeys(config: Record<string, unknown>): Set<string> | null {
  const configured = config.totalColumns ?? config.footerTotalColumns ?? config.totalFields;
  const values = Array.isArray(configured)
    ? configured
    : typeof configured === 'string'
      ? configured.split(',')
      : [];
  const keys = values
    .map(value => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean);
  return keys.length > 0 ? new Set(keys) : null;
}

function tableTotalLabelCell(label: string, column: DashboardTableColumn): DashboardTableCell {
  return {
    display: label,
    isTotal: true,
    numeric: null,
    ratio: null,
    raw: label,
    sparkline: [],
    ...(column.align ? { style: { textAlign: column.align } } : {}),
    tone: 'neutral'
  };
}
