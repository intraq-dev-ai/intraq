<script setup lang="ts">
import { reactive, type ComponentPublicInstance, type VNodeRef } from 'vue';
import type { DashboardFilter, DashboardFilterPatch } from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';
import { useDashboardOptionsFilterControl } from './useDashboardOptionsFilterControl';

const props = defineProps<{
  controlName: string;
  filter: DashboardFilter;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>();

const emit = defineEmits<{
  update: [patch: DashboardFilterPatch];
}>();

type TemplateRefValue = Element | ComponentPublicInstance | null;

const control = reactive(useDashboardOptionsFilterControl(props, patch => emit('update', patch)));

const setButtonsContainerRef: VNodeRef = value => {
  control.buttonsContainerRef = htmlElement(value);
};

const setDropdownRootRef: VNodeRef = value => {
  control.dropdownRootRef = htmlElement(value);
};

const setDropdownTriggerRef: VNodeRef = value => {
  control.dropdownTriggerRef = htmlElement(value);
};

function htmlElement(value: TemplateRefValue): HTMLElement | null {
  return value instanceof HTMLElement ? value : null;
}
</script>

<template>
  <div
    v-if="control.filterDisplayMode() === 'buttons'"
    class="filter-buttons-wrapper"
  >
    <button
      v-if="control.hasButtonOverflow"
      class="filter-btn-nav"
      type="button"
      :disabled="control.buttonsPage === 0"
      aria-label="Previous options"
      @click="control.prevButtonsPage"
    >&#8249;</button>
    <div
      :ref="setButtonsContainerRef"
      class="filter-buttons-group"
      :class="{ 'is-multi': control.isMultiSelect() }"
      :style="control.buttonsGridStyle"
    >
      <button
        v-for="opt in control.visibleButtonOptions"
        :key="opt"
        type="button"
        class="filter-btn-option"
        :class="{ active: opt === '__all__' ? (control.isMultiSelect() ? control.currentFilterArray().length === 0 : control.filterValue(control.currentFilterValue()) === 'Any') : (control.isMultiSelect() ? control.isMultiSelectOptionSelected(opt) : control.isDropdownOptionSelected(opt)) }"
        @click="opt === '__all__' ? (control.isMultiSelect() ? control.clearMultiSelect() : control.updateFilterValue('all')) : (control.isMultiSelect() ? control.toggleMultiSelectOption(opt) : control.selectDropdownOption(opt))"
      >{{ opt === '__all__' ? 'All' : control.filterOptionLabel(opt) }}</button>
      <p v-if="control.filterOptionValues().length === 0" class="filter-no-options">{{ control.noDataFoundLabel() }}</p>
    </div>
    <button
      v-if="control.hasButtonOverflow"
      class="filter-btn-nav"
      type="button"
      :disabled="control.buttonsPage >= control.totalButtonPages - 1"
      aria-label="Next options"
      @click="control.nextButtonsPage"
    >&#8250;</button>
  </div>

  <div
    v-else-if="control.filterDisplayMode() === 'list'"
    class="filter-list-group"
  >
    <div class="filter-list-options">
      <button
        v-if="control.shouldShowAnyOption()"
        type="button"
        class="filter-list-option"
        :class="{ active: control.isMultiSelect() ? control.currentFilterArray().length === 0 : control.filterValue(control.currentFilterValue()) === 'Any' }"
        @click="control.isMultiSelect() ? control.clearMultiSelect() : control.updateFilterValue('all')"
      >
        <span v-if="control.isMultiSelect()" class="checkbox-box" :class="{ checked: control.currentFilterArray().length === 0 }" aria-hidden="true"></span>
        <span>All</span>
      </button>
      <button
        v-for="option in control.filterOptionItems()"
        :key="option.value"
        type="button"
        class="filter-list-option"
        :class="{ active: control.isMultiSelect() ? control.isMultiSelectOptionSelected(option.value) : control.isDropdownOptionSelected(option.value) }"
        @click="control.isMultiSelect() ? control.toggleMultiSelectOption(option.value) : control.selectDropdownOption(option.value)"
      >
        <span v-if="control.isMultiSelect()" class="checkbox-box" :class="{ checked: control.isMultiSelectOptionSelected(option.value) }" aria-hidden="true"></span>
        <span>{{ option.label }}</span>
      </button>
      <p v-if="control.filterOptionValues().length === 0" class="filter-no-options">{{ control.noDataFoundLabel() }}</p>
    </div>
  </div>

  <select
    v-else-if="!control.isMultiSelect() && !control.shouldUseSearchableSingleSelect()"
    :id="`dashboard-filter-${filter.id}`"
    class="filter-input filter-select-input"
    :value="control.nativeSelectControlValue()"
    :aria-label="`${controlName} filter`"
    @change="control.updateFilterValue(control.inputValue($event))"
  >
    <option v-if="control.shouldShowAnyOption()" value="all">Any</option>
    <option v-else-if="control.filterOptionItems().length === 0" value="" disabled>{{ control.noDataFoundLabel() }}</option>
    <option v-else value="" disabled>{{ control.singleSelectPlaceholder() }}</option>
    <option v-for="option in control.filterOptionItems()" :key="option.value" :value="option.value">{{ option.label }}</option>
  </select>

  <div
    v-else
    :ref="setDropdownRootRef"
    class="searchable-dropdown"
    :data-dashboard-filter-dropdown-id="filter.id"
    :class="{
      'is-open': control.openDropdown,
      'multi-select-dropdown': control.isMultiSelect(),
      'single-select-dropdown': !control.isMultiSelect(),
      'has-selected-values': control.isMultiSelect() ? control.currentFilterArray().length > 0 : control.hasSingleSelectValue()
    }"
  >
    <div :ref="setDropdownTriggerRef" class="dropdown-input-container">
      <input
        :id="`dashboard-filter-${filter.id}`"
        class="filter-search-input"
        :class="{ 'has-selected-values': control.isMultiSelect() ? control.currentFilterArray().length > 0 : control.hasSingleSelectValue() }"
        type="text"
        :value="control.dropdownDisplayValue()"
        :placeholder="control.isMultiSelect() ? control.multiSelectPlaceholder() : control.singleSelectPlaceholder()"
        :aria-label="`${controlName} filter`"
        role="combobox"
        :aria-expanded="control.openDropdown"
        :aria-controls="control.filterOptionsId()"
        aria-autocomplete="list"
        autocomplete="off"
        @focus="control.openDropdownFilter"
        @click="control.openDropdownFilter"
        @input="control.updateDropdownSearch"
        @keydown.escape="control.closeDropdownFilter"
      >
      <div
        v-if="control.isMultiSelect() && control.selectedMultiSelectOptions().length > 0"
        class="multi-select-selected-values"
        @click="control.openDropdownFilter"
      >
        <button
          v-for="option in control.selectedMultiSelectOptions()"
          :key="option.value"
          class="multi-select-selected-chip"
          type="button"
          :aria-label="`Remove ${option.label}`"
          @mousedown.prevent
          @click.stop="control.removeMultiSelectOption(option.value)"
        >
          <span class="multi-select-selected-label">{{ option.label }}</span>
          <span class="multi-select-selected-remove" aria-hidden="true">&times;</span>
        </button>
      </div>
      <button
        v-if="!control.isMultiSelect() && control.hasSingleSelectValue() && control.shouldShowSingleSelectClear()"
        class="single-select-clear"
        type="button"
        :aria-label="`Clear ${controlName}`"
        @mousedown.prevent
        @click.stop="control.clearSingleSelect"
      >
        <span aria-hidden="true">&times;</span>
      </button>
      <button
        class="dropdown-toggle"
        type="button"
        :aria-label="`Open ${controlName} options`"
        :aria-expanded="control.openDropdown"
        @click.stop="control.toggleDropdownFilter"
      >
        <span v-if="control.isLoadingOptions" class="dropdown-loading-spinner" aria-hidden="true"></span>
        <svg v-else class="dropdown-toggle-icon" aria-hidden="true" viewBox="0 0 10 6">
          <path d="M0 0h10L5 6z" />
        </svg>
      </button>
    </div>
    <Teleport to="body">
      <div
        v-if="control.openDropdown"
        :id="control.filterOptionsId()"
        class="dropdown-options"
        :class="{ 'dropdown-options--no-data': !control.shouldShowAnyOption() && control.filterOptionValues().length === 0 && control.filteredDropdownOptions().length === 0 }"
        :data-dashboard-filter-dropdown-id="filter.id"
        role="listbox"
        :aria-label="`${controlName} options`"
        :aria-multiselectable="control.isMultiSelect()"
        :style="control.dropdownStyle"
      >
        <button
          v-if="control.shouldShowAnyOption()"
          class="dropdown-option"
          :class="{
            selected: control.isMultiSelect() ? control.currentFilterArray().length === 0 : control.filterValue(control.currentFilterValue()) === 'Any',
            'multi-select-option': control.isMultiSelect()
          }"
          type="button"
          role="option"
          :aria-selected="control.isMultiSelect() ? control.currentFilterArray().length === 0 : control.filterValue(control.currentFilterValue()) === 'Any'"
          @mousedown.prevent.stop
          @click.stop="control.isMultiSelect() ? control.clearMultiSelect() : control.selectDropdownOption('all')"
        >
          <span v-if="control.isMultiSelect()" class="checkbox-box" :class="{ checked: control.currentFilterArray().length === 0 }" aria-hidden="true"></span>
          <span class="option-text">Any</span>
        </button>
        <button
          v-for="option in control.filteredDropdownOptions()"
          :key="option.value"
          class="dropdown-option"
          :class="{
            selected: control.isMultiSelect() ? control.isMultiSelectOptionSelected(option.value) : control.isDropdownOptionSelected(option.value),
            'multi-select-option': control.isMultiSelect()
          }"
          type="button"
          role="option"
          :aria-selected="control.isMultiSelect() ? control.isMultiSelectOptionSelected(option.value) : control.isDropdownOptionSelected(option.value)"
          @mousedown.prevent.stop
          @click.stop="control.isMultiSelect() ? control.toggleMultiSelectOption(option.value) : control.selectDropdownOption(option.value)"
        >
          <span v-if="control.isMultiSelect()" class="checkbox-box" :class="{ checked: control.isMultiSelectOptionSelected(option.value) }" aria-hidden="true"></span>
          <span class="option-text">{{ option.label }}</span>
        </button>
        <div v-if="control.filteredDropdownOptions().length === 0" class="dropdown-option no-results">
          <span class="option-text">{{ control.filterOptionValues().length === 0 ? control.noDataFoundLabel() : control.noResultsLabel() }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>
