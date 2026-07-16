import type {
  BuilderDataField,
  BuilderDataParameter,
  BuilderDataSource,
  BuilderDataTable,
  DashboardElement,
  DashboardFilter
} from '../types';

export interface ParameterBindingContext {
  aliases: Set<string>;
  parameters: BuilderDataParameter[];
  source?: BuilderDataSource;
  table?: BuilderDataTable;
}

export interface ParameterFilterSuggestion {
  filterType: 'datePicker' | 'dateRange' | 'dropdown';
  label: string;
  parameterName?: string;
  rangeMapping?: { start: string; end: string };
  sourceField: string;
}

export interface ParameterAutoFilterSuggestion {
  filterType: 'datePicker' | 'dropdown';
  label: string;
  parameter: BuilderDataParameter;
  sourceField: string;
}

export function parameterFieldsForDataTable(
  source: BuilderDataSource | undefined,
  table: BuilderDataTable | undefined
): BuilderDataField[] {
  return parametersForDataTable(source, table).map(parameterToField);
}

export function parametersForDataTable(
  source: BuilderDataSource | undefined,
  table: BuilderDataTable | undefined
): BuilderDataParameter[] {
  return dedupeParameters([
    ...(source?.parameters ?? []),
    ...(source?.settings?.parameters ?? []),
    ...(table?.parameters ?? []),
    ...(table?.settings?.parameters ?? []),
    ...(table?.dictionary?.parameters ?? [])
  ]);
}

export function requiredParametersForDataTable(
  source: BuilderDataSource | undefined,
  table: BuilderDataTable | undefined
): BuilderDataParameter[] {
  return parametersForDataTable(source, table).filter(parameter => parameter.required === true);
}

export function parameterDisplayName(parameter: BuilderDataParameter): string {
  return parameter.label || parameter.description || parameter.name;
}

export function defaultRangeParameterMapping(fields: BuilderDataField[]): { start: string; end: string } {
  const start = fields.find(field => field.dateRole?.toLowerCase() === 'start')
    ?? fields.find(field => /(^|_)(from|start)(_|$)/i.test(field.name))
    ?? fields[0];
  const end = fields.find(field => field.dateRole?.toLowerCase() === 'end')
    ?? fields.find(field => /(^|_)(to|end|as_of)(_|$)/i.test(field.name))
    ?? fields.find(field => field.name !== start?.name)
    ?? start;
  return { start: start?.name ?? '', end: end?.name ?? '' };
}

export function defaultPeriodParameterMapping(fields: BuilderDataField[]): Record<string, string> {
  const range = defaultRangeParameterMapping(fields);
  const entries: Array<[string, string]> = [
    ['start', range.start],
    ['end', range.end],
    ['selectedDate', fieldByAliases(fields, ['SelectedDate', 'selectedDate', 'ReportDate', 'date', range.start])],
    ['selectedDay', fieldByAliases(fields, ['selectedDay', 'SelectedDay', 'businessDate', 'dateOnly', range.start])],
    ['startDateOnly', fieldByAliases(fields, ['fromDateOnly', 'startDateOnly', 'PeriodOneStart', range.start])],
    ['endDateOnly', fieldByAliases(fields, ['toDateOnly', 'endDateOnly', 'PeriodOneEnd', range.end])],
    ['rangeType', fieldByAliases(fields, ['RangeType', 'rangeType'])],
    ['rangeTypeText', fieldByAliases(fields, ['rangeTypeText', 'RangeTypeText'])],
    ['rangeFrequency', fieldByAliases(fields, ['RangeFrequency', 'rangeFrequency'])]
  ];
  return Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry[1])));
}

export function parameterFilterSuggestionForDataTable(
  source: BuilderDataSource | undefined,
  table: BuilderDataTable | undefined
): ParameterFilterSuggestion | null {
  return parameterFilterSuggestionsForDataTable(source, table)[0] ?? null;
}

