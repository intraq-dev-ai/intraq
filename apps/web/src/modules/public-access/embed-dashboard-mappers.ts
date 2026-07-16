import type {
  BuilderDataSource,
  DashboardElement,
  DashboardFilter,
  DashboardFilterPatch,
  DashboardSettings
} from '../dashboard-builder/types';
import { readString } from './embed-dashboard-utils';
import type {
  EmbedAppearance,
  EmbedDashboardElement,
  EmbedDashboardFilter,
  EmbedDataSource
} from './types';

export interface EmbedFilterBehavior {
  closeOnSelect?: boolean;
  dashboardCloseOnSelect?: boolean;
  dashboardHideMultiSelectSummary?: boolean;
  hideMultiSelectSummary?: boolean;
  singleSelectClearable?: boolean;
  singleSelectSearchable?: boolean;
}

export interface DashboardFilterMappingOptions {
  dashboardId: string;
  filterBehavior: EmbedFilterBehavior;
  patch?: DashboardFilterPatch;
  scopedOptions?: readonly string[];
}

export function embedFilterBehaviorFrom(
  settings: DashboardSettings | undefined,
  appearance: EmbedAppearance | null
): EmbedFilterBehavior {
  const behavior = appearance?.behavior;
  return {
    closeOnSelect: typeof behavior?.multiSelectCloseOnSelect === 'boolean' ? behavior.multiSelectCloseOnSelect : undefined,
    dashboardCloseOnSelect: dashboardSettingBoolean(settings, 'closeDropdownOnSelect'),
    dashboardHideMultiSelectSummary: dashboardSettingBoolean(settings, 'hideMultiSelectSummary'),
    hideMultiSelectSummary: typeof behavior?.hideMultiSelectSummary === 'boolean' ? behavior.hideMultiSelectSummary : undefined,
    singleSelectClearable: typeof behavior?.singleSelectClearable === 'boolean' ? behavior.singleSelectClearable : undefined,
    singleSelectSearchable: typeof behavior?.singleSelectSearchable === 'boolean' ? behavior.singleSelectSearchable : undefined
  };
}

export function toDashboardElement(
  element: EmbedDashboardElement,
  dashboardId: string,
  filterBehavior: EmbedFilterBehavior
): DashboardElement {
  return {
    id: element.id,
    dashboardId,
    name: element.title,
    type: dashboardElementType(element),
    ...(element.chartType ? { chartType: element.chartType } : {}),
    config: element.type === 'filter'
      ? applyEmbedBehaviorToFilterConfig(element.config ?? {}, filterBehavior)
      : (element.config ?? {}),
    layout: {
      i: element.layout?.i ?? element.id,
      x: element.layout?.x ?? 0,
      y: element.layout?.y ?? 0,
      w: element.layout?.w ?? 6,
      h: element.layout?.h ?? 5
    },
    ...(element.dataSourceId ? { dataSourceId: element.dataSourceId } : {}),
    order: element.order ?? 0,
    isVisible: element.isVisible !== false
  };
}

export function toDashboardFilter(filter: EmbedDashboardFilter, options: DashboardFilterMappingOptions): DashboardFilter {
  const patch = options.patch ?? {};
  const scopedOptions = options.scopedOptions ?? [];
  const config: Record<string, unknown> = scopedOptions.length > 0
    ? { ...(filter.config ?? {}), ...(patch.config ?? {}), options: scopedOptions }
    : { ...(filter.config ?? {}), ...(patch.config ?? {}) };
  const resolvedConfig = applyEmbedBehaviorToFilterConfig(config, options.filterBehavior);
  const baseValue = patch.value ?? filter.value ?? config['value'];
  return {
    id: filter.id,
    dashboardId: options.dashboardId,
    name: patch.name ?? filter.name ?? filter.label,
    field: patch.field ?? filter.field,
    operator: patch.operator ?? filter.operator ?? readString(resolvedConfig['operator']) ?? 'equals',
    value: scopedOptions.length > 0 ? scopedFilterValue(baseValue, scopedOptions) : baseValue,
    placement: 'bar',
    type: patch.type ?? filter.type ?? readString(resolvedConfig['type']) ?? 'interactive',
    config: resolvedConfig
  };
}

export function toBuilderDataSource(source: EmbedDataSource): BuilderDataSource {
  return {
    id: source.id,
    name: source.name,
    status: 'active',
    tables: source.tables.map(table => ({
      id: table.id,
      name: table.name,
      fields: table.fields.map(field => ({
        name: field.name,
        type: field.type,
        description: field.description
      })),
      isSelected: table.isSelected
    }))
  };
}

