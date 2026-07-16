import type { FilterDraft } from '../agent-context/planner-filters';
import type {
  BuilderDataField,
  DashboardFilter,
  DashboardFilterCreatePatch
} from '../types';
import type {
  FilterFormState,
  TargetDataSource,
  TargetFieldType
} from './dashboard-filter-editor-model';
import { readString } from './dashboard-filter-editor-model';
import {
  isRecord,
  parsePeriodOptionsText,
  uniqueStrings
} from './dashboard-filter-editor-utils';
import { buildPeriodFilterValue } from './period-filter-values';

interface CreateDashboardFilterPatchInput {
  createDraft: FilterDraft;
  dataModelById: (id: string | undefined) => TargetDataSource | undefined;
  editingFilter: DashboardFilter | null;
  filtersCount: number;
  form: FilterFormState;
  parameterMappingsForSelectedTargets: () => Record<string, string | Record<string, string>>;
  resolvedDataSourceId: () => string;
  resolvedFilterFieldType: (firstTarget: string) => TargetFieldType;
  selectedDataModel: TargetDataSource | undefined;
  targetFieldsForCurrentScope: (targetId: string) => BuilderDataField[];
}

export function createDashboardFilterPatch(input: CreateDashboardFilterPatchInput): DashboardFilterCreatePatch {
  const form = input.form;
  const selectedTargets = form.scope === 'dataModel' ? form.selectedDataModels : form.selectedComponents;
  const fieldMappings = form.scope === 'dataModel' ? form.dataSourceFieldMappings : form.componentFieldMappings;
  const parameterMappings = input.parameterMappingsForSelectedTargets();
  const firstTarget = selectedTargets[0] ?? '';
  const resolvedField = resolvedFilterField(firstTarget, fieldMappings, parameterMappings, form, input.createDraft);
  const dataSourceFieldMappings = { ...form.dataSourceFieldMappings };
  const componentFieldMappings = { ...form.componentFieldMappings };
  const filterValue = defaultFilterValue(form);
  const filterOperator = defaultFilterOperator(form);
  const resolvedFieldType = input.resolvedFilterFieldType(firstTarget);
  const selectedParameter = resolvedFieldType === 'parameter'
    ? input.targetFieldsForCurrentScope(firstTarget).find(field => field.name === resolvedField)
    : undefined;
  const isParameter = Object.keys(parameterMappings).length > 0;
  const selectedTargetModels = form.scope === 'dataModel'
    ? form.selectedDataModels.flatMap(id => {
      const model = input.dataModelById(id);
      return model ? [model] : [];
    })
    : [];
  const primaryModel = form.scope === 'dataModel'
    ? selectedTargetModels[0] ?? input.selectedDataModel
    : input.selectedDataModel;
  const tableName = form.tableName || primaryModel?.tableName || '';
  const dataModelId = primaryModel?.id || form.dataModelId || tableName;
  const targetTableIds = uniqueStrings(selectedTargetModels.map(model => model.tableId || model.id));
  const targetTableNames = uniqueStrings(selectedTargetModels.map(model => model.tableName));
  const targetTables = uniqueStrings(selectedTargetModels.flatMap(model => [model.id, model.tableId, model.tableName]));
  const targetDataSources = uniqueStrings([
    ...form.selectedDataSources,
    ...selectedTargetModels.map(model => model.dataSourceId)
  ]);
  const enhancedFieldMappings = enhancedFieldMappingsForSave(dataSourceFieldMappings, componentFieldMappings, input.dataModelById);
  return {
    name: form.label.trim(),
    field: resolvedField,
    operator: filterOperator,
    value: filterValue,
    type: form.type,
    placement: form.placement,
    isActive: form.isActive,
    order: input.editingFilter?.order ?? input.filtersCount,
    config: {
      type: form.type,
      inputType: form.type === 'dropdown'
        ? (form.selectionMode === 'multi' ? 'multi-select' : 'single-select')
        : form.type,
      filterType: form.type === 'dropdown'
        ? (form.selectionMode === 'multi' ? 'multi-select' : 'single-select')
        : form.type,
      label: form.label.trim(),
      operator: filterOperator,
      value: filterValue,
      defaultValue: filterValue,
      behavior: form.behavior,
      dataSourceId: input.resolvedDataSourceId(),
      dataModelId,
      tableName,
      fieldType: resolvedFieldType,
      displayField: form.displayField,
      options: [],
      displayMode: form.displayMode,
      selectionMode: form.selectionMode,
      placeholder: form.placeholder,
      minDate: form.minDate,
      maxDate: form.maxDate,
      includeTime: form.includeTime,
      datePickerDisplayMode: form.datePickerDisplayMode === 'native' ? undefined : form.datePickerDisplayMode,
      dateRangeDisplayMode: form.dateRangeDisplayMode === 'button' ? undefined : form.dateRangeDisplayMode,
      showRangeNavigation: form.showRangeNavigation,
      showTitle: form.showTitle,
      dateRangePreset: form.dateRangePreset,
      defaultPeriod: form.defaultPeriod,
      fiscalStartMonth: form.fiscalStartMonth,
      periodActiveColor: form.periodActiveColor,
      periodBackgroundColor: form.periodBackgroundColor,
      periodDatePickerTheme: form.periodDatePickerTheme,
      periodNavigationStyle: form.periodNavigationStyle,
      periodShowTabIcons: form.periodShowTabIcons,
      periodTabIcon: form.periodTabIcon,
      showPeriodBottomDivider: form.showPeriodBottomDivider,
      periodDisplayMode: form.periodDisplayMode,
      periodOptions: parsePeriodOptionsText(form.periodOptionsText),
      selectedDate: form.type === 'periodFilter' && isRecord(filterValue) ? readString(filterValue.selectedDate) : undefined,
      defaultStartDate: form.defaultStartDate,
      defaultEndDate: form.defaultEndDate,
      defaultDatePreset: form.defaultDatePreset,
      weekStartsOn: form.weekStartsOn,
      scope: form.scope,
      targetElements: [],
      additionalComponents: [],
      targetComponent: '',
      fieldMappings: {},
      dataSourceFieldMapping: resolvedField,
      dataSourceFieldMappings,
      componentFieldMappings,
      parameterMappings,
      targetFieldTypes: { ...form.targetFieldTypes },
      componentFieldTypes: { ...form.componentFieldTypes },
      crossFilterDataSources: [],
      selectedDataModels: [...form.selectedDataModels],
      targetDataModels: [...form.selectedDataModels],
      targetDataSources,
      targetMatchMode: 'any',
      targetTable: form.scope === 'dataModel' ? targetTables[0] : undefined,
      targetTableId: form.scope === 'dataModel' ? targetTableIds[0] : undefined,
      targetTableName: form.scope === 'dataModel' ? targetTableNames[0] : undefined,
      targetTableIds,
      targetTableNames,
      targetTables,
      targetComponents: [...form.selectedComponents],
      enhancedFieldMappings,
      isParameter,
      parameterConfig: selectedParameter?.parameterConfig ?? null
    }
  };
}

