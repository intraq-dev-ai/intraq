import type { DashboardElement, VisualizationData, VisualizationSpec } from '../types';
import { formatMetric, labelFor, type MetricDisplayFormat, type MetricFormatOptions, numericMetricValue } from './formatting';
import { configuredMatrixFields } from './matrix-view-model-config';
import {
  matrixBodyCellMeta,
  type MatrixConditionalScales
} from './matrix-conditional-formatting';
import type { MatrixColumn, MatrixFields, MatrixGroup, MatrixRowWithContext } from './matrix-view-model-types';
import {
  columnGroupIds,
  columnMatchesRow,
  columnSubtotalGroupId,
  compositeLabel,
  effectiveMatrixRowFields,
  filterRecords,
  groupRows,
  matrixColumnHeaderRows,
  matrixColumns,
  matrixFlatColumnHeaderMeta,
  rowHeaderCells,
  rowHeaderGroupStats,
  sortRecords,
  sortedMatrixGroups,
  uniqueColumnGroups,
  withRowHeaderStarts
} from './matrix-view-model-structure';
import { measureEncodings, primaryNumberFormat } from './spec';
import { aggregateRows, readBoolean, readConfiguredFields, type AggregationType, type ConfiguredField } from './view-model-config';
import { numericValueOrNull } from './view-model-runtime';
import type {
  DashboardMatrixCellMeta,
  DashboardMatrixModel,
  DashboardMatrixRow,
  DashboardMatrixValueHeader
} from './view-model-types';

export function buildMatrixViewModel(spec: VisualizationSpec, data: VisualizationData, element?: DashboardElement): DashboardMatrixModel {
  const configured = configuredMatrixFields(spec, element);
  if (isUnconfiguredMatrixHusk(spec, data, element, configured)) return matrixHuskModel(configured);
  if (data.rawData?.length && configured.rowFields.length && configured.columnFields.length && configured.valueFields.length) {
    return matrixFromRawRows(spec, data.rawData, configured);
  }

  const columns = data.labels.map(label => String(label));
  const showRowTotals = readBoolean(element?.config?.showRowTotals) ?? true;
  const showColumnTotals = readBoolean(element?.config?.showColumnTotals) ?? false;
  const rows = data.datasets.map(dataset => {
    const values = dataset.data.map(value => numericMetricValue(value));
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      label: labelFor(dataset.label),
      cells: values.map(value => formatMetric(value, primaryNumberFormat(spec), configured.formatOptions)),
      total: showRowTotals ? formatMetric(total, primaryNumberFormat(spec), configured.formatOptions) : ''
    };
  });
  return {
    columns,
    rows: withColumnTotalRows(rows, columns, showColumnTotals, showRowTotals, new Map([['__default__', primaryNumberFormat(spec)]]), false, configured.formatOptions),
    showColumnTotals,
    showRowTotals,
    ...(configured.showValueHeaders ? { showValueHeaders: true } : {}),
    ...matrixRuntimePatch(configured, columns)
  };
}

function isUnconfiguredMatrixHusk(
  spec: VisualizationSpec,
  data: VisualizationData,
  element: DashboardElement | undefined,
  configured: MatrixFields
): boolean {
  return spec.kind === 'matrix'
    && spec.encodings.length === 0
    && readConfiguredFields(element?.config?.rowFields).length === 0
    && readConfiguredFields(element?.config?.columnFields).length === 0
    && readConfiguredFields(element?.config?.valueFields).length === 0
    && configured.rowFields.length === 0
    && configured.columnFields.length === 0
    && configured.valueFields.length === 0
    && data.datasets.length > 0
    && data.datasets.every(dataset => dataset.placeholder === true);
}

function matrixHuskModel(configured: MatrixFields): DashboardMatrixModel {
  const columns = ['', '', ''];
  const rows = Array.from({ length: 4 }, (_, index) => ({
    cells: columns.map(() => ''),
    key: `placeholder-${index}`,
    label: '',
    total: ''
  })).map(({ key, ...row }) => row);
  return {
    columns,
    rowHeaderLabel: '',
    rows,
    showColumnTotals: false,
    showRowTotals: false,
    ...matrixRuntimePatch(configured, columns)
  };
}

