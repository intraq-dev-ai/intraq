import { computed, type ComputedRef, type Ref } from 'vue';
import type { DashboardElement, DashboardFilter } from '../types';
import { isTwoRowCardConfig } from '../card-layout-config';
import { type ComponentLayout } from './canvas/dashboard-canvas-layout';
import { buildDashboardCanvasIndicatorSummary } from './canvas/dashboard-canvas-indicators';
import { isDashboardComponentDownloadable } from './canvas/component-download';
import {
  matchingParameterFiltersForElement,
  missingRequiredParametersForElement,
  parameterDisplayName
} from './parameterized-data-sources';
import type { ComponentRunState, DashboardCanvasProps } from './dashboard-canvas-types';
import {
  readConfigRecord,
  readConfigString,
  safeDataToken
} from './dashboard-canvas-types';

export function useDashboardCanvasElementMeta(
  props: DashboardCanvasProps,
  options: {
    containerChildren: (element: DashboardElement) => DashboardElement[];
    elementLayout: (element: DashboardElement) => ComponentLayout;
    filtersForElement: (element: DashboardElement) => DashboardFilter[];
    hasEditorFocus: ComputedRef<boolean>;
    isMobileCanvas: Ref<boolean>;
    runState: (elementId: string) => ComponentRunState;
    showElementHeader: (element: DashboardElement) => boolean;
  }
) {
  const missingParameterLabelsByElement = computed(() => Object.fromEntries(
    props.dashboard.elements.map(element => [
      element.id,
      missingRequiredParametersForElement(element, props.dataSources, options.filtersForElement(element)).map(parameterDisplayName)
    ])
  ));
  const matchingParameterFiltersByElement = computed(() => Object.fromEntries(
    props.dashboard.elements.map(element => [
      element.id,
      matchingParameterFiltersForElement(element, props.dataSources, options.filtersForElement(element))
    ])
  ));

  function componentLabel(element: DashboardElement): string {
    if (element.type === 'chart') return element.chartType && element.chartType !== 'chart'
      ? `${element.chartType} chart`
      : 'chart';
    return element.type;
  }

  function componentDownloadActionEnabled(element: DashboardElement): boolean {
    const config = element.config ?? {};
    return readBooleanConfig(config.showDownloadAction ?? config.showComponentDownload ?? config.showExportAction) !== false;
  }

  function componentExpandActionEnabled(element: DashboardElement): boolean {
    const config = element.config ?? {};
    return readBooleanConfig(config.showExpandAction ?? config.showComponentExpand) !== false;
  }

  function canDownloadElement(element: DashboardElement): boolean {
    return !props.canEditDashboard
      && !['container', 'export', 'filter-container', 'text'].includes(element.type)
      && props.showViewDownloadActions !== false
      && componentDownloadActionEnabled(element)
      && isDashboardComponentDownloadable(props.dataSources, element);
  }

  function canExpandElement(element: DashboardElement): boolean {
    return !props.canEditDashboard
      && props.showViewExpandActions !== false
      && componentExpandActionEnabled(element)
      && !['container', 'export', 'filter', 'filter-container', 'text'].includes(element.type);
  }

  function showComponentActions(element: DashboardElement): boolean {
    if (props.canEditDashboard) return element.type !== 'filter';
    return canDownloadElement(element) || canExpandElement(element);
  }

  function showRunAction(element: DashboardElement): boolean {
    return !['container', 'export', 'filter', 'filter-container', 'text'].includes(element.type);
  }

  function canViewElementData(element: DashboardElement): boolean {
    return !['container', 'export', 'filter', 'filter-container', 'text'].includes(element.type);
  }

  function runLabel(element: DashboardElement): string {
    const state = options.runState(element.id);
    if (state.isLoading) return `Stop loading for ${element.name}`;
    if (state.hasRun) return `Refresh data for ${element.name}`;
    return `Run to fetch data for ${element.name}`;
  }

  function indicatorSummary(element: DashboardElement) {
    return buildDashboardCanvasIndicatorSummary(element, props.dashboard.filters);
  }

  function missingParameterLabels(element: DashboardElement): string[] {
    return missingParameterLabelsByElement.value[element.id] ?? [];
  }

  function matchingParameterFilters(element: DashboardElement): DashboardFilter[] {
    return matchingParameterFiltersByElement.value[element.id] ?? [];
  }

  function showFieldsAction(element: DashboardElement): boolean {
    return indicatorSummary(element).fields.length > 0 || element.type === 'table' || element.type === 'matrix';
  }

  function fieldsActionName(element: DashboardElement): string {
    return element.type === 'table' || element.type === 'matrix' ? 'columns' : 'fields';
  }

  function fieldsActionTitle(element: DashboardElement): string {
    return `${indicatorSummary(element).fields.length} ${fieldsActionName(element)}`;
  }

  function useCompactComponentActions(element: DashboardElement): boolean {
    const layout = options.elementLayout(element);
    return options.isMobileCanvas.value || layout.width <= 4 || layout.height <= 3;
  }

  function showInlineComponentIndicators(element: DashboardElement): boolean {
    return !useCompactComponentActions(element);
  }

  function isTwoRowCardElement(element: DashboardElement): boolean {
    if (element.type !== 'card') return false;
    return isTwoRowCardConfig(element.config ?? {});
  }

  function isFlushKpiCardElement(element: DashboardElement): boolean {
    if (element.type !== 'card' || isTwoRowCardElement(element)) return false;
    return readConfigString(element.config?.outerGap).toLowerCase() === 'none';
  }

  function isChromeNoneElement(element: DashboardElement): boolean {
    const config = element.config ?? {};
    const value = readConfigString(config.canvasChrome ?? config.componentChrome ?? config.chrome ?? config.wrapperStyle).toLowerCase();
    return value === 'none' || value === 'transparent' || value === 'frameless';
  }

  function componentDensity(element: DashboardElement): string | undefined {
    return safeDataToken(readConfigString(
      element.config?.componentDensity
        ?? element.config?.density
        ?? element.config?.layoutDensity
    ));
  }

  function elementChartSpacingPreset(element: DashboardElement): string | undefined {
    if (element.type !== 'chart') return undefined;
    const config = element.config ?? {};
    const visualization = readConfigRecord(config.visualization);
    const chartSpacing = readConfigRecord(config.chartSpacing ?? config.chartPadding ?? config.chartLayoutPadding);
    return safeDataToken(readConfigString(
      config.chartSpacingPreset
        ?? config.chartPaddingPreset
        ?? chartSpacing.preset
        ?? visualization.chartSpacingPreset
        ?? visualization.chartPaddingPreset
    ));
  }

  function isFocusedElement(element: DashboardElement): boolean {
    return options.hasEditorFocus.value && element.id === props.editorFocusElementId;
  }

  function isDisabledByEditorFocus(element: DashboardElement): boolean {
    return options.hasEditorFocus.value
      && element.id !== props.editorFocusElementId
      && !options.containerChildren(element).some(child => child.id === props.editorFocusElementId);
  }

  function editActionLabel(element: DashboardElement): string {
    return isFocusedElement(element) ? `Cancel editing ${element.name}` : `Edit ${element.name}`;
  }

  function editActionTitle(element: DashboardElement): string {
    return isFocusedElement(element) ? 'Cancel' : 'Configure';
  }

  return {
    canDownloadElement,
    canExpandElement,
    canViewElementData,
    componentDensity,
    componentLabel,
    editActionLabel,
    editActionTitle,
    elementChartSpacingPreset,
    fieldsActionName,
    fieldsActionTitle,
    indicatorSummary,
    isChromeNoneElement,
    isDisabledByEditorFocus,
    isFlushKpiCardElement,
    isFocusedElement,
    isTwoRowCardElement,
    matchingParameterFilters,
    missingParameterLabels,
    runLabel,
    showComponentActions,
    showFieldsAction,
    showInlineComponentIndicators,
    showRunAction,
    useCompactComponentActions
  };
}

function readBooleanConfig(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
