import { computed, ref, watch } from 'vue';
import type { DashboardFilter } from '../types';
import type { VisualizationDataRequestContext } from '../visualization/data';
import {
  fetchDynamicFilterOptionItems,
  filterOptionSourceKey,
  hasDynamicFilterOptionSource,
  type FilterOptionItem
} from './filter-options-api';
import {
  dedupeOptions,
  displayableSelectedLabel,
  optionItems,
  readString,
  stableStringify
} from './dashboard-filter-control-utils';

interface DashboardFilterOptionSourceProps {
  filter: DashboardFilter;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}

export function useDashboardFilterOptionItems(props: DashboardFilterOptionSourceProps) {
  const fetchedOptions = ref<FilterOptionItem[]>([]);
  const fetchedOptionsLoaded = ref(false);
  const pendingOptionLabels = ref<Record<string, string>>({});

  const isLoadingOptions = computed(() => hasDynamicFilterOptionSource(props.filter) && !fetchedOptionsLoaded.value);

  function filterOptionValues(): string[] {
    return filterOptionItems().map(option => option.value);
  }

  function filterOptionItems(): FilterOptionItem[] {
    const config = props.filter.config ?? {};
    const record = props.filter as unknown as Record<string, unknown>;
    const sources = [record.options, record.values, record.sampleValues, config.options, config.values, config.sampleValues, config.allowedValues, config.choices];
    const configured = dedupeOptions(sources.flatMap(optionItems)).slice(0, 80);
    if (hasDynamicFilterOptionSource(props.filter) && (fetchedOptionsLoaded.value || fetchedOptions.value.length > 0)) return fetchedOptions.value;
    return configured.length > 0 ? configured : fetchedOptions.value;
  }

  function filterOptionLabel(value: string): string {
    return filterOptionItems().find(option => option.value === value)?.label
      ?? pendingOptionLabels.value[value]
      ?? value;
  }

  function selectedOptionLabel(value: string): string {
    if (!value || value === 'all') return '';
    const label = filterOptionItems().find(option => option.value === value)?.label
      ?? pendingOptionLabels.value[value];
    return displayableSelectedLabel(label);
  }

  function rememberPendingOptionLabel(value: string, candidates: FilterOptionItem[] = filterOptionItems()): void {
    if (!value || value === 'all') return;
    const option = candidates.find(item => item.value === value)
      ?? filterOptionItems().find(item => item.value === value);
    if (!option?.label) return;
    pendingOptionLabels.value = {
      ...pendingOptionLabels.value,
      [value]: option.label
    };
  }

  async function fetchFieldValues(dataSourceId: string, tableName: string, field: string): Promise<string[]> {
    const res = await fetch(`/api/data-sources/${encodeURIComponent(dataSourceId)}/field-values`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableName,
        fieldName: field,
        ...(props.visualizationRequest?.runtimeParameterValues ? { parameterValues: props.visualizationRequest.runtimeParameterValues } : {})
      })
    });
    if (!res.ok) return [];
    const json = await res.json() as { data?: { values?: unknown[] }; values?: unknown[] };
    const values = json.data?.values ?? json.values ?? [];
    return values.flatMap(optionItems).map(option => option.value).slice(0, 80);
  }

  async function fetchFieldOptions(): Promise<void> {
    fetchedOptionsLoaded.value = false;
    if (hasDynamicFilterOptionSource(props.filter)) {
      fetchedOptions.value = await fetchDynamicFilterOptionItems(props.filter, props.visualizationRequest);
      fetchedOptionsLoaded.value = true;
      return;
    }
    const config = props.filter.config ?? {};
    const dataSourceId = readString(config.dataSourceId);
    const field = props.filter.field || readString(config.dataSourceFieldMapping);
    if (!dataSourceId || !field) return;
    try {
      const configTableName = readString(config.tableName);
      if (configTableName) {
        const values = await fetchFieldValues(dataSourceId, configTableName, field);
        if (values.length > 0) {
          fetchedOptions.value = values.map(value => ({ label: value, value }));
          fetchedOptionsLoaded.value = true;
          return;
        }
      }

      let resolvedTableName = configTableName;
      const tablesRes = await fetch(`/api/data-sources/${encodeURIComponent(dataSourceId)}/tables`);
      if (tablesRes.ok) {
        type TableRecord = { id?: string; name: string; fields?: Array<{ name: string }> };
        const tablesData = await tablesRes.json() as { data?: { selectedTables?: TableRecord[] } };
        const tables = tablesData.data?.selectedTables ?? [];
        const target = tables.find(t => t.id === configTableName)
          ?? tables.find(t => t.fields?.some(f => f.name === field));
        if (target) {
          resolvedTableName = target.name;
          const values = await fetchFieldValues(dataSourceId, target.name, field);
          if (values.length > 0) {
            fetchedOptions.value = values.map(value => ({ label: value, value }));
            fetchedOptionsLoaded.value = true;
            return;
          }
        }
      }

      const kbRes = await fetch('/api/agent-tools/get-filter-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName: resolvedTableName ?? field, dataSourceId, fieldName: field })
      });
      if (kbRes.ok) {
        const kbData = await kbRes.json() as { valueConcepts?: Array<{ value?: unknown; label?: unknown } | unknown> };
        const concepts = kbData.valueConcepts ?? [];
        const values = concepts.flatMap(c => {
          if (typeof c === 'string') return [c];
          if (typeof c === 'object' && c !== null) {
            const record = c as Record<string, unknown>;
            const value = record.value ?? record.label ?? record.name;
            return typeof value === 'string' ? [value] : [];
          }
          return [];
        }).filter(Boolean).slice(0, 80);
        if (values.length > 0) fetchedOptions.value = values.map(value => ({ label: value, value }));
      }
    } catch {
      // Ignore unavailable option sources; the filter falls back to static options.
    } finally {
      fetchedOptionsLoaded.value = true;
    }
  }

  watch(
    () => [
      props.filter.id,
      filterOptionSourceKey(props.filter),
      props.visualizationRequest?.token,
      props.visualizationRequest?.embedOrigin,
      stableStringify(props.visualizationRequest?.runtimeParameterValues ?? {})
    ],
    () => {
      fetchedOptions.value = [];
      fetchedOptionsLoaded.value = false;
      void fetchFieldOptions();
    },
    { immediate: true }
  );

  return {
    fetchedOptions,
    fetchedOptionsLoaded,
    filterOptionItems,
    filterOptionLabel,
    filterOptionValues,
    isLoadingOptions,
    rememberPendingOptionLabel,
    selectedOptionLabel
  };
}
