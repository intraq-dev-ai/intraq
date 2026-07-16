import { watch } from 'vue';
import type { BuilderDataSource, BuilderDataTable } from '../../types';
import {
  shouldPersistVisualizationLimit
} from '../../visualization/limit-config';
import {
  readString,
  readStringArray,
  setStringConfig,
  stripVendorRendererConfig
} from './dashboardElementEditorConfig';
import {
  dashboardElementUsesDataSource,
  normalizeChartType,
  normalizeDashboardElementShape
} from '../../dashboard-element-normalization';
import { applyCardConfig } from './dashboardElementEditorCardConfig';
import { applyChartConfig } from './dashboardElementEditorChartConfig';
import {
  applyContainerConfig,
  applyFilterConfig
} from './dashboardElementEditorElementConfig';
import { hydrateDashboardElementEditorState } from './dashboardElementEditorHydration';
import { applyMatrixConfig } from './dashboardElementEditorMatrixConfig';
import {
  createDashboardElementEditorState
} from './dashboardElementEditorState';
import { applyTableConfig } from './dashboardElementEditorTableConfig';
import type {
  DashboardElementEditorProps,
  SaveElementPatch
} from './dashboardElementEditorTypes';
import {
  cardTypeForSave,
  chartUsesSingleValue
} from './dashboardElementEditorUtils';

export type { SaveElementPatch } from './dashboardElementEditorTypes';

