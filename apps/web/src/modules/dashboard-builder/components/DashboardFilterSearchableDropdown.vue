<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import { hasDynamicFilterOptionSource, type FilterOptionItem } from './filter-options-api';
import {
  currentFilterArray,
  currentFilterValue,
  filterOptionItems,
  filterOptionsId,
  filterOptionValues,
  filterValue,
  isDropdownOptionSelected,
  isMultiSelect,
  noDataFoundLabel,
  noResultsLabel,
  parseValueForFilter,
  readString,
  selectedOptionLabel,
  selectedSingleSelectLabel,
  shouldCloseMultiSelectOnSelect,
  shouldHideMultiSelectSummary,
  shouldShowAnyOption,
  shouldShowSingleSelectClear,
  type FilterOptionLookup
} from './dashboard-filter-bar-utils';

const props = defineProps<{
  fetchedOptionsByFilter: Record<string, FilterOptionItem[]>;
  fetchedOptionsLoadedByFilter: Record<string, boolean>;
  filter: DashboardFilter;
}>();

const emit = defineEmits<{
  update: [patch: DashboardFilterPatch];
}>();

const isOpen = ref(false);
const searchQuery = ref('');
const pendingOptionLabels = ref<Record<string, string>>({});

function optionLookup(): FilterOptionLookup {
  return {
    fetchedOptionsByFilter: props.fetchedOptionsByFilter,
    fetchedOptionsLoadedByFilter: props.fetchedOptionsLoadedByFilter
  };
}

function pendingLabelsByFilter(): Record<string, Record<string, string>> {
  return { [props.filter.id]: pendingOptionLabels.value };
}

function openDropdownFilter(): void {
  isOpen.value = true;
  searchQuery.value = '';
}

function toggleDropdownFilter(): void {
  if (isOpen.value) {
    closeDropdownFilter();
    return;
  }
  openDropdownFilter();
}

function closeDropdownFilter(): void {
  isOpen.value = false;
}

function updateDropdownSearch(event: Event): void {
  searchQuery.value = event.target instanceof HTMLInputElement ? event.target.value : '';
}

function singleSelectPlaceholder(): string {
  const config = props.filter.config ?? {};
  return readString(config.placeholder ?? config.selectPlaceholder ?? config.singleSelectPlaceholder ?? config.searchPlaceholder)
    ?? 'Search or select...';
}

function hasSingleSelectValue(): boolean {
  const value = filterValue(props.filter, currentFilterValue(props.filter));
  return !isMultiSelect(props.filter)
    && value !== 'Any'
    && Boolean(selectedSingleSelectLabel(props.filter, value, optionLookup(), pendingLabelsByFilter()));
}

function dropdownDisplayValue(): string {
  if (isOpen.value) return searchQuery.value;
  const value = filterValue(props.filter, currentFilterValue(props.filter));
  return value === 'Any' ? '' : selectedSingleSelectLabel(props.filter, value, optionLookup(), pendingLabelsByFilter());
}

function filteredDropdownOptions(): FilterOptionItem[] {
  const query = searchQuery.value.trim().toLowerCase();
  const options = filterOptionItems(props.filter, optionLookup());
  if (!query) return options;
  return options.filter(option => `${option.label} ${option.value}`.toLowerCase().includes(query));
}

function multiSelectDisplayValue(): string {
  if (isOpen.value) return searchQuery.value;
  const selected = selectedMultiSelectOptions();
  if (selected.length === 0) return '';
  if (shouldHideMultiSelectSummary(props.filter)) return '';
  if (selected.length === 1) return selected[0]?.label ?? '';
  return `${selected.length} selected`;
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
    .map(value => ({
      label: selectedOptionLabel(props.filter, value, optionLookup(), pendingLabelsByFilter()),
      value
    }))
    .filter(option => option.label);
}

function isMultiSelectOptionSelected(value: string): boolean {
  return currentFilterArray(props.filter).includes(value);
}

function updateFilterValue(value: string): void {
  emit('update', { value: parseValueForFilter(props.filter, value) });
}

function updateFilterValues(values: string[]): void {
  emit('update', { value: values });
}

function toggleMultiSelectOption(value: string): void {
  const current = currentFilterArray(props.filter);
  if (current.includes(value)) {
    if (shouldCloseMultiSelectOnSelect(props.filter)) closeDropdownFilter();
    updateFilterValues(current.filter(item => item !== value));
    return;
  }
  rememberPendingOptionLabel(value);
  if (shouldCloseMultiSelectOnSelect(props.filter)) closeDropdownFilter();
  updateFilterValues([...current, value]);
}

function clearMultiSelect(): void {
  if (shouldCloseMultiSelectOnSelect(props.filter)) closeDropdownFilter();
  updateFilterValues([]);
}

function clearSingleSelect(): void {
  searchQuery.value = '';
  closeDropdownFilter();
  updateFilterValue('all');
}

function selectDropdownOption(value: string): void {
  rememberPendingOptionLabel(value);
  searchQuery.value = '';
  closeDropdownFilter();
  updateFilterValue(value);
}

function removeMultiSelectOption(value: string): void {
  updateFilterValues(currentFilterArray(props.filter).filter(item => item !== value));
}

function rememberPendingOptionLabel(value: string): void {
  if (!value || value === 'all') return;
  const option = filteredDropdownOptions().find(item => item.value === value)
    ?? filterOptionItems(props.filter, optionLookup()).find(item => item.value === value);
  if (!option?.label) return;
  pendingOptionLabels.value = {
    ...pendingOptionLabels.value,
    [value]: option.label
  };
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Element) || !isOpen.value) return;
  if (dropdownFilterIdFromTarget(event.target) === props.filter.id) return;
  closeDropdownFilter();
}

