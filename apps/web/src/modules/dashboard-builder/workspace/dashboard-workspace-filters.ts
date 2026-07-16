import { computed } from 'vue';
import { createFilterDraft } from '../agent-context/element-planner';
import {
  removeDashboardRuntimeFilterValue,
  saveDashboardRuntimeFilterValue
} from '../runtime/dashboard-runtime-state';
import type {
  Dashboard,
  DashboardFilter,
  DashboardFilterCreatePatch,
  DashboardFilterPatch,
  DashboardRuntimeState
} from '../types';
import type { MarkDashboardDirty } from './dashboard-element-action-context';
import {
  createLocalDashboardElement,
  createLocalDashboardFilter,
  updateDashboardFilterDraft
} from './dashboard-local-draft';
import type { DashboardWorkspaceState } from './use-dashboard-workspace-state';

type UpdateSelectedDashboard = (next: Dashboard, runtimeStateOverride?: DashboardRuntimeState | null) => void;

export function useDashboardWorkspaceFilters(
  state: DashboardWorkspaceState,
  updateSelectedDashboard: UpdateSelectedDashboard,
  markDashboardDirty: MarkDashboardDirty
) {
  const newFilterDraft = computed(() => createFilterDraft(state.selectedTable.value));

  function addFilter(): void {
    if (!state.selectedDashboard.value) return;
    state.filterCreateRequestKey.value += 1;
    state.status.value = 'Filter editor opened';
  }

  async function createFilter(patch: DashboardFilterCreatePatch): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    const filter = createLocalDashboardFilter(dashboard, {
      ...createFilterDraft(state.selectedTable.value),
      ...patch
    });
    state.dashboardRuntimeState.value = saveDashboardRuntimeFilterValue(dashboard.id, filter, runtimeFilterValue(filter));
    if (filter.placement === 'canvas') {
      const element = createLocalDashboardElement(dashboard, filterElementCreatePatch(filter, dashboard));
      updateSelectedDashboard({
        ...dashboard,
        elements: [...dashboard.elements, element],
        filters: [...dashboard.filters, filter]
      }, state.dashboardRuntimeState.value);
      state.selectedElementId.value = element.id;
      state.editorFocusElementId.value = element.id;
    } else {
      updateSelectedDashboard({
        ...dashboard,
        filters: [...dashboard.filters, filter]
      }, state.dashboardRuntimeState.value);
    }
    markDashboardDirty('Dashboard filter added locally');
  }

  async function changeFilter(id: string, patch?: DashboardFilterPatch): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    const filter = dashboard.filters.find(item => item.id === id);
    if (filter && isRuntimeFilterPatch(patch)) {
      const updated = { ...filter, value: patch.value };
      state.dashboardRuntimeState.value = saveDashboardRuntimeFilterValue(dashboard.id, updated, patch.value);
      updateSelectedDashboard({
        ...dashboard,
        filters: dashboard.filters.map(filter => filter.id === id ? updated : filter)
      }, state.dashboardRuntimeState.value);
      state.status.value = 'Dashboard filter value updated';
      return;
    }
    const updatedDashboard = updateDashboardFilterDraft(dashboard, id, patch ?? nextFilterPatch(filter));
    const updated = updatedDashboard.filters.find(filter => filter.id === id);
    if (updated) {
      state.dashboardRuntimeState.value = saveDashboardRuntimeFilterValue(dashboard.id, updated, runtimeFilterValue(updated));
    }
    updateSelectedDashboard(updatedDashboard, state.dashboardRuntimeState.value);
    markDashboardDirty('Dashboard filter changed locally');
  }

  async function removeFilter(id: string): Promise<void> {
    const dashboard = state.selectedDashboard.value;
    if (!dashboard) return;
    state.dashboardRuntimeState.value = removeDashboardRuntimeFilterValue(dashboard.id, id);
    updateSelectedDashboard({ ...dashboard, filters: dashboard.filters.filter(filter => filter.id !== id) });
    markDashboardDirty('Dashboard filter removed locally');
  }

  return {
    addFilter,
    changeFilter,
    createFilter,
    newFilterDraft,
    removeFilter
  };
}

