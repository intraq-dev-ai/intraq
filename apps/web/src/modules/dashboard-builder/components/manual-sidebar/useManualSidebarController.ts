import { computed, isRef, nextTick, ref, toRefs, watch } from 'vue';
import type { BuilderDataField } from '../../types';
import { fieldMetadata, readString as readMetadataString } from '../../agent-context/planner-metadata';
import { useDashboardElementEditor, type SaveElementPatch } from '../editor/useDashboardElementEditor';
import { crossFilterTargetElementsForAuthoring } from '../canvas/dashboard-cross-filters';
import { useManualCardSidebar } from './useManualCardSidebar';
import { useManualChartSidebar } from './useManualChartSidebar';
import { useManualMatrixSidebar } from './useManualMatrixSidebar';
import { useManualTableSidebar } from './useManualTableSidebar';
import { useManualTextSidebar } from './useManualTextSidebar';
import { dashboardCurrencyOptions } from './manualDashboardSettingsOptions';
import { tableFieldsWithCalculatedFields } from './manualCalculatedFieldOptions';
import { isNumericFieldType } from './manualTableColumnEntries';
import { fieldLabel, inputValue, jsonArrayCount, namedFieldLabel, parseColorRecord, parseList, tableLabel } from './manualSidebarUtils';
import { manualComponents } from './manualSidebarOptions';
import type { ManualSidebarEmit, ManualSidebarProps } from './manualSidebarTypes';
import type { DashboardFilterCreatePatch, DashboardFilterPatch, DashboardSettings } from '../../types';
import { formatConfigRecord } from '../editor/dashboardElementEditorConfig';
import {
  readDashboardCrossFilterMode,
  readDashboardCrossFilterTargetElementIds
} from '../../visualization/cross-filter-config';
import { autoAlignDashboardLayouts, layoutToStorage } from '../canvas/dashboard-canvas-layout';
import { chartPaletteColor } from '../../visualization/chart/series';
import { dashboardElementUsesDataSource, editorTypeForElement } from '../../dashboard-element-normalization';

