import { ref, watch, type Ref } from 'vue';
import type { DashboardFilter } from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';
import {
  fetchDynamicFilterOptionItems,
  filterOptionSourceKey,
  hasDynamicFilterOptionSource,
  type FilterOptionItem
} from './filter-options-api';
import { stableStringify } from './dashboard-filter-bar-utils';

export function useDashboardFilterDynamicOptions(
  filters: Readonly<Ref<DashboardFilter[]>>,
  visualizationRequest: Readonly<Ref<VisualizationDataRequestContext | undefined>>
): {
  fetchedOptionsByFilter: Ref<Record<string, FilterOptionItem[]>>;
  fetchedOptionsLoadedByFilter: Ref<Record<string, boolean>>;
} {
  const fetchedOptionsByFilter = ref<Record<string, FilterOptionItem[]>>({});
  const fetchedOptionsLoadedByFilter = ref<Record<string, boolean>>({});
  let dynamicOptionsRun = 0;

  async function loadDynamicFilterOptions(): Promise<void> {
    const dynamicFilters = filters.value.filter(hasDynamicFilterOptionSource);
    const run = ++dynamicOptionsRun;
    if (dynamicFilters.length === 0) {
      fetchedOptionsByFilter.value = {};
      fetchedOptionsLoadedByFilter.value = {};
      return;
    }
    const entries = await Promise.all(dynamicFilters.map(async filter => [
      filter.id,
      await fetchDynamicFilterOptionItems(filter, visualizationRequest.value)
    ] as const));
    if (run !== dynamicOptionsRun) return;
    fetchedOptionsByFilter.value = Object.fromEntries(entries);
    fetchedOptionsLoadedByFilter.value = Object.fromEntries(entries.map(([id]) => [id, true]));
  }

  watch(
    () => stableStringify({
      filters: filters.value.map(filter => ({
        field: filter.field,
        id: filter.id,
        source: filterOptionSourceKey(filter)
      })),
      embedOrigin: visualizationRequest.value?.embedOrigin,
      runtimeParameterValues: visualizationRequest.value?.runtimeParameterValues,
      token: visualizationRequest.value?.token
    }),
    () => { void loadDynamicFilterOptions(); },
    { immediate: true }
  );

  return {
    fetchedOptionsByFilter,
    fetchedOptionsLoadedByFilter
  };
}
