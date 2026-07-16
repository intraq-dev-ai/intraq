import type { Ref } from 'vue';
import type { BuilderDataField } from '../types';
import type {
  FilterFormState,
  TargetFieldType,
  TargetScope
} from './dashboard-filter-editor-model';
import type { DashboardFilterEditorProps } from './dashboard-filter-editor-types';
import {
  defaultFieldForFilterType,
  firstFieldName
} from './dashboard-filter-editor-utils';
import type { DashboardFilterEditorContext } from './useDashboardFilterEditorContext';
import {
  defaultPeriodParameterMapping,
  defaultRangeParameterMapping,
  parameterFieldsForDataTable,
  requiredParametersForDataTable
} from './parameterized-data-sources';

export interface DashboardFilterEditorTargets {
  autoSelectMatchingField: (targetId: string, targetType: TargetScope) => void;
  defaultFieldForFilterType: typeof defaultFieldForFilterType;
  defaultTargetFieldTypeForComponent: (componentId: string) => TargetFieldType;
  defaultTargetFieldTypeForDataModel: (dataModelId: string) => TargetFieldType;
  ensureTargetMapping: (targetId: string, targetType: TargetScope, force?: boolean) => void;
  getTargetFieldsForComponent: (componentId: string) => BuilderDataField[];
  getTargetFieldsForDataModel: (dataModelId: string) => BuilderDataField[];
  onTargetFieldTypeChange: (targetId: string, targetType: TargetScope) => void;
  parameterMappingsForSelectedTargets: () => Record<string, string | Record<string, string>>;
  resolvedFilterFieldType: (firstTarget: string) => TargetFieldType;
  syncFilterFieldDefaults: () => void;
  syncSelectedTargetMappings: (force?: boolean) => void;
  targetFieldsForCurrentScope: (targetId: string) => BuilderDataField[];
  validateTargetMappings: () => string;
}

