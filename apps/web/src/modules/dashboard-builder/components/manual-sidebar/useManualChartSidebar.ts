import { computed, ref } from 'vue';
import type { useDashboardElementEditor } from '../editor/useDashboardElementEditor';
import { parseColorRecord, parseList } from './manualSidebarUtils';
import { palette as chartDefaultPalette } from '../../visualization/chart/series';
import type { DashboardCrossFilterMode } from '../../visualization/cross-filter-config';

type EditorState = ReturnType<typeof useDashboardElementEditor>;

interface SeriesEntry {
  agg: string;
  axis: string;
  chartType: string;
  color: string;
  currencySymbol: string;
  decimals: string;
  field: string;
  format: string;
  label: string;
  prefix: string;
  thousandsSeparator: string;
}

interface CrossFilterTargetOption {
  id: string;
  name: string;
  type: string;
}

interface ManualChartSidebarOptions {
  currentCrossFilterConfig: Readonly<{ value: { mode: DashboardCrossFilterMode; targetElementIds: string[] } }>;
  crossFilterTargetOptions: Readonly<{ value: CrossFilterTargetOption[] }>;
  saveCrossFilterConfig: (configPatch: Record<string, unknown>) => void;
}

export function isSplitSeriesByActiveForChart(
  chartType: string,
  measureFieldsText: string,
  splitField: string
): boolean {
  const normalizedChartType = chartType.trim().toLowerCase();
  if (normalizedChartType === 'pie' || normalizedChartType === 'doughnut' || normalizedChartType === 'donut') return false;
  return parseList(measureFieldsText).length === 1 && splitField.trim().length > 0;
}