function matrixFromRawRows(spec: VisualizationSpec, rawRows: Array<Record<string, unknown>>, configured: MatrixFields): DashboardMatrixModel {
  const filteredRows = filterRecords(rawRows, configured.filters);
  const columnFieldNames = configured.columnFields.map(field => field.field);
  const valueFieldNames = new Set(configured.valueFields.map(field => field.field));
  const rowFields = effectiveMatrixRowFields(filteredRows, configured.rowFields, valueFieldNames);
  const rowFieldNames = rowFields.map(field => field.field);
  const logicalColumns = matrixColumns(uniqueColumnGroups(sortRecords(filteredRows, configured.columnSorts), configured.columnFields), columnFieldNames, configured.showColumnSubtotals);
  const valueHeaders = matrixValueHeaders(configured.valueFields);
  const showValueHeaderRow = shouldShowMatrixValueHeaderRow(configured);
  const columns = expandedMatrixColumns(logicalColumns, valueHeaders, showValueHeaderRow);
  const columnHeaderRows = shouldUseGroupedMatrixHeaders(configured)
    ? matrixColumnHeaderRows(logicalColumns, columnFieldNames, configured.conditionalRules, configured.columnDataDisplayMode, valueHeaders, showValueHeaderRow)
    : undefined;
  const columnHeaderMeta = columnHeaderRows
    ? undefined
    : expandFlatColumnHeaderMeta(matrixFlatColumnHeaderMeta(logicalColumns, columnFieldNames, configured.conditionalRules), valueHeaders);
  const formatByField = formatMapForMatrix(spec, configured);
  const conditionalScales = matrixConditionalScales(filteredRows, logicalColumns, columnFieldNames, rowFieldNames, configured);
  const rows = matrixRowsFromRawGroups(filteredRows, logicalColumns, columnFieldNames, rowFieldNames, configured, formatByField, conditionalScales);
  return {
    columns,
    ...(columnHeaderRows ? { columnHeaderRows } : {}),
    ...(columnHeaderMeta ? { columnHeaderMeta } : {}),
    ...(columnHeaderRows ? {
      columnGroupIds: expandColumnGroupIds(logicalColumns, columnFieldNames, valueHeaders),
      columnSubtotalGroupIds: expandColumnSubtotalGroupIds(logicalColumns, columnFieldNames, valueHeaders)
    } : {}),
    ...(rowFields.length > 0 ? { rowHeaderFields: rowFields.map(field => ({ field: field.field, label: field.label })) } : {}),
    rows: withRawColumnTotalRows(rows, filteredRows, logicalColumns, columnFieldNames, configured, formatByField),
    showColumnTotals: configured.showColumnTotals,
    showRowTotals: configured.showRowTotals,
    ...(valueHeaders.length > 0 ? { valueHeaders } : {}),
    ...(configured.showValueHeaders ? { showValueHeaders: true } : {}),
    ...matrixRuntimePatch(configured, columns)
  };
}

