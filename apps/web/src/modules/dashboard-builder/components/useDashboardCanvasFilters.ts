import { computed, ref, watch } from 'vue';
import type {
  DashboardElement,
  DashboardFilter,
  DashboardFilterPatch
} from '../types';
import type { ChartCrossFilterSelection } from '../visualization/chart-interactions';
import {
  clearRuntimeCrossFilter,
  toggleRuntimeCrossFilters,
  type DashboardRuntimeCrossFilter
} from './canvas/dashboard-cross-filters';
import type { DashboardCanvasEmit, DashboardCanvasProps } from './dashboard-canvas-types';
import { readConfigString } from './dashboard-canvas-types';

export function useDashboardCanvasFilters(props: DashboardCanvasProps, emit: DashboardCanvasEmit) {
  const canvasFilterPatches = ref<Record<string, DashboardFilterPatch>>({});
  const runtimeCrossFilters = ref<DashboardRuntimeCrossFilter[]>([]);

  const persistedAndCanvasFilters = computed(() => {
    const canvasElements = props.dashboard.elements.filter(el => el.type === 'filter');
    const virtualFilters = canvasElements.map(el => {
      const config = el.config ?? {};
      const patch = canvasFilterPatches.value[el.id] ?? {};
      const mergedConfig = { ...config, ...(patch.config ?? {}) };
      const readStr = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
      return {
        id: el.id,
        dashboardId: props.dashboard.id,
        name: el.name,
        field: readStr(patch.field ?? mergedConfig.field ?? mergedConfig.filterField ?? mergedConfig.xField) ?? '',
        operator: readStr(patch.operator ?? mergedConfig.operator) ?? 'in',
        value: patch.value ?? mergedConfig.value ?? mergedConfig.defaultValue,
        type: 'interactive',
        placement: 'canvas' as const,
        config: mergedConfig,
        createdAt: '',
        updatedAt: '',
      };
    });
    return [...props.dashboard.filters, ...virtualFilters];
  });

  const filtersByElementId = computed(() => Object.fromEntries(
    props.dashboard.elements.map(element => [
      element.id,
      [
        ...persistedAndCanvasFilters.value,
        ...runtimeCrossFilters.value
          .filter(filter => filter.targetElementIds.includes(element.id))
          .map(filter => filter.filter)
      ]
    ])
  ));

  const visibilityRuntimeValues = computed(() => buildVisibilityRuntimeValues(
    persistedAndCanvasFilters.value,
    props.visualizationRequest?.runtimeParameterValues
  ));

  function handleFilterChange(filterId: string, patch: DashboardFilterPatch): void {
    const isCanvasElement = props.dashboard.elements.some(el => el.type === 'filter' && el.id === filterId);
    if (isCanvasElement) {
      const previous = canvasFilterPatches.value[filterId] ?? {};
      canvasFilterPatches.value = {
        ...canvasFilterPatches.value,
        [filterId]: {
          ...previous,
          ...patch,
          config: { ...(previous.config ?? {}), ...(patch.config ?? {}) }
        }
      };
      return;
    }
    emit('changeFilter', filterId, patch);
  }

  function handleChartCrossFilter(elementId: string, selection: ChartCrossFilterSelection): void {
    runtimeCrossFilters.value = toggleRuntimeCrossFilters(
      runtimeCrossFilters.value,
      props.dashboard,
      props.dataSources,
      selection,
      elementId
    );
  }

  function removeRuntimeCrossFilter(filterId: string): void {
    runtimeCrossFilters.value = clearRuntimeCrossFilter(runtimeCrossFilters.value, filterId);
  }

  function clearAllRuntimeCrossFilters(): void {
    runtimeCrossFilters.value = [];
  }

  function elementPassesVisibilityRules(element: DashboardElement): boolean {
    const config = element.config ?? {};
    if (visibilityRulesMatch(config.hiddenWhen ?? config.hideWhen, persistedAndCanvasFilters.value, visibilityRuntimeValues.value)) {
      return false;
    }

    const visibleWhen = config.visibleWhen ?? config.showWhen ?? config.displayWhen ?? config.visibilityRules;
    if (visibleWhen === undefined) return true;
    return visibilityRulesMatch(visibleWhen, persistedAndCanvasFilters.value, visibilityRuntimeValues.value);
  }

  function filtersForElement(element: DashboardElement): DashboardFilter[] {
    return filtersByElementId.value[element.id] ?? persistedAndCanvasFilters.value;
  }

  function rendererFiltersForElement(element: DashboardElement): DashboardFilter[] {
    if (element.type !== 'export') return filtersForElement(element);
    return [
      ...persistedAndCanvasFilters.value,
      ...runtimeCrossFilters.value.map(filter => filter.filter)
    ];
  }

  function syncRuntimeCrossFilters(): void {
    const elementIds = new Set(props.dashboard.elements.map(element => element.id));
    runtimeCrossFilters.value = runtimeCrossFilters.value.filter(filter =>
      elementIds.has(filter.sourceElementId)
      && filter.targetElementIds.some(targetId => elementIds.has(targetId))
    );
  }

  watch(() => props.dashboard.elements.map(element => element.id).join('|'), syncRuntimeCrossFilters, { immediate: true });
  watch(() => props.dashboard.id, () => {
    runtimeCrossFilters.value = [];
  });

  return {
    clearAllRuntimeCrossFilters,
    elementPassesVisibilityRules,
    filtersForElement,
    handleChartCrossFilter,
    handleFilterChange,
    persistedAndCanvasFilters,
    removeRuntimeCrossFilter,
    rendererFiltersForElement,
    runtimeCrossFilters
  };
}

