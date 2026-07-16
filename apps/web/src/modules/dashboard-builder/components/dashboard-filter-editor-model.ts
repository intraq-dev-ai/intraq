import type { DashboardFilter } from '../types';

export type FilterEditorTab = 'filter' | 'targets';
export type TargetScope = 'dataModel' | 'component';
export type TargetFieldType = 'column' | 'parameter';

export interface FilterTypeOption {
  name: string;
  type: 'dropdown' | 'freeText' | 'datePicker' | 'dateRange' | 'periodFilter';
}

export interface TargetDataSource {
  dataSourceId: string;
  id: string;
  name: string;
  sourceName: string;
  tableId: string;
  tableName: string;
  type: string;
}

export interface FilterFormState {
  behavior: 'value' | 'value-name-pair';
  componentFieldMappings: Record<string, string>;
  componentFieldTypes: Record<string, TargetFieldType>;
  dataSourceFieldMappings: Record<string, string>;
  dataSourceId: string;
  dataModelId: string;
  datePickerDisplayMode: 'split-date-time' | 'native';
  dateRangeDisplayMode: 'button' | 'datetime-fields' | 'inline' | 'range-picker';
  dateRangePreset: string;
  defaultDatePreset: string;
  defaultEndDate: string;
  defaultPeriod: string;
  defaultStartDate: string;
  displayField: string;
  displayMode: 'dropdown' | 'list' | 'buttons';
  field: string;
  fieldType: TargetFieldType;
  includeTime: boolean;
  isActive: boolean;
  label: string;
  maxDate: string;
  minDate: string;
  parameterRangeMappings: Record<string, { start: string; end: string }>;
  periodActiveColor: string;
  periodBackgroundColor: string;
  periodDatePickerTheme: 'default' | 'legacy' | 'minimal';
  periodNavigationStyle: 'text' | 'icons';
  periodShowTabIcons: boolean;
  periodTabIcon: string;
  showPeriodBottomDivider: boolean;
  periodDisplayMode: 'segmented' | 'toolbar';
  periodOptionsText: string;
  placeholder: string;
  scope: TargetScope;
  selectedComponents: string[];
  selectedDataModels: string[];
  selectedDataSources: string[];
  selectionMode: 'single' | 'multi';
  placement: 'bar' | 'canvas';
  showRangeNavigation: boolean;
  showTitle: boolean;
  tableName: string;
  targetFieldTypes: Record<string, TargetFieldType>;
  type: '' | FilterTypeOption['type'];
  fiscalStartMonth: number;
  weekStartsOn: number;
}

export const availableFilterTypes: FilterTypeOption[] = [
  { type: 'dropdown', name: 'Dropdown' },
  { type: 'freeText', name: 'Free Text' },
  { type: 'datePicker', name: 'Date Picker' },
  { type: 'dateRange', name: 'Date Range' },
  { type: 'periodFilter', name: 'Period Filter' }
];

export function blankFilterForm(): FilterFormState {
  return {
    behavior: 'value',
    componentFieldMappings: {},
    componentFieldTypes: {},
    dataSourceFieldMappings: {},
    dataSourceId: '',
    dataModelId: '',
    datePickerDisplayMode: 'native',
    dateRangeDisplayMode: 'button',
    dateRangePreset: '',
    defaultDatePreset: '',
    defaultEndDate: '',
    defaultPeriod: 'month',
    defaultStartDate: '',
    displayField: '',
    field: '',
    fieldType: 'column',
    includeTime: false,
    isActive: true,
    label: '',
    maxDate: '',
    minDate: '',
    parameterRangeMappings: {},
    periodActiveColor: '',
    periodBackgroundColor: '',
    periodDatePickerTheme: 'default',
    periodNavigationStyle: 'text',
    periodShowTabIcons: false,
    periodTabIcon: '',
    showPeriodBottomDivider: true,
    periodDisplayMode: 'segmented',
    periodOptionsText: defaultPeriodOptionsText(),
    placeholder: '',
    scope: 'dataModel',
    selectedComponents: [],
    selectedDataModels: [],
    selectedDataSources: [],
    displayMode: 'dropdown',
    selectionMode: 'single',
    placement: 'bar' as const,
    showRangeNavigation: true,
    showTitle: true,
    tableName: '',
    targetFieldTypes: {},
    type: '',
    fiscalStartMonth: 1,
    weekStartsOn: 1
  };
}