export function parameterFilterSuggestionsForDataTable(
  source: BuilderDataSource | undefined,
  table: BuilderDataTable | undefined
): ParameterFilterSuggestion[] {
  const requiredParameters = requiredParametersForDataTable(source, table);
  const tableFields = table?.fields ?? [];
  return requiredParameters
    .map(parameter => suggestionForParameter(tableFields, parameter))
    .filter((suggestion): suggestion is ParameterFilterSuggestion => suggestion !== null);
}

export function autoCreateParameterFiltersForElement(
  element: DashboardElement,
  dataSources: BuilderDataSource[],
  filters: DashboardFilter[]
): ParameterAutoFilterSuggestion[] {
  if (isNonDataElement(element)) return [];
  const context = resolveElementParameterContext(element, dataSources);
  const tableFields = context.table?.fields ?? [];
  return missingRequiredParametersForElement(element, dataSources, filters)
    .map(parameter => autoCreateSuggestionForParameter(tableFields, parameter))
    .filter((suggestion): suggestion is ParameterAutoFilterSuggestion => suggestion !== null);
}

export function resolveElementParameterContext(
  element: DashboardElement,
  dataSources: BuilderDataSource[]
): ParameterBindingContext {
  const sourceKeys = normalizedValues(elementSourceValues(element));
  const tableKeys = normalizedValues(elementTableValues(element));
  const source = dataSources.find(candidate => sourceKeys.has(normalizeKey(candidate.id))
    || sourceKeys.has(normalizeKey(candidate.name))
    || candidate.tables.some(table => sourceKeys.has(normalizeKey(table.id)) || sourceKeys.has(normalizeKey(table.name)))
    || candidate.tables.some(table => tableKeys.has(normalizeKey(table.id)) || tableKeys.has(normalizeKey(table.name))));
  const table = source?.tables.find(candidate => tableKeys.has(normalizeKey(candidate.id)) || tableKeys.has(normalizeKey(candidate.name)))
    ?? source?.tables.find(candidate => sourceKeys.has(normalizeKey(candidate.id)) || sourceKeys.has(normalizeKey(candidate.name)))
    ?? source?.tables.find(candidate => candidate.isSelected)
    ?? source?.tables[0];
  const aliases = new Set([
    ...sourceKeys,
    ...tableKeys,
    ...normalizedValues([element.id, element.name, source?.id, source?.name, table?.id, table?.name])
  ]);
  return { aliases, parameters: parametersForDataTable(source, table), ...(source ? { source } : {}), ...(table ? { table } : {}) };
}

export function missingRequiredParametersForElement(
  element: DashboardElement,
  dataSources: BuilderDataSource[],
  filters: DashboardFilter[]
): BuilderDataParameter[] {
  if (isNonDataElement(element)) return [];
  const context = resolveElementParameterContext(element, dataSources);
  return context.parameters.filter(parameter => parameter.required === true && !isParameterBound(parameter, context, element, filters));
}

export function matchingParameterFiltersForElement(
  element: DashboardElement,
  dataSources: BuilderDataSource[],
  filters: DashboardFilter[]
): DashboardFilter[] {
  if (isNonDataElement(element)) return [];
  const context = resolveElementParameterContext(element, dataSources);
  const requiredParameters = context.parameters.filter(parameter => parameter.required === true);
  if (requiredParameters.length === 0) return [];
  return filters.filter(filter => (
    isFilterActive(filter)
    && requiredParameters.every(parameter => filterHasReusableParameterMapping(filter, parameter.name))
    && !filterCanTargetElement(filter, context, element)
  ));
}

function isNonDataElement(element: DashboardElement): boolean {
  return element.type === 'container' || element.type === 'export' || element.type === 'filter' || element.type === 'filter-container';
}

function parameterToField(parameter: BuilderDataParameter): BuilderDataField {
  const type = parameter.dataType ?? parameter.type ?? 'string';
  return {
    name: parameter.name,
    type,
    columnType: 'parameter',
    dataType: type,
    ...(parameter.aliases ? { aliases: parameter.aliases } : {}),
    ...(parameter.dateRole ? { dateRole: parameter.dateRole } : {}),
    ...(parameter.defaultValue !== undefined ? { defaultValue: parameter.defaultValue } : {}),
    ...(parameter.description ? { description: `${parameter.description} (Parameter)` } : {}),
    isParameter: true,
    ...(parameter.label ? { label: parameter.label } : {}),
    parameterConfig: parameter,
    ...(parameter.required !== undefined ? { required: parameter.required } : {})
  };
}