function visibilityRulesMatch(
  rules: unknown,
  filters: DashboardFilter[],
  runtimeValues: Map<string, unknown>
): boolean {
  if (rules === undefined || rules === null) return false;
  if (Array.isArray(rules)) return rules.every(rule => visibilityRuleMatches(rule, filters, runtimeValues));
  if (isVisibilityRecord(rules)) {
    if (Array.isArray(rules.any)) return rules.any.some(rule => visibilityRuleMatches(rule, filters, runtimeValues));
    if (Array.isArray(rules.all)) return rules.all.every(rule => visibilityRuleMatches(rule, filters, runtimeValues));
    if (rules.not !== undefined) return !visibilityRulesMatch(rules.not, filters, runtimeValues);
  }
  return visibilityRuleMatches(rules, filters, runtimeValues);
}

function visibilityRuleMatches(
  rule: unknown,
  filters: DashboardFilter[],
  runtimeValues: Map<string, unknown>
): boolean {
  if (!isVisibilityRecord(rule)) return false;
  const actual = visibilityRuleValue(rule, filters, runtimeValues);

  if (rule.exists !== undefined) return Boolean(actual) === Boolean(rule.exists);
  if (rule.equals !== undefined || rule.eq !== undefined || rule.value !== undefined || rule.is !== undefined) {
    return valueMatches(actual, rule.equals ?? rule.eq ?? rule.value ?? rule.is);
  }
  if (rule.notEquals !== undefined || rule.ne !== undefined || rule.not !== undefined) {
    return !valueMatches(actual, rule.notEquals ?? rule.ne ?? rule.not);
  }
  if (rule.in !== undefined || rule.oneOf !== undefined) {
    return arrayValue(rule.in ?? rule.oneOf).some(expected => valueMatches(actual, expected));
  }
  if (rule.notIn !== undefined || rule.noneOf !== undefined) {
    return !arrayValue(rule.notIn ?? rule.noneOf).some(expected => valueMatches(actual, expected));
  }
  return Boolean(actual);
}

function visibilityRuleValue(
  rule: Record<string, unknown>,
  filters: DashboardFilter[],
  runtimeValues: Map<string, unknown>
): unknown {
  const filterId = readConfigString(rule.filterId ?? rule.filter ?? rule.filterElementId);
  const key = readConfigString(rule.parameter ?? rule.field ?? rule.name ?? rule.key ?? rule.path);
  if (filterId) {
    const filter = filters.find(item => item.id === filterId);
    return filter ? visibilityValueFromFilter(filter, key) : undefined;
  }
  return runtimeValues.get(normalizeVisibilityKey(key));
}

function visibilityValueFromFilter(filter: DashboardFilter, key: string): unknown {
  const value = filter.value ?? filter.config?.value ?? filter.config?.defaultValue;
  if (!key) return value;
  if (isVisibilityRecord(value) && value[key] !== undefined) return value[key];
  const config = filter.config ?? {};
  if (config[key] !== undefined) return config[key];
  if (key === 'field') return filter.field;
  if (key === 'name') return filter.name;
  return undefined;
}

function buildVisibilityRuntimeValues(
  filters: DashboardFilter[],
  runtimeParameterValues: unknown
): Map<string, unknown> {
  const values = new Map<string, unknown>();
  const setValue = (key: unknown, value: unknown): void => {
    const normalized = normalizeVisibilityKey(readConfigString(key));
    if (!normalized || value === undefined) return;
    values.set(normalized, value);
  };

  if (isVisibilityRecord(runtimeParameterValues)) {
    for (const [key, value] of Object.entries(runtimeParameterValues)) setValue(key, value);
  }

  for (const filter of filters) {
    const config = filter.config ?? {};
    const value = filter.value ?? config.value ?? config.defaultValue;
    setValue(filter.id, value);
    setValue(filter.field, value);
    setValue(filter.name, value);
    if (isVisibilityRecord(config.parameterConfig)) {
      setValue(config.parameterConfig.name, value);
      setValue(config.parameterConfig.label, value);
    }
    if (isVisibilityRecord(value)) {
      for (const [key, nestedValue] of Object.entries(value)) setValue(key, nestedValue);
    }
    for (const key of ['period', 'selectedDate', 'startDate', 'endDate', 'fromDate', 'toDate']) {
      if (config[key] !== undefined) setValue(key, config[key]);
    }
  }

  return values;
}

function valueMatches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.some(item => valueMatches(item, expected));
  if (Array.isArray(expected)) return expected.some(item => valueMatches(actual, item));
  return normalizeVisibilityValue(actual) === normalizeVisibilityValue(expected);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function normalizeVisibilityKey(value: string): string {
  return value.trim().replace(/[\s_-]+/g, '').toLowerCase();
}

function normalizeVisibilityValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return String(value).trim().toLowerCase();
}

function isVisibilityRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
