<script setup lang="ts">
import { computed } from 'vue';
import {
  activeDashboardFilters,
  createFilterValues,
  filterKind,
  filterOptions,
  updateFilterValues
} from './dashboard-filtering';
import type {
  EmbedDashboardFilterValue,
  EmbedDashboardFilter,
  EmbedDataSourcePreview
} from './types';

const props = defineProps<{
  filters: EmbedDashboardFilter[];
  modelValue: EmbedDashboardFilterValue[];
  previews: EmbedDataSourcePreview[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: EmbedDashboardFilterValue[]];
}>();

const activeFilters = computed(() => activeDashboardFilters(props.filters));

function currentFilterValue(filter: EmbedDashboardFilter): EmbedDashboardFilterValue {
  return props.modelValue.find(value => value.filterId === filter.id)
    ?? createFilterValues([filter])[0]
    ?? { filterId: filter.id, field: filter.field, type: filterKind(filter), value: '' };
}

function updateValue(filter: EmbedDashboardFilter, patch: Partial<EmbedDashboardFilterValue>): void {
  emit('update:modelValue', updateFilterValues(props.modelValue, filter, patch));
}
</script>

<template>
  <section
    v-if="activeFilters.length > 0"
    class="public-dashboard-filter-bar"
    aria-label="Dashboard filters"
  >
    <div class="public-dashboard-filter-list">
      <label
        v-for="filter in activeFilters"
        :key="filter.id"
        class="public-dashboard-filter"
        :class="`public-dashboard-filter--${filterKind(filter)}`"
      >
        <span>{{ filter.label }}</span>

        <select
          v-if="filterKind(filter) === 'dropdown'"
          :value="currentFilterValue(filter).value"
          @change="updateValue(filter, { value: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">All</option>
          <option
            v-for="option in filterOptions(filter, previews)"
            :key="option"
            :value="option"
          >
            {{ option }}
          </option>
        </select>

        <input
          v-else-if="filterKind(filter) === 'freeText'"
          type="search"
          :value="currentFilterValue(filter).value"
          :placeholder="String(filter.config.placeholder ?? 'Search')"
          @input="updateValue(filter, { value: ($event.target as HTMLInputElement).value })"
        />

        <input
          v-else-if="filterKind(filter) === 'datePicker'"
          type="date"
          :value="currentFilterValue(filter).value"
          @change="updateValue(filter, { value: ($event.target as HTMLInputElement).value })"
        />

        <span v-else class="public-dashboard-date-range">
          <input
            type="date"
            :aria-label="`${filter.label} start date`"
            :value="currentFilterValue(filter).startDate"
            @change="updateValue(filter, { startDate: ($event.target as HTMLInputElement).value })"
          />
          <input
            type="date"
            :aria-label="`${filter.label} end date`"
            :value="currentFilterValue(filter).endDate"
            @change="updateValue(filter, { endDate: ($event.target as HTMLInputElement).value })"
          />
        </span>
      </label>
    </div>

  </section>
</template>
