import type {
  Dashboard,
  DashboardFilter,
  DashboardRunConfiguration,
  DashboardRuntimeFilterState,
  DashboardRuntimeState
} from '../types';

export interface DashboardRuntimeStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

const STORAGE_PREFIX = 'intraq.dashboard-builder.runtime.';
const RUNTIME_STATE_VERSION = 2;
const MAX_ROW_LIMIT = 100_000;

export const DEFAULT_DASHBOARD_RUN_CONFIGURATION: DashboardRunConfiguration = {
  runtime: 'databricks',
  scheduled: false
};

export function readDashboardRuntimeState(
  dashboardId: string,
  storage: DashboardRuntimeStorage | null = browserRuntimeStorage()
): DashboardRuntimeState | null {
  const normalizedId = normalizeDashboardId(dashboardId);
  if (!normalizedId || !storage) return null;
  const key = storageKey(normalizedId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const state = normalizeDashboardRuntimeState(parsed, normalizedId);
    if (state) return state;
  } catch {
    // Corrupt runtime state should not block dashboard loading.
  }
  storage.removeItem(key);
  return null;
}

export function saveDashboardRuntimeFilterValue(
  dashboardId: string,
  filter: DashboardFilter,
  value: unknown,
  storage: DashboardRuntimeStorage | null = browserRuntimeStorage()
): DashboardRuntimeState | null {
  const normalizedId = normalizeDashboardId(dashboardId);
  const serializableValue = toSerializableValue(value);
  if (!normalizedId || !storage || serializableValue === undefined) {
    return readDashboardRuntimeState(normalizedId, storage);
  }
  const current = readDashboardRuntimeState(normalizedId, storage) ?? emptyRuntimeState(normalizedId);
  const next: DashboardRuntimeState = {
    ...current,
    filters: {
      ...current.filters,
      [filter.id]: {
        ...(readString(filter.field) ? { field: readString(filter.field) as string } : {}),
        ...(readString(filter.name) ? { name: readString(filter.name) as string } : {}),
        ...(readString(filter.operator) ? { operator: readString(filter.operator) as string } : {}),
        ...(readString(filter.type) ? { type: readString(filter.type) as string } : {}),
        value: serializableValue
      }
    }
  };
  return writeDashboardRuntimeState(next, storage);
}

export function removeDashboardRuntimeFilterValue(
  dashboardId: string,
  filterId: string,
  storage: DashboardRuntimeStorage | null = browserRuntimeStorage()
): DashboardRuntimeState | null {
  const normalizedId = normalizeDashboardId(dashboardId);
  if (!normalizedId || !storage) return null;
  const current = readDashboardRuntimeState(normalizedId, storage);
  if (!current) return null;
  const { [filterId]: _removed, ...filters } = current.filters;
  const next: DashboardRuntimeState = { ...current, filters };
  if (Object.keys(next.filters).length === 0 && !next.runConfiguration && !next.runtimeParameterValues) {
    storage.removeItem(storageKey(normalizedId));
    return null;
  }
  return writeDashboardRuntimeState(next, storage);
}

export function saveDashboardRunConfiguration(
  dashboardId: string,
  configuration: {
    editModeRowLimit?: number | undefined;
    rowLimit?: number | undefined;
    runtime?: string;
    scheduled?: boolean;
    viewModeRowLimit?: number | undefined;
  },
  storage: DashboardRuntimeStorage | null = browserRuntimeStorage()
): DashboardRuntimeState | null {
  const normalizedId = normalizeDashboardId(dashboardId);
  if (!normalizedId || !storage) return null;
  const current = readDashboardRuntimeState(normalizedId, storage) ?? emptyRuntimeState(normalizedId);
  return writeDashboardRuntimeState({
    ...current,
    runConfiguration: normalizeRunConfiguration(configuration)
  }, storage);
}

export function saveDashboardRuntimeParameterValues(
  dashboardId: string,
  values: Record<string, unknown>,
  storage: DashboardRuntimeStorage | null = browserRuntimeStorage()
): DashboardRuntimeState | null {
  const normalizedId = normalizeDashboardId(dashboardId);
  if (!normalizedId || !storage) return null;
  const current = readDashboardRuntimeState(normalizedId, storage) ?? emptyRuntimeState(normalizedId);
  const runtimeParameterValues = normalizeRuntimeParameterValues(values);
  const next: DashboardRuntimeState = {
    ...current,
    ...(Object.keys(runtimeParameterValues).length > 0 ? { runtimeParameterValues } : {})
  };
  if (Object.keys(runtimeParameterValues).length === 0) delete next.runtimeParameterValues;
  return writeDashboardRuntimeState(next, storage);
}

export function removeDashboardRuntimeState(
  dashboardId: string,
  storage: DashboardRuntimeStorage | null = browserRuntimeStorage()
): void {
  const normalizedId = normalizeDashboardId(dashboardId);
  if (!normalizedId || !storage) return;
  storage.removeItem(storageKey(normalizedId));
}

