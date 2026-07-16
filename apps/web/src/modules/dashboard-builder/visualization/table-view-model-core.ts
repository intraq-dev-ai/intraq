import type { DashboardElement, VisualizationData, VisualizationSpec } from '../types';
import { tableFormatOptions } from './table-cell-formatting';
import {
  readTableGroupDefaultCollapsed,
  readTableGroupFields,
  readTableGroupHideColumns,
  readTableGroupTotalsEnabled
} from './table-filter-runtime';
import { applyColumnRatios, buildTableAnalytics, tableCell } from './table-view-model-cells';
import {
  applyColumnRuntimeOverrides,
  configuredColumnDefinitions,
  tableColumnRuntimeOptions,
  tableColumns
} from './table-view-model-columns';
import { tableGroupPresentationPatch, tableVisibleColumns } from './table-view-model-grouping';
import {
  datasetValue,
  filterRecords,
  groupValuesPatch,
  readConditionalRules,
  readTablePagination,
  readTableSorts,
  sliceLimit,
  sortRecords,
  sortTableRows,
  tableRowLimit,
  tableSeriesRows,
  tableSeriesRowsEnabled
} from './table-view-model-normalization';
import { displayModePatch, tablePresentationPatch } from './table-view-model-presentation';
import { footerRowsPatch } from './table-view-model-totals';
import type { ConditionalRule } from './table-view-model-types';
import { isRecord } from './view-model-config';
import type { DashboardTableModel } from './view-model-types';

export function tableViewModel(spec: VisualizationSpec, data: VisualizationData, element?: DashboardElement, rowLimit = 10): DashboardTableModel {
  const config = element?.config ?? {};
  if (isUnconfiguredTableHusk(spec, data, element)) return tableHuskModel(config);
  const runtimeContext = tableRuntimeContext(data, config);
  const sorts = readTableSorts(config, spec);
  const sort = sorts[0];
  const pagination = readTablePagination(config, rowLimit);
  const groupFields = readTableGroupFields(config);
  const presentation = tablePresentationPatch(config);
  const rowGrouping = isRecord(config.rowGrouping) ? config.rowGrouping : {};
  const grouping = groupFields.length > 0 ? {
    defaultCollapsed: readTableGroupDefaultCollapsed(config),
    ...tableGroupPresentationPatch(rowGrouping, config),
    fields: groupFields,
    hideGroupedColumns: readTableGroupHideColumns(config),
    showTotals: readTableGroupTotalsEnabled(config)
  } : undefined;
  const configuredColumns = tableVisibleColumns(applyColumnRuntimeOverrides(tableColumns(spec, element), runtimeContext), grouping);
  const conditionalRules = readConditionalRules(config);
  const formatOptions = tableFormatOptions(config);
  const limit = pagination?.enabled ? undefined : tableRowLimit(element, rowLimit);
  const filteredRawRows = filterRecords(data.rawData ?? [], config);
  const rawRows = sortRecords(filteredRawRows, sorts);
  const seriesRows = tableSeriesRowsEnabled(config) ? tableSeriesRows(data, spec, filteredRawRows) : [];
  const sourceRows = seriesRows.length > 0 ? sortRecords(seriesRows, sorts) : rawRows;
  const visibleRows = sliceLimit(sourceRows, limit);
  const analyticsColumns = buildTableAnalytics(configuredColumns, visibleRows);
  const rows = sourceRows.length > 0
    ? visibleRows.map((row, rowIndex) => ({
      key: String(row.id ?? row._id ?? rowIndex),
      raw: row,
      ...groupValuesPatch(row, grouping?.fields),
      cells: configuredColumns.map((column, columnIndex) => {
        const derivedValue = analyticsColumns[columnIndex]?.[rowIndex];
        return tableCell(
          derivedValue === undefined ? row[column.key] : derivedValue,
          column,
          conditionalRules,
          formatOptions,
          false,
          row,
          runtimeContext
        );
      })
    }))
    : sortTableRows(data.labels.map((label, index) => ({
      key: String(label),
      cells: configuredColumns.map((column, columnIndex) => columnIndex === 0
        ? tableCell(label, column, conditionalRules, formatOptions)
        : tableCell(datasetValue(data, column.key, index), column, conditionalRules, formatOptions, false, undefined, runtimeContext))
    })), configuredColumns, sorts).slice(0, limit ?? data.labels.length);
  return applyColumnRatios({
    columns: configuredColumns,
    rows,
    ...presentation,
    ...displayModePatch(config),
    ...footerRowsPatch(sourceRows, configuredColumns, config, conditionalRules, formatOptions),
    ...(grouping ? { grouping } : {}),
    ...(pagination ? { pagination } : {}),
    ...(sort ? { sort } : {}),
    ...(sorts.length > 0 ? { sorts } : {})
  });
}

function isUnconfiguredTableHusk(
  spec: VisualizationSpec,
  data: VisualizationData,
  element?: DashboardElement
): boolean {
  return spec.kind === 'table'
    && spec.encodings.length === 0
    && configuredColumnDefinitions(element).length === 0
    && data.datasets.length > 0
    && data.datasets.every(dataset => dataset.placeholder === true);
}

function tableHuskModel(config: Record<string, unknown>): DashboardTableModel {
  const columns = ['placeholder_1', 'placeholder_2', 'placeholder_3'].map(key =>
    tableColumnRuntimeOptions({ key, label: '', cellType: 'text' }, config)
  );
  const conditionalRules: ConditionalRule[] = [];
  const formatOptions = tableFormatOptions(config);
  const rows = Array.from({ length: 4 }, (_, index) => ({
    key: `placeholder-${index}`,
    cells: columns.map(column => tableCell('', column, conditionalRules, formatOptions))
  }));
  return applyColumnRatios({ columns, rows, ...tablePresentationPatch(config), ...displayModePatch(config) });
}

function tableRuntimeContext(data: VisualizationData, config: Record<string, unknown>) {
  const browser = browserLinkContext();
  return {
    ...browser,
    parameterValues: {
      ...parameterValuesRecord(config.parameterValues),
      ...(data.runtimeContext?.parameterValues ?? {})
    }
  };
}

function browserLinkContext() {
  const locationOrigin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined;
  const referrer = typeof document !== 'undefined' ? document.referrer : '';
  const parentOrigin = originFromUrl(referrer) ?? locationOrigin;
  return {
    ...(locationOrigin ? { locationOrigin } : {}),
    ...(parentOrigin ? { parentOrigin } : {})
  };
}

function originFromUrl(value: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function parameterValuesRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}
