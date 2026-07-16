import {
  parseConfigList,
  parseOptionalJson,
  setStringConfig
} from './dashboardElementEditorConfig';
import type { DashboardElementEditorState } from './dashboardElementEditorState';
import {
  clearConfigKeys,
  hasThemeOverride,
  setNullableNumberConfig,
  setOptionalConfig,
  setThemeOptionalColorConfig,
  usesNamedThemePreset
} from './dashboardElementEditorUtils';

export function applyTableConfig(
  config: Record<string, unknown>,
  state: DashboardElementEditorState,
  setConfigError: (message: string) => void
): boolean {
  const {
    calculatedFieldsText, columnsText, tableActionsText, tableAlternateRowBg, tableBorderColor,
    tableBorderRadius, tableCellPadding, tableConditionalFormattingText, tableDataMode,
    tableDisplayMode, tableEnableExport, tableEnableFilters, tableEnablePagination,
    tableEnableRowSelection, tableEnableSearch, tableEnableSorting, tableFillMissingTimeBuckets,
    tableFiltersText, tableFormat, tableGroupCollapsed, tableGroupFieldsText, tableGroupShowTotals,
    tableHeaderBg, tableHeaderText, tableHeightMode, tableHideTitle, tablePageSize, tableRowBg,
    tableRowText, tableShadow, tableShowBorders, tableShowTotal, tableTimeBucketFillValue,
    tableTimeBucketInterval, tableTotalColumnsText, tableTotalLabel, tableTotalLabelColumn
  } = state;

  const columns = parseConfigList(columnsText.value, 'Table columns', setConfigError);
  const groupFields = parseConfigList(tableGroupFieldsText.value, 'Table grouping fields', setConfigError);
  const filters = parseOptionalJson(tableFiltersText.value, 'Table filters', setConfigError);
  const actions = parseOptionalJson(tableActionsText.value, 'Table actions', setConfigError);
  const conditionalFormatting = parseOptionalJson(tableConditionalFormattingText.value, 'Table conditional formatting', setConfigError);
  const calculatedFields = parseOptionalJson(calculatedFieldsText.value, 'Calculated fields', setConfigError);
  const totalColumns = parseConfigList(tableTotalColumnsText.value, 'Total columns', setConfigError);
  if (!columns || !groupFields || !totalColumns || filters === null || actions === null || conditionalFormatting === null || calculatedFields === null) return false;
  config.columns = columns;
  setStringConfig(config, 'tableDisplayMode', tableDisplayMode.value);
  if (tableEnablePagination.value) {
    config.rowsPerPage = Math.max(1, Math.floor(tablePageSize.value || 25));
  } else {
    delete config.rowsPerPage;
  }
  if (groupFields.length) {
    config.rowGrouping = {
      ...(typeof config.rowGrouping === 'object' && config.rowGrouping ? config.rowGrouping : {}),
      collapsedByDefault: tableGroupCollapsed.value,
      defaultExpanded: !tableGroupCollapsed.value,
      enableExpandCollapse: true,
      enabled: true,
      fields: groupFields,
      hideGroupedColumns: true,
      inlineGroupRowValues: true,
      showTotals: tableGroupShowTotals.value
    };
    config.groupByFields = groupFields;
  } else {
    delete config.rowGrouping;
    delete config.groupByFields;
  }
  setOptionalConfig(config, 'tableFilters', filters);
  setOptionalConfig(config, 'actions', actions);
  setOptionalConfig(config, 'conditionalFormatting', conditionalFormatting);
  setOptionalConfig(config, 'calculatedFields', calculatedFields);
  config.enableSearch = tableEnableSearch.value;
  config.enableFilters = tableEnableFilters.value;
  config.enableSorting = tableEnableSorting.value;
  config.enableRowSelection = tableEnableRowSelection.value;
  config.enableExport = tableEnableExport.value;
  config.enablePagination = tableEnablePagination.value;
  setStringConfig(config, 'tableHeightMode', tableHeightMode.value === 'fixed' ? '' : tableHeightMode.value);
  config.showTotal = tableShowTotal.value;
  setStringConfig(config, 'totalLabel', tableTotalLabel.value === 'Total' ? '' : tableTotalLabel.value);
  setStringConfig(config, 'totalLabelColumn', tableTotalLabelColumn.value);
  setOptionalConfig(config, 'totalColumns', totalColumns);
  if (tableDataMode.value === 'series') {
    config.tableDataMode = 'series';
    delete config.dataMode;
    delete config.useSeriesRows;
    if (tableFillMissingTimeBuckets.value) {
      config.fillMissingTimeBuckets = true;
      setStringConfig(config, 'timeBucketInterval', tableTimeBucketInterval.value === 'auto' ? '' : tableTimeBucketInterval.value);
      setNullableNumberConfig(config, 'timeBucketFillValue', tableTimeBucketFillValue.value);
    } else {
      delete config.fillMissingTimeBuckets;
      delete config.timeBucketInterval;
      delete config.timeBucketFillValue;
    }
  } else {
    delete config.tableDataMode;
    delete config.dataMode;
    delete config.useSeriesRows;
    delete config.fillMissingTimeBuckets;
    delete config.timeBucketInterval;
    delete config.timeBucketFillValue;
  }
  config.hideTitle = tableHideTitle.value;
  setStringConfig(config, 'tableFormat', tableFormat.value);
  const namedTablePreset = usesNamedThemePreset(tableFormat.value);
  if (namedTablePreset) clearConfigKeys(config, ['alternateRowBg', 'borderColor', 'headerBg', 'headerText', 'rowBg', 'rowText']);
  else {
    setThemeOptionalColorConfig(config, 'alternateRowBg', tableAlternateRowBg.value, '#f9fafb');
    setThemeOptionalColorConfig(config, 'borderColor', tableBorderColor.value, '#e5e7eb');
  }
  setStringConfig(config, 'borderRadius', tableBorderRadius.value);
  setStringConfig(config, 'cellPadding', tableCellPadding.value);
  setStringConfig(config, 'shadow', tableShadow.value);
  config.isCustomStyling = Boolean(
    tableFormat.value === 'custom'
    || (!namedTablePreset && (
      hasThemeOverride(tableHeaderBg.value, '#f8fafc')
      || hasThemeOverride(tableHeaderText.value, '#111827')
      || hasThemeOverride(tableRowBg.value, '#ffffff')
      || hasThemeOverride(tableRowText.value, '#111827')
      || hasThemeOverride(tableAlternateRowBg.value, '#f9fafb')
      || hasThemeOverride(tableBorderColor.value, '#e5e7eb')
    ))
  );
  if (namedTablePreset) clearConfigKeys(config, ['headerBg', 'headerText', 'rowBg', 'rowText']);
  else {
    setThemeOptionalColorConfig(config, 'headerBg', tableHeaderBg.value, '#f8fafc');
    setThemeOptionalColorConfig(config, 'headerText', tableHeaderText.value, '#111827');
    setThemeOptionalColorConfig(config, 'rowBg', tableRowBg.value, '#ffffff');
    setThemeOptionalColorConfig(config, 'rowText', tableRowText.value, '#111827');
  }
  config.showBorders = tableShowBorders.value;
  return true;
}
