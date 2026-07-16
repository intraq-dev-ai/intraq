import { computed, ref } from 'vue';
import type { useDashboardElementEditor } from '../editor/useDashboardElementEditor';
import { jsonArrayCount } from './manualSidebarUtils';
import {
  matrixTableFormats,
  matrixValuePreview,
  parseMatrixFieldEntries,
  parseMatrixFilterEntries,
  parseMatrixSortConfig,
  parseMatrixValueEntries,
  serializeMatrixFieldEntries,
  serializeMatrixFilterEntries,
  serializeMatrixSortConfig,
  serializeMatrixValueEntries,
  type MatrixFieldEntry,
  type MatrixFilterEntry,
  type MatrixSortEntry,
  type MatrixValueEntry
} from './manualMatrixSidebarConfig';

type EditorState = ReturnType<typeof useDashboardElementEditor>;

export function useManualMatrixSidebar(editor: EditorState) {
  const showMatrixRowsDialog = ref(false);
  const showMatrixColsDialog = ref(false);
  const showMatrixValuesDialog = ref(false);
  const showMatrixDesignDialog = ref(false);
  const showMatrixFilterSortDialog = ref(false);
  const showMatrixCalcDialog = ref(false);
  const showMatrixCondFmtDialog = ref(false);
  const localMatrixRows = ref<MatrixFieldEntry[]>([]);
  const localMatrixCols = ref<MatrixFieldEntry[]>([]);
  const localMatrixValues = ref<MatrixValueEntry[]>([]);
  const localMatrixFilters = ref<MatrixFilterEntry[]>([]);
  const localMatrixRowSorts = ref<MatrixSortEntry[]>([]);
  const localMatrixColumnSorts = ref<MatrixSortEntry[]>([]);

  const matrixConfiguredRowFields = computed(() => parseMatrixFieldEntries(editor.matrixRowFieldsText.value));
  const matrixConfiguredColumnFields = computed(() => parseMatrixFieldEntries(editor.matrixColumnFieldsText.value));
  const matrixConfiguredValues = computed(() => parseMatrixValueEntries(editor.matrixValueFieldsText.value));
  const matrixRowCount = computed(() => matrixConfiguredRowFields.value.length);
  const matrixColCount = computed(() => matrixConfiguredColumnFields.value.length);
  const matrixValueCount = computed(() => matrixConfiguredValues.value.length);
  const matrixCondFmtCount = computed(() => jsonArrayCount(editor.matrixConditionalFormattingText.value));
  const matrixFilterCount = computed(() => parseMatrixFilterEntries(editor.matrixFiltersText.value).length);
  const matrixRowSortCount = computed(() => parseMatrixSortConfig(editor.matrixMultiSortText.value).rows.length);
  const matrixColumnSortCount = computed(() => parseMatrixSortConfig(editor.matrixMultiSortText.value).columns.length);
  function openMatrixRowsDialog(): void {
    localMatrixRows.value = parseMatrixFieldEntries(editor.matrixRowFieldsText.value);
    showMatrixRowsDialog.value = true;
  }

  function applyMatrixRowsDialog(): void {
    editor.matrixRowFieldsText.value = serializeMatrixFieldEntries(localMatrixRows.value);
    showMatrixRowsDialog.value = false;
    editor.submitElement();
  }

  function openMatrixColsDialog(): void {
    localMatrixCols.value = parseMatrixFieldEntries(editor.matrixColumnFieldsText.value);
    showMatrixColsDialog.value = true;
  }

  function applyMatrixColsDialog(): void {
    editor.matrixColumnFieldsText.value = serializeMatrixFieldEntries(localMatrixCols.value);
    showMatrixColsDialog.value = false;
    editor.submitElement();
  }

  function openMatrixValuesDialog(): void {
    localMatrixValues.value = parseMatrixValueEntries(editor.matrixValueFieldsText.value);
    showMatrixValuesDialog.value = true;
  }

  function applyMatrixValuesDialog(): void {
    editor.matrixValueFieldsText.value = serializeMatrixValueEntries(localMatrixValues.value);
    if (localMatrixValues.value.length > 1) editor.matrixShowValueHeaders.value = true;
    showMatrixValuesDialog.value = false;
    editor.submitElement();
  }

  function openMatrixFilterSortDialog(): void {
    localMatrixFilters.value = parseMatrixFilterEntries(editor.matrixFiltersText.value);
    const sortConfig = parseMatrixSortConfig(editor.matrixMultiSortText.value);
    localMatrixRowSorts.value = sortConfig.rows;
    localMatrixColumnSorts.value = sortConfig.columns;
    showMatrixFilterSortDialog.value = true;
  }

  function applyMatrixFilterSortDialog(): void {
    editor.matrixFiltersText.value = serializeMatrixFilterEntries(localMatrixFilters.value);
    editor.matrixMultiSortText.value = serializeMatrixSortConfig({
      columns: localMatrixColumnSorts.value,
      rows: localMatrixRowSorts.value
    });
    showMatrixFilterSortDialog.value = false;
    editor.submitElement();
  }

  function applyMatrixTableFormat(format: string): void {
    editor.tableFormat.value = format;
    const preset = matrixTableFormats[format];
    if (!preset || format === 'custom') return;
    editor.matrixShowBorders.value = preset.showBorders;
    editor.matrixHeaderBg.value = preset.headerBg;
    editor.matrixHeaderText.value = preset.headerText;
    editor.matrixRowHeaderBg.value = preset.headerBg;
    editor.matrixRowHeaderText.value = preset.headerText;
    editor.matrixRowBg.value = preset.rowBg;
    editor.matrixRowText.value = preset.rowText;
    editor.matrixBorderColor.value = preset.borderColor;
  }

  function applyMatrixCondFmtDialog(): void {
    // Matrix conditional formatting now live-applies while the dialog is open.
    // Closing the dialog should behave like legacy: close only, without a
    // second submit step.
  }

  function applyMatrixCalcDialog(): void {
    showMatrixCalcDialog.value = false;
    editor.submitElement();
  }

  return {
    applyMatrixCalcDialog,
    applyMatrixColsDialog,
    applyMatrixCondFmtDialog,
    applyMatrixFilterSortDialog,
    applyMatrixRowsDialog,
    applyMatrixTableFormat,
    applyMatrixValuesDialog,
    localMatrixCols,
    localMatrixColumnSorts,
    localMatrixFilters,
    localMatrixRows,
    localMatrixRowSorts,
    localMatrixValues,
    matrixColCount,
    matrixColumnSortCount,
    matrixCondFmtCount,
    matrixConfiguredColumnFields,
    matrixConfiguredRowFields,
    matrixConfiguredValues,
    matrixFilterCount,
    matrixRowCount,
    matrixRowSortCount,
    matrixValueCount,
    matrixValuePreview,
    openMatrixColsDialog,
    openMatrixFilterSortDialog,
    openMatrixRowsDialog,
    openMatrixValuesDialog,
    showMatrixCalcDialog,
    showMatrixColsDialog,
    showMatrixCondFmtDialog,
    showMatrixDesignDialog,
    showMatrixFilterSortDialog,
    showMatrixRowsDialog,
    showMatrixValuesDialog
  };
}