export function ensureDashboardFilterElements(dashboard: Dashboard): Dashboard {
  const canvasFilters = dashboard.filters.filter(filter => filter.placement === 'canvas');
  const missingFilters = canvasFilters.filter(filter => !dashboard.elements.some(element => linkedFilterId(element) === filter.id));
  if (missingFilters.length === 0) return dashboard;
  const createdElements: Dashboard['elements'] = [];
  for (const [index, filter] of missingFilters.entries()) {
    createdElements.push(createLocalDashboardElement(dashboard, filterElementCreatePatch(filter, {
      ...dashboard,
      elements: [...dashboard.elements, ...createdElements]
    }, {
      h: 3,
      w: 3,
      x: (index % 4) * 3,
      y: Math.floor(index / 4) * 3
    })));
  }
  return {
    ...dashboard,
    elements: [...createdElements, ...dashboard.elements]
  };
}

function isRuntimeFilterPatch(patch: DashboardFilterPatch | undefined): patch is { value: unknown } {
  return Boolean(patch)
    && Object.keys(patch as Record<string, unknown>).length === 1
    && Object.prototype.hasOwnProperty.call(patch, 'value');
}

function runtimeFilterValue(filter: DashboardFilter): unknown {
  return filter.value ?? filter.config?.value ?? '';
}

function filterDataSourceId(filter: DashboardFilter): string {
  const config = filter.config ?? {};
  const value = filter.targetDataSourceId ?? config.dataSourceId ?? config.targetDataSourceId;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function filterInputType(filter: DashboardFilter): string {
  const config = filter.config ?? {};
  const value = config.inputType ?? config.filterType ?? filter.type;
  return typeof value === 'string' && value.trim() ? value.trim() : filter.type;
}

function filterElementCreatePatch(filter: DashboardFilter, dashboard: Dashboard, layout?: Record<string, number>): {
  config: Record<string, unknown>;
  dataSourceId?: string;
  layout: Record<string, number>;
  name: string;
  type: string;
} {
  return {
    name: filter.name,
    type: 'filter',
    ...(filterDataSourceId(filter) ? { dataSourceId: filterDataSourceId(filter) } : {}),
    config: {
      ...(filter.config ?? {}),
      field: filter.field,
      filterId: filter.id,
      displayMode: 'dropdown',
      inputType: filterInputType(filter),
      operator: filter.operator,
      targetType: filter.targetType ?? filter.applyTo ?? 'all',
      title: filter.name,
      value: runtimeFilterValue(filter)
    },
    layout: layout ?? nextFilterElementLayout(dashboard)
  };
}

function linkedFilterId(element: Dashboard['elements'][number]): string {
  if (element.type !== 'filter') return '';
  const config = element.config ?? {};
  const value = config.filterId ?? config.dashboardFilterId;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function nextFilterElementLayout(dashboard: Dashboard): Record<string, number> {
  const filterElements = dashboard.elements.filter(el => el.type === 'filter');
  const totalWidth = filterElements.reduce((sum, el) => sum + Number(el.layout?.w ?? 3), 0);
  return { h: 3, w: 3, x: totalWidth % 12, y: Math.floor(totalWidth / 12) * 3 };
}

function nextFilterPatch(filter: DashboardFilter | undefined): { operator?: string; value?: unknown } {
  if (!filter) return { value: '' };
  if (filter.operator === 'last') return { operator: 'last', value: filter.value === '30 days' ? '7 days' : '30 days' };
  if (filter.operator === 'in') return {
    operator: 'in',
    value: Array.isArray(filter.value) && filter.value.length > 0 ? [] : filter.value
  };
  if (filter.operator === 'contains') return { operator: 'contains', value: filter.value ?? '' };
  return { operator: 'equals', value: filter.value ?? '' };
}