function matrixRowsFromRawGroups(
  rawRows: Array<Record<string, unknown>>,
  columns: MatrixColumn[],
  columnFieldNames: string[],
  rowFieldNames: string[],
  configured: MatrixFields,
  formatByField: Map<string, MetricDisplayFormat | undefined>,
  conditionalScales: MatrixConditionalScales
): DashboardMatrixRow[] {
  const rowGroups = groupRows(sortRecords(rawRows, configured.rowSorts.length ? configured.rowSorts : configured.sort), rowFieldNames);
  const groupStats = rowHeaderGroupStats(rowGroups, rowFieldNames);
  if (!configured.showRowSubtotals || rowFieldNames.length < 2) {
    return withRowHeaderStarts(sortedMatrixGroups(rowGroups, configured.rowSorts.length ? configured.rowSorts : configured.sort, configured.valueFields[0]?.field, rowFieldNames).map(group =>
      matrixRowForGroup(group, columns, columnFieldNames, rowFieldNames, groupStats, formatByField, configured, conditionalScales)
    ));
  }

  const parentFieldNames = rowFieldNames.slice(0, -1);
  const sort = configured.rowSorts.length ? configured.rowSorts : configured.sort;
  return withRowHeaderStarts(sortedMatrixGroups(groupRows(rawRows, parentFieldNames), sort, configured.valueFields[0]?.field, parentFieldNames).flatMap(parent => {
    const childRows = sortedMatrixGroups(rowGroups.filter(group =>
      compositeLabel(group.rows[0] ?? {}, parentFieldNames) === parent.label
    ), sort, configured.valueFields[0]?.field, rowFieldNames).map(group =>
      matrixRowForGroup(group, columns, columnFieldNames, rowFieldNames, groupStats, formatByField, configured, conditionalScales)
    );
    const subtotalRows = [matrixRowForGroup(
      { label: `${parent.label} Total`, rows: parent.rows, values: parent.values },
      columns, columnFieldNames, rowFieldNames, groupStats, formatByField, configured, conditionalScales, { isSubtotal: true }
    )];
    return [...childRows, ...subtotalRows];
  }));
}

function matrixRowForGroup(
  group: MatrixGroup,
  columns: MatrixColumn[],
  columnFields: string[],
  rowFields: string[],
  groupStats: Map<string, number>,
  formatByField: Map<string, MetricDisplayFormat | undefined>,
  configured: MatrixFields,
  conditionalScales: MatrixConditionalScales,
  options: { isSubtotal?: boolean } = {}
): DashboardMatrixRow {
  const rowFieldValues = new Map(rowFields.map((field, index) => [field, group.values[index] ?? '']));
  const valueCells = configured.valueFields.map((valueField) => {
    const aggregation = aggregationForField(valueField);
    const rawValues = columns.map(column => aggregateRows(group.rows.filter(row => columnMatchesRow(column, row, columnFields)), valueField.field, aggregation));
    const format = valueField.format ?? formatByField.get(valueField.field) ?? primaryNumberFormatFromMap(formatByField);
    const formatOptions = valueFieldFormatOptions(configured, valueField);
    return {
      cells: rawValues.map(value => formatMetric(value, format, formatOptions)),
      meta: rawValues.map((value, columnIndex) => matrixBodyCellMeta({
        columnFieldValues: new Map(columnFields.map((field, fieldIndex) => [field, columns[columnIndex]?.values[fieldIndex] ?? ''])),
        rawValue: value,
        rowFieldValues,
        valueField: valueField.field
      }, configured.conditionalRules, conditionalScales)),
      total: formatMetric(aggregateRows(group.rows, valueField.field, aggregation), format, formatOptions)
    };
  });
  const rowTotals = configured.showRowTotals ? valueCells.map(entry => entry.total) : undefined;
  const cellMeta = valueCells.flatMap(entry => entry.meta);
  return {
    label: group.label && group.label !== 'Unassigned' ? group.label : 'All',
    cells: columns.flatMap((_, columnIndex) => valueCells.map(entry => entry.cells[columnIndex] ?? '')),
    ...(cellMeta.some(Boolean) ? { cellMeta } : {}),
    groupLabel: group.label,
    ...(rowFields.length > 0 ? { rowHeaderCells: rowHeaderCells(group.values, rowFields, groupStats, configured.conditionalRules, options.isSubtotal === true) } : {}),
    ...(options.isSubtotal ? { isSubtotal: true } : {}),
    ...(rowTotals ? { rowTotals } : {}),
    total: rowTotals?.[0] ?? ''
  };
}

function aggregationForField(valueField: ConfiguredField): AggregationType { return valueField.aggregation ?? 'sum'; }