export function createFilterFormFromContext(input: {
  createDraft?: { field?: string; label?: string; name?: string; type?: string };
  selectedDataSourceId?: string;
  selectedTableId?: string;
}): FilterFormState {
  const dataSourceId = readString(input.selectedDataSourceId) ?? '';
  const field = readString(input.createDraft?.field) ?? '';
  return {
    ...blankFilterForm(),
    dataSourceId,
    dataModelId: readString(input.selectedTableId) ?? '',
    field,
    label: readString(input.createDraft?.label) ?? readString(input.createDraft?.name) ?? '',
    selectedDataModels: readString(input.selectedTableId) ? [readString(input.selectedTableId) as string] : [],
    selectedDataSources: dataSourceId ? [dataSourceId] : [],
    tableName: readString(input.selectedTableId) ?? '',
    type: normalizeFilterType(input.createDraft?.type)
  };
}

export function filterFormFromDashboardFilter(filter: DashboardFilter): FilterFormState {
  const config = filter.config ?? {};
  const record = filter as unknown as Record<string, unknown>;
  const dataSourceId = readString(config.dataSourceId)
    ?? readString(record.targetDataSourceId)
    ?? readString(config.targetDataSourceId)
    ?? readStringArray(record.targetDataSources ?? config.targetDataSources)[0]
    ?? '';
  const dataSourceFieldMappings = readStringRecord(config.dataSourceFieldMappings);
  const componentFieldMappings = readStringRecord(config.componentFieldMappings);
  const parameterFieldMappings = readStringRecord(config.parameterMappings);
  const selectedDataSources = readStringArray(record.targetDataSources ?? config.targetDataSources ?? config.selectedDataSources);
  const selectedDataModels = readStringArray(config.targetDataModels ?? config.selectedDataModels ?? config.targetTables ?? config.targetTableIds ?? config.targetTableNames);
  const targetTable = readString(config.targetTable ?? config.targetTableId ?? config.targetTableName);
  const tableName = readString(config.tableName) ?? targetTable ?? '';
  const dataModelId = selectedDataModels[0] ?? targetTable ?? tableName;
  const selectedComponents = readStringArray(record.targetComponents ?? record.targetElementIds ?? config.targetComponents ?? config.selectedComponents);
  for (const [targetId, parameterField] of Object.entries(parameterFieldMappings)) {
    if (selectedComponents.includes(targetId)) {
      componentFieldMappings[targetId] ??= parameterField;
    } else {
      dataSourceFieldMappings[targetId] ??= parameterField;
    }
  }
  const field = filter.field
    || readString(config.field)
    || readString(config.dataSourceFieldMapping)
    || Object.values(dataSourceFieldMappings)[0]
    || Object.values(componentFieldMappings)[0]
    || '';
  return {
    ...blankFilterForm(),
    behavior: readString(config.behavior) === 'value-name-pair' ? 'value-name-pair' : 'value',
    componentFieldMappings,
    componentFieldTypes: readTargetFieldTypes(config.componentFieldTypes),
    dataSourceFieldMappings,
    dataSourceId,
    dataModelId,
    datePickerDisplayMode: normalizeDatePickerDisplayMode(config.datePickerDisplayMode ?? config.datePickerStyle ?? config.datePickerTheme),
    dateRangeDisplayMode: normalizeDateRangeDisplayMode(config.dateRangeDisplayMode ?? config.rangeDisplayMode ?? config.dateRangeMode),
    dateRangePreset: readString(config.dateRangePreset) ?? '',
    defaultDatePreset: readString(config.defaultDatePreset) ?? '',
    defaultEndDate: readString(config.defaultEndDate) ?? '',
    defaultPeriod: readString(config.defaultPeriod) ?? readString(config.period) ?? 'month',
    defaultStartDate: readString(config.defaultStartDate) ?? '',
    displayField: readString(config.displayField) ?? '',
    field,
    fieldType: readString(config.fieldType) === 'parameter' ? 'parameter' : 'column',
    includeTime: config.includeTime === true,
    isActive: filter.isActive !== false,
    label: readString(config.label) ?? filter.name,
    maxDate: readString(config.maxDate) ?? '',
    minDate: readString(config.minDate) ?? '',
    parameterRangeMappings: readRangeMappings(config.parameterMappings),
    periodActiveColor: readString(config.periodActiveColor ?? config.periodAccentColor) ?? '',
    periodBackgroundColor: readString(config.periodBackgroundColor ?? config.backgroundColor ?? config.background) ?? '',
    periodDatePickerTheme: normalizePeriodDatePickerTheme(config.periodDatePickerTheme ?? config.datePickerTheme ?? config.periodDateInputTheme),
    periodNavigationStyle: normalizePeriodNavigationStyle(config.periodNavigationStyle ?? config.periodToolbarNavigationStyle),
    periodShowTabIcons: config.periodShowTabIcons === true || config.showPeriodTabIcons === true || config.periodTabIconsEnabled === true,
    periodTabIcon: readString(config.periodTabIcon ?? config.periodIcon) ?? '',
    showPeriodBottomDivider: config.showPeriodBottomDivider !== false,
    periodDisplayMode: normalizePeriodDisplayMode(config.periodDisplayMode),
    periodOptionsText: periodOptionsTextFromConfig(config.periodOptions),
    placeholder: readString(config.placeholder) ?? '',
    scope: selectedComponents.length > 0 && selectedDataModels.length === 0 ? 'component' : readString(config.scope) === 'component' ? 'component' : 'dataModel',
    selectedComponents,
    selectedDataModels: selectedDataModels.length > 0 ? selectedDataModels : dataModelId ? [dataModelId] : [],
    selectedDataSources: selectedDataSources.length > 0 ? selectedDataSources : dataSourceId ? [dataSourceId] : [],
    displayMode: normalizeDisplayMode(config.displayMode),
    selectionMode: normalizeSelectionMode(config.selectionMode, filter),
    placement: filter.placement === 'canvas' ? 'canvas' : 'bar',
    showRangeNavigation: config.showRangeNavigation !== false,
    showTitle: config.showTitle !== false,
    tableName,
    targetFieldTypes: readTargetFieldTypes(config.targetFieldTypes),
    type: legacyFilterType(filter),
    fiscalStartMonth: readNumber(config.fiscalStartMonth, 1),
    weekStartsOn: readNumber(config.weekStartsOn, 1)
  };
}

