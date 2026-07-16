import { uuidv7 } from '@intraq/contracts';

export interface FieldDefinition {
  name: string;
  type: string;
  aggregation?: string;
  aliases?: string[];
  analyzerHidden?: boolean;
  columnType?: string;
  defaultAggregation?: string;
  description: string;
  dictionaryDescription: string;
  format?: string;
  hiddenFromAnalyzer?: boolean;
  label?: string;
  role?: string;
  sampleQuestions?: string[];
  sampleValues?: unknown[];
  semanticRole?: string;
  synonyms?: string[];
  valueAliases?: Record<string, string[]>;
  valueConcepts?: Array<Record<string, unknown>>;
}

export interface TableDefinition {
  id: string;
  name: string;
  description: string;
  fields: FieldDefinition[];
  dictionary: Record<string, unknown>;
  settings?: Record<string, unknown>;
  isSelected: boolean;
  sampleRows?: Array<Record<string, unknown>>;
  sqlQuery?: string | null;
}

export interface DataSourceRecord {
  id: string;
  name: string;
  description?: string;
  type: string;
  sourceType: string;
  status: string;
  isSample: boolean;
  createdBy?: string | null;
  baseDataSourceId?: string;
  query?: string;
  isGlobal?: boolean;
  isGloballyVisible?: boolean;
  tenantId?: string | null;
  config: Record<string, unknown>;
  settings: Record<string, unknown>;
  tables: TableDefinition[];
  dictionary: Record<string, unknown>;
}

export const dataSources: DataSourceRecord[] = [];

export function buildDataSource(input: unknown, fallbackType = 'source'): DataSourceRecord {
  const record = isRecord(input) ? input : { name: input, type: fallbackType };
  const type = optionalString(record.type) ?? fallbackType;
  const description = optionalString(record.description);
  const source: DataSourceRecord = {
    id: optionalString(record.id) ?? uuidv7(),
    name: optionalString(record.name) ?? 'Untitled data source',
    type,
    sourceType: optionalString(record.sourceType) ?? (type === 'custom_query' ? 'custom_query' : 'source'),
    status: optionalString(record.status) ?? 'connected',
    isSample: typeof record.isSample === 'boolean' ? record.isSample : type === 'sample',
    config: readRecord(record.config),
    settings: readRecord(record.settings),
    dictionary: readRecord(record.dictionary),
    tables: readTables(record.tables)
  };
  if (description) source.description = description;
  const baseDataSourceId = optionalString(record.baseDataSourceId) ?? optionalString(source.config.baseDataSourceId);
  const query = optionalString(record.query) ?? optionalString(source.config.query);
  if (baseDataSourceId) source.baseDataSourceId = baseDataSourceId;
  if (query) source.query = query;
  if ('createdBy' in record) source.createdBy = optionalString(record.createdBy) ?? null;
  if (typeof record.isGlobal === 'boolean') source.isGlobal = record.isGlobal;
  if (typeof record.isGloballyVisible === 'boolean') source.isGloballyVisible = record.isGloballyVisible;
  if ('tenantId' in record) source.tenantId = optionalString(record.tenantId) ?? null;
  return source;
}

export function findDataSource(id: string): DataSourceRecord | undefined {
  return dataSources.find(source => source.id === id);
}

export function findTable(id: string): TableDefinition | undefined {
  return findTableWithSource(id)?.table;
}

export function findTableWithSource(
  id: string
): { source: DataSourceRecord; table: TableDefinition; tableIndex: number } | undefined {
  for (const source of dataSources) {
    const tableIndex = source.tables.findIndex(table => tableMatchesIdentifier(table, id));
    const table = source.tables[tableIndex];
    if (tableIndex >= 0 && table) return { source, table, tableIndex };
  }
  return undefined;
}

export function findTableInDataSource(
  dataSourceId: string,
  tableIdOrName: string
): { source: DataSourceRecord; table: TableDefinition; tableIndex: number } | undefined {
  const source = findDataSource(dataSourceId);
  if (!source) return undefined;

  const tableIndex = source.tables.findIndex(table => tableMatchesIdentifier(table, tableIdOrName));
  const table = source.tables[tableIndex];
  return tableIndex >= 0 && table ? { source, table, tableIndex } : undefined;
}

export function removeTable(tableIdOrName: string): boolean {
  const lookup = findTableWithSource(tableIdOrName);
  if (!lookup) return false;
  lookup.source.tables.splice(lookup.tableIndex, 1);
  return true;
}

export function removeDataSource(id: string): boolean {
  const index = dataSources.findIndex(source => source.id === id);
  if (index < 0) return false;
  dataSources.splice(index, 1);
  return true;
}

export function tableDictionary(table: TableDefinition): Record<string, unknown> {
  return {
    id: table.id,
    name: table.name,
    tableDescription: table.description,
    businessName: table.dictionary.businessName ?? table.name,
    columns: table.fields,
    fields: table.fields,
    ...table.dictionary
  };
}

