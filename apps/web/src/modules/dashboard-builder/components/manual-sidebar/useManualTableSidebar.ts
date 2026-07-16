import { computed, ref, watch } from 'vue';
import type { useDashboardElementEditor } from '../editor/useDashboardElementEditor';
import { inferTableBooleanPreset, tableBooleanLabelsForPreset } from './manualTableColumnFormattingPresets';
import { jsonArrayCount, parseList } from './manualSidebarUtils';
import {
  defaultColumnEntry,
  defaultFormatForTableCellType,
  defaultFormatForFieldType,
  isBooleanFieldType,
  isDateFieldType,
  isNumericFieldType,
  normalizeFieldType,
  parseColumnEntries,
  serializeColumnEntries,
  type ColumnEntry,
  type FieldTypeResolver
} from './manualTableColumnEntries';

type EditorState = ReturnType<typeof useDashboardElementEditor>;

export function useManualTableSidebar(editor: EditorState, fieldTypeForName: FieldTypeResolver = () => undefined) {
  const showColumnsDialog = ref(false);
  const showTableStylingDialog = ref(false);
  const showPaginationDialog = ref(false);
  const showPeriodRowsDialog = ref(false);
  const showGroupingDialog = ref(false);
  const showCondFmtDialog = ref(false);
  const showTableCalcDialog = ref(false);
  const localColumns = ref<ColumnEntry[]>([]);

  const localTableHeaderBg = ref('#f8fafc');
  const localTableHeaderText = ref('#111827');
  const localTableRowBg = ref('#ffffff');
  const localTableRowText = ref('#111827');
  const localTableShowBorders = ref(false);
  const localTableAlternateRowBg = ref('#f9fafb');
  const localTableBorderColor = ref('#e5e7eb');
  const localTableBorderRadius = ref('0');
  const localTableCellPadding = ref('medium');
  const localTableFormat = ref('');
  const localTableHideTitle = ref(false);
  const localTableShadow = ref('none');

  const localGroupFields = ref<string[]>([]);
  const localShowTotals = ref(false);
  const localCollapse = ref(false);

  const tableColumnCount = computed(() =>
    parseColumnEntries(editor.columnsText.value, fieldTypeForName).filter(column => column.field).length
  );
  const tableConfiguredColumns = computed(() =>
    parseColumnEntries(editor.columnsText.value, fieldTypeForName)
      .filter(column => column.field)
  );
  const tableCondFmtCount = computed(() => jsonArrayCount(editor.tableConditionalFormattingText.value));
  const tablePeriodRowsSummary = computed(() => {
    if (editor.tableDataMode.value !== 'series') return 'Raw source rows';
    const parts = ['Period rows'];
    if (editor.tableFillMissingTimeBuckets.value) {
      const interval = editor.tableTimeBucketInterval.value === 'auto' ? 'auto interval' : editor.tableTimeBucketInterval.value;
      parts.push(`fill missing · ${interval}`);
    }
    return parts.join(' · ');
  });
  const localColumnCount = computed(() => localColumns.value.filter(column => column.field).length);
  const liveTableStylingSignature = computed(() => JSON.stringify({
    tableAlternateRowBg: localTableAlternateRowBg.value,
    tableBorderColor: localTableBorderColor.value,
    tableBorderRadius: localTableBorderRadius.value,
    tableCellPadding: localTableCellPadding.value,
    tableFormat: localTableFormat.value,
    tableHeaderBg: localTableHeaderBg.value,
    tableHeaderText: localTableHeaderText.value,
    tableHideTitle: localTableHideTitle.value,
    tableRowBg: localTableRowBg.value,
    tableRowText: localTableRowText.value,
    tableShadow: localTableShadow.value,
    tableShowBorders: localTableShowBorders.value,
    tableDisplayMode: editor.tableDisplayMode.value
  }));
  const liveTableGroupingSignature = computed(() => JSON.stringify({
    groupFields: localGroupFields.value,
    collapseByDefault: localCollapse.value,
    showTotals: localShowTotals.value
  }));

  watch(localColumns, () => {
    if (!showColumnsDialog.value) return;
    syncColumnsTextFromDialog();
  }, { deep: true });

  watch(liveTableStylingSignature, () => {
    if (!showTableStylingDialog.value) return;
    syncTableStylingFromDialog();
    editor.submitElement();
  });

  watch(liveTableGroupingSignature, () => {
    if (!showGroupingDialog.value) return;
    syncGroupingFromDialog();
    editor.submitElement();
  });

  function openColumnsDialog(): void {
    localColumns.value = parseColumnEntries(editor.columnsText.value, fieldTypeForName);
    showColumnsDialog.value = true;
  }

  function addColumn(): void {
    localColumns.value.push(defaultColumnEntry('', ''));
  }

  function removeColumn(index: number): void {
    localColumns.value.splice(index, 1);
  }

  function applyColumnsDialog(): void {
    syncColumnsTextFromDialog();
    showColumnsDialog.value = false;
    editor.submitElement();
  }

  function syncColumnsTextFromDialog(): void {
    editor.columnsText.value = serializeColumnEntries(localColumns.value);
  }

  function updateColumnField(column: ColumnEntry): void {
    column.type = normalizeFieldType(fieldTypeForName(column.field));
    if (!column.format) column.format = defaultFormatForFieldType(column.type);
  }

  function updateColumnCellType(column: ColumnEntry): void {
    const fieldDefault = defaultFormatForFieldType(column.type);
    if (!column.format || column.format === fieldDefault) {
      column.format = defaultFormatForTableCellType(column.cellType) || fieldDefault;
    }
  }

  function updateColumnDateFormat(column: ColumnEntry): void {
    if (column.dateFormat !== '__custom__') column.dateFormatCustom = '';
  }

  function applyBooleanPreset(column: ColumnEntry): void {
    if (column.booleanPreset === 'custom') return;
    const labels = tableBooleanLabelsForPreset(column.booleanPreset);
    column.trueLabel = labels.trueLabel;
    column.falseLabel = labels.falseLabel;
  }

  function syncBooleanPreset(column: ColumnEntry): void {
    column.booleanPreset = inferTableBooleanPreset(column.trueLabel, column.falseLabel);
  }

  function columnUsesNumericFormatting(column: ColumnEntry): boolean {
    if (column.format) return column.format === 'number' || column.format === 'currency' || column.format === 'percentage';
    return isNumericFieldType(column.type);
  }

  function columnUsesDateFormatting(column: ColumnEntry): boolean {
    if (column.format) return column.format === 'date';
    return isDateFieldType(column.type);
  }

  function columnUsesBooleanFormatting(column: ColumnEntry): boolean {
    return isBooleanFieldType(column.type);
  }

  function columnUsesStructuredListFormatting(column: ColumnEntry): boolean {
    return column.format === 'structured-list';
  }

  function openTableStylingDialog(): void {
    localTableHeaderBg.value = editor.tableHeaderBg.value;
    localTableHeaderText.value = editor.tableHeaderText.value;
    localTableRowBg.value = editor.tableRowBg.value;
    localTableRowText.value = editor.tableRowText.value;
    localTableShowBorders.value = editor.tableShowBorders.value;
    localTableAlternateRowBg.value = editor.tableAlternateRowBg.value;
    localTableBorderColor.value = editor.tableBorderColor.value;
    localTableBorderRadius.value = editor.tableBorderRadius.value;
    localTableCellPadding.value = editor.tableCellPadding.value;
    localTableFormat.value = editor.tableFormat.value;
    localTableHideTitle.value = editor.tableHideTitle.value;
    localTableShadow.value = editor.tableShadow.value;
    showTableStylingDialog.value = true;
  }

  function applyTableStylingDialog(): void {
    syncTableStylingFromDialog();
    showTableStylingDialog.value = false;
    editor.submitElement();
  }

  function syncTableStylingFromDialog(): void {
    editor.tableHeaderBg.value = localTableHeaderBg.value;
    editor.tableHeaderText.value = localTableHeaderText.value;
    editor.tableRowBg.value = localTableRowBg.value;
    editor.tableRowText.value = localTableRowText.value;
    editor.tableShowBorders.value = localTableShowBorders.value;
    editor.tableAlternateRowBg.value = localTableAlternateRowBg.value;
    editor.tableBorderColor.value = localTableBorderColor.value;
    editor.tableBorderRadius.value = localTableBorderRadius.value;
    editor.tableCellPadding.value = localTableCellPadding.value;
    editor.tableFormat.value = localTableFormat.value;
    editor.tableHideTitle.value = localTableHideTitle.value;
    editor.tableShadow.value = localTableShadow.value;
  }

  function openGroupingDialog(): void {
    localGroupFields.value = parseList(editor.tableGroupFieldsText.value);
    localShowTotals.value = editor.tableGroupShowTotals.value;
    localCollapse.value = editor.tableGroupCollapsed.value;
    showGroupingDialog.value = true;
  }

  function applyGroupingDialog(): void {
    syncGroupingFromDialog();
    showGroupingDialog.value = false;
    editor.submitElement();
  }

  function syncGroupingFromDialog(): void {
    editor.tableGroupFieldsText.value = localGroupFields.value.join(', ');
    editor.tableGroupShowTotals.value = localShowTotals.value;
    editor.tableGroupCollapsed.value = localCollapse.value;
  }

  function applyTableCondFmtDialog(): void { showCondFmtDialog.value = false; editor.submitElement(); }
  function applyTableCalcDialog(): void { showTableCalcDialog.value = false; editor.submitElement(); }

  return {
    addColumn,
    applyColumnsDialog,
    applyBooleanPreset,
    applyGroupingDialog,
    applyTableCalcDialog,
    applyTableCondFmtDialog,
    applyTableStylingDialog,
    columnUsesBooleanFormatting,
    columnUsesDateFormatting,
    columnUsesNumericFormatting,
    columnUsesStructuredListFormatting,
    localCollapse,
    localColumnCount,
    localColumns,
    localGroupFields,
    localShowTotals,
    localTableAlternateRowBg,
    localTableBorderColor,
    localTableBorderRadius,
    localTableCellPadding,
    localTableFormat,
    localTableHeaderBg,
    localTableHeaderText,
    localTableHideTitle,
    localTableRowBg,
    localTableRowText,
    localTableShadow,
    localTableShowBorders,
    openColumnsDialog,
    openGroupingDialog,
    openTableStylingDialog,
    removeColumn,
    showColumnsDialog,
    showCondFmtDialog,
    showGroupingDialog,
    showPaginationDialog,
    showPeriodRowsDialog,
    showTableCalcDialog,
    showTableStylingDialog,
    syncBooleanPreset,
    tableConfiguredColumns,
    tableColumnCount,
    tableCondFmtCount,
    tablePeriodRowsSummary,
    updateColumnCellType,
    updateColumnDateFormat,
    updateColumnField
  };
}