function isDateParameter(parameter: BuilderDataParameter): boolean {
  return isDateParameterField(parameterToField(parameter));
}

function isDateParameterField(field: BuilderDataField): boolean {
  const type = `${field.type ?? ''} ${field.dataType ?? ''}`.toLowerCase();
  return Boolean(field.dateRole) || type.includes('date') || type.includes('time');
}

function firstDateTableField(fields: BuilderDataField[]): BuilderDataField | undefined {
  return fields.find(field => {
    const type = `${field.type ?? ''} ${field.dataType ?? ''}`.toLowerCase();
    return field.columnType === 'time' || type.includes('date') || type.includes('time');
  });
}

function firstFilterableTableField(fields: BuilderDataField[]): BuilderDataField | undefined {
  return fields.find(field => field.columnType === 'filter' || field.columnType === 'dimension')
    ?? fields.find(field => `${field.type ?? ''}`.toLowerCase().includes('string'));
}

function matchingTableField(fields: BuilderDataField[], parameterName: string): BuilderDataField | undefined {
  return fields.find(field => namesMatch(field.name, parameterName));
}

function suggestionForParameter(
  tableFields: BuilderDataField[],
  parameter: BuilderDataParameter
): ParameterFilterSuggestion | null {
  const dateField = firstDateTableField(tableFields);
  const matchingField = matchingTableField(tableFields, parameter.name);
  if (isDateParameter(parameter)) {
    return {
      filterType: 'datePicker',
      label: parameterDisplayName(parameter),
      parameterName: parameter.name,
      sourceField: dateField?.name ?? matchingField?.name ?? ''
    };
  }
  return {
    filterType: 'dropdown',
    label: parameterDisplayName(parameter),
    parameterName: parameter.name,
    sourceField: matchingField?.name ?? firstFilterableTableField(tableFields)?.name ?? tableFields[0]?.name ?? ''
  };
}

function autoCreateSuggestionForParameter(
  tableFields: BuilderDataField[],
  parameter: BuilderDataParameter
): ParameterAutoFilterSuggestion | null {
  const suggestion = suggestionForParameter(tableFields, parameter);
  if (!suggestion || !suggestion.parameterName) return null;
  if (suggestion.filterType === 'dateRange') return null;
  return {
    filterType: suggestion.filterType,
    label: suggestion.label,
    parameter,
    sourceField: suggestion.sourceField
  };
}

function isParameterBound(
  parameter: BuilderDataParameter,
  context: ParameterBindingContext,
  element: DashboardElement,
  filters: DashboardFilter[]
): boolean {
  return filters.some(filter => isFilterActive(filter)
    && filterCanTargetElement(filter, context, element)
    && filterMapsParameter(filter, context.aliases, parameter.name));
}

function filterMapsParameter(filter: DashboardFilter, aliases: Set<string>, parameterName: string): boolean {
  const config = filter.config ?? {};
  if (mappingRecordHasParameter(config.parameterMappings, aliases, parameterName)) return true;
  return filterHasReusableParameterFallback(filter, parameterName);
}

function filterHasReusableParameterMapping(filter: DashboardFilter, parameterName: string): boolean {
  const config = filter.config ?? {};
  if (mappingRecordHasParameterAnywhere(config.parameterMappings, parameterName)) return true;
  return filterHasReusableParameterFallback(filter, parameterName);
}

function filterHasReusableParameterFallback(filter: DashboardFilter, parameterName: string): boolean {
  const config = filter.config ?? {};
  const parameterConfig = isRecord(config.parameterConfig) ? config.parameterConfig : {};
  const fallback = readString(parameterConfig.name) ?? readString(filter.field) ?? readString(config.field);
  const fieldType = readString(config.fieldType)?.toLowerCase();
  return (config.isParameter === true || fieldType === 'parameter') && namesMatch(fallback, parameterName);
}