function dropdownFilterIdFromTarget(target: Element): string {
  const dropdown = target.closest<HTMLElement>('[data-dashboard-filter-dropdown-id]');
  return dropdown?.dataset.dashboardFilterDropdownId ?? '';
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
});
</script>

<template>
  <div
    class="searchable-dropdown"
    :data-dashboard-filter-dropdown-id="filter.id"
    :class="{
      'is-open': isOpen,
      'multi-select-dropdown': isMultiSelect(filter),
      'single-select-dropdown': !isMultiSelect(filter),
      'has-selected-values': isMultiSelect(filter) ? currentFilterArray(filter).length > 0 : hasSingleSelectValue()
    }"
  >
    <div class="dropdown-input-container">
      <input
        :id="`dashboard-filter-${filter.id}`"
        class="filter-search-input"
        :class="{ 'has-selected-values': isMultiSelect(filter) ? currentFilterArray(filter).length > 0 : hasSingleSelectValue() }"
        type="text"
        :value="isMultiSelect(filter) ? multiSelectDisplayValue() : dropdownDisplayValue()"
        :placeholder="isMultiSelect(filter) ? multiSelectPlaceholder() : singleSelectPlaceholder()"
        :aria-label="`${filter.name} filter`"
        role="combobox"
        :aria-expanded="isOpen"
        :aria-controls="filterOptionsId(filter)"
        aria-autocomplete="list"
        autocomplete="off"
        @focus="openDropdownFilter"
        @click="openDropdownFilter"
        @input="updateDropdownSearch"
        @keydown.escape="closeDropdownFilter"
      >
      <div
        v-if="isMultiSelect(filter) && selectedMultiSelectOptions().length > 0"
        class="multi-select-selected-values"
      >
        <button
          v-for="option in selectedMultiSelectOptions()"
          :key="option.value"
          class="multi-select-selected-chip"
          type="button"
          :aria-label="`Remove ${option.label}`"
          @mousedown.prevent
          @click.stop="removeMultiSelectOption(option.value)"
        >
          <span class="multi-select-selected-label">{{ option.label }}</span>
          <span class="multi-select-selected-remove" aria-hidden="true">&times;</span>
        </button>
      </div>
      <button
        v-if="!isMultiSelect(filter) && hasSingleSelectValue() && shouldShowSingleSelectClear(filter)"
        class="single-select-clear"
        type="button"
        :aria-label="`Clear ${filter.name}`"
        @mousedown.prevent
        @click.stop="clearSingleSelect"
      >
        <span aria-hidden="true">&times;</span>
      </button>
      <button
        class="dropdown-toggle"
        type="button"
        :aria-label="`Open ${filter.name} options`"
        :aria-expanded="isOpen"
        @click.stop="toggleDropdownFilter"
      >
        <span v-if="hasDynamicFilterOptionSource(filter) && !fetchedOptionsLoadedByFilter[filter.id]" class="dropdown-loading-spinner" aria-hidden="true"></span>
        <svg v-else class="dropdown-toggle-icon" aria-hidden="true" viewBox="0 0 10 6">
          <path d="M0 0h10L5 6z" />
        </svg>
      </button>
    </div>
    <div
      v-if="isOpen"
      :id="filterOptionsId(filter)"
      class="dropdown-options"
      :class="{ 'dropdown-options--no-data': !shouldShowAnyOption(filter) && filterOptionValues(filter, optionLookup()).length === 0 && filteredDropdownOptions().length === 0 }"
      :data-dashboard-filter-dropdown-id="filter.id"
      role="listbox"
      :aria-label="`${filter.name} options`"
      :aria-multiselectable="isMultiSelect(filter)"
    >
      <button
        v-if="shouldShowAnyOption(filter)"
        class="dropdown-option"
        :class="{
          selected: isMultiSelect(filter) ? currentFilterArray(filter).length === 0 : filterValue(filter, currentFilterValue(filter)) === 'Any',
          'multi-select-option': isMultiSelect(filter)
        }"
        type="button"
        role="option"
        :aria-selected="isMultiSelect(filter) ? currentFilterArray(filter).length === 0 : filterValue(filter, currentFilterValue(filter)) === 'Any'"
        @mousedown.prevent.stop
        @click.stop="isMultiSelect(filter) ? clearMultiSelect() : clearSingleSelect()"
      >
        <span v-if="isMultiSelect(filter)" class="checkbox-box" :class="{ checked: currentFilterArray(filter).length === 0 }" aria-hidden="true"></span>
        <span class="option-text">Any</span>
      </button>
      <button
        v-for="option in filteredDropdownOptions()"
        :key="option.value"
        class="dropdown-option"
        :class="{
          selected: isMultiSelect(filter) ? isMultiSelectOptionSelected(option.value) : isDropdownOptionSelected(filter, option.value),
          'multi-select-option': isMultiSelect(filter)
        }"
        type="button"
        role="option"
        :aria-selected="isMultiSelect(filter) ? isMultiSelectOptionSelected(option.value) : isDropdownOptionSelected(filter, option.value)"
        @mousedown.prevent.stop
        @click.stop="isMultiSelect(filter) ? toggleMultiSelectOption(option.value) : selectDropdownOption(option.value)"
      >
        <span v-if="isMultiSelect(filter)" class="checkbox-box" :class="{ checked: isMultiSelectOptionSelected(option.value) }" aria-hidden="true"></span>
        <span class="option-text">{{ option.label }}</span>
      </button>
      <div v-if="filteredDropdownOptions().length === 0" class="dropdown-option no-results">
        <span class="option-text">{{ filterOptionValues(filter, optionLookup()).length === 0 ? noDataFoundLabel(filter) : noResultsLabel(filter) }}</span>
      </div>
    </div>
  </div>
</template>