export function useDashboardFilterEditorTargets(
  props: Readonly<DashboardFilterEditorProps>,
  form: Ref<FilterFormState>,
  context: DashboardFilterEditorContext
): DashboardFilterEditorTargets {
  function getTargetFieldsForDataModel(dataModelId: string): BuilderDataField[] {
    const fieldType = form.value.targetFieldTypes[dataModelId] ?? defaultTargetFieldTypeForDataModel(dataModelId);
    const model = context.dataModelById(dataModelId);
    const source = context.dataSourceById(model?.dataSourceId ?? '');
    const table = context.tableForDataModel(model);
    return fieldType === 'parameter' ? parameterFieldsForDataTable(source, table) : context.fieldsForTable(table);
  }

  function getTargetFieldsForComponent(componentId: string): BuilderDataField[] {
    const element = props.dashboardElements.find(item => item.id === componentId);
    const fieldType = form.value.componentFieldTypes[componentId] ?? defaultTargetFieldTypeForComponent(componentId);
    if (!element) return [];
    const source = context.dataSourceForElement(element);
    const table = context.tableForElement(element, source);
    return fieldType === 'parameter' ? parameterFieldsForDataTable(source, table) : context.fieldsForTable(table);
  }

  function syncFilterFieldDefaults(): void {
    if (form.value.type !== 'dropdown') return;
    const fields = context.availableFields.value;
    if (form.value.field && fields.some(field => field.name === form.value.field)) return;
    form.value.field = firstFieldName(fields);
  }

  function syncSelectedTargetMappings(force = false): void {
    for (const targetId of form.value.selectedDataModels) ensureTargetMapping(targetId, 'dataModel', force);
    for (const targetId of form.value.selectedComponents) ensureTargetMapping(targetId, 'component', force);
  }

  function ensureTargetMapping(targetId: string, targetType: TargetScope, force = false): void {
    const fields = targetType === 'dataModel' ? getTargetFieldsForDataModel(targetId) : getTargetFieldsForComponent(targetId);
    const mapping = targetType === 'dataModel' ? form.value.dataSourceFieldMappings : form.value.componentFieldMappings;
    const current = mapping[targetId] ?? '';
    const preferredField = form.value.field || defaultFieldNameForTarget(targetId, targetType);
    const fallback = fields.find(field => field.name === preferredField) ?? fields[0];
    if (!fallback) return;
    if (force || !current || !fields.some(field => field.name === current)) mapping[targetId] = fallback.name;
    const fieldType = targetType === 'dataModel'
      ? form.value.targetFieldTypes[targetId]
      : form.value.componentFieldTypes[targetId];
    if (fieldType === 'parameter' && (form.value.type === 'dateRange' || form.value.type === 'periodFilter')) ensureRangeMapping(targetId, fields);
  }

  function defaultFieldNameForTarget(targetId: string, targetType: TargetScope): string {
    if (targetType === 'dataModel') return defaultFieldForFilterType(context.tableForDataModel(context.dataModelById(targetId)), form.value.type);
    const element = props.dashboardElements.find(item => item.id === targetId);
    return defaultFieldForFilterType(element ? context.tableForElement(element, context.dataSourceForElement(element)) : undefined, form.value.type);
  }

  function ensureRangeMapping(targetId: string, fields: BuilderDataField[]): void {
    if (!targetId) return;
    const current = form.value.parameterRangeMappings[targetId];
    const fieldNames = new Set(fields.map(field => field.name));
    if (current && fieldNames.has(current.start) && fieldNames.has(current.end)) return;
    form.value.parameterRangeMappings[targetId] = defaultRangeParameterMapping(fields);
  }

  function validateTargetMappings(): string {
    const targets = form.value.scope === 'dataModel' ? form.value.selectedDataModels : form.value.selectedComponents;
    for (const targetId of targets) {
      const fieldType = form.value.scope === 'dataModel'
        ? form.value.targetFieldTypes[targetId]
        : form.value.componentFieldTypes[targetId];
      const mapping = form.value.scope === 'dataModel'
        ? form.value.dataSourceFieldMappings[targetId]
        : form.value.componentFieldMappings[targetId];
      const fields = form.value.scope === 'dataModel' ? getTargetFieldsForDataModel(targetId) : getTargetFieldsForComponent(targetId);
      if (fieldType !== 'parameter') continue;
      if (fields.length === 0) return 'The selected target does not expose SQL parameters.';
      if (form.value.type === 'dateRange' || form.value.type === 'periodFilter') {
        const range = form.value.parameterRangeMappings[targetId];
        if (!range?.start || !range.end) return 'Select the start and end SQL parameters for the period filter.';
        continue;
      }
      if (!mapping) return 'Select the SQL parameter that this filter should control.';
    }
    for (const targetId of targets) {
      const fieldType = form.value.scope === 'dataModel'
        ? form.value.targetFieldTypes[targetId]
        : form.value.componentFieldTypes[targetId];
      if (fieldType === 'parameter' && (form.value.type === 'dateRange' || form.value.type === 'periodFilter')) continue;
      const mapping = form.value.scope === 'dataModel'
        ? form.value.dataSourceFieldMappings[targetId]
        : form.value.componentFieldMappings[targetId];
      if (!mapping) return 'Select the target field this filter should control.';
    }
    return '';
  }

  function parameterMappingsForSelectedTargets(): Record<string, string | Record<string, string>> {
    const targets = form.value.scope === 'dataModel' ? form.value.selectedDataModels : form.value.selectedComponents;
    const entries: Array<[string, string | Record<string, string>]> = [];
    for (const targetId of targets) {
      const fieldType = form.value.scope === 'dataModel'
        ? form.value.targetFieldTypes[targetId]
        : form.value.componentFieldTypes[targetId];
      if (fieldType !== 'parameter') continue;
      if (form.value.type === 'dateRange' || form.value.type === 'periodFilter') {
        const fields = form.value.scope === 'dataModel' ? getTargetFieldsForDataModel(targetId) : getTargetFieldsForComponent(targetId);
        const range = form.value.parameterRangeMappings[targetId] ?? defaultRangeParameterMapping(fields);
        if (range.start && range.end) {
          const mapping = form.value.type === 'periodFilter'
            ? { ...defaultPeriodParameterMapping(fields), start: range.start, end: range.end }
            : { start: range.start, end: range.end };
          entries.push([targetId, mapping]);
        }
        continue;
      }
      const mapping = form.value.scope === 'dataModel'
        ? form.value.dataSourceFieldMappings[targetId]
        : form.value.componentFieldMappings[targetId];
      if (mapping) entries.push([targetId, mapping]);
    }
    return Object.fromEntries(entries);
  }

  function targetFieldsForCurrentScope(targetId: string): BuilderDataField[] {
    if (!targetId) return [];
    return form.value.scope === 'dataModel' ? getTargetFieldsForDataModel(targetId) : getTargetFieldsForComponent(targetId);
  }

  function defaultTargetFieldTypeForDataModel(dataModelId: string): TargetFieldType {
    const model = context.dataModelById(dataModelId);
    const source = context.dataSourceById(model?.dataSourceId ?? '');
    const table = context.tableForDataModel(model);
    return requiredParametersForDataTable(source, table).length > 0 ? 'parameter' : 'column';
  }

  function defaultTargetFieldTypeForComponent(componentId: string): TargetFieldType {
    const element = props.dashboardElements.find(item => item.id === componentId);
    if (!element) return 'column';
    const source = context.dataSourceForElement(element);
    const table = context.tableForElement(element, source);
    return requiredParametersForDataTable(source, table).length > 0 ? 'parameter' : 'column';
  }

  function resolvedFilterFieldType(firstTarget: string): TargetFieldType {
    if (!firstTarget) return 'column';
    return form.value.scope === 'dataModel'
      ? form.value.targetFieldTypes[firstTarget] ?? defaultTargetFieldTypeForDataModel(firstTarget)
      : form.value.componentFieldTypes[firstTarget] ?? defaultTargetFieldTypeForComponent(firstTarget);
  }

  function autoSelectMatchingField(targetId: string, targetType: TargetScope): void {
    ensureTargetMapping(targetId, targetType);
  }

  function onTargetFieldTypeChange(targetId: string, targetType: TargetScope): void {
    ensureTargetMapping(targetId, targetType, true);
  }

  return {
    autoSelectMatchingField,
    defaultFieldForFilterType,
    defaultTargetFieldTypeForComponent,
    defaultTargetFieldTypeForDataModel,
    ensureTargetMapping,
    getTargetFieldsForComponent,
    getTargetFieldsForDataModel,
    onTargetFieldTypeChange,
    parameterMappingsForSelectedTargets,
    resolvedFilterFieldType,
    syncFilterFieldDefaults,
    syncSelectedTargetMappings,
    targetFieldsForCurrentScope,
    validateTargetMappings
  };
}
