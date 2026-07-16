import {
  parseConfigList,
  parseOptionalJson,
  setStringConfig
} from './dashboardElementEditorConfig';
import type { DashboardElementEditorState } from './dashboardElementEditorState';
import {
  clearConfigKeys,
  normalizeWidthPixels,
  setOptionalConfig,
  setThemeOptionalColorConfig,
  usesNamedThemePreset
} from './dashboardElementEditorUtils';

export function applyMatrixConfig(
  config: Record<string, unknown>,
  state: DashboardElementEditorState,
  setConfigError: (message: string) => void
): boolean {
  const {
    calculatedFieldsText, matrixBorderColor, matrixColumnCollapseFieldsText,
    matrixColumnDataDisplayMode, matrixColumnFieldsText, matrixColumnHeaderLabel,
    matrixColumnHeaderWidth, matrixColumnHeaderWidthType, matrixColumnWidthsText,
    matrixConditionalFormattingText, matrixDefaultColumnCollapseState, matrixDefaultRowCollapseState,
    matrixDisplayMode, matrixEnableColumnCollapse, matrixEnableRowCollapse, matrixFiltersText,
    matrixFontFamily, matrixFontSize, matrixHeaderAlign, matrixHeaderBg, matrixHeaderFontWeight,
    matrixHeaderText, matrixMultiSortText, matrixRowAlign, matrixRowBg, matrixRowCollapseFieldsText,
    matrixRowDataDisplayMode, matrixRowFieldsText, matrixRowFontWeight, matrixRowHeaderAlign,
    matrixRowHeaderBg, matrixRowHeaderFontWeight, matrixRowHeaderLabel, matrixRowHeaderText,
    matrixRowHeaderWidth, matrixRowHeaderWidthType, matrixRowText, matrixShowBorders,
    matrixShowColumnSubtotals, matrixShowColumnTotals, matrixShowRowSubtotals, matrixShowRowTotals,
    matrixShowTitle, matrixShowValueHeaders, matrixSortBy, matrixSortDirection, matrixTitleColor,
    matrixTitleFontSize, matrixTitleFontWeight, matrixValueFieldsText, matrixValueHeaderLabel,
    matrixValueHeaderWidth, tableFormat
  } = state;

  const rowFields = parseConfigList(matrixRowFieldsText.value, 'Matrix row fields', setConfigError);
  const columnFields = parseConfigList(matrixColumnFieldsText.value, 'Matrix column fields', setConfigError);
  const valueFields = parseConfigList(matrixValueFieldsText.value, 'Matrix value fields', setConfigError);
  const rowCollapseFields = parseConfigList(matrixRowCollapseFieldsText.value, 'Matrix row collapse fields', setConfigError);
  const columnCollapseFields = parseConfigList(matrixColumnCollapseFieldsText.value, 'Matrix column collapse fields', setConfigError);
  const columnWidths = parseOptionalJson(matrixColumnWidthsText.value, 'Matrix column widths', setConfigError);
  const filters = parseOptionalJson(matrixFiltersText.value, 'Matrix filters', setConfigError);
  const conditionalFormatting = parseOptionalJson(matrixConditionalFormattingText.value, 'Matrix conditional formatting', setConfigError);
  const multiSort = parseOptionalJson(matrixMultiSortText.value, 'Matrix multi-sort', setConfigError);
  const calculatedFields = parseOptionalJson(calculatedFieldsText.value, 'Calculated fields', setConfigError);
  if (!rowFields || !columnFields || !valueFields || !rowCollapseFields || !columnCollapseFields || columnWidths === null || filters === null || conditionalFormatting === null || multiSort === null || calculatedFields === null) return false;
  config.rowFields = rowFields;
  config.columnFields = columnFields;
  config.valueFields = valueFields;
  setStringConfig(config, 'tableFormat', tableFormat.value);
  setStringConfig(config, 'displayMode', matrixDisplayMode.value);
  config.showValueHeaders = valueFields.length > 1 ? true : matrixShowValueHeaders.value;
  setStringConfig(config, 'rowHeaderLabel', matrixRowHeaderLabel.value);
  setStringConfig(config, 'columnHeaderLabel', matrixColumnHeaderLabel.value);
  setStringConfig(config, 'valueHeaderLabel', matrixValueHeaderLabel.value);
  setStringConfig(config, 'rowHeaderWidthType', matrixRowHeaderWidthType.value);
  setStringConfig(config, 'columnHeaderWidthType', matrixColumnHeaderWidthType.value);
  setStringConfig(config, 'rowHeaderWidth', matrixRowHeaderWidthType.value === 'fixed' ? normalizeWidthPixels(matrixRowHeaderWidth.value) : '');
  setStringConfig(config, 'columnHeaderWidth', matrixColumnHeaderWidthType.value === 'fixed' ? normalizeWidthPixels(matrixColumnHeaderWidth.value) : '');
  setStringConfig(config, 'columnWidth', matrixColumnHeaderWidthType.value === 'fixed' ? normalizeWidthPixels(matrixColumnHeaderWidth.value) : '');
  setStringConfig(config, 'valueHeaderWidth', matrixValueHeaderWidth.value);
  setOptionalConfig(config, 'columnWidths', columnWidths);
  setStringConfig(config, 'rowDataDisplayMode', matrixRowDataDisplayMode.value);
  setStringConfig(config, 'columnDataDisplayMode', matrixColumnDataDisplayMode.value);
  setOptionalConfig(config, 'matrixFilters', filters);
  setOptionalConfig(config, 'conditionalFormatting', conditionalFormatting);
  setOptionalConfig(config, 'multiSort', multiSort);
  setOptionalConfig(config, 'calculatedFields', calculatedFields);
  setStringConfig(config, 'defaultRowCollapseState', matrixDefaultRowCollapseState.value);
  setStringConfig(config, 'defaultColumnCollapseState', matrixDefaultColumnCollapseState.value);
  setStringConfig(config, 'sortBy', matrixSortBy.value);
  setStringConfig(config, 'sortDirection', matrixSortDirection.value);
  config.rowCollapseFields = rowCollapseFields;
  config.columnCollapseFields = columnCollapseFields;
  config.showRowTotals = matrixShowRowTotals.value;
  config.showColumnTotals = matrixShowColumnTotals.value;
  config.showRowSubtotals = matrixShowRowSubtotals.value;
  config.showColumnSubtotals = matrixShowColumnSubtotals.value;
  config.enableRowExpandCollapse = matrixEnableRowCollapse.value;
  config.enableColumnExpandCollapse = matrixEnableColumnCollapse.value;
  config.showBorders = matrixShowBorders.value;
  if (usesNamedThemePreset(tableFormat.value)) {
    clearConfigKeys(config, ['borderColor', 'headerBg', 'headerText', 'rowHeaderBg', 'rowHeaderText', 'rowBg', 'rowText']);
  } else {
    setThemeOptionalColorConfig(config, 'borderColor', matrixBorderColor.value, '#d1d5db');
    setThemeOptionalColorConfig(config, 'headerBg', matrixHeaderBg.value, '#f8fafc');
    setThemeOptionalColorConfig(config, 'headerText', matrixHeaderText.value, '#111827');
    setThemeOptionalColorConfig(config, 'rowHeaderBg', matrixRowHeaderBg.value, '#ffffff');
    setThemeOptionalColorConfig(config, 'rowHeaderText', matrixRowHeaderText.value, '#111827');
    setThemeOptionalColorConfig(config, 'rowBg', matrixRowBg.value, '#ffffff');
    setThemeOptionalColorConfig(config, 'rowText', matrixRowText.value, '#111827');
  }
  setStringConfig(config, 'fontFamily', matrixFontFamily.value);
  setStringConfig(config, 'fontSize', matrixFontSize.value);
  config.showTitle = matrixShowTitle.value;
  setStringConfig(config, 'titleFontSize', matrixTitleFontSize.value);
  setStringConfig(config, 'titleFontWeight', matrixTitleFontWeight.value);
  setStringConfig(config, 'titleColor', matrixTitleColor.value);
  setStringConfig(config, 'headerAlign', matrixHeaderAlign.value);
  setStringConfig(config, 'headerFontWeight', matrixHeaderFontWeight.value);
  setStringConfig(config, 'rowHeaderAlign', matrixRowHeaderAlign.value);
  setStringConfig(config, 'rowHeaderFontWeight', matrixRowHeaderFontWeight.value);
  setStringConfig(config, 'rowAlign', matrixRowAlign.value);
  setStringConfig(config, 'rowFontWeight', matrixRowFontWeight.value);
  return true;
}