function defaultFilterOperator(form: FilterFormState): string {
  if (form.type === 'periodFilter') return 'period';
  if (form.type === 'dateRange') return form.dateRangePreset === 'custom' ? 'between' : 'last';
  if (form.type === 'datePicker') return 'equals';
  if (form.type === 'freeText') return 'contains';
  if (form.type === 'dropdown' && form.selectionMode === 'multi') return 'in';
  return 'equals';
}

function defaultFilterValue(form: FilterFormState): unknown {
  if (form.type === 'periodFilter') {
    const selectedDate = form.defaultStartDate || new Date().toISOString().slice(0, 10);
    return buildPeriodFilterValue(form.defaultPeriod || 'month', selectedDate, {
      defaultPeriod: form.defaultPeriod || 'month',
      fiscalStartMonth: form.fiscalStartMonth,
      includeTime: form.includeTime,
      periodOptions: parsePeriodOptionsText(form.periodOptionsText),
      weekStartsOn: form.weekStartsOn
    });
  }
  if (form.type === 'dateRange') {
    if (form.dateRangePreset === 'custom') return [form.defaultStartDate, form.defaultEndDate].filter(Boolean);
    return dateRangePresetValue(form.dateRangePreset);
  }
  if (form.type === 'datePicker') return form.defaultDatePreset || 'all';
  if (form.type === 'freeText') return '';
  return 'all';
}

function dateRangePresetValue(preset: string): string {
  const presetDays: Record<string, string> = {
    today: '1 days',
    yesterday: '1 days',
    last_7_days: '7 days',
    last_week: '7 days',
    this_week: '7 days',
    last_30_days: '30 days',
    this_month: '30 days',
    last_month: '30 days',
    last_90_days: '90 days',
    this_quarter: '90 days',
    last_quarter: '90 days',
    this_year: '365 days',
    last_year: '365 days'
  };
  return presetDays[preset] ?? '30 days';
}

function resolvedFilterField(
  firstTarget: string,
  fieldMappings: Record<string, string>,
  parameterMappings: Record<string, string | Record<string, string>>,
  form: FilterFormState,
  createDraft: FilterDraft
): string {
  const mappedParameter = parameterMappings[firstTarget];
  if (typeof mappedParameter === 'string') return mappedParameter;
  if (mappedParameter?.start) return mappedParameter.start;
  return fieldMappings[firstTarget] || form.field || createDraft.field || '';
}

function enhancedFieldMappingsForSave(
  dataModelFieldMappings: Record<string, string>,
  componentFieldMappings: Record<string, string>,
  dataModelById: (id: string | undefined) => TargetDataSource | undefined
): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const [targetId, field] of Object.entries(dataModelFieldMappings)) {
    if (!field) continue;
    entries.push([targetId, field]);
    const model = dataModelById(targetId);
    if (!model) continue;
    if (model.tableId) entries.push([model.tableId, field]);
    if (model.tableName) entries.push([model.tableName, field]);
  }
  for (const [targetId, field] of Object.entries(componentFieldMappings)) {
    if (field) entries.push([targetId, field]);
  }
  return Object.fromEntries(entries);
}
