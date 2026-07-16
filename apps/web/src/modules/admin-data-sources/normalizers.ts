import type {
  AdminDataSource,
  AdminDataSourceConnectionResult,
  AdminDerivedColumn,
  AdminDataSourceField,
  AdminDataSourceFilterCondition,
  AdminDataSourceTable,
  AdminTableDictionaryDetails,
  AdminValueConcept
} from './types';

export function normalizeAdminDataSources(value: unknown): AdminDataSource[] {
  return readCollection(value, 'dataSources').map(normalizeAdminDataSource).filter(isPresent);
}

export function normalizeAdminDataSource(value: unknown): AdminDataSource | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  if (!id || !name) return null;

  const type = readString(value.type) ?? 'source';
  const config = readRecord(value.config);
  const settings = readRecord(value.settings);
  const dictionary = readRecord(value.dictionary);
  const dashboard = readRecord(settings.dashboard);
  const tables = readTables(value.tables);

  const source: AdminDataSource = {
    id,
    name,
    type,
    sourceType: readString(value.sourceType) ?? (type === 'custom_query' ? 'custom_query' : 'source'),
    status: readString(value.status) ?? 'unknown',
    isSample: value.isSample === true || type === 'sample',
    description: readDescription(value, config, dictionary),
    config,
    settings,
    dictionary,
    tables,
    tableCount: readNumber(value.tableCount) ?? tables.length,
    defaultFilters: readFilterCollection(value.defaultFilters ?? settings.defaultFilters ?? value.filters),
    dashboardVisible: dashboard.visible !== false,
    dashboardDefault: dashboard.isDefault === true,
    isGloballyVisible: readBoolean(value.isGloballyVisible) ?? false
  };
  const baseDataSourceId = readString(value.baseDataSourceId);
  if (baseDataSourceId) source.baseDataSourceId = baseDataSourceId;
  const query = readString(value.query);
  if (query) source.query = query;
  return source;
}

export function normalizeAdminDataSourceTables(value: unknown): AdminDataSourceTable[] {
  const data = unwrapData(value);
  if (isRecord(data)) return readTableCollection(data);
  return readTables(data);
}

export function normalizeTableDictionary(value: unknown, fallbackTableId: string): AdminTableDictionaryDetails {
  const data = unwrapData(value);
  if (!isRecord(data)) throw new Error('Table dictionary response was not an object.');
  const tableName = readString(data.name) ?? readString(data.tableName) ?? fallbackTableId;
  const businessName = readString(data.businessName) ?? tableName;
  const description = readString(data.description) ?? readString(data.tableDescription) ?? 'No dictionary description is available.';
  const details: AdminTableDictionaryDetails = {
    tableId: readString(data.id) ?? readString(data.tableId) ?? fallbackTableId,
    tableName,
    businessName,
    businessPurpose: readString(data.businessPurpose) ?? '',
    businessRules: readString(data.businessRules) ?? '',
    commonFilters: readString(data.commonFilters) ?? '',
    dataLineage: readString(data.dataLineage) ?? '',
    derivedColumns: readDerivedColumns(data.derivedColumns),
    description,
    fields: readFields(data.fields ?? data.columns),
    keyMetrics: readString(data.keyMetrics) ?? '',
    performanceNotes: readString(data.performanceNotes) ?? '',
    qualityIssues: readString(data.qualityIssues) ?? '',
    relatedTables: readString(data.relatedTables) ?? '',
    sampleQuestions: readStringArray(data.sampleQuestions ?? data.aiSampleQuestions),
    updateFrequency: readString(data.updateFrequency) ?? '',
    valueConcepts: readValueConcepts(data.valueConcepts)
  };
  const recordCountEstimate = readNumber(data.recordCountEstimate);
  if (recordCountEstimate !== null) details.recordCountEstimate = recordCountEstimate;
  return details;
}

export function normalizeConnectionResult(value: unknown): AdminDataSourceConnectionResult {
  const data = unwrapData(value);
  if (!isRecord(data)) {
    return { success: true, message: 'Connection test completed', tables: [] };
  }
  return {
    success: data.success !== false,
    message: readString(data.message) ?? 'Connection test completed',
    tables: readStringArray(data.tables)
  };
}