function mappingRecordHasParameter(value: unknown, aliases: Set<string>, parameterName: string): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([targetKey, mapping]) => {
    if (!aliases.has(normalizeKey(targetKey))) return false;
    return mappingHasParameter(mapping, parameterName);
  });
}

function mappingRecordHasParameterAnywhere(value: unknown, parameterName: string): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).some(mapping => mappingHasParameter(mapping, parameterName));
}

function mappingHasParameter(value: unknown, parameterName: string): boolean {
  if (typeof value === 'string') return namesMatch(value, parameterName);
  if (!isRecord(value)) return false;
  return Object.values(value).some(mappedValue => namesMatch(readString(mappedValue), parameterName));
}

function fieldByAliases(fields: BuilderDataField[], aliases: Array<string | undefined>): string {
  const normalizedAliases = aliases.flatMap(alias => alias ? [normalizeKey(alias)] : []);
  return fields.find(field => normalizedAliases.includes(normalizeKey(field.name)))?.name ?? '';
}

function filterCanTargetElement(
  filter: DashboardFilter,
  context: ParameterBindingContext,
  element: DashboardElement
): boolean {
  const config = filter.config ?? {};
  const record = filter as unknown as Record<string, unknown>;
  const componentTargets = normalizedValues([
    ...targetValues(record.targetComponents ?? config.targetComponents),
    ...targetValues(record.targetElementIds ?? config.targetElementIds ?? config.targetElements)
  ]);
  const dataSourceTargets = normalizedValues([
    ...targetValues(record.targetDataSources ?? config.targetDataSources),
    ...targetValues(record.targetDataSourceId ?? config.targetDataSourceId)
  ]);
  const componentAliases = normalizedValues([element.id, element.name]);
  const componentScoped = componentTargets.size === 0 || intersects(componentTargets, componentAliases);
  const dataSourceScoped = dataSourceTargets.size === 0 || intersects(dataSourceTargets, context.aliases);
  return componentScoped && dataSourceScoped;
}

function isFilterActive(filter: DashboardFilter): boolean {
  const config = filter.config ?? {};
  return filter.isActive !== false
    && filter.disabled !== true
    && filter.isDisabled !== true
    && filter.enabled !== false
    && config.isActive !== false
    && config.disabled !== true
    && config.isDisabled !== true
    && config.enabled !== false;
}

function elementSourceValues(element: DashboardElement): unknown[] {
  const config = element.config ?? {};
  const visualization = isRecord(config.visualization) ? config.visualization : {};
  const dataRef = isRecord(visualization.dataRef) ? visualization.dataRef : {};
  return [
    element.dataSourceId,
    config.dataSource,
    config.dataSourceId,
    config.dataSourceTableId,
    config.tableId,
    dataRef.sourceId,
    dataRef.tableId
  ];
}

function elementTableValues(element: DashboardElement): unknown[] {
  const config = element.config ?? {};
  const visualization = isRecord(config.visualization) ? config.visualization : {};
  const dataRef = isRecord(visualization.dataRef) ? visualization.dataRef : {};
  return [
    config.tableName,
    config.tableId,
    config.dataSourceTableId,
    config.dataModelName,
    dataRef.tableName,
    dataRef.tableId
  ];
}

function dedupeParameters(parameters: BuilderDataParameter[]): BuilderDataParameter[] {
  const seen = new Set<string>();
  return parameters.filter(parameter => {
    const key = normalizeKey(parameter.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function targetValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap(item => {
    if (item === undefined || item === null || item === '') return [];
    if (isRecord(item)) return targetValues(item.id ?? item.value ?? item.key ?? item.name);
    return [String(item)];
  });
}

function normalizedValues(values: unknown[]): Set<string> {
  return new Set(values.flatMap(value => {
    if (value === undefined || value === null || value === '') return [];
    return [normalizeKey(String(value))];
  }).filter(Boolean));
}

function intersects(first: Set<string>, second: Set<string>): boolean {
  return Array.from(first).some(value => second.has(value));
}

function namesMatch(first: string | undefined, second: string): boolean {
  return normalizeKey(first) === normalizeKey(second);
}

function normalizeKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