function matrixConditionalScales(
  rawRows: Array<Record<string, unknown>>,
  columns: MatrixColumn[],
  columnFieldNames: string[],
  rowFieldNames: string[],
  configured: MatrixFields
): MatrixConditionalScales {
  const rowGroups = groupRows(sortRecords(rawRows, configured.rowSorts.length ? configured.rowSorts : configured.sort), rowFieldNames);
  return {
    columnValuesByField: new Map(columnFieldNames.map((field, index) => [field, columns.flatMap(column => {
      const numeric = numericValueOrNull(column.values[index]);
      return numeric === null ? [] : [numeric];
    })])),
    rowValuesByField: new Map(rowFieldNames.map((field, index) => [field, rowGroups.flatMap(group => {
      const numeric = numericValueOrNull(group.values[index]);
      return numeric === null ? [] : [numeric];
    })])),
    valueCellValuesByField: new Map(configured.valueFields.map(valueField => [valueField.field, rowGroups.flatMap(group => {
      const aggregation = aggregationForField(valueField);
      return columns.flatMap(column => {
        const numeric = aggregateRows(group.rows.filter(row => columnMatchesRow(column, row, columnFieldNames)), valueField.field, aggregation);
        const scaleValue = numericValueOrNull(numeric);
        return scaleValue === null ? [] : [scaleValue];
      });
    })]))
  };
}

function withRawColumnTotalRows(rows: DashboardMatrixRow[], rawRows: Array<Record<string, unknown>>, columns: MatrixColumn[], columnFields: string[], configured: MatrixFields, formatByField: Map<string, MetricDisplayFormat | undefined>): DashboardMatrixRow[] {
  if (!configured.showColumnTotals || rows.length === 0) return rows;
  const totals = configured.valueFields.map(valueField => {
    const aggregation = aggregationForField(valueField);
    const format = valueField.format ?? formatByField.get(valueField.field) ?? primaryNumberFormatFromMap(formatByField);
    const formatOptions = valueFieldFormatOptions(configured, valueField);
    return {
      cells: columns.map(column =>
        formatMetric(aggregateRows(rawRows.filter(row => columnMatchesRow(column, row, columnFields)), valueField.field, aggregation), format, formatOptions)
      ),
      total: formatMetric(aggregateRows(rawRows, valueField.field, aggregation), format, formatOptions)
    };
  });
  const rowTotals = configured.showRowTotals ? totals.map(entry => entry.total) : undefined;
  return [...rows, {
    label: 'Total',
    cells: columns.flatMap((_, columnIndex) => totals.map(entry => entry.cells[columnIndex] ?? '')),
    isTotal: true,
    ...(rowTotals ? { rowTotals } : {}),
    total: rowTotals?.[0] ?? ''
  }];
}

function matrixRuntimePatch(configured: MatrixFields, columns: string[]): Partial<DashboardMatrixModel> {
  const columnWidths = Object.fromEntries(columns.flatMap(column => {
    const width = configured.columnWidths[column] ?? configured.defaultColumnWidth;
    return width ? [[column, width]] : [];
  }));
  return {
    columnDataDisplayMode: configured.columnDataDisplayMode,
    ...(configured.columnHeaderLabel ? { columnHeaderLabel: configured.columnHeaderLabel } : {}),
    ...(Object.keys(columnWidths).length > 0 ? { columnWidths } : {}),
    ...(configured.defaultColumnCollapseState ? { defaultColumnCollapseState: configured.defaultColumnCollapseState } : {}),
    ...(configured.defaultRowCollapseState ? { defaultRowCollapseState: configured.defaultRowCollapseState } : {}),
    ...(configured.displayMode ? { displayMode: configured.displayMode } : {}),
    ...(configured.enableColumnExpandCollapse ? { enableColumnExpandCollapse: true } : {}),
    ...(configured.enableRowExpandCollapse ? { enableRowExpandCollapse: true } : {}),
    ...(configured.maxVisibleColumns ? { maxVisibleColumns: configured.maxVisibleColumns } : {}),
    ...(configured.maxVisibleRows ? { maxVisibleRows: configured.maxVisibleRows } : {}),
    ...(configured.rowDataDisplayMode !== 'repeat' ? { rowDataDisplayMode: configured.rowDataDisplayMode } : {}),
    ...(configured.rowHeaderLabel ? { rowHeaderLabel: configured.rowHeaderLabel } : {}),
    ...(configured.rowHeaderWidth ? { rowHeaderWidth: configured.rowHeaderWidth } : {}),
    ...(configured.showBorders !== undefined ? { showBorders: configured.showBorders } : {}),
    ...(configured.styles ? { styles: configured.styles } : {}),
    ...(configured.tableFormat ? { tableFormat: configured.tableFormat } : {}),
    ...(configured.valueFields.length > 0 ? { valueHeaders: matrixValueHeaders(configured.valueFields) } : {}),
    ...(configured.showValueHeaders ? { valueHeaderLabel: configured.valueHeaderLabel ?? 'Value' } : {}),
    ...(configured.valueHeaderWidth ? { valueHeaderWidth: configured.valueHeaderWidth } : {})
  };
}