export function useManualSidebarController(
  props: ManualSidebarProps,
  emit: ManualSidebarEmit
) {
  const propRefs = toRefs(props);
  const editorDataSourceOverride = ref('');
  const editorTableOverride = ref('');
  const selectedConfigDraft = ref<Record<string, unknown>>({});
  const selectedConfigDirtyKeys = new Set<string>();
  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  let hydratingEditor = false;

  watch(() => props.selectedElement?.id ?? '', async () => {
    hydratingEditor = true;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = null;
    editorDataSourceOverride.value = '';
    editorTableOverride.value = '';
    selectedConfigDraft.value = { ...(props.selectedElement?.config ?? {}) };
    selectedConfigDirtyKeys.clear();
    await nextTick();
    hydratingEditor = false;
  }, { immediate: true });

  const elementDataSourceId = computed(() => {
    const element = props.selectedElement;
    if (!element) return '';
    return readConfigString(element.dataSourceId)
      ?? readConfigString(element.config?.dataSourceId)
      ?? '';
  });

  const elementTableId = computed(() => {
    const element = props.selectedElement;
    if (!element) return '';
    const configuredId = readConfigString(element.config?.dataSourceTableId)
      ?? readConfigString(element.config?.tableId);
    if (configuredId) return configuredId;
    const configuredName = readConfigString(element.config?.tableName)
      ?? readConfigString(element.config?.dataSource);
    if (!configuredName) return '';
    const source = props.dataSources.find(item => item.id === elementDataSourceId.value);
    return source?.tables.find(table => table.id === configuredName || table.name === configuredName)?.id ?? '';
  });

  const activeDataSourceId = computed(() =>
    editorDataSourceOverride.value || elementDataSourceId.value || props.selectedDataSourceId
  );
  const activeTables = computed(() =>
    props.dataSources.find(source => source.id === activeDataSourceId.value)?.tables ?? []
  );
  const activeTable = computed(() =>
    activeTables.value.find(table => table.id === activeTableId.value) ?? null
  );
  const activeTableId = computed(() =>
    editorTableOverride.value || elementTableId.value || props.selectedTableId
  );
  const filterContainerOptions = computed(() => (props.dashboard?.elements ?? [])
    .filter(element => (element.type === 'container' || element.type === 'filter-container') && element.id !== props.selectedElement?.id)
    .map(element => ({
      id: element.id,
      name: element.name || 'Container'
    })));

  const editorBindingProps = {
    get dataSources() { return props.dataSources; },
    get selectedDataSourceId() { return activeDataSourceId.value; },
    get selectedElement() { return props.selectedElement; },
    get selectedTableId() { return activeTableId.value; }
  };

  const editor = useDashboardElementEditor(editorBindingProps, patch => emit('saveElement', mergePendingConfigDraft(patch)));
  const elementUsesDataSource = computed(() => dashboardElementUsesDataSource(editor.elementType.value));
  const sourceTableFields = computed((): BuilderDataField[] =>
    activeTables.value.find(table => table.id === activeTableId.value)?.fields ?? []
  );
  const currentTableFields = computed((): BuilderDataField[] =>
    tableFieldsWithCalculatedFields(sourceTableFields.value, editor.calculatedFieldsText.value)
  );
  const chartCrossFilterTargetOptions = computed(() => {
    const dashboard = props.dashboard;
    const selectedElement = props.selectedElement;
    if (!dashboard || !selectedElement || editorTypeForElement(selectedElement) !== 'chart') return [];
    return crossFilterTargetElementsForAuthoring(dashboard.elements, props.dataSources, selectedElement).map(element => ({
      id: element.id,
      name: element.name || 'Untitled Component',
      type: element.chartType || element.type
    }));
  });
  const currentChartCrossFilterConfig = computed(() => ({
    mode: props.selectedElement ? readDashboardCrossFilterMode(props.selectedElement) : 'auto',
    targetElementIds: props.selectedElement ? readDashboardCrossFilterTargetElementIds(props.selectedElement) : []
  }));
  const chart = useManualChartSidebar(editor, {
    currentCrossFilterConfig: currentChartCrossFilterConfig,
    crossFilterTargetOptions: chartCrossFilterTargetOptions,
    saveCrossFilterConfig: saveSelectedElementConfig
  });
  const table = useManualTableSidebar(editor, fieldTypeForName);
  const card = useManualCardSidebar();
  const matrix = useManualMatrixSidebar(editor);
  const text = useManualTextSidebar(props, saveSelectedElementConfig);
  const isPieChart = computed(() =>
    editor.elementChartType.value === 'pie' || editor.elementChartType.value === 'doughnut'
  );
  const filterNeedsValue = computed(() =>
    editor.filterOperator.value !== 'is_null' && editor.filterOperator.value !== 'is_not_null'
  );
  const calculatedFieldCount = computed(() => jsonArrayCount(editor.calculatedFieldsText.value));
  const chartSeriesSummaryLabels = computed(() => {
    const configuredLabels = parseColorRecord(editor.chartSeriesLabelsText.value);
    return parseList(editor.measureFields.value).map(field =>
      namedFieldLabel(field, currentTableFields.value, configuredLabels)
    );
  });
  const pieValueFieldLabel = computed(() => {
    const field = currentTableFields.value.find(candidate => candidate.name === editor.valueField.value);
    return field ? fieldLabel(field) : editor.valueField.value;
  });
  const pieSliceColorOverrides = computed(() => parseColorRecord(editor.chartXValueColorsText.value));
  const pieSliceLabels = computed(() => {
    const labels: string[] = [];
    const seen = new Set<string>();
    const addLabel = (value: unknown) => {
      if (value === undefined || value === null) return;
      const next = String(value).trim();
      if (!next || seen.has(next)) return;
      seen.add(next);
      labels.push(next);
    };
    const xField = editor.xField.value.trim();
    if (xField) {
      const field = currentTableFields.value.find(candidate => candidate.name === xField);
      for (const value of field?.sampleValues ?? []) addLabel(value);
      const rawRows = (activeTable.value as ({ sampleRows?: Array<Record<string, unknown>> } & typeof activeTable.value) | null)?.sampleRows;
      if (Array.isArray(rawRows)) {
        for (const row of rawRows) addLabel(row?.[xField]);
      }
    }
    Object.keys(pieSliceColorOverrides.value).forEach(addLabel);
    return labels;
  });

  function writePieSliceColors(record: Record<string, string>): void {
    editor.chartXValueColorsText.value = formatConfigRecord(record);
  }

  function pieSliceColorPreview(label: string, index: number): string {
    return pieSliceColorOverrides.value[label] ?? chartPaletteColor(index, editor.chartColorTheme.value);
  }

  function pieSliceColorHasOverride(label: string): boolean {
    return typeof pieSliceColorOverrides.value[label] === 'string';
  }

  function setPieSliceColor(label: string, value: string): void {
    const next = { ...pieSliceColorOverrides.value, [label]: value.trim() };
    writePieSliceColors(next);
  }

  function clearPieSliceColor(label: string): void {
    const next = { ...pieSliceColorOverrides.value };
    delete next[label];
    writePieSliceColors(next);
  }

  function seriesFieldLabel(fieldName: string): string {
    const metadata = fieldMetadata(activeTable.value, fieldName);
    return readMetadataString(metadata.label)
      ?? readMetadataString(metadata.businessName)
      ?? namedFieldLabel(fieldName, currentTableFields.value);
  }

  function fieldTypeForName(fieldName: string): string | undefined {
    return currentTableFields.value.find(field => field.name === fieldName)?.type;
  }

  function isNumericField(field: BuilderDataField): boolean {
    return isNumericFieldType(field.type.trim().toLowerCase());
  }

  function scheduleLocalPreview(): void {
    if (hydratingEditor) return;
    if (previewTimer) clearTimeout(previewTimer);
    if (
      props.selectedElement?.type === 'matrix'
      && matrix.showMatrixDesignDialog.value
    ) {
      previewTimer = null;
      if (props.selectedElement) editor.submitElement();
      return;
    }
    if (
      props.selectedElement?.type === 'matrix'
      && matrix.showMatrixCondFmtDialog.value
    ) {
      previewTimer = setTimeout(() => {
        if (props.selectedElement) editor.submitElement();
      }, 120);
      return;
    }
    if (
      props.selectedElement?.type === 'matrix'
      && (
        matrix.showMatrixRowsDialog.value
        || matrix.showMatrixColsDialog.value
        || matrix.showMatrixValuesDialog.value
        || matrix.showMatrixFilterSortDialog.value
        || matrix.showMatrixCalcDialog.value
      )
    ) return;
    previewTimer = setTimeout(() => {
      if (props.selectedElement) editor.submitElement();
    }, 600);
  }

  watch([
    ...Object.values(editor).filter(isRef),
    activeDataSourceId,
    activeTableId
  ], scheduleLocalPreview, { deep: false });

  function changeDataSource(id: string): void {
    if (props.selectedElement) {
      editorDataSourceOverride.value = id;
      const firstTable = props.dataSources.find(source => source.id === id)?.tables[0]?.id ?? '';
      editorTableOverride.value = firstTable;
      if (firstTable) emit('selectDataTable', firstTable);
    }
    emit('selectDataSource', id);
    if (props.selectedElement) editor.submitElement();
  }

  function changeDataTable(id: string): void {
    if (props.selectedElement) editorTableOverride.value = id;
    emit('selectDataTable', id);
    if (props.selectedElement) editor.submitElement();
  }

  function createManualElement(type: string, chartType?: string): void {
    emit('createManualElement', type, chartType);
  }

  function clearSelectedElement(): void {
    emit('clearElementSelection');
  }

  function createFilter(patch: DashboardFilterCreatePatch): void {
    emit('createFilter', patch);
  }

  function changeFilter(filterId: string, patch: DashboardFilterPatch): void {
    emit('changeFilter', filterId, patch);
  }

  function removeFilter(filterId: string): void {
    emit('removeFilter', filterId);
  }

  function updateDashboardSettings(settings: DashboardSettings): void {
    emit('updateDashboardSettings', settings);
  }

  function autoAlignDashboardElements(): void {
    const dashboard = props.dashboard;
    if (!dashboard || dashboard.elements.length === 0) return;
    const layouts = autoAlignDashboardLayouts(dashboard.elements);
    for (const element of dashboard.elements) {
      const layout = layouts[element.id];
      if (layout) emit('updateElementLayout', element.id, layoutToStorage(layout));
    }
  }

  function restoreVersion(versionId: string): void {
    emit('restoreVersion', versionId);
  }

  function onPaletteDragStart(event: DragEvent, type: string, chartType?: string): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-dashboard-component', JSON.stringify({ type, chartType }));
  }

  function saveToggle(): void {
    editor.submitElement();
  }

  function saveSelectedElementConfig(configPatch: Record<string, unknown>): void {
    const element = props.selectedElement;
    if (!element) return;
    Object.keys(configPatch).forEach(key => selectedConfigDirtyKeys.add(key));
    selectedConfigDraft.value = {
      ...(Object.keys(selectedConfigDraft.value).length > 0 ? selectedConfigDraft.value : element.config ?? {}),
      ...configPatch
    };
    emitSelectedElementConfig(element);
  }

  function mergePendingConfigDraft(patch: SaveElementPatch): SaveElementPatch {
    if (selectedConfigDirtyKeys.size === 0) return patch;
    const pendingConfig = Object.fromEntries([...selectedConfigDirtyKeys].map(key => [key, selectedConfigDraft.value[key]]));
    return {
      ...patch,
      config: {
        ...(patch.config ?? {}),
        ...pendingConfig
      }
    };
  }

  function emitSelectedElementConfig(element: NonNullable<ManualSidebarProps['selectedElement']>): void {
    emit('saveElement', {
      ...(element.chartType ? { chartType: element.chartType } : {}),
      ...(dashboardElementUsesDataSource(element.type) && activeDataSourceId.value
        ? { dataSourceId: activeDataSourceId.value }
        : {}),
      config: selectedConfigDraft.value,
      name: editor.elementName.value || element.name,
      type: element.type
    });
  }

  function applyCardCalcDialog(): void {
    card.showCardCalcDialog.value = false;
    editor.submitElement();
  }

  return {
    ...propRefs,
    ...editor,
    ...chart,
    ...table,
    ...card,
    ...matrix,
    ...text,
    activeDataSourceId,
    activeTableId,
    activeTables,
    autoAlignDashboardElements,
    applyCardCalcDialog,
    calculatedFieldCount,
    changeFilter,
    changeDataSource,
    changeDataTable,
    chartSeriesSummaryLabels,
    createFilter,
    createManualElement,
    clearSelectedElement,
    currentTableFields,
    dashboardCurrencyOptions,
    elementUsesDataSource,
    fieldLabel,
    filterNeedsValue,
    filterContainerOptions,
    inputValue,
    isNumericField,
    isPieChart,
    manualComponents,
    onPaletteDragStart,
    parseList,
    pieSliceColorHasOverride,
    pieSliceColorPreview,
    pieSliceLabels,
    pieValueFieldLabel,
    clearPieSliceColor,
    removeFilter,
    restoreVersion,
    saveSelectedElementConfig,
    saveToggle,
    seriesFieldLabel,
    setPieSliceColor,
    tableLabel,
    updateDashboardSettings
  };
}

function readConfigString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
