import { computed, onMounted, ref, watch } from 'vue';
import { createFilterDraft } from '../agent-context/planner-filters';
import type { BuilderDataField, BuilderDataTable } from '../types';
import {
  blankFilterForm,
  createFilterFormFromContext,
  filterFormFromDashboardFilter,
  readString,
  type FilterEditorTab,
  type FilterFormState
} from './dashboard-filter-editor-model';
import type {
  DashboardFilterEditorEmit,
  DashboardFilterEditorProps
} from './dashboard-filter-editor-types';
import {
  defaultFieldForFilterType,
  firstFieldName
} from './dashboard-filter-editor-utils';
import { createDashboardFilterPatch } from './dashboard-filter-editor-patch';
import {
  defaultRangeParameterMapping,
  parameterFieldsForDataTable,
  parameterFilterSuggestionForDataTable,
  requiredParametersForDataTable
} from './parameterized-data-sources';
import { useDashboardFilterEditorContext } from './useDashboardFilterEditorContext';
import { useDashboardFilterEditorTargets } from './useDashboardFilterEditorTargets';

export function useDashboardFilterEditor(
  props: Readonly<DashboardFilterEditorProps>,
  emit: DashboardFilterEditorEmit
) {
  const currentTab = ref<FilterEditorTab>('filter');
  const form = ref<FilterFormState>(blankFilterForm());
  const validationMessage = ref('');
  const modalContent = ref<HTMLElement | null>(null);
  const isEditing = computed(() => props.editingFilter !== null);
  const context = useDashboardFilterEditorContext(props, form);
  const targets = useDashboardFilterEditorTargets(props, form, context);

  onMounted(() => { modalContent.value?.focus(); });

  watch(() => props.editingFilter?.id ?? 'new', () => loadForm(), { immediate: true });

  watch(() => form.value.dataModelId, () => {
    const model = context.dataModelById(form.value.dataModelId);
    if (model) {
      form.value.dataSourceId = model.dataSourceId;
      form.value.tableName = model.tableName;
      if (form.value.scope === 'dataModel' && form.value.selectedDataModels.length <= 1) {
        form.value.selectedDataModels = [model.id];
      }
    }
    targets.syncFilterFieldDefaults();
    targets.syncSelectedTargetMappings();
  });

  watch(() => [form.value.tableName, form.value.type], () => {
    targets.syncFilterFieldDefaults();
    targets.syncSelectedTargetMappings();
  });

  watch(() => form.value.selectedDataModels, selectedTargets => {
    for (const targetId of selectedTargets) {
      form.value.targetFieldTypes[targetId] ??= targets.defaultTargetFieldTypeForDataModel(targetId);
      targets.ensureTargetMapping(targetId, 'dataModel');
    }
  }, { deep: true });

  watch(() => form.value.selectedComponents, selectedTargets => {
    for (const targetId of selectedTargets) {
      form.value.componentFieldTypes[targetId] ??= targets.defaultTargetFieldTypeForComponent(targetId);
      targets.ensureTargetMapping(targetId, 'component');
    }
  }, { deep: true });

  function loadForm(): void {
    currentTab.value = 'filter';
    validationMessage.value = '';
    const nextForm = props.editingFilter
      ? filterFormFromDashboardFilter(props.editingFilter)
      : createFilterFormFromContext({
        createDraft: props.createDraft,
        selectedDataSourceId: props.selectedDataSourceId,
        selectedTableId: props.selectedTableId
      });
    form.value = applyDashboardContextDefaults(nextForm);
    applySuggestedTargetDefaults();
    targets.syncSelectedTargetMappings(true);
  }

  function saveFilter(): void {
    validationMessage.value = '';
    if (!form.value.label.trim()) {
      validationMessage.value = 'Please enter a filter name.';
      return;
    }
    if (!form.value.type) {
      validationMessage.value = 'Please select a filter type.';
      return;
    }
    if (form.value.type === 'dropdown' && (!form.value.dataModelId || !form.value.field)) {
      validationMessage.value = 'Please select a data model and filter field.';
      return;
    }
    const targetValidation = targets.validateTargetMappings();
    if (targetValidation) {
      validationMessage.value = targetValidation;
      currentTab.value = 'targets';
      return;
    }
    if (form.value.scope === 'dataModel' && form.value.selectedDataModels.length === 0) {
      validationMessage.value = 'Please select at least one data model target.';
      currentTab.value = 'targets';
      return;
    }
    if (form.value.scope === 'component' && form.value.selectedComponents.length === 0) {
      validationMessage.value = 'Please select at least one component target.';
      currentTab.value = 'targets';
      return;
    }

    const patch = createDashboardFilterPatch({
      createDraft: props.createDraft,
      dataModelById: context.dataModelById,
      editingFilter: props.editingFilter,
      filtersCount: props.filtersCount,
      form: form.value,
      parameterMappingsForSelectedTargets: targets.parameterMappingsForSelectedTargets,
      resolvedDataSourceId,
      resolvedFilterFieldType: targets.resolvedFilterFieldType,
      selectedDataModel: context.selectedDataModel.value,
      targetFieldsForCurrentScope: targets.targetFieldsForCurrentScope
    });
    if (props.editingFilter) {
      emit('update', props.editingFilter.id, patch);
    } else {
      emit('create', patch);
    }
  }

  function onFilterTypeChange(): void {
    if (form.value.type !== 'dropdown') currentTab.value = 'filter';
    targets.syncFilterFieldDefaults();
    targets.syncSelectedTargetMappings(true);
  }

  function onFieldSelectionChange(): void {
    if (form.value.dataModelId && form.value.field) {
      const targetFieldType = form.value.targetFieldTypes[form.value.dataModelId]
        ?? targets.defaultTargetFieldTypeForDataModel(form.value.dataModelId);
      if (targetFieldType === 'column') form.value.dataSourceFieldMappings[form.value.dataModelId] = form.value.field;
    }
  }

  function resolvedDataSourceId(): string {
    if (form.value.dataSourceId) return form.value.dataSourceId;
    if (form.value.scope === 'dataModel') {
      const model = context.dataModelById(form.value.selectedDataModels[0] ?? form.value.dataModelId);
      return model?.dataSourceId ?? '';
    }
    const element = props.dashboardElements.find(item => item.id === form.value.selectedComponents[0]);
    return readString(element?.dataSourceId ?? element?.config?.dataSource) ?? '';
  }

  function applyDashboardContextDefaults(nextForm: FilterFormState): FilterFormState {
    const model = context.dataModelById(nextForm.dataModelId || nextForm.tableName || props.selectedTableId)
      ?? context.dashboardDataModels.value[0]
      ?? context.dataModelById(props.selectedTableId);
    if (!model) return nextForm;
    const dataSourceId = model.dataSourceId;
    const dataModelId = model.id;
    const source = context.dataSourceById(dataSourceId);
    const table = context.tableForDataModel(model);
    const columnFields = context.fieldsForTable(table);
    const parameterFields = parameterFieldsForDataTable(source, table);
    const usesParameters = nextForm.fieldType === 'parameter'
      || nextForm.targetFieldTypes[dataModelId] === 'parameter'
      || (!nextForm.field && requiredParametersForDataTable(source, table).length > 0);
    const fieldType = usesParameters && parameterFields.length > 0 ? 'parameter' : 'column';
    const field = nextForm.type !== 'dropdown'
      ? nextForm.field
      : nextForm.field && columnFields.some(option => option.name === nextForm.field)
      ? nextForm.field
      : firstFieldName(columnFields);
    const selectedDataModels = nextForm.selectedDataModels.length > 0 ? nextForm.selectedDataModels : [dataModelId];
    const selectedDataSources = nextForm.selectedDataSources.length > 0 ? nextForm.selectedDataSources : [dataSourceId];
    const dataSourceFieldMappings = { ...nextForm.dataSourceFieldMappings };
    const targetFieldTypes = { ...nextForm.targetFieldTypes };
    targetFieldTypes[dataModelId] ??= fieldType;
    const targetFieldOptions = targetFieldTypes[dataModelId] === 'parameter' ? parameterFields : columnFields;
    const existingMapping = dataSourceFieldMappings[dataModelId] ?? dataSourceFieldMappings[dataSourceId];
    const legacyParameterField = nextForm.field && parameterFields.some(option => option.name === nextForm.field) ? nextForm.field : '';
    if (!existingMapping || !targetFieldOptions.some(option => option.name === existingMapping)) {
      dataSourceFieldMappings[dataModelId] = targetFieldTypes[dataModelId] === 'parameter'
        ? legacyParameterField || firstFieldName(parameterFields)
        : field;
    } else if (!dataSourceFieldMappings[dataModelId]) {
      dataSourceFieldMappings[dataModelId] = existingMapping;
    }
    const parameterRangeMappings = { ...nextForm.parameterRangeMappings };
    if (targetFieldTypes[dataModelId] === 'parameter' && (nextForm.type === 'dateRange' || nextForm.type === 'periodFilter')) {
      parameterRangeMappings[dataModelId] = parameterRangeMappings[dataModelId] ?? parameterRangeMappings[dataSourceId] ?? defaultRangeParameterMapping(parameterFields);
    }
    return {
      ...nextForm,
      dataSourceFieldMappings,
      dataSourceId,
      dataModelId,
      field,
      fieldType,
      parameterRangeMappings,
      selectedDataModels,
      selectedDataSources,
      tableName: model.tableName || table?.name || props.selectedTableId,
      targetFieldTypes
    };
  }

  function applySuggestedTargetDefaults(): void {
    if (!props.suggestedTargetElementId) return;
    const element = props.dashboardElements.find(item => item.id === props.suggestedTargetElementId);
    if (!element) return;
    const source = context.dataSourceForElement(element);
    const table = context.tableForElement(element, source);
    if (!source || !table) return;
    const tableFields = context.fieldsForTable(table);
    const suggestion = parameterFilterSuggestionForDataTable(source, table);

    form.value.dataSourceId = source.id;
    form.value.dataModelId = table.id || table.name;
    form.value.tableName = table.name;
    if (!isEditing.value) {
      form.value.scope = 'component';
      applyNewSuggestedTargetFields(table, tableFields, suggestion);
    } else if (!form.value.field || !tableFields.some(field => field.name === form.value.field)) {
      form.value.field = defaultFieldForFilterType(table, form.value.type);
    } else if (!form.value.label.trim()) {
      form.value.label = createFilterDraft(table).name;
    }

    if (form.value.scope === 'component') {
      applySuggestedComponentTarget(element.id, suggestion);
      return;
    }
    applySuggestedDataModelTarget(source.id, suggestion);
  }

  function applyNewSuggestedTargetFields(
    table: BuilderDataTable,
    tableFields: BuilderDataField[],
    suggestion: ReturnType<typeof parameterFilterSuggestionForDataTable>
  ): void {
    if (suggestion) {
      form.value.type = suggestion.filterType;
      form.value.label = suggestion.label;
      form.value.field = suggestion.sourceField || defaultFieldForFilterType(table, suggestion.filterType);
      return;
    }
    if (!form.value.field || !tableFields.some(field => field.name === form.value.field)) {
      form.value.field = defaultFieldForFilterType(table, form.value.type);
    }
    if (!form.value.label.trim()) form.value.label = createFilterDraft(table).name;
  }

  function applySuggestedComponentTarget(
    elementId: string,
    suggestion: ReturnType<typeof parameterFilterSuggestionForDataTable>
  ): void {
    if (!form.value.selectedComponents.includes(elementId)) {
      form.value.selectedComponents = [...form.value.selectedComponents, elementId];
    }
    form.value.componentFieldTypes[elementId] ??= targets.defaultTargetFieldTypeForComponent(elementId);
    if (!isEditing.value && suggestion) {
      if (suggestion.rangeMapping) form.value.parameterRangeMappings[elementId] = suggestion.rangeMapping;
      if (suggestion.parameterName) form.value.componentFieldMappings[elementId] = suggestion.parameterName;
    }
    targets.ensureTargetMapping(elementId, 'component', true);
  }

  function applySuggestedDataModelTarget(
    sourceId: string,
    suggestion: ReturnType<typeof parameterFilterSuggestionForDataTable>
  ): void {
    if (!form.value.selectedDataModels.includes(form.value.dataModelId)) {
      form.value.selectedDataModels = [...form.value.selectedDataModels, form.value.dataModelId];
    }
    if (!form.value.selectedDataSources.includes(sourceId)) {
      form.value.selectedDataSources = [...form.value.selectedDataSources, sourceId];
    }
    form.value.targetFieldTypes[form.value.dataModelId] ??= targets.defaultTargetFieldTypeForDataModel(form.value.dataModelId);
    if (!isEditing.value && suggestion) {
      if (suggestion.rangeMapping) form.value.parameterRangeMappings[form.value.dataModelId] = suggestion.rangeMapping;
      if (suggestion.parameterName) form.value.dataSourceFieldMappings[form.value.dataModelId] = suggestion.parameterName;
    }
    targets.ensureTargetMapping(form.value.dataModelId, 'dataModel', true);
  }

  return {
    allAvailableDataModels: context.allAvailableDataModels,
    availableFields: context.availableFields,
    availableTables: context.availableTables,
    canOpenTargets: context.canOpenTargets,
    compatibleComponents: context.compatibleComponents,
    currentTab,
    dashboardDataModels: context.dashboardDataModels,
    fieldLabel: context.fieldLabel,
    form,
    getElementDataSourceName: context.getElementDataSourceName,
    getTargetFieldsForComponent: targets.getTargetFieldsForComponent,
    getTargetFieldsForDataModel: targets.getTargetFieldsForDataModel,
    isEditing,
    isSelectedDataModelFromDashboard: context.isSelectedDataModelFromDashboard,
    modalContent,
    onFieldSelectionChange,
    onFilterTypeChange,
    onTargetFieldTypeChange: targets.onTargetFieldTypeChange,
    requiredParameterLabels: context.requiredParameterLabels,
    saveFilter,
    validationMessage,
    autoSelectMatchingField: targets.autoSelectMatchingField
  };
}