function readTables(value: unknown): AdminDataSourceTable[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeTable).filter(isPresent);
}

function readTableCollection(data: Record<string, unknown>): AdminDataSourceTable[] {
  const tables = readTables(data.tables ?? data.availableTables ?? data.discoveredTables);
  const selectedTables = readTables(data.selectedTables);
  if (tables.length === 0) return selectedTables;
  const selectedIds = readTableIdentifiers(data.selectedTables);
  const selectedDetails = new Map(selectedTables.map(table => [table.name, table]));
  return tables.map(table => ({
    ...table,
    ...(selectedDetails.get(table.name) ?? {}),
    isSelected: selectedIds.size > 0 ? selectedIds.has(table.id) || selectedIds.has(table.name) : table.isSelected
  }));
}

function normalizeTable(value: unknown): AdminDataSourceTable | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name) ?? readString(value.tableName);
  const id = readString(value.id) ?? name;
  if (!id || !name) return null;
  const dictionary = readRecord(value.dictionary);
  const settings = readRecord(value.settings);
  const fields = readFields(value.fields ?? value.columns ?? dictionary.fields ?? dictionary.columns);
  const table: AdminDataSourceTable = {
    id,
    name,
    description: readString(value.description) ?? readString(value.tableDescription) ?? '',
    dashboardCount: readNumber(value.dashboardCount) ?? 0,
    fields: fields.length > 0 ? fields : readFieldsFromRows(value.sampleRows ?? value.rows),
    defaultFilters: readFilterCollection(
      value.defaultFilters ?? settings.defaultFilters ?? value.filters ?? dictionary.defaultFilters ?? dictionary.filters,
      name
    ),
    isSelected: readBoolean(value.isSelected) ?? readBoolean(value.selected) ?? true,
    isDataModel: settings.isDataModel === true || value.isDataModel === true,
    isSqlModel: Boolean(readString(value.sqlQuery) ?? readString(value.query)),
    settings
  };
  const sqlQuery = readString(value.sqlQuery) ?? readString(value.query);
  if (sqlQuery) table.sqlQuery = sqlQuery;
  const tableType = readTableType(value);
  if (tableType) table.tableType = tableType;
  const businessName = readString(dictionary.businessName);
  if (businessName) table.businessName = businessName;
  const dictionaryDescription = readString(dictionary.description);
  if (dictionaryDescription) table.dictionaryDescription = dictionaryDescription;
  return table;
}

function readFields(value: unknown): AdminDataSourceField[] {
  if (isRecord(value)) {
    return Object.entries(value).map(([name, field]) => normalizeField({ name, ...(isRecord(field) ? field : {}) })).filter(isPresent);
  }
  if (!Array.isArray(value)) return [];
  return value.map(normalizeField).filter(isPresent);
}

function readFieldsFromRows(value: unknown): AdminDataSourceField[] {
  if (!Array.isArray(value) || !isRecord(value[0])) return [];
  return Object.entries(value[0]).map(([name, rowValue]) => ({
    name,
    type: typeof rowValue === 'number' ? 'number' : typeof rowValue === 'boolean' ? 'boolean' : 'string',
    description: '',
    dictionaryDescription: ''
  }));
}

function normalizeField(value: unknown): AdminDataSourceField | null {
  if (typeof value === 'string' && value.trim()) {
    return { name: value.trim(), type: 'string', description: '', dictionaryDescription: '' };
  }
  if (!isRecord(value)) return null;
  const name = readString(value.name) ?? readString(value.field) ?? readString(value.fieldName) ?? readString(value.column);
  if (!name) return null;
  const description = readString(value.description) ?? readString(value.dictionaryDescription) ?? readString(value.label) ?? '';
  const field: AdminDataSourceField = {
    name,
    type: readString(value.type) ?? readString(value.dataType) ?? readString(value.columnType) ?? 'string',
    description,
    dictionaryDescription: readString(value.dictionaryDescription) ?? description
  };
  const businessName = readString(value.businessName) ?? readString(value.label);
  const columnType = readString(value.columnType);
  const formatHint = readString(value.formatHint) ?? readString(value.format);
  const isDimension = readBoolean(value.isDimension);
  const isKey = readBoolean(value.isKey);
  const isMetric = readBoolean(value.isMetric);
  if (businessName) field.businessName = businessName;
  if (columnType) field.columnType = columnType;
  if (formatHint) field.formatHint = formatHint;
  if (isDimension !== null) field.isDimension = isDimension;
  if (isKey !== null) field.isKey = isKey;
  if (isMetric !== null) field.isMetric = isMetric;
  return field;
}