function applyEmbedBehaviorToFilterConfig(
  config: Record<string, unknown>,
  behavior: EmbedFilterBehavior
): Record<string, unknown> {
  const dashboardCloseOnSelect = behavior.dashboardCloseOnSelect;
  const dashboardHideMultiSelectSummary = behavior.dashboardHideMultiSelectSummary;
  const closeOnSelect = behavior.closeOnSelect;
  const hideMultiSelectSummary = behavior.hideMultiSelectSummary;
  const singleSelectClearable = behavior.singleSelectClearable;
  const singleSelectSearchable = behavior.singleSelectSearchable;
  const hasCloseOnSelectConfig = hasBooleanConfig(config, ['closeOnSelect', 'closeDropdownOnSelect', 'autoCloseOnSelect', 'autoClose']);
  const hasHideSummaryConfig = hasBooleanConfig(config, ['hideMultiSelectSummary', 'hideSelectedSummary', 'hideSelectionSummary', 'hideSelectedCount']);
  const configCloseOnSelect = readBooleanConfig(config, ['closeOnSelect', 'closeDropdownOnSelect', 'autoCloseOnSelect', 'autoClose']);
  const configHideMultiSelectSummary = readBooleanConfig(config, ['hideMultiSelectSummary', 'hideSelectedSummary', 'hideSelectionSummary', 'hideSelectedCount']);
  const effectiveCloseOnSelect = closeOnSelect === false && (configCloseOnSelect === true || dashboardCloseOnSelect === true)
    ? undefined
    : closeOnSelect;
  const effectiveHideMultiSelectSummary = hideMultiSelectSummary === false && (configHideMultiSelectSummary === true || dashboardHideMultiSelectSummary === true)
    ? undefined
    : hideMultiSelectSummary;
  if (
    dashboardCloseOnSelect === undefined
    && dashboardHideMultiSelectSummary === undefined
    && effectiveCloseOnSelect === undefined
    && effectiveHideMultiSelectSummary === undefined
    && singleSelectClearable === undefined
    && singleSelectSearchable === undefined
  ) return config;
  return {
    ...config,
    ...(dashboardCloseOnSelect !== undefined && !hasCloseOnSelectConfig ? {
      closeDropdownOnSelect: dashboardCloseOnSelect,
      closeOnSelect: dashboardCloseOnSelect
    } : {}),
    ...(dashboardHideMultiSelectSummary !== undefined && !hasHideSummaryConfig ? {
      hideMultiSelectSummary: dashboardHideMultiSelectSummary,
      hideSelectedCount: dashboardHideMultiSelectSummary,
      hideSelectedSummary: dashboardHideMultiSelectSummary,
      hideSelectionSummary: dashboardHideMultiSelectSummary
    } : {}),
    ...(effectiveCloseOnSelect !== undefined ? {
      closeDropdownOnSelect: effectiveCloseOnSelect,
      closeOnSelect: effectiveCloseOnSelect
    } : {}),
    ...(effectiveHideMultiSelectSummary !== undefined ? {
      hideMultiSelectSummary: effectiveHideMultiSelectSummary,
      hideSelectedCount: effectiveHideMultiSelectSummary,
      hideSelectedSummary: effectiveHideMultiSelectSummary,
      hideSelectionSummary: effectiveHideMultiSelectSummary
    } : {}),
    ...(singleSelectClearable !== undefined ? {
      allowClear: singleSelectClearable,
      clearable: singleSelectClearable,
      clearableSingleSelect: singleSelectClearable,
      showClearButton: singleSelectClearable,
      singleSelectClearable
    } : {}),
    ...(singleSelectSearchable !== undefined ? {
      searchable: singleSelectSearchable,
      searchableSelect: singleSelectSearchable,
      searchableSingleSelect: singleSelectSearchable,
      singleSelectSearchable,
      useSearchableDropdown: singleSelectSearchable
    } : {})
  };
}

function dashboardElementType(element: EmbedDashboardElement): string {
  const chartType = readString(element.chartType)?.toLowerCase();
  if (element.type === 'chart' && chartType === 'table') return 'table';
  if (element.type === 'chart' && chartType === 'matrix') return 'matrix';
  if (element.type === 'chart' && chartType === 'card') return 'card';
  return element.type;
}

function scopedFilterValue(value: unknown, options: readonly string[]): unknown {
  if (Array.isArray(value)) {
    return value.map(item => String(item)).filter(item => options.includes(item));
  }
  if (typeof value === 'string' && value.trim() && !['all', 'any'].includes(value.trim().toLowerCase())) {
    return options.includes(value) ? value : '';
  }
  return value;
}

function dashboardSettingBoolean(settings: DashboardSettings | undefined, key: keyof DashboardSettings): boolean | undefined {
  const value = settings?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function hasBooleanConfig(config: Record<string, unknown>, keys: string[]): boolean {
  return keys.some(key => typeof config[key] === 'boolean');
}

function readBooleanConfig(config: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    if (typeof config[key] === 'boolean') return config[key];
  }
  return undefined;
}