export function rowsForTable(dataSourceId: string, tableIdOrName: string): Array<Record<string, unknown>> {
  const lookup = findTableInDataSource(dataSourceId, tableIdOrName);
  return lookup?.table.sampleRows ?? [];
}

export function schemaForRows(items: Array<Record<string, unknown>>): Array<{ name: string; type: string }> {
  const sample = items[0] ?? {};
  return Object.entries(sample).map(([name, value]) => ({ name, type: typeof value === 'number' ? 'number' : 'string' }));
}

export function tableDisplayName(table: TableDefinition): string {
  return optionalString(table.dictionary.businessName) ?? toLabel(table.name);
}

export function tablePathSlug(table: TableDefinition): string {
  const settings = readRecord(table.settings);
  const apiSettings = readRecord(settings.api ?? settings.request);
  const configured = optionalString(apiSettings.slug)
    ?? optionalString(apiSettings.pathSlug)
    ?? optionalString(settings.apiSlug)
    ?? optionalString(settings.pathSlug)
    ?? optionalString(table.dictionary.apiSlug)
    ?? optionalString(table.dictionary.pathSlug)
    ?? optionalString(table.dictionary.slug);
  return toPathSlug(configured ?? tableDisplayName(table)) || toPathSlug(table.name) || table.id;
}

export function tableLookupAliases(table: TableDefinition): string[] {
  return uniqueStrings([
    table.id,
    table.name,
    tablePathSlug(table),
    toPathSlug(table.name)
  ]);
}

export function toLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readTables(value: unknown): TableDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const name = optionalString(item.name) ?? optionalString(item.tableName) ?? `table_${index + 1}`;
    const description = optionalString(item.description) ?? `${toLabel(name)} table`;
    const table: TableDefinition = {
      id: optionalString(item.id) ?? uuidv7(),
      name,
      description,
      fields: readFields(item.fields ?? item.columns),
      dictionary: readRecord(item.dictionary),
      settings: readRecord(item.settings),
      isSelected: typeof item.isSelected === 'boolean' ? item.isSelected : true
    };
    const sampleRows = readRows(item.sampleRows ?? item.rows);
    const sqlQuery = optionalString(item.sqlQuery) ?? optionalString(item.query);
    if (sampleRows) table.sampleRows = sampleRows;
    if (sqlQuery) table.sqlQuery = sqlQuery;
    return [table];
  });
}

function readFields(value: unknown): FieldDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string' && item.trim()) return [{ name: item.trim(), type: 'string', description: '', dictionaryDescription: '' }];
    if (!isRecord(item)) return [];
    const name = optionalString(item.name) ?? optionalString(item.field);
    if (!name) return [];
    const description = optionalString(item.description) ?? optionalString(item.dictionaryDescription) ?? '';
    const aggregation = optionalString(item.aggregation);
    const aliases = readStringArray(item.aliases);
    const columnType = optionalString(item.columnType);
    const defaultAggregation = optionalString(item.defaultAggregation);
    const format = optionalString(item.format);
    const label = optionalString(item.label);
    const role = optionalString(item.role);
    const sampleQuestions = readStringArray(item.sampleQuestions);
    const semanticRole = optionalString(item.semanticRole);
    const synonyms = readStringArray(item.synonyms);
    const valueAliases = readValueAliases(item.valueAliases);
    const valueConcepts = readRecordArray(item.valueConcepts);
    return [{
      name,
      type: optionalString(item.type) ?? 'string',
      description,
      dictionaryDescription: optionalString(item.dictionaryDescription) ?? description,
      ...(aggregation ? { aggregation } : {}),
      ...(aliases.length > 0 ? { aliases } : {}),
      ...(item.analyzerHidden === true ? { analyzerHidden: true } : {}),
      ...(columnType ? { columnType } : {}),
      ...(defaultAggregation ? { defaultAggregation } : {}),
      ...(format ? { format } : {}),
      ...(item.hiddenFromAnalyzer === true ? { hiddenFromAnalyzer: true } : {}),
      ...(label ? { label } : {}),
      ...(role ? { role } : {}),
      ...(sampleQuestions.length > 0 ? { sampleQuestions } : {}),
      ...(Array.isArray(item.sampleValues) ? { sampleValues: item.sampleValues } : {}),
      ...(semanticRole ? { semanticRole } : {}),
      ...(synonyms.length > 0 ? { synonyms } : {}),
      ...(Object.keys(valueAliases).length > 0 ? { valueAliases } : {}),
      ...(valueConcepts.length > 0 ? { valueConcepts } : {})
    }];
  });
}

function readRows(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.filter(isRecord);
  return rows.length > 0 ? rows.map(row => ({ ...row })) : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function tableMatchesIdentifier(table: TableDefinition, value: string): boolean {
  const normalized = String(value ?? '').trim();
  if (!normalized) return false;
  return tableLookupAliases(table).includes(normalized);
}

function toPathSlug(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord).map(item => ({ ...item })) : [];
}

function readValueAliases(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const aliases = readStringArray(item);
    return key.trim() && aliases.length > 0 ? [[key.trim(), aliases]] : [];
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
