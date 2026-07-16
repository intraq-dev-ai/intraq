<script setup lang="ts">
import { computed } from 'vue';
import type { DashboardElement, DashboardFilter, DashboardFilterPatch, DashboardSettings } from '../../types';
import type { VisualizationDataRequestContext } from '../../visualization/data';
import DashboardFilterControl from '../DashboardFilterControl.vue';

const props = defineProps<{
  element: DashboardElement;
  filters?: DashboardFilter[];
  canEditDashboard?: boolean;
  dashboardSettings?: DashboardSettings;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>();

function themeSettingBoolean(key: string): boolean | undefined {
  const v = props.dashboardSettings?.[key as keyof DashboardSettings];
  return typeof v === 'boolean' ? v : undefined;
}

function dashboardPeriodDatePickerTheme(config: Record<string, unknown>): string | undefined {
  const configured = typeof config.periodDatePickerTheme === 'string' && config.periodDatePickerTheme.trim()
    ? config.periodDatePickerTheme.trim()
    : undefined;
  return configured;
}

const emit = defineEmits<{
  change: [filterId: string, patch: DashboardFilterPatch];
  configure: [];
  remove: [];
}>();

const runtimeFilter = computed(() => props.filters?.find(filter => filter.id === props.element.id) ?? null);
const elementAsFilter = computed<DashboardFilter>(() => {
  const mergedConfig = { ...(props.element.config ?? {}), ...(runtimeFilter.value?.config ?? {}) };
  const config = shouldPreservePeriodSurface(mergedConfig) ? omitTransparentPeriodSurfaceConfig(mergedConfig) : mergedConfig;
  const readStr = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined;
  return {
    id: props.element.id,
    dashboardId: '',
    name: props.element.name,
    field: readStr(runtimeFilter.value?.field ?? config.field ?? config.filterField ?? config.xField) ?? '',
    operator: readStr(runtimeFilter.value?.operator ?? config.operator) ?? 'in',
    value: runtimeFilter.value?.value ?? config.value ?? config.defaultValue,
    type: 'interactive',
    placement: 'canvas',
    config: {
      background: config.background,
      backgroundColor: config.backgroundColor,
      canvasChrome: config.canvasChrome,
      chrome: config.chrome,
      closeDropdownOnSelect: config.closeDropdownOnSelect ?? themeSettingBoolean('closeDropdownOnSelect'),
      closeOnSelect: config.closeOnSelect ?? themeSettingBoolean('closeDropdownOnSelect'),
      componentChrome: config.componentChrome,
      allowClear: config.allowClear,
      clearable: config.clearable,
      clearableSingleSelect: config.clearableSingleSelect,
      defaultEndDate: config.defaultEndDate,
      defaultStartDate: config.defaultStartDate,
      defaultValue: config.defaultValue,
      defaultPeriod: config.defaultPeriod,
      dateRangeDisplayFormat: config.dateRangeDisplayFormat,
      dateRangeDisplayMode: config.dateRangeDisplayMode,
      dateRangeEndFieldLabel: config.dateRangeEndFieldLabel,
      dateRangeFieldDisplayFormat: config.dateRangeFieldDisplayFormat,
      dateRangeMode: config.dateRangeMode,
      dateRangeSeparatorLabel: config.dateRangeSeparatorLabel,
      dateRangeShowNavigation: config.dateRangeShowNavigation,
      dateRangeStartFieldLabel: config.dateRangeStartFieldLabel,
      datePickerDisplayMode: config.datePickerDisplayMode,
      datePickerStyle: config.datePickerStyle,
      datePickerTheme: config.datePickerTheme,
      fiscalStartMonth: config.fiscalStartMonth,
      filterChrome: config.filterChrome,
      hideMultiSelectSummary: config.hideMultiSelectSummary ?? themeSettingBoolean('hideMultiSelectSummary'),
      hideSelectedCount: config.hideSelectedCount,
      hideSelectedSummary: config.hideSelectedSummary,
      hideSelectionSummary: config.hideSelectionSummary,
      inputType: config.inputType,
      displayMode: config.displayMode,
      endDate: config.endDate,
      fromDate: config.fromDate,
      includeTime: config.includeTime,
      operator: config.operator,
      options: config.options ?? config.allowedValues ?? config.choices,
      rangeFieldDisplayFormat: config.rangeFieldDisplayFormat,
      rangeEndFieldLabel: config.rangeEndFieldLabel,
      rangeStartFieldLabel: config.rangeStartFieldLabel,
      dynamicOptions: config.dynamicOptions,
      dynamicOptionsDataSourceId: config.dynamicOptionsDataSourceId,
      dynamicOptionsFieldName: config.dynamicOptionsFieldName,
      dynamicOptionsLabelField: config.dynamicOptionsLabelField,
      dynamicOptionsLimit: config.dynamicOptionsLimit,
      dynamicOptionsTableName: config.dynamicOptionsTableName,
      dynamicOptionsValueField: config.dynamicOptionsValueField,
      allValue: config.allValue,
      allValues: config.allValues,
      blankValue: config.blankValue,
      blankValues: config.blankValues,
      emptyValue: config.emptyValue,
      emptyValues: config.emptyValues,
      lookupOptions: config.lookupOptions,
      noSelectionValue: config.noSelectionValue,
      noSelectionValues: config.noSelectionValues,
      optionDataSourceId: config.optionDataSourceId,
      optionFieldName: config.optionFieldName,
      optionLabelField: config.optionLabelField,
      optionLimit: config.optionLimit,
      optionLookup: config.optionLookup,
      optionSource: config.optionSource,
      optionTableName: config.optionTableName,
      optionValueField: config.optionValueField,
      optionsDataSourceId: config.optionsDataSourceId,
      optionsFieldName: config.optionsFieldName,
      optionsLabelField: config.optionsLabelField,
      optionsLimit: config.optionsLimit,
      optionsSource: config.optionsSource,
      optionsTableName: config.optionsTableName,
      optionsValueField: config.optionsValueField,
      period: config.period,
      periodAccentColor: config.periodAccentColor,
      periodActiveColor: config.periodActiveColor,
      periodBackgroundColor: config.periodBackgroundColor,
      periodDatePickerTheme: dashboardPeriodDatePickerTheme(config),
      periodIcon: config.periodIcon,
      periodNavigationStyle: config.periodNavigationStyle,
      periodRangeDisplayMode: config.periodRangeDisplayMode,
      periodShowTabIcons: config.periodShowTabIcons,
      periodTabIcon: config.periodTabIcon,
      periodTabIcons: config.periodTabIcons,
      periodTabIconsEnabled: config.periodTabIconsEnabled,
      periodToolbarNavigationStyle: config.periodToolbarNavigationStyle,
      showPeriodBottomDivider: config.showPeriodBottomDivider,
      showDateRangeNavigation: config.showDateRangeNavigation,
      showPeriodTabIcons: config.showPeriodTabIcons,
      showRangeNavigation: config.showRangeNavigation,
      periodDisplayMode: config.periodDisplayMode,
      periodOptions: config.periodOptions,
      selectionMode: config.selectionMode,
      selectMode: config.selectMode,
      selectPlaceholder: config.selectPlaceholder,
      placeholder: config.placeholder,
      placeholderValue: config.placeholderValue,
      placeholderValues: config.placeholderValues,
      selectedDate: config.selectedDate,
      singleSelectClearable: config.singleSelectClearable,
      singleSelectMode: config.singleSelectMode,
      singleSelectPlaceholder: config.singleSelectPlaceholder,
      singleSelectSearchable: config.singleSelectSearchable,
      startDate: config.startDate,
      toDate: config.toDate,
      value: config.value,
      searchable: config.searchable,
      searchableSelect: config.searchableSelect,
      searchableSingleSelect: config.searchableSingleSelect,
      showClearButton: config.showClearButton,
      useSearchableDropdown: config.useSearchableDropdown,
      weekStartsOn: config.weekStartsOn,
    },
    createdAt: '',
    updatedAt: '',
  };
});

function shouldPreservePeriodSurface(config: Record<string, unknown>): boolean {
  const chrome = String(config.filterChrome ?? config.canvasChrome ?? config.componentChrome ?? config.chrome ?? '').toLowerCase();
  if (!['transparent', 'none', 'frameless'].includes(chrome)) return false;
  const type = String(config.inputType ?? config.filterType ?? config.type ?? '')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
  return type === 'periodfilter' || type === 'period-filter' || type === 'period_filter' || type === 'period';
}

function omitTransparentPeriodSurfaceConfig(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  for (const key of ['periodBackgroundColor', 'backgroundColor', 'background']) {
    if (typeof next[key] === 'string' && next[key].trim().toLowerCase() === 'transparent') delete next[key];
  }
  return next;
}
</script>

<template>
  <div
    class="dashboard-filter-element"
    :class="{
      'dashboard-filter-element--transparent': ['transparent', 'none', 'frameless'].includes(String(element.config?.filterChrome ?? element.config?.canvasChrome ?? element.config?.componentChrome ?? element.config?.chrome ?? '').toLowerCase())
    }"
    role="group"
    :aria-label="`Filter component ${element.name}`"
  >
    <DashboardFilterControl
      :filter="elementAsFilter"
      :actions-label="`Canvas actions for ${element.name} filter`"
      :can-edit-dashboard="canEditDashboard"
      :display-name="element.name"
      :show-title="element.config?.showTitle !== false"
      :visualization-request="visualizationRequest"
      @update="(filterId, patch) => emit('change', filterId, patch)"
      @edit="emit('configure')"
      @remove="emit('remove')"
    />
  </div>
</template>