export function legacyFilterType(filter: DashboardFilter): FilterFormState['type'] {
  return normalizeFilterType(readString(filter.config?.inputType) ?? readString(filter.config?.filterType) ?? readString(filter.config?.type) ?? filter.type);
}

function normalizeFilterType(value: unknown): FilterFormState['type'] {
  const raw = readString(value)?.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() ?? '';
  if (['freetext', 'free-text', 'free_text', 'text'].includes(raw)) return 'freeText';
  if (['datepicker', 'date-picker', 'date_picker', 'date'].includes(raw)) return 'datePicker';
  if (['daterange', 'date-range', 'date_range'].includes(raw)) return 'dateRange';
  if (['periodfilter', 'period-filter', 'period_filter', 'period'].includes(raw)) return 'periodFilter';
  if (raw === 'dropdown' || raw === 'single-select' || raw === 'select') return 'dropdown';
  return raw ? 'dropdown' : '';
}

function normalizeDisplayMode(value: unknown): FilterFormState['displayMode'] {
  const raw = readString(value)?.toLowerCase() ?? '';
  if (raw === 'list' || raw === 'scroll-list' || raw === 'slicer') return 'list';
  if (raw === 'buttons' || raw === 'button') return 'buttons';
  return 'dropdown';
}

function normalizePeriodDisplayMode(value: unknown): FilterFormState['periodDisplayMode'] {
  const raw = readString(value)?.toLowerCase() ?? '';
  return raw === 'toolbar' || raw === 'backend-toolbar' ? 'toolbar' : 'segmented';
}