function readFilterCollection(value: unknown, tableName?: string): AdminDataSourceFilterCondition[] {
  if (Array.isArray(value)) return value.map(normalizeFilterCondition).filter(isPresent);
  if (!isRecord(value)) return [];
  const tableFilters = tableName ? value[tableName] : null;
  if (Array.isArray(tableFilters)) {
    return tableFilters.map(normalizeFilterCondition).filter(isPresent);
  }
  const conditions = value.conditions;
  if (Array.isArray(conditions)) return conditions.map(normalizeFilterCondition).filter(isPresent);
  return [];
}

function normalizeFilterCondition(value: unknown, index: number): AdminDataSourceFilterCondition | null {
  if (!isRecord(value)) return null;
  const column = readString(value.column) ?? readString(value.field) ?? readString(value.name) ?? '';
  const rawValue = value.value;
  const conditionValue = typeof rawValue === 'string'
    ? rawValue
    : rawValue === undefined || rawValue === null
      ? ''
      : JSON.stringify(rawValue);
  if (!column && !conditionValue) return null;
  return {
    id: readString(value.id) ?? `filter-${index + 1}`,
    column,
    operator: readString(value.operator) ?? '=',
    value: conditionValue,
    logicOperator: readString(value.logicOperator)?.toUpperCase() === 'OR' ? 'OR' : 'AND'
  };
}

function readDescription(
  value: Record<string, unknown>,
  config: Record<string, unknown>,
  dictionary: Record<string, unknown>
): string {
  return readString(value.description) ??
    readString(dictionary.description) ??
    readString(dictionary.aiPurpose) ??
    readString(dictionary.businessContext) ??
    readString(config.description) ??
    '';
}

function readCollection(value: unknown, key: string): unknown[] {
  const data = unwrapData(value);
  if (Array.isArray(data)) return data;
  if (isRecord(data) && Array.isArray(data[key])) return data[key];
  return [];
}

function unwrapData(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return 'data' in value ? value.data : value;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const text = readString(item);
    return text ? [text] : [];
  });
}

function readDerivedColumns(value: unknown): AdminDerivedColumn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const name = readString(item.name);
    if (!name) return [];
    return [{
      columnType: readString(item.columnType) ?? 'measure',
      description: readString(item.description) ?? '',
      formula: readString(item.formula) ?? '',
      name,
      outputFormat: readString(item.outputFormat) ?? readString(item.format) ?? '',
      type: readString(item.type) ?? 'decimal'
    }];
  });
}

function readValueConcepts(value: unknown): AdminValueConcept[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const conceptKey = readString(item.conceptKey);
    if (!conceptKey) return [];
    return [{
      appliesToMetrics: readStringArray(item.appliesToMetrics),
      conceptKey,
      label: readString(item.label) ?? conceptKey,
      matchType: readString(item.matchType) === 'equals' ? 'equals' : 'in',
      matchValues: readStringArray(item.matchValues),
      synonyms: readStringArray(item.synonyms),
      targetField: readString(item.targetField) ?? ''
    }];
  });
}

function readTableIdentifiers(value: unknown): Set<string> {
  const identifiers = new Set<string>();
  if (!Array.isArray(value)) return identifiers;
  for (const item of value) {
    const direct = readString(item);
    if (direct) {
      identifiers.add(direct);
      continue;
    }
    if (!isRecord(item)) continue;
    const id = readString(item.id);
    const name = readString(item.name) ?? readString(item.tableName);
    if (id) identifiers.add(id);
    if (name) identifiers.add(name);
  }
  return identifiers;
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readTableType(value: Record<string, unknown>): string | null {
  const raw = readString(value.tableType) ?? readString(value.table_type) ?? readString(value.TABLE_TYPE);
  if (!raw) return null;
  return raw.toLowerCase().includes('view') ? 'view' : 'table';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}