export function useManualChartSidebar(editor: EditorState, options: ManualChartSidebarOptions) {
  const showXAxisDialog = ref(false);
  const showSeriesDialog = ref(false);
  const showStylingDialog = ref(false);
  const showDataCfgDialog = ref(false);
  const showAxesDialog = ref(false);
  const showChartCalcDialog = ref(false);
  const showCrossFilterDialog = ref(false);
  const localSeries = ref<SeriesEntry[]>([]);
  const crossFilterModeDraft = ref<DashboardCrossFilterMode>('auto');
  const selectedCrossFilterTargetElementIds = ref<string[]>([]);

  const seriesCount = computed(() => parseList(editor.measureFields.value).length);
  const crossFilterTargetOptions = computed(() => options.crossFilterTargetOptions.value);
  const chartCrossFilterSummary = computed(() => {
    const current = options.currentCrossFilterConfig.value;
    if (current.mode === 'disabled') return 'Disabled';
    if (current.mode === 'selected') {
      const count = current.targetElementIds.filter(targetId =>
        crossFilterTargetOptions.value.some(option => option.id === targetId)
      ).length;
      return count > 0 ? `${count} selected component${count === 1 ? '' : 's'}` : 'No target components selected';
    }
    return 'Auto target compatible components';
  });
  const splitSeriesByActive = computed(() =>
    isSplitSeriesByActiveForChart(
      editor.elementChartType.value,
      editor.measureFields.value,
      editor.valueField.value
    )
  );

  function openSeriesDialog(): void {
    const fields = parseList(editor.measureFields.value);
    const labels = parseColorRecord(editor.chartSeriesLabelsText.value);
    const aggs = parseColorRecord(editor.chartSeriesTypesText.value);
    const colors = parseColorRecord(editor.chartSeriesColorsText.value);
    const axes = parseColorRecord(editor.chartSeriesAxesText.value);
    const chartTypes = parseColorRecord(editor.chartSeriesChartTypesText.value);
    const formats = parseColorRecord(editor.chartSeriesFormatText.value);
    const decimals = parseColorRecord(editor.chartSeriesDecimalsText.value);
    const currencySymbols = parseColorRecord(editor.chartSeriesCurrencySymbolText.value);
    const prefixes = parseColorRecord(editor.chartSeriesPrefixText.value);
    const thousandsSeparators = parseColorRecord(editor.chartSeriesThousandsSeparatorText.value);
    localSeries.value = fields.map(field => ({
      field,
      label: labels[field] ?? '',
      agg: aggs[field] ?? 'sum',
      color: colors[field] ?? '',
      axis: axes[field] ?? 'y',
      format: formats[field] ?? 'number',
      decimals: decimals[field] ?? '',
      currencySymbol: currencySymbols[field] ?? '',
      prefix: prefixes[field] ?? '',
      thousandsSeparator: thousandsSeparators[field] ?? 'comma',
      chartType: splitSeriesByActive.value ? '' : (chartTypes[field] ?? '')
    }));
    showSeriesDialog.value = true;
  }

  function addSeries(): void {
    localSeries.value.push({
      field: '',
      label: '',
      agg: 'sum',
      color: '',
      axis: 'y',
      chartType: '',
      format: 'number',
      decimals: '',
      currencySymbol: '',
      prefix: '',
      thousandsSeparator: 'comma'
    });
  }

  function defaultSeriesColor(index: number): string {
    return chartDefaultPalette[index % chartDefaultPalette.length] ?? '#3b82f6';
  }

  function seriesColorPreview(series: SeriesEntry, index: number): string {
    return series.color.trim() || defaultSeriesColor(index);
  }

  function setSeriesColor(series: SeriesEntry, value: string): void {
    series.color = value.trim();
  }

  function clearSeriesColor(series: SeriesEntry): void {
    series.color = '';
  }

  function removeSeries(index: number): void {
    localSeries.value.splice(index, 1);
    syncSeriesDialog();
  }

  function syncSeriesDialog(): void {
    const activeSeries = localSeries.value.filter(series => series.field);
    editor.measureFields.value = activeSeries.map(series => series.field).join(', ');
    editor.chartSeriesLabelsText.value = activeSeries
      .filter(series => series.label).map(series => `${series.field}=${series.label}`).join(', ');
    editor.chartSeriesColorsText.value = activeSeries
      .filter(series => series.color).map(series => `${series.field}=${series.color}`).join(', ');
    editor.chartSeriesTypesText.value = activeSeries
      .filter(series => series.agg && series.agg !== 'sum').map(series => `${series.field}=${series.agg}`).join(', ');
    editor.chartSeriesAxesText.value = activeSeries
      .filter(series => series.axis && series.axis !== 'y').map(series => `${series.field}=${series.axis}`).join(', ');
    editor.chartSeriesChartTypesText.value = splitSeriesByActive.value
      ? ''
      : activeSeries.filter(series => series.chartType).map(series => `${series.field}=${series.chartType}`).join(', ');
    editor.chartSeriesFormatText.value = activeSeries
      .filter(series => series.format && series.format !== 'number').map(series => `${series.field}=${series.format}`).join(', ');
    editor.chartSeriesDecimalsText.value = activeSeries
      .filter(series => series.decimals.trim().length > 0).map(series => `${series.field}=${series.decimals.trim()}`).join(', ');
    editor.chartSeriesCurrencySymbolText.value = activeSeries
      .filter(series => series.format === 'currency' && series.currencySymbol.trim().length > 0)
      .map(series => `${series.field}=${series.currencySymbol.trim()}`).join(', ');
    editor.chartSeriesPrefixText.value = activeSeries
      .filter(series => series.prefix.trim().length > 0).map(series => `${series.field}=${series.prefix.trim()}`).join(', ');
    editor.chartSeriesThousandsSeparatorText.value = activeSeries
      .filter(series => series.thousandsSeparator && series.thousandsSeparator !== 'comma')
      .map(series => `${series.field}=${series.thousandsSeparator}`).join(', ');
    editor.submitElement();
  }

  function closeSeriesDialog(): void {
    syncSeriesDialog();
    showSeriesDialog.value = false;
  }

  function openCrossFilterDialog(): void {
    hydrateCrossFilterDraft();
    showCrossFilterDialog.value = true;
  }

  function closeCrossFilterDialog(): void {
    syncCrossFilterDialog();
    showCrossFilterDialog.value = false;
  }

  function syncCrossFilterDialog(): void {
    const availableIds = new Set(crossFilterTargetOptions.value.map(option => option.id));
    const nextTargetIds = Array.from(new Set(selectedCrossFilterTargetElementIds.value.filter(targetId => availableIds.has(targetId))));
    options.saveCrossFilterConfig({
      crossFilterMode: crossFilterModeDraft.value,
      crossFilterTargetElementIds: crossFilterModeDraft.value === 'selected' ? nextTargetIds : []
    });
  }

  function hydrateCrossFilterDraft(): void {
    const current = options.currentCrossFilterConfig.value;
    const availableIds = new Set(crossFilterTargetOptions.value.map(option => option.id));
    crossFilterModeDraft.value = current.mode;
    selectedCrossFilterTargetElementIds.value = current.targetElementIds.filter(targetId => availableIds.has(targetId));
  }

  function openXAxisDialog(): void { showXAxisDialog.value = true; }
  function openStylingDialog(): void { showStylingDialog.value = true; }
  function openDataCfgDialog(): void { showDataCfgDialog.value = true; }
  function openAxesDialog(): void { showAxesDialog.value = true; }
  function applyChartCalcDialog(): void { showChartCalcDialog.value = false; editor.submitElement(); }

  return {
    addSeries,
    applyChartCalcDialog,
    closeSeriesDialog,
    closeCrossFilterDialog,
    clearSeriesColor,
    crossFilterModeDraft,
    chartCrossFilterSummary,
    crossFilterTargetOptions,
    defaultSeriesColor,
    hydrateCrossFilterDraft,
    localSeries,
    openAxesDialog,
    openCrossFilterDialog,
    openDataCfgDialog,
    openSeriesDialog,
    openStylingDialog,
    openXAxisDialog,
    removeSeries,
    selectedCrossFilterTargetElementIds,
    seriesCount,
    showAxesDialog,
    showChartCalcDialog,
    showCrossFilterDialog,
    showDataCfgDialog,
    showSeriesDialog,
    showStylingDialog,
    showXAxisDialog,
    seriesColorPreview,
    splitSeriesByActive,
    setSeriesColor,
    syncCrossFilterDialog,
    syncSeriesDialog
  };
}