function withColumnTotalRows(rows: DashboardMatrixRow[], columns: string[], showColumnTotals: boolean, showRowTotals: boolean, formatByField: Map<string, MetricDisplayFormat | undefined>, showValueHeaders: boolean, formatOptions: MetricFormatOptions): DashboardMatrixRow[] {
  if (!showColumnTotals || rows.length === 0) return rows;
  const groups = new Map<string, DashboardMatrixRow[]>();
  for (const row of rows.filter(row => !row.isSubtotal && !row.isTotal)) {
    const key = matrixRowValueIdentity(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const totalRows = Array.from(groups.entries()).map(([field, groupRows]) => {
    const valueLabel = groupRows[0]?.valueLabel;
    const format = matrixRowFormat(groupRows[0]) ?? formatByField.get(groupRows[0]?.valueField ?? field) ?? primaryNumberFormatFromMap(formatByField);
    const rowFormatOptions = matrixRowFormatOptions(groupRows[0]) ?? formatOptions;
    const columnTotals = columns.map((_, index) => groupRows.reduce((sum, row) => sum + displayMetricValue(row.cells[index]), 0));
    const grandTotal = columnTotals.reduce((sum, value) => sum + value, 0);
    return withMatrixRowContext({
      label: groups.size > 1 && !showValueHeaders && valueLabel ? `${valueLabel} Total` : 'Total',
      cells: columnTotals.map(value => formatMetric(value, format, rowFormatOptions)),
      total: showRowTotals ? formatMetric(grandTotal, format, rowFormatOptions) : '',
      isTotal: true,
      ...(groupRows[0]?.valueField ? { valueField: groupRows[0].valueField } : {}),
      ...(showValueHeaders && valueLabel ? { valueLabel } : {})
    }, field, format, rowFormatOptions);
  });
  return [...rows, ...totalRows];
}

function valueFieldFormatOptions(configured: MatrixFields, valueField: ConfiguredField): MetricFormatOptions {
  return {
    ...configured.formatOptions,
    ...(valueField.currencySymbol ? { currencySymbol: valueField.currencySymbol } : {}),
    ...(valueField.maximumFractionDigits !== undefined ? { maximumFractionDigits: valueField.maximumFractionDigits } : {}),
    ...(valueField.minimumFractionDigits !== undefined ? { minimumFractionDigits: valueField.minimumFractionDigits } : {}),
    ...(valueField.prefix ? { prefix: valueField.prefix } : {}),
    ...(valueField.suffix ? { suffix: valueField.suffix } : {}),
    ...(valueField.thousandsSeparator ? { thousandsSeparator: valueField.thousandsSeparator } : {})
  };
}

function matrixValueHeaders(valueFields: ConfiguredField[]): DashboardMatrixValueHeader[] {
  return valueFields.map((valueField, valueIndex) => ({
    field: valueField.field,
    key: matrixValueIdentity(valueField, valueIndex),
    label: valueField.label
  }));
}

function shouldShowMatrixValueHeaderRow(configured: MatrixFields): boolean {
  return configured.showValueHeaders && configured.valueFields.length > 1;
}

function shouldUseGroupedMatrixHeaders(configured: MatrixFields): boolean {
  return configured.columnFields.length > 1 || configured.valueFields.length > 1;
}

function expandedMatrixColumns(columns: MatrixColumn[], valueHeaders: DashboardMatrixValueHeader[], showValueHeaderRow: boolean): string[] {
  if (valueHeaders.length <= 1) return columns.map(column => column.label);
  return columns.flatMap(column => valueHeaders.map(() => column.label));
}

function expandFlatColumnHeaderMeta(
  meta: Array<DashboardMatrixCellMeta | undefined> | undefined,
  valueHeaders: DashboardMatrixValueHeader[]
): Array<DashboardMatrixCellMeta | undefined> | undefined {
  if (!meta) return undefined;
  const valueCount = Math.max(valueHeaders.length, 1);
  const expanded = meta.flatMap(entry => Array.from({ length: valueCount }, () => entry));
  return expanded.some(Boolean) ? expanded : undefined;
}

function expandColumnGroupIds(columns: MatrixColumn[], fields: string[], valueHeaders: DashboardMatrixValueHeader[]): string[][] {
  const valueCount = Math.max(valueHeaders.length, 1);
  return columns.flatMap(column => Array.from({ length: valueCount }, () => columnGroupIds(column, fields)));
}

function expandColumnSubtotalGroupIds(columns: MatrixColumn[], fields: string[], valueHeaders: DashboardMatrixValueHeader[]): Array<string | undefined> {
  const valueCount = Math.max(valueHeaders.length, 1);
  return columns.flatMap(column => Array.from({ length: valueCount }, () => columnSubtotalGroupId(column, fields)));
}

function formatMapForMatrix(spec: VisualizationSpec, configured: MatrixFields): Map<string, MetricDisplayFormat | undefined> {
  const map = new Map(measureEncodings(spec).map(measure => [measure.field, measure.format ?? primaryNumberFormat(spec)]));
  for (const [field, format] of Object.entries(configured.fieldFormats)) map.set(field, format);
  return map;
}

function matrixValueIdentity(valueField: ConfiguredField, valueIndex: number): string {
  return valueField.entryKey
    ?? `${valueField.field}:${valueField.label}:${valueField.aggregation ?? 'sum'}:${valueIndex}`;
}

function withMatrixRowContext(
  row: DashboardMatrixRow,
  valueKey: string,
  format: MetricDisplayFormat | undefined,
  formatOptions: MetricFormatOptions
): DashboardMatrixRow {
  const enriched = row as MatrixRowWithContext;
  Object.defineProperties(enriched, {
    __valueFormat: { configurable: true, enumerable: false, value: format },
    __valueFormatOptions: { configurable: true, enumerable: false, value: formatOptions },
    __valueKey: { configurable: true, enumerable: false, value: valueKey }
  });
  return enriched;
}

function matrixRowFormat(row: DashboardMatrixRow | undefined): MetricDisplayFormat | undefined {
  return (row as MatrixRowWithContext | undefined)?.__valueFormat;
}

function matrixRowFormatOptions(row: DashboardMatrixRow | undefined): MetricFormatOptions | undefined {
  return (row as MatrixRowWithContext | undefined)?.__valueFormatOptions;
}

function matrixRowValueIdentity(row: DashboardMatrixRow): string {
  return (row as MatrixRowWithContext).__valueKey
    ?? `${row.valueField ?? '__default__'}:${row.valueLabel ?? ''}`;
}

function primaryNumberFormatFromMap(formatByField: Map<string, MetricDisplayFormat | undefined>): MetricDisplayFormat | undefined { return formatByField.values().next().value ?? 'number'; }

function displayMetricValue(value: string | undefined): number {
  if (!value) return 0;
  const numeric = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}