export function useDashboardElementEditor(
  props: DashboardElementEditorProps,
  saveElement: (patch: SaveElementPatch) => void
) {
  const state = createDashboardElementEditorState();
  let syncingTwoRowCardTitles = false;

  watch(() => props.selectedElement?.id ?? '', () => {
    hydrateDashboardElementEditorState(state, props.selectedElement);
  }, { immediate: true });

  watch(
    () => `${props.selectedElement?.id ?? ''}:${props.selectedDataSourceId ?? ''}:${props.selectedTableId ?? ''}`,
    () => {
      if (sanitizeChartBindingsForCurrentTable()) {
        // Keep repaired bindings in the local draft so Save persists the cleaned chart.
        submitElement();
      }
    },
    { immediate: true }
  );

  watch(state.elementName, value => {
    syncTwoRowCardTitleDraft(value, 'element');
  });

  watch(state.cardTitle, value => {
    syncTwoRowCardTitleDraft(value, 'card');
  });

  watch(state.cardType, () => {
    if (isTwoRowCardDraft()) syncTwoRowCardTitleDraft(state.elementName.value || state.cardTitle.value, 'element');
  });

  function submitElement(): void {
    state.configError.value = '';
    sanitizeChartBindingsForCurrentTable();
    const ySeries = state.measureFields.value.split(',').map(field => field.trim()).filter(Boolean);
    const config: Record<string, unknown> = {
      ...(props.selectedElement?.config ?? {}),
      title: state.elementName.value,
      xField: state.xField.value.trim(),
      ySeries,
      showLegend: state.showLegend.value,
      showTooltip: state.showTooltip.value
    };
    if (shouldPersistVisualizationLimit(state.resultLimit.value, state.resultLimitExplicit.value)) {
      config.limit = state.resultLimit.value;
      config.limitExplicit = true;
    } else {
      delete config.limit;
      delete config.limitExplicit;
    }
    const normalized = normalizeDashboardElementShape({
      type: state.elementType.value,
      chartType: state.elementChartType.value,
      config
    });
    const isContainerElement = normalized.type === 'container' || normalized.type === 'filter-container';
    const usesDataSource = dashboardElementUsesDataSource(normalized.type);
    if (normalized.type === 'chart') {
      state.elementChartType.value = normalized.chartType ?? normalizeChartType(state.elementChartType.value) ?? 'bar';
      if (chartUsesSingleValue(state.elementChartType.value)) {
        config.valueField = state.valueField.value.trim() || ySeries[0];
        delete config.seriesBy;
      } else {
        setStringConfig(config, 'seriesBy', state.valueField.value);
        delete config.valueField;
      }
    } else if (usesDataSource) {
      config.valueField = state.valueField.value.trim() || ySeries[0];
    }
    const dataSourceId = usesDataSource ? applyDataBinding(config) : '';
    if (normalized.type === 'table' && !applyTableConfig(config, state, setConfigError)) return;
    if (normalized.type === 'card' && !applyCardConfig(config, state, setConfigError, syncedTwoRowCardTitle)) return;
    if (normalized.type === 'matrix' && !applyMatrixConfig(config, state, setConfigError)) return;
    if (normalized.type === 'chart' && !applyChartConfig(config, state, setConfigError)) return;
    if (normalized.type === 'filter') applyFilterConfig(config, state);
    if (normalized.type === 'container' || normalized.type === 'filter-container') applyContainerConfig(config, state);
    stripVendorRendererConfig(config);
    const saveShape = normalizeDashboardElementShape({
      type: normalized.type,
      chartType: state.elementChartType.value,
      config
    });
    saveElement({
      name: state.elementName.value,
      type: saveShape.type,
      ...(saveShape.chartType ? { chartType: saveShape.chartType } : {}),
      ...(dataSourceId ? { dataSourceId } : {}),
      config: saveShape.config
    });
  }

  function applyDataBinding(config: Record<string, unknown>): string {
    const dataSource = currentDataSource();
    const dataSourceId = props.selectedDataSourceId || readString(props.selectedElement?.dataSourceId)
      || readString(props.selectedElement?.config?.dataSourceId) || '';
    if (dataSourceId) config.dataSourceId = dataSourceId;

    const table = currentTable(dataSource);
    if (table) {
      config.dataSourceTableId = table.id;
      config.tableName = table.name;
      config.dataSource = table.name;
      config.dataModelName = table.dictionary?.businessName ?? table.name;
      config.fields = table.fields.map(field => field.name);
    } else if (props.selectedTableId) {
      config.dataSourceTableId = props.selectedTableId;
    }
    return dataSourceId;
  }

  function currentDataSource(): BuilderDataSource | undefined {
    return props.dataSources?.find(source => source.id === props.selectedDataSourceId);
  }

  function currentTable(source?: BuilderDataSource): BuilderDataTable | undefined {
    if (!source || !props.selectedTableId) return undefined;
    return source.tables.find(table => table.id === props.selectedTableId);
  }

  function sanitizeChartBindingsForCurrentTable(): boolean {
    if (props.selectedElement?.type !== 'chart') return false;
    const fieldNames = currentTableFieldNames();
    if (fieldNames.size === 0) return false;

    const nextXField = sanitizeFieldValue(state.xField.value, fieldNames);
    const nextMeasureFields = sanitizeFieldListText(state.measureFields.value, fieldNames);
    const nextValueField = sanitizeFieldValue(state.valueField.value, fieldNames);
    const nextDisplayField = sanitizeFieldValue(state.chartXAxisDisplayField.value, fieldNames);
    const nextSortField = sanitizeFieldValue(state.chartXAxisSortField.value, fieldNames);
    const nextValueAxisField = sanitizeFieldValue(state.chartXAxisValueField.value, fieldNames);
    const changed = nextXField !== state.xField.value
      || nextMeasureFields !== state.measureFields.value
      || nextValueField !== state.valueField.value
      || nextDisplayField !== state.chartXAxisDisplayField.value
      || nextSortField !== state.chartXAxisSortField.value
      || nextValueAxisField !== state.chartXAxisValueField.value;

    state.xField.value = nextXField;
    state.measureFields.value = nextMeasureFields;
    state.valueField.value = nextValueField;
    state.chartXAxisDisplayField.value = nextDisplayField;
    state.chartXAxisSortField.value = nextSortField;
    state.chartXAxisValueField.value = nextValueAxisField;
    return changed;
  }

  function currentTableFieldNames(): Set<string> {
    return new Set((currentTable(currentDataSource())?.fields ?? []).map(field => field.name));
  }

  function sanitizeFieldValue(value: string, fieldNames: Set<string>): string {
    const normalized = value.trim();
    return normalized && fieldNames.has(normalized) ? normalized : '';
  }

  function sanitizeFieldListText(value: string, fieldNames: Set<string>): string {
    return value
      .split(',')
      .map(field => field.trim())
      .filter(field => field && fieldNames.has(field))
      .join(', ');
  }

  function configuredFields(): string[] {
    const config = props.selectedElement?.config ?? {};
    return Array.from(new Set([
      ...readStringArray(config.fields),
      ...readStringArray(config.columns),
      ...readStringArray(config.ySeries),
      ...readStringArray(config.rowFields),
      ...readStringArray(config.columnFields),
      ...readStringArray(config.valueFields),
      readString(config.xField),
      readString(config.valueField),
      readString(config.yField),
      readString(config.trendField),
      readString(config.comparisonField),
      readString(config.supportingField),
      readString(config.sparklineField)
    ].filter((field): field is string => Boolean(field))));
  }

  function isTwoRowCardDraft(): boolean {
    return state.elementType.value === 'card' && cardTypeForSave(state.cardType.value) === 'two-row';
  }

  function syncTwoRowCardTitleDraft(value: string, source: 'card' | 'element'): void {
    if (syncingTwoRowCardTitles || !isTwoRowCardDraft()) return;
    const nextTitle = value.trim();
    if (!nextTitle) return;
    syncingTwoRowCardTitles = true;
    if (source === 'element' && state.cardTitle.value !== nextTitle) {
      state.cardTitle.value = nextTitle;
    } else if (source === 'card' && state.elementName.value !== nextTitle) {
      state.elementName.value = nextTitle;
    }
    syncingTwoRowCardTitles = false;
  }

  function syncedTwoRowCardTitle(): string {
    const nextTitle = state.elementName.value.trim() || state.cardTitle.value.trim();
    if (!nextTitle) return '';
    syncingTwoRowCardTitles = true;
    state.elementName.value = nextTitle;
    state.cardTitle.value = nextTitle;
    syncingTwoRowCardTitles = false;
    return nextTitle;
  }

  function setConfigError(message: string): void {
    state.configError.value = message;
  }

  return {
    ...state,
    configuredFields,
    submitElement
  };
}