function normalizePeriodNavigationStyle(value: unknown): FilterFormState['periodNavigationStyle'] {
  const raw = readString(value)?.toLowerCase() ?? '';
  return raw === 'icon' || raw === 'icons' || raw === 'compact' ? 'icons' : 'text';
}

function normalizePeriodDatePickerTheme(value: unknown): FilterFormState['periodDatePickerTheme'] {
  const raw = readString(value)?.toLowerCase() ?? '';
  if (raw === 'legacy' || raw === 'classic' || raw === 'report') return 'legacy';
  if (raw === 'minimal' || raw === 'plain' || raw === 'underline') return 'minimal';
  return 'default';
}

function normalizeDatePickerDisplayMode(value: unknown): FilterFormState['datePickerDisplayMode'] {
  const raw = readString(value)?.toLowerCase() ?? '';
  if (raw === 'split-date-time' || raw === 'separate-date-time' || raw === 'datetime-fields' || raw === 'date-time-fields' || raw === 'kendo') return 'split-date-time';
  return 'native';
}

function normalizeDateRangeDisplayMode(value: unknown): FilterFormState['dateRangeDisplayMode'] {
  const raw = readString(value)?.toLowerCase() ?? '';
  if (raw === 'inline' || raw === 'split-inline') return 'inline';
  if (raw === 'datetime-fields' || raw === 'date-time-fields' || raw === 'split-date-time' || raw === 'datetime') return 'datetime-fields';
  if (raw === 'range-picker' || raw === 'range' || raw === 'split') return 'range-picker';
  return 'button';
}

function normalizeSelectionMode(value: unknown, filter: DashboardFilter): FilterFormState['selectionMode'] {
  const raw = readString(value)?.toLowerCase() ?? '';
  if (raw === 'multi' || raw === 'multiple') return 'multi';
  if (raw === 'single') return 'single';
  // Backward compat: infer from inputType / operator
  const inputType = readString(filter.config?.inputType) ?? readString(filter.config?.filterType) ?? '';
  if (['multi-select', 'multiselect', 'multi_select'].includes(inputType) || filter.operator === 'in') return 'multi';
  return 'single';
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function readTargetFieldTypes(value: unknown): Record<string, TargetFieldType> {
  return Object.fromEntries(Object.entries(readStringRecord(value)).map(([key, fieldType]) => [key, fieldType === 'parameter' ? 'parameter' : 'column']));
}

function readRangeMappings(value: unknown): Record<string, { start: string; end: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, mapping]) => {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return [];
    const record = mapping as Record<string, unknown>;
    return [[key, { start: readString(record.start) ?? '', end: readString(record.end) ?? '' }]];
  }));
}

function defaultPeriodOptionsText(): string {
  return [
    'day|Day|day|0|Hourly',
    'week|Week|week|1|Daily',
    'month|Month|month|2|Daily',
    'range|Range|range|range|Daily'
  ].join('\n');
}

function periodOptionsTextFromConfig(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return defaultPeriodOptionsText();
  const rows = value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const id = readString(record.id ?? record.value ?? record.key);
    const label = readString(record.label ?? record.name) ?? id;
    const unit = readString(record.unit ?? record.type ?? record.period) ?? id;
    if (!id || !label || !unit) return [];
    return [[id, label, unit, record.rangeType ?? '', readString(record.rangeFrequency) ?? '', readString(record.icon) ?? ''].map(String).join('|').replace(/\|+$/, '')];
  });
  return rows.length > 0 ? rows.join('\n') : defaultPeriodOptionsText();
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