export function applyDashboardRuntimeState(
  dashboard: Dashboard,
  state: DashboardRuntimeState | null
): Dashboard {
  if (!state || state.dashboardId !== dashboard.id || Object.keys(state.filters).length === 0) {
    return dashboard;
  }
  let applied = false;
  const filters = dashboard.filters.map(filter => {
    const persisted = state.filters[filter.id];
    if (!persisted) return filter;
    applied = true;
    return { ...filter, value: persisted.value };
  });
  return applied ? { ...dashboard, filters } : dashboard;
}

export function dashboardRunConfigurationFromState(
  state: DashboardRuntimeState | null
): DashboardRunConfiguration {
  return {
    ...DEFAULT_DASHBOARD_RUN_CONFIGURATION,
    ...(state?.runConfiguration ?? {})
  };
}

function emptyRuntimeState(dashboardId: string): DashboardRuntimeState {
  return {
    dashboardId,
    filters: {},
    version: RUNTIME_STATE_VERSION
  };
}

function normalizeDashboardRuntimeState(value: unknown, dashboardId: string): DashboardRuntimeState | null {
  if (!isRecord(value) || value.version !== RUNTIME_STATE_VERSION || value.dashboardId !== dashboardId) return null;
  const filters = normalizeRuntimeFilters(value.filters);
  const runConfiguration = normalizeOptionalRunConfiguration(value.runConfiguration);
  const runtimeParameterValues = normalizeRuntimeParameterValues(value.runtimeParameterValues);
  return {
    dashboardId,
    filters,
    ...(runConfiguration ? { runConfiguration } : {}),
    ...(Object.keys(runtimeParameterValues).length > 0 ? { runtimeParameterValues } : {}),
    version: RUNTIME_STATE_VERSION
  };
}

function normalizeRuntimeFilters(value: unknown): Record<string, DashboardRuntimeFilterState> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([filterId, filterState]) => {
    const normalized = normalizeRuntimeFilterState(filterState);
    return normalized ? [[filterId, normalized]] : [];
  }));
}

function normalizeRuntimeFilterState(value: unknown): DashboardRuntimeFilterState | null {
  if (!isRecord(value) || !('value' in value)) return null;
  const serializableValue = toSerializableValue(value.value);
  if (serializableValue === undefined) return null;
  return {
    ...(readString(value.field) ? { field: readString(value.field) as string } : {}),
    ...(readString(value.name) ? { name: readString(value.name) as string } : {}),
    ...(readString(value.operator) ? { operator: readString(value.operator) as string } : {}),
    ...(readString(value.type) ? { type: readString(value.type) as string } : {}),
    value: serializableValue
  };
}

function normalizeOptionalRunConfiguration(value: unknown): DashboardRunConfiguration | undefined {
  if (!isRecord(value)) return undefined;
  return normalizeRunConfiguration(value);
}

function normalizeRuntimeParameterValues(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const name = key.trim();
    if (!name) return [];
    const normalized = normalizeRuntimeParameterValue(item);
    return normalized === undefined ? [] : [[name, normalized]];
  }));
}

function normalizeRuntimeParameterValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (!Array.isArray(value)) return undefined;
  const values = value.filter(item =>
    item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
  );
  return values.length > 0 ? values : undefined;
}

function normalizeRunConfiguration(
  value: {
    editModeRowLimit?: unknown;
    rowLimit?: unknown;
    runtime?: unknown;
    scheduled?: unknown;
    viewModeRowLimit?: unknown;
  }
): DashboardRunConfiguration {
  const runtime = readString(value.runtime) ?? DEFAULT_DASHBOARD_RUN_CONFIGURATION.runtime;
  const editModeRowLimit = readPositiveInteger(value.editModeRowLimit)
    ?? readPositiveInteger(value.rowLimit);
  const viewModeRowLimit = readPositiveInteger(value.viewModeRowLimit);
  return {
    runtime,
    scheduled: value.scheduled === true,
    ...(editModeRowLimit === undefined ? {} : { editModeRowLimit }),
    ...(viewModeRowLimit === undefined ? {} : { viewModeRowLimit })
  };
}

function writeDashboardRuntimeState(
  state: DashboardRuntimeState,
  storage: DashboardRuntimeStorage
): DashboardRuntimeState {
  try {
    storage.setItem(storageKey(state.dashboardId), JSON.stringify(state));
  } catch {
    // Browser storage can be unavailable or full; the in-memory dashboard state still updates.
  }
  return state;
}

function toSerializableValue(value: unknown): unknown {
  try {
    const raw = JSON.stringify(value);
    return raw === undefined ? undefined : JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(MAX_ROW_LIMIT, Math.floor(parsed));
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeDashboardId(value: string): string {
  return value.trim();
}

function storageKey(dashboardId: string): string {
  return `${STORAGE_PREFIX}${dashboardId}`;
}

function browserRuntimeStorage(): DashboardRuntimeStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
