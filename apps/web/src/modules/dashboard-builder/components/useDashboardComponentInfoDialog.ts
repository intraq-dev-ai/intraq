import { computed, reactive, ref, watch } from 'vue';
import type { DashboardElement } from '../types';
import type { DashboardCanvasIndicatorSummary, DashboardCanvasInfoTab } from './canvas/dashboard-canvas-indicators';
import {
  chartTypeOptionsFor,
  tabsByKind,
  type BooleanDraftKey,
  type ComponentKind,
  type ComponentSettingsPatch,
  type TableFieldDraft
} from './component-info-dialog-options';
import { createComponentInfoDraft, resetComponentInfoDraft } from './component-info-dialog-draft';
import { buildComponentInfoSettingsPatch } from './component-info-dialog-patch';

export interface DashboardComponentInfoDialogProps {
  dashboardElements?: DashboardElement[] | undefined;
  element: DashboardElement | null;
  initialTab: DashboardCanvasInfoTab;
  summary: DashboardCanvasIndicatorSummary | null;
}

interface DashboardComponentInfoDialogCallbacks {
  onClose: () => void;
  onSave: (elementId: string, patch: ComponentSettingsPatch) => void;
}

export function useDashboardComponentInfoDialog(
  props: DashboardComponentInfoDialogProps,
  callbacks: DashboardComponentInfoDialogCallbacks
) {
  const activeTab = ref<DashboardCanvasInfoTab>('filters');
  const error = ref('');
  const tableFields = ref<TableFieldDraft[]>([]);
  const draft = reactive(createComponentInfoDraft());
  const settingsRows = computed(() => {
    if (!props.summary) return [];
    if (activeTab.value === 'sorting') return Object.entries(props.summary.sortingSettings);
    if (activeTab.value === 'layout') return Object.entries(props.summary.layoutSettings);
    if (activeTab.value === 'additional') return Object.entries(props.summary.additionalSettings);
    return [];
  });
  const componentKind = computed<ComponentKind>(() => {
    const type = props.element?.type;
    return type === 'card' || type === 'chart' || type === 'export' || type === 'filter' || type === 'matrix' || type === 'table'
      ? type
      : 'component';
  });
  const visibleTabs = computed(() => tabsByKind[componentKind.value]);
  const availableChartTypeOptions = computed(() => chartTypeOptionsFor(draft.chartType || props.element?.chartType));
  const sortableFieldOptions = computed(() => tableFields.value.map(field => ({
    label: field.displayName || field.columnName,
    value: field.columnName
  })));
  const exportTargetOptions = computed(() => (props.dashboardElements ?? [])
    .filter(element => element.id !== props.element?.id && !['chatbot', 'export', 'filter', 'news'].includes(element.type))
    .map(element => ({
      label: element.name || element.id,
      value: element.id
    })));
  const activeTabLabel = computed(() => visibleTabs.value.find(tab => tab.id === activeTab.value)?.label ?? 'Fields');
  const hasSortingTab = computed(() => visibleTabs.value.some(tab => tab.id === 'sorting'));
  const supportsViewActions = computed(() => ['card', 'chart', 'component', 'matrix', 'table'].includes(componentKind.value));

  watch(() => [props.initialTab, componentKind.value] as const, ([tab]) => {
    activeTab.value = visibleTabs.value.some(option => option.id === tab) ? tab : visibleTabs.value[0]?.id ?? 'fields';
  }, { immediate: true });
  watch(() => props.element?.id, () => {
    resetDraft();
  }, { immediate: true });

  function resetDraft(): void {
    tableFields.value = resetComponentInfoDraft(draft, props.element, props.summary);
    error.value = '';
  }

  function saveDraft(): void {
    if (!props.element) return;
    const patch = buildComponentInfoSettingsPatch({
      componentKind: componentKind.value,
      draft,
      element: props.element,
      onError: message => {
        error.value = message;
      },
      supportsViewActions: supportsViewActions.value,
      tableFields: tableFields.value
    });
    if (!patch) return;
    callbacks.onSave(props.element.id, patch);
    callbacks.onClose();
  }

  function moveFieldUp(index: number): void {
    if (index <= 0 || index >= tableFields.value.length) return;
    const next = [...tableFields.value];
    const previous = next[index - 1];
    const current = next[index];
    if (!previous || !current) return;
    next[index - 1] = current;
    next[index] = previous;
    tableFields.value = next;
  }

  function moveFieldDown(index: number): void {
    if (index < 0 || index >= tableFields.value.length - 1) return;
    const next = [...tableFields.value];
    const current = next[index];
    const nextField = next[index + 1];
    if (!current || !nextField) return;
    next[index] = nextField;
    next[index + 1] = current;
    tableFields.value = next;
  }

  function removeField(index: number): void {
    tableFields.value = tableFields.value.filter((_, fieldIndex) => fieldIndex !== index);
  }

  function updateBoolean(key: BooleanDraftKey, event: Event): void {
    draft[key] = (event.target as HTMLInputElement).checked;
  }

  return {
    activeTab,
    activeTabLabel,
    availableChartTypeOptions,
    componentKind,
    draft,
    error,
    exportTargetOptions,
    hasSortingTab,
    moveFieldDown,
    moveFieldUp,
    removeField,
    saveDraft,
    settingsRows,
    sortableFieldOptions,
    supportsViewActions,
    tableFields,
    updateBoolean,
    visibleTabs
  };
}
