import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';
import type { FilterOptionItem } from './filter-options-api';
import {
  currentFilterArray,
  currentFilterValue,
  filterDisplayMode,
  filterValue,
  inputValue,
  isMultiSelect,
  noDataFoundLabel,
  noResultsLabel,
  parseValueForFilter,
  readString,
  shouldCloseMultiSelectOnSelect,
  shouldHideMultiSelectSummary,
  shouldShowAnyOption,
  shouldShowSingleSelectClear,
  shouldUseSearchableSingleSelect
} from './dashboard-filter-control-utils';
import { useDashboardFilterOptionItems } from './useDashboardFilterOptionItems';

interface DashboardOptionsFilterProps {
  filter: DashboardFilter;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}

const MIN_BTN_W = 64;
const MIN_BTN_H = 32;

export function useDashboardOptionsFilterControl(
  props: DashboardOptionsFilterProps,
  emitPatch: (patch: DashboardFilterPatch) => void
) {
  const optionSource = useDashboardFilterOptionItems(props);
  const openDropdown = ref(false);
  const dropdownSearchQuery = ref('');
  const dropdownRootRef = ref<HTMLElement | null>(null);
  const dropdownTriggerRef = ref<HTMLElement | null>(null);
  const dropdownStyle = ref<Record<string, string>>({});
  const buttonsContainerRef = ref<HTMLElement | null>(null);
  const buttonsPage = ref(0);
  const containerWidth = ref(0);
  const containerHeight = ref(0);
  let buttonsResizeObserver: ResizeObserver | null = null;

  const buttonsRows = computed(() => Math.max(1, Math.floor((containerHeight.value || MIN_BTN_H) / (MIN_BTN_H + 6))));
  const buttonsCols = computed(() => {
    const maxColsByWidth = Math.max(1, Math.floor((containerWidth.value || MIN_BTN_W) / MIN_BTN_W));
    const colsToFill = Math.ceil(allButtonOptions.value.length / buttonsRows.value);
    return Math.min(maxColsByWidth, Math.max(1, colsToFill));
  });
  const buttonsPerPage = computed(() => buttonsCols.value * buttonsRows.value);
  const allButtonOptions = computed(() => shouldShowAnyOption(props.filter) ? ['__all__', ...optionSource.filterOptionValues()] : optionSource.filterOptionValues());
  const totalButtonPages = computed(() => Math.ceil(allButtonOptions.value.length / buttonsPerPage.value));
  const visibleButtonOptions = computed(() => allButtonOptions.value.slice(buttonsPage.value * buttonsPerPage.value, (buttonsPage.value + 1) * buttonsPerPage.value));
  const hasButtonOverflow = computed(() => totalButtonPages.value > 1);
  const buttonsGridStyle = computed(() => ({ gridTemplateColumns: `repeat(${buttonsCols.value}, 1fr)`, gridTemplateRows: `repeat(${buttonsRows.value}, 1fr)` }));

  function prevButtonsPage(): void {
    buttonsPage.value = Math.max(0, buttonsPage.value - 1);
  }

  function nextButtonsPage(): void {
    buttonsPage.value = Math.min(totalButtonPages.value - 1, buttonsPage.value + 1);
  }

  function openDropdownFilter(): void {
    openDropdown.value = true;
    dropdownSearchQuery.value = '';
    positionDropdown();
    void nextTick(positionDropdown);
  }

  function toggleDropdownFilter(): void {
    if (openDropdown.value) {
      openDropdown.value = false;
      return;
    }
    openDropdownFilter();
  }

  function closeDropdownFilter(): void {
    openDropdown.value = false;
  }

  function positionDropdown(): void {
    if (!dropdownTriggerRef.value || typeof window === 'undefined') return;
    const rect = dropdownTriggerRef.value.getBoundingClientRect();
    const rawGap = window.getComputedStyle(dropdownTriggerRef.value).getPropertyValue('--dashboard-dropdown-popup-gap').trim();
    const parsedGap = Number.parseFloat(rawGap);
    const dropdownGap = Number.isFinite(parsedGap) ? parsedGap : 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= 190 ? rect.bottom + dropdownGap : Math.max(4, rect.top - 194 - dropdownGap);
    dropdownStyle.value = {
      position: 'fixed',
      top: `${top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      zIndex: '9999'
    };
  }

  function selectDropdownOption(value: string): void {
    optionSource.rememberPendingOptionLabel(value, filteredDropdownOptions());
    dropdownSearchQuery.value = '';
    closeDropdownFilter();
    updateFilterValue(value);
  }

  function clearSingleSelect(): void {
    dropdownSearchQuery.value = '';
    closeDropdownFilter();
    updateFilterValue('all');
  }

  function updateDropdownSearch(event: Event): void {
    dropdownSearchQuery.value = inputValue(event);
  }

  function dropdownDisplayValue(): string {
    if (openDropdown.value) return dropdownSearchQuery.value;
    if (isMultiSelect(props.filter)) {
      const values = currentFilterArray(props.filter);
      if (values.length === 0) return '';
      if (shouldHideMultiSelectSummary(props.filter)) return '';
      const selected = selectedMultiSelectOptions();
      if (selected.length === 0) return '';
      if (selected.length === 1) return selected[0]?.label ?? '';
      return `${selected.length} selected`;
    }
    const value = filterValue(props.filter, currentFilterValue(props.filter));
    return value === 'Any' ? '' : selectedSingleSelectLabel(value);
  }

  function singleSelectPlaceholder(): string {
    const config = props.filter.config ?? {};
    return readString(config.placeholder ?? config.selectPlaceholder ?? config.singleSelectPlaceholder ?? config.searchPlaceholder)
      ?? 'Search or select...';
  }

  function selectControlValue(): string {
    const value = filterValue(props.filter, currentFilterValue(props.filter));
    return value === 'Any' ? 'all' : value;
  }

  function nativeSelectControlValue(): string {
    const value = selectControlValue();
    if (value === 'all' && !shouldShowAnyOption(props.filter)) return '';
    if (value !== 'all' && !selectedSingleSelectLabel(value)) return '';
    return value;
  }

  function filteredDropdownOptions(): FilterOptionItem[] {
    const query = dropdownSearchQuery.value.trim().toLowerCase();
    const options = optionSource.filterOptionItems();
    if (!query) return options;
    return options.filter(option => `${option.label} ${option.value}`.toLowerCase().includes(query));
  }

  function isDropdownOptionSelected(value: string): boolean {
    return selectControlValue() === value;
  }

  function hasSingleSelectValue(): boolean {
    const value = filterValue(props.filter, currentFilterValue(props.filter));
    return !isMultiSelect(props.filter) && value !== 'Any' && Boolean(selectedSingleSelectLabel(value));
  }

  function multiSelectPlaceholder(): string {
    const selected = selectedMultiSelectOptions();
    if (selected.length === 0) return 'Search or select...';
    if (shouldHideMultiSelectSummary(props.filter)) return '';
    if (selected.length === 1) return selected[0]?.label || 'Search or select...';
    return `${selected.length} selected`;
  }

  function selectedMultiSelectOptions(): FilterOptionItem[] {
    return currentFilterArray(props.filter)
      .map(value => ({ label: selectedOptionLabel(value), value }))
      .filter(option => option.label);
  }

  function isMultiSelectOptionSelected(value: string): boolean {
    return currentFilterArray(props.filter).includes(value);
  }

  function toggleMultiSelectOption(value: string): void {
    const current = currentFilterArray(props.filter);
    if (current.includes(value)) {
      if (shouldCloseMultiSelectOnSelect(props.filter)) closeDropdownFilter();
      updateFilterValues(current.filter(item => item !== value));
      return;
    }
    optionSource.rememberPendingOptionLabel(value, filteredDropdownOptions());
    if (shouldCloseMultiSelectOnSelect(props.filter)) closeDropdownFilter();
    updateFilterValues([...current, value]);
  }

  function removeMultiSelectOption(value: string): void {
    updateFilterValues(currentFilterArray(props.filter).filter(item => item !== value));
  }

  function clearMultiSelect(): void {
    if (shouldCloseMultiSelectOnSelect(props.filter)) closeDropdownFilter();
    updateFilterValues([]);
  }

  function updateFilterValue(value: string): void {
    emitPatch({ value: parseValueForFilter(props.filter, value) });
  }

  function updateFilterValues(values: string[]): void {
    emitPatch({ value: values });
  }

  function filterOptionsId(): string {
    return `dashboard-filter-options-${props.filter.id}`;
  }

  function selectedSingleSelectLabel(value: string): string {
    return selectedOptionLabel(value);
  }

  function selectedOptionLabel(value: string): string {
    return optionSource.selectedOptionLabel(value);
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    if (!(event.target instanceof Element)) return;
    if (openDropdown.value && !isInsideCurrentDropdown(event.target)) closeDropdownFilter();
  }

  function isInsideCurrentDropdown(target: Element): boolean {
    if (dropdownRootRef.value?.contains(target)) return true;
    return document.getElementById(filterOptionsId())?.contains(target) ?? false;
  }

  watch(buttonsContainerRef, el => {
    buttonsResizeObserver?.disconnect();
    if (el && buttonsResizeObserver) buttonsResizeObserver.observe(el);
  });

  onMounted(() => {
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    if (typeof ResizeObserver !== 'undefined') {
      buttonsResizeObserver = new ResizeObserver(entries => {
        const entry = entries[0];
        if (!entry) return;
        containerWidth.value = entry.contentRect.width;
        containerHeight.value = entry.contentRect.height;
        buttonsPage.value = 0;
      });
      if (buttonsContainerRef.value) buttonsResizeObserver.observe(buttonsContainerRef.value);
    }
  });

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    buttonsResizeObserver?.disconnect();
  });

  return {
    buttonsContainerRef,
    buttonsGridStyle,
    buttonsPage,
    clearMultiSelect,
    clearSingleSelect,
    closeDropdownFilter,
    currentFilterArray: () => currentFilterArray(props.filter),
    currentFilterValue: () => currentFilterValue(props.filter),
    dropdownDisplayValue,
    dropdownRootRef,
    dropdownStyle,
    dropdownTriggerRef,
    filterDisplayMode: () => filterDisplayMode(props.filter),
    filterOptionItems: optionSource.filterOptionItems,
    filterOptionLabel: optionSource.filterOptionLabel,
    filterOptionValues: optionSource.filterOptionValues,
    filterOptionsId,
    filterValue: (value: unknown) => filterValue(props.filter, value),
    filteredDropdownOptions,
    hasButtonOverflow,
    hasSingleSelectValue,
    inputValue,
    isDropdownOptionSelected,
    isLoadingOptions: optionSource.isLoadingOptions,
    isMultiSelect: () => isMultiSelect(props.filter),
    isMultiSelectOptionSelected,
    multiSelectPlaceholder,
    nativeSelectControlValue,
    nextButtonsPage,
    noDataFoundLabel: () => noDataFoundLabel(props.filter),
    noResultsLabel: () => noResultsLabel(props.filter),
    openDropdown,
    openDropdownFilter,
    prevButtonsPage,
    removeMultiSelectOption,
    selectDropdownOption,
    selectedMultiSelectOptions,
    shouldShowAnyOption: () => shouldShowAnyOption(props.filter),
    shouldShowSingleSelectClear: () => shouldShowSingleSelectClear(props.filter),
    shouldUseSearchableSingleSelect: () => shouldUseSearchableSingleSelect(props.filter),
    singleSelectPlaceholder,
    toggleDropdownFilter,
    toggleMultiSelectOption,
    totalButtonPages,
    updateDropdownSearch,
    updateFilterValue,
    visibleButtonOptions
  };
}
