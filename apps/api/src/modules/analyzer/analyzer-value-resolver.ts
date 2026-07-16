import {
  findDataSource,
  type FieldDefinition,
  type TableDefinition
} from '../data-source/foundation-store.js';
import { quoteSqlIdentifierForType } from '../data-source/sql-dialect.js';
import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import { executeSqlEditorQuery } from '../sql-chart/sql-editor-service.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import { analyzerFieldMetadata } from './analyzer-plan-field-matching.js';
import { analyzerVisibleFieldNames } from './analyzer-plan-field-visibility.js';
import {
  analyzerParameterDefinitionsForTable,
  analyzerParameterValuesForQuestion
} from './analyzer-plan-parameter-values.js';
import { type AnalyzerValueConcept, valueConceptsForTable } from './analyzer-plan-derived-columns.js';
import { analyzerAccessPolicyCacheKey } from './analyzer-access-policy-cache-key.js';
import {
  analyzerLookupDatasetCacheSizeForTest,
  lookupDatasetMaxRows,
  lookupDatasetRows,
  lookupDatasetSearchRows,
  resetAnalyzerLookupDatasetCacheForTest,
  stableLookupConfig,
  type AnalyzerLookupDatasetRow,
  type AnalyzerLookupDatasetResult,
  type AnalyzerValueLookupConfig,
  type AnalyzerValueLookupScope
} from './analyzer-value-lookup.js';

export { buildLookupDatasetQuery } from './analyzer-value-lookup.js';
export type { AnalyzerValueLookupConfig, AnalyzerValueLookupScope } from './analyzer-value-lookup.js';

const DEFAULT_VALUE_RESOLVER_LIMIT = 10;
const MAX_VALUE_RESOLVER_LIMIT = 25;
const FIELD_VALUE_RESOLVER_CACHE_TTL_MS = 15 * 60 * 1000;
const FIELD_VALUE_RESOLVER_CACHE_MAX_ENTRIES = 500;
const GENERIC_LOOKUP_ENTITY_SUFFIX_TOKENS = new Set([
  'account',
  'accounts',
  'client',
  'clients',
  'company',
  'companies',
  'customer',
  'customers',
  'entity',
  'entities',
  'location',
  'locations',
  'organization',
  'organizations',
  'organisation',
  'organisations',
  'site',
  'sites',
  'subject',
  'subjects',
  'tenant',
  'tenants'
]);

const valueResolverCache = new Map<string, {
  expiresAt: number;
  result: Record<string, unknown>;
}>();

export interface AnalyzerFieldValueResolution {
  entityType?: string;
  examples?: string[];
  field: string;
  lookup?: {
    cacheTtlSeconds: number;
    scope: AnalyzerValueLookupScope;
    source: 'configured_lookup';
  };
  mode: 'catalog' | 'lookup' | 'none';
  reason: string;
}

export async function resolveAnalyzerFieldValues(
  dataSourceId: string,
  args: Record<string, unknown>,
  options: {
    accessPolicy?: DataSourceAccessPolicy;
    parameterValues?: Record<string, unknown>;
    question?: string;
  } = {}
): Promise<Record<string, unknown>> {
  const resolverStartedAt = Date.now();
  const source = findDataSource(dataSourceId);
  if (!source) return { success: false, error: 'Selected data source was not found.', dataSourceId };

  const table = resolveTable(source.tables, args);
  if (!table) {
    return {
      success: false,
      error: 'Selected data model was not found.',
      dataSourceId,
      tableId: readString(args.tableId),
      tableName: readString(args.tableName)
    };
  }

  const fieldName = readString(args.field) ?? readString(args.fieldName);
  const visibleFieldNames = analyzerVisibleFieldNames(table);
  const field = fieldName
    ? table.fields.find(item => item.name === fieldName && visibleFieldNames.has(item.name))
    : null;
  if (!field) {
    return {
      success: false,
      error: 'Selected field was not found or is not available to Analyzer.',
      dataSourceId,
      tableId: table.id,
      tableName: table.name,
      field: fieldName
    };
  }

  const searchText = readString(args.searchText) ?? readString(args.query) ?? readString(args.value);
  if (!searchText) {
    return {
      success: false,
      error: 'searchText is required for field value resolution.',
      dataSourceId,
      tableId: table.id,
      tableName: table.name,
      field: field.name
    };
  }

  const limit = readResolverLimit(args.limit);
  const searchVariants = searchVariantsForField(table, field, searchText);
  const lookupConfig = valueLookupConfigForField(table, field);
  const parameterValues = parameterValuesForResolution(table, field, options, lookupConfig);
  const cacheKey = valueResolverCacheKey(
    source.id,
    table.name,
    field.name,
    searchText,
    limit,
    parameterValues,
    searchVariants,
    lookupConfig,
    options.accessPolicy
  );
  const cached = readValueResolverCache(cacheKey);
  if (cached) return withResolverTiming(cached, resolverStartedAt, { cacheHit: true });
  const conceptMatches = resolveFromValueConcepts(table, field, searchText, limit);

  if (lookupConfig) {
    const lookupResult = await resolveFromConfiguredLookup(source.id, table, field, lookupConfig, searchText, searchVariants, limit, {
      ...(options.accessPolicy ? { accessPolicy: options.accessPolicy } : {}),
      ...(parameterValues ? { parameterValues } : {})
    });
    if (lookupResult.success !== true) {
      if (lookupConfig.scope === 'shared' && conceptMatches.length > 0) {
        return withResolverTiming({
          ...resolutionResult(source.id, table, field, searchText, searchVariants, conceptMatches, 'value_concepts'),
          lookupFallback: {
            error: readString(lookupResult.error) ?? 'Configured lookup failed.',
            source: 'configured_lookup'
          }
        }, resolverStartedAt);
      }
      return withResolverTiming(lookupResult, resolverStartedAt);
    }
    if (Array.isArray(lookupResult.matches) && lookupResult.matches.length === 0 && conceptMatches.length > 0) {
      const fallback = {
        ...resolutionResult(source.id, table, field, searchText, searchVariants, conceptMatches, 'value_concepts'),
        lookup: lookupResult.lookup ?? lookupResolutionMetadata(lookupConfig),
        lookupFallback: {
          error: 'Configured lookup returned no scoped value matches.',
          source: 'configured_lookup'
        },
        ...(isRecord(lookupResult.timing) ? { timing: lookupResult.timing } : {})
      };
      writeValueResolverCache(cacheKey, fallback);
      return withResolverTiming(fallback, resolverStartedAt);
    }
    writeValueResolverCache(cacheKey, lookupResult);
    return withResolverTiming(lookupResult, resolverStartedAt);
  }

  if (conceptMatches.length > 0) {
    const result = resolutionResult(source.id, table, field, searchText, searchVariants, conceptMatches, 'value_concepts');
    writeValueResolverCache(cacheKey, result);
    return withResolverTiming(result, resolverStartedAt);
  }

  const sampleMatches = resolveFromSampleRows(table, field.name, searchText, searchVariants, limit);
  const fieldMetadata = analyzerFieldMetadata(table, field.name);
  const explicitValueMode = readString(fieldMetadata.valueResolutionMode ?? fieldMetadata.valueMode ?? fieldMetadata.resolutionMode);
  const catalogMiss = ['catalog', 'enum'].includes(explicitValueMode?.trim().toLowerCase() ?? '');
  if (sampleMatches.length > 0 || catalogMiss) {
    const result = resolutionResult(source.id, table, field, searchText, searchVariants, sampleMatches, sampleMatches.length > 0 ? 'sample_rows' : 'catalog');
    writeValueResolverCache(cacheKey, result);
    return withResolverTiming(result, resolverStartedAt);
  }

  const query = buildValueResolverQuery(source.type, table.name, field.name, searchVariants);
  const executeOptions = {
    defaultLimit: limit,
    maxLimit: Math.max(limit, MAX_VALUE_RESOLVER_LIMIT),
    ...(options.accessPolicy ? { policy: options.accessPolicy } : {}),
    ...(parameterValues ? { parameterValues } : {})
  };
  const executed = await executeSqlEditorQuery(source.id, query, executeOptions);
  if (!executed.ok) {
    return withResolverTiming({
      success: false,
      error: executed.error,
      dataSourceId: source.id,
      tableId: table.id,
      tableName: table.name,
      field: field.name
    }, resolverStartedAt);
  }

  const matches = executed.data.rows
    .map(row => matchFromRow(row, searchText, searchVariants))
    .filter(match => match.value)
    .slice(0, limit);

  const result = resolutionResult(source.id, table, field, searchText, searchVariants, matches, 'live_query');
  result.timing = {
    queryExecutionMs: executed.data.executionTime,
    resolverElapsedMs: Date.now() - resolverStartedAt
  };
  writeValueResolverCache(cacheKey, result);
  return withResolverTiming(result, resolverStartedAt);
}

function parameterValuesForResolution(
  table: TableDefinition,
  field: FieldDefinition,
  options: {
    parameterValues?: Record<string, unknown>;
    question?: string;
  },
  lookupConfig: AnalyzerValueLookupConfig | null = null
): Record<string, unknown> | undefined {
  const fromQuestion = options.question
    ? analyzerParameterValuesForQuestion(table, options.question)
    : {};
  const explicitParameterValues = options.parameterValues ?? {};
  const values: Record<string, unknown> = {
    ...defaultParameterValuesForLookupResolution(table),
    ...fromQuestion,
    ...explicitParameterValues
  };
  if (lookupConfig && shouldIgnoreScopeParametersForLookup(table, field, lookupConfig, {
    explicitParameterValues,
    questionParameterValues: fromQuestion
  })) {
    for (const parameter of lookupConfig.scopeParameters) delete values[parameter];
  }
  if (lookupConfig?.parameterPassthrough === 'scope_only') {
    const allowed = new Set(lookupConfig.scopeParameters);
    const scopedValues = Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key)));
    return Object.keys(scopedValues).length > 0 ? scopedValues : undefined;
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

function shouldIgnoreScopeParametersForLookup(
  table: TableDefinition,
  field: FieldDefinition,
  lookupConfig: AnalyzerValueLookupConfig,
  parameterSources: {
    explicitParameterValues: Record<string, unknown>;
    questionParameterValues: Record<string, unknown>;
  }
): boolean {
  if (lookupConfig.scope !== 'client' && lookupConfig.scope !== 'tenant') return false;
  if (lookupConfig.missingScopePolicy !== 'all_accessible') return false;
  if (lookupConfig.scopeParameters.some(parameter =>
    parameterSources.explicitParameterValues[parameter] !== undefined
    || parameterSources.questionParameterValues[parameter] !== undefined
  )) {
    return false;
  }
  const resolution = fieldValueResolutionForTable(table, field);
  const entityType = resolution.entityType?.trim().toLowerCase();
  if (entityType && ['account', 'business', 'client', 'company', 'customer', 'entity', 'location', 'organization', 'organisation', 'site', 'subject', 'tenant'].includes(entityType)) {
    return true;
  }
  const normalized = field.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return normalized.includes('account')
    || normalized.includes('business')
    || normalized.includes('location')
    || normalized.includes('company')
    || normalized.includes('client')
    || normalized.includes('customer')
    || normalized.includes('entity')
    || normalized.includes('organization')
    || normalized.includes('organisation')
    || normalized.includes('site')
    || normalized.includes('subject')
    || normalized.includes('tenant');
}

function defaultParameterValuesForLookupResolution(table: TableDefinition): Record<string, string> {
  const values: Record<string, string> = {};
  for (const definition of analyzerParameterDefinitionsForTable(table)) {
    if (!definition.defaultValue) continue;
    values[definition.name] = definition.defaultValue;
  }
  return values;
}

export function resetAnalyzerFieldValueResolverCacheForTest(): void {
  valueResolverCache.clear();
  resetAnalyzerLookupDatasetCacheForTest();
}

export function analyzerFieldValueResolverCacheSizeForTest(): number {
  pruneExpiredValueResolverCache();
  return valueResolverCache.size + analyzerLookupDatasetCacheSizeForTest();
}

export function fieldValueResolutionForTable(table: TableDefinition, field: FieldDefinition): AnalyzerFieldValueResolution {
  const metadata = analyzerFieldMetadata(table, field.name);
  const explicitMode = readString(metadata.valueResolutionMode)
    ?? readString(metadata.valueMode)
    ?? readString(metadata.resolutionMode);
  const explicitEntityType = readString(metadata.entityType)
    ?? readString(metadata.businessEntity)
    ?? entityTypeForField(table, field, metadata);
  const lookupConfig = valueLookupConfigForField(table, field);
  const examples = uniqueStrings([
    ...readStringArray(field.sampleValues).slice(0, 20),
    ...readStringArray(metadata.sampleValues).slice(0, 20),
    ...readStringArray(metadata.values).slice(0, 20)
  ]);

  if (explicitMode === 'none' || explicitMode === 'direct' || explicitMode === 'parameter') {
    return {
      field: field.name,
      mode: 'none',
      reason: 'Metadata marks this field as a direct filter value.'
    };
  }
  if (explicitMode === 'catalog' || explicitMode === 'enum') {
    return {
      field: field.name,
      mode: 'catalog',
      ...(explicitEntityType ? { entityType: explicitEntityType } : {}),
      ...(examples.length > 0 ? { examples } : {}),
      ...(lookupConfig ? { lookup: lookupResolutionMetadata(lookupConfig) } : {}),
      reason: 'Metadata marks this field as a small controlled value catalog.'
    };
  }
  if (lookupConfig || explicitMode === 'lookup' || explicitMode === 'search') {
    return {
      field: field.name,
      mode: 'lookup',
      ...(explicitEntityType ? { entityType: explicitEntityType } : {}),
      ...(examples.length > 0 ? { examples } : {}),
      ...(lookupConfig ? { lookup: lookupResolutionMetadata(lookupConfig) } : {}),
      reason: lookupConfig
        ? `Metadata resolves this field through a ${lookupConfig.scope} lookup source.`
        : 'Metadata marks this field as a runtime lookup value.'
    };
  }
  if (smallCatalogField(field, metadata, examples)) {
    return {
      field: field.name,
      mode: 'catalog',
      ...(explicitEntityType ? { entityType: explicitEntityType } : {}),
      ...(examples.length > 0 ? { examples } : {}),
      reason: 'This looks like a low-cardinality dimension; use exact catalog values when available.'
    };
  }
  if (explicitEntityType || searchableTextDimension(field, metadata)) {
    return {
      field: field.name,
      mode: 'lookup',
      ...(explicitEntityType ? { entityType: explicitEntityType } : {}),
      ...(examples.length > 0 ? { examples } : {}),
      reason: 'This looks like a scoped dynamic entity; resolve user text before filtering.'
    };
  }
  return {
    field: field.name,
    mode: 'none',
    reason: 'No value resolver is configured for this field.'
  };
}

function buildValueResolverQuery(
  sourceType: string,
  tableName: string,
  fieldName: string,
  searchVariants: string[]
): string {
  const field = quoteSqlIdentifierForType(fieldName, sourceType);
  const table = quoteSqlIdentifierForType(tableName, sourceType);
  const predicates = searchVariants
    .slice(0, 8)
    .map(variant => {
      const tokens = searchTokens(variant).slice(0, 4);
      return tokens.length > 0
        ? `(${tokens.map(token => `lower(${field}) like ${sqlLiteral(`%${escapeLikePattern(token)}%`)} escape ${sqlLiteral('\\')}`).join(' and ')})`
        : '';
    })
    .filter(Boolean);
  const where = [
    `${field} is not null`,
    predicates.length > 0 ? `(${predicates.join(' or ')})` : '1 = 0'
  ].join(' and ');
  return [
    `select ${field} as value, count(*) as row_count`,
    `from ${table}`,
    `where ${where}`,
    `group by ${field}`,
    'order by row_count desc'
  ].join(' ');
}

function resolveFromSampleRows(
  table: TableDefinition,
  fieldName: string,
  searchText: string,
  searchVariants: string[],
  limit: number
): Array<{ matchType: string; rowCount?: number; value: string }> {
  const counts = new Map<string, number>();
  for (const row of table.sampleRows ?? []) {
    const value = row[fieldName];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (!text || !valueMatchesSearch(text, searchVariants)) continue;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, rowCount]) => ({ value, rowCount, matchType: matchTypeForValue(value, searchText, searchVariants) }))
    .sort((left, right) => (right.rowCount ?? 0) - (left.rowCount ?? 0) || left.value.localeCompare(right.value))
    .slice(0, limit);
}

function resolveFromValueConcepts(
  table: TableDefinition,
  field: FieldDefinition,
  searchText: string,
  limit: number
): Array<{ matchType: string; value: string }> {
  return bestMatchingExpansionConcepts(valueConceptsForField(table, field), searchText)
    .flatMap(concept => concept.matchValues.map(value => ({
      matchType: 'value_concept',
      value
    })))
    .filter(match => match.value.trim().length > 0)
    .slice(0, limit);
}

async function resolveFromConfiguredLookup(
  dataSourceId: string,
  table: TableDefinition,
  field: FieldDefinition,
  config: AnalyzerValueLookupConfig,
  searchText: string,
  searchVariants: string[],
  limit: number,
  options: {
    accessPolicy?: DataSourceAccessPolicy;
    parameterValues?: Record<string, unknown>;
  }
): Promise<Record<string, unknown>> {
  const dataset = await lookupDatasetRows(dataSourceId, config, options);
  if (!dataset.success) return { ...dataset };
  const rows = dataset.rows ?? [];
  let matchedRows = matchLookupRows(rows, searchText, searchVariants, limit);
  let searchDataset: AnalyzerLookupDatasetResult | null = null;
  if (matchedRows.length === 0) {
    searchDataset = await lookupDatasetSearchRows(dataSourceId, config, searchVariants, options);
    if (!searchDataset.success) return { ...searchDataset };
    const searchRows = searchDataset.rows ?? [];
    matchedRows = matchLookupRows(searchRows, searchText, searchVariants, limit);
  }
  const matches = matchedRows.map(({ row, match }) => ({
    ...(row.label && row.label !== row.value ? { label: row.label } : {}),
    matchType: match.matchType,
    value: row.value
  }));
  return {
    ...resolutionResult(dataSourceId, table, field, searchText, searchVariants, matches, 'configured_lookup'),
    lookup: {
      cacheTtlSeconds: config.cacheTtlMs / 1000,
      datasetCached: dataset.cached === true,
      datasetRowCount: rows.length,
      scope: config.scope,
      searchRowCount: Array.isArray(searchDataset?.rows) ? searchDataset.rows.length : 0,
      source: 'configured_lookup'
    },
    timing: {
      datasetQueryMs: readNumber(dataset.durationMs),
      searchQueryMs: readNumber(searchDataset?.durationMs),
      searchQueryExecutionMs: readNumber(searchDataset?.executionTime)
    }
  };
}

function matchLookupRows(
  rows: AnalyzerLookupDatasetRow[],
  searchText: string,
  searchVariants: string[],
  limit: number
): Array<{ match: { matched: boolean; matchType: string; score: number }; row: AnalyzerLookupDatasetRow }> {
  const matched = rows
    .map((row, index) => ({ index, row, match: lookupRowMatch(row, searchText, searchVariants) }))
    .filter(item => item.match.matched)
    .sort((left, right) => right.match.score - left.match.score || left.index - right.index);
  const strongMatches = matched.filter(item => item.match.matchType !== 'fuzzy_lookup');
  const preferred = strongMatches.length > 0 ? strongMatches : matched;
  const topScore = preferred[0]?.match.score ?? 0;
  return preferred
    .filter(item => item.match.score === topScore)
    .map(({ row, match }) => ({ row, match }))
    .slice(0, limit);
}

function resolutionResult(
  dataSourceId: string,
  table: TableDefinition,
  field: FieldDefinition,
  searchText: string,
  searchVariants: string[],
  matches: Array<{ matchType: string; rowCount?: number; value: string }>,
  source: 'catalog' | 'configured_lookup' | 'live_query' | 'sample_rows' | 'value_concepts'
): Record<string, unknown> {
  return {
    success: true,
    dataSourceId,
    tableId: table.id,
    tableName: table.name,
    field: field.name,
    searchText,
    searchVariants,
    source,
    cacheTtlSeconds: FIELD_VALUE_RESOLVER_CACHE_TTL_MS / 1000,
    matchCount: matches.length,
    matches,
    instruction: matches.length === 0
      ? 'No scoped value match was found. Ask a clarification question or run an unfiltered grouped result if the user asked for a category breakdown.'
      : 'Use matches[].value exactly in create_table.params.filters. If several matches are valid, either group by this field or ask the user to clarify.'
  };
}

function readValueResolverCache(key: string): Record<string, unknown> | null {
  const cached = valueResolverCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    valueResolverCache.delete(key);
    return null;
  }
  return {
    ...cached.result,
    cached: true
  };
}

function writeValueResolverCache(key: string, result: Record<string, unknown>): void {
  pruneExpiredValueResolverCache();
  if (valueResolverCache.size >= FIELD_VALUE_RESOLVER_CACHE_MAX_ENTRIES) {
    const oldestKey = valueResolverCache.keys().next().value;
    if (oldestKey) valueResolverCache.delete(oldestKey);
  }
  valueResolverCache.set(key, {
    expiresAt: Date.now() + FIELD_VALUE_RESOLVER_CACHE_TTL_MS,
    result: {
      ...result,
      cached: false
    }
  });
}

function pruneExpiredValueResolverCache(): void {
  const now = Date.now();
  for (const [key, entry] of valueResolverCache.entries()) {
    if (entry.expiresAt <= now) valueResolverCache.delete(key);
  }
}

function valueResolverCacheKey(
  dataSourceId: string,
  tableName: string,
  fieldName: string,
  searchText: string,
  limit: number,
  parameterValues: Record<string, unknown> | undefined,
  searchVariants: string[],
  lookupConfig: AnalyzerValueLookupConfig | null,
  accessPolicy: DataSourceAccessPolicy | undefined
): string {
  return JSON.stringify({
    dataSourceId,
    tableName,
    fieldName,
    lookupConfig: lookupConfig ? stableLookupConfig(lookupConfig) : null,
    searchText: normalizeText(searchText),
    searchVariants: searchVariants.map(normalizeText),
    limit,
    parameterValues: stableParameterValues(parameterValues),
    accessPolicy: analyzerAccessPolicyCacheKey(accessPolicy)
  });
}

function valueLookupConfigForField(table: TableDefinition, field: FieldDefinition): AnalyzerValueLookupConfig | null {
  const metadata = analyzerFieldMetadata(table, field.name);
  const raw = lookupConfigRecord(metadata);
  if (!raw) return null;
  const tableName = readString(raw.tableName ?? raw.table ?? raw.lookupTable ?? raw.lookupTableName);
  const valueField = readString(raw.valueField ?? raw.field ?? raw.keyField ?? raw.idField);
  if (!tableName || !valueField) return null;
  const labelField = readString(raw.labelField ?? raw.displayField ?? raw.nameField);
  const scope = normalizeLookupScope(readString(raw.scope ?? raw.lookupScope ?? raw.visibility));
  const scopeField = readString(raw.scopeField ?? raw.clientField ?? raw.tenantField ?? raw.companyField);
  const lookupDataSourceId = readString(raw.dataSourceId ?? raw.lookupDataSourceId ?? raw.sourceId);
  const configuredScopeParameters = uniqueStrings([
    readString(raw.scopeParameter),
    ...readStringArray(raw.scopeParameters),
    ...readStringArray(raw.parameterNames)
  ].filter((value): value is string => Boolean(value)));
  const searchFields = uniqueStrings([
    ...readStringArray(raw.searchFields),
    ...readStringArray(raw.matchFields),
    valueField,
    labelField
  ].filter((value): value is string => Boolean(value)));
  return {
    cacheTtlMs: positiveMilliseconds(raw.cacheTtlSeconds, FIELD_VALUE_RESOLVER_CACHE_TTL_MS),
    ...(lookupDataSourceId ? { dataSourceId: lookupDataSourceId } : {}),
    ...(labelField ? { labelField } : {}),
    maxRows: positiveInteger(raw.maxRows ?? raw.limit, lookupDatasetMaxRows()),
    missingScopePolicy: lookupMissingScopePolicy(raw),
    parameterPassthrough: lookupParameterPassthrough(raw),
    scope,
    ...(scopeField ? { scopeField } : {}),
    scopeParameters: configuredScopeParameters.length > 0 ? configuredScopeParameters : defaultLookupScopeParameters(scope),
    searchFields,
    tableName,
    valueField
  };
}

function lookupParameterPassthrough(raw: Record<string, unknown>): 'all' | 'scope_only' {
  const value = readString(raw.parameterPassthrough ?? raw.parameterMode ?? raw.parameterPolicy);
  return value?.trim().toLowerCase() === 'scope_only' ? 'scope_only' : 'all';
}

function lookupMissingScopePolicy(raw: Record<string, unknown>): 'all_accessible' | 'fail' {
  const value = readString(raw.missingScopePolicy ?? raw.missingScopeAction ?? raw.unscopedLookupPolicy);
  const normalized = value?.trim().toLowerCase().replace(/[-\s]+/g, '_');
  return [
    'all_accessible',
    'allow_all_accessible',
    'all_accessible_values',
    'visible_values'
  ].includes(normalized ?? '')
    ? 'all_accessible'
    : 'fail';
}

function lookupConfigRecord(metadata: Record<string, unknown>): Record<string, unknown> | null {
  const candidates = [
    metadata.valueLookup,
    metadata.lookupSource,
    metadata.lookup,
    metadata.valueResolver
  ];
  for (const candidate of candidates) {
    if (isRecord(candidate)) return candidate;
  }
  return null;
}

function lookupResolutionMetadata(config: AnalyzerValueLookupConfig): NonNullable<AnalyzerFieldValueResolution['lookup']> {
  return {
    cacheTtlSeconds: config.cacheTtlMs / 1000,
    scope: config.scope,
    source: 'configured_lookup'
  };
}

function normalizeLookupScope(value: string | null | undefined): AnalyzerValueLookupScope {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'account' || normalized === 'accounts' || normalized === 'client' || normalized === 'clients' || normalized === 'customer' || normalized === 'customers' || normalized === 'company' || normalized === 'organization' || normalized === 'organizations' || normalized === 'organisation' || normalized === 'organisations') {
    return 'client';
  }
  if (normalized === 'tenant' || normalized === 'tenantonly') return 'tenant';
  return 'shared';
}

function defaultLookupScopeParameters(scope: AnalyzerValueLookupScope): string[] {
  if (scope === 'client') return ['accountIds', 'accountId', 'clientIds', 'clientId', 'companyIds', 'companyId', 'customerIds', 'customerId', 'organizationIds', 'organizationId', 'organisationIds', 'organisationId'];
  if (scope === 'tenant') return ['tenantIds', 'tenantId'];
  return [];
}

function stableParameterValues(value: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!value) return null;
  return Object.fromEntries(Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map(key => [key, value[key]]));
}

function matchFromRow(
  row: Record<string, unknown>,
  searchText: string,
  searchVariants: string[]
): { matchType: string; rowCount?: number; value: string } {
  const value = String(row.value ?? '').trim();
  const rowCount = Number(row.row_count ?? row.rowCount ?? 0) || undefined;
  return {
    matchType: matchTypeForValue(value, searchText, searchVariants),
    ...(rowCount === undefined ? {} : { rowCount }),
    value
  };
}

function resolveTable(tables: TableDefinition[], args: Record<string, unknown>): TableDefinition | null {
  const tableId = readString(args.tableId);
  const tableName = readString(args.tableName);
  return tables.find(table => table.id === tableId || table.name === tableName) ?? null;
}

function smallCatalogField(field: FieldDefinition, metadata: Record<string, unknown>, examples: string[]): boolean {
  const name = field.name.toLowerCase();
  const role = readString(metadata.semanticRole)?.toLowerCase() ?? '';
  if (examples.length > 0 && examples.length <= 50) return true;
  return [
    'order_type',
    'order status',
    'payment_method',
    'payment type',
    'daypart',
    'channel',
    'source',
    'status'
  ].some(term => name.includes(term.replace(/\s+/g, '_')) || role.includes(term));
}

function searchableTextDimension(field: FieldDefinition, metadata: Record<string, unknown>): boolean {
  const type = field.type.toLowerCase();
  if (!['string', 'text', 'varchar', 'nvarchar'].some(term => type.includes(term))) return false;
  const text = textValuesFromUnknown([
    field.name,
    field.name.replace(/[_-]/g, ' '),
    field.label,
    field.description,
    field.dictionaryDescription,
    metadata.businessName,
    metadata.label,
    metadata.semanticRole,
    metadata.role,
    metadata.synonyms
  ]).join(' ').toLowerCase();
  return ['product', 'item', 'customer', 'invoice', 'staff', 'employee', 'location'].some(term => text.includes(term));
}

function entityTypeForField(
  _table: TableDefinition,
  field: FieldDefinition,
  metadata: Record<string, unknown>
): string | undefined {
  const text = textValuesFromUnknown([
    field.name,
    field.name.replace(/[_-]/g, ' '),
    field.label,
    field.description,
    field.dictionaryDescription,
    metadata.businessName,
    metadata.label,
    metadata.semanticRole,
    metadata.role,
    metadata.synonyms
  ]).join(' ').toLowerCase();
  if (/\b(product|item)\b/.test(text)) return 'product';
  if (/\b(customer|guest)\b/.test(text)) return 'customer';
  if (/\b(invoice|receipt|order number)\b/.test(text)) return 'invoice';
  if (/\b(branch|location|site)\b/.test(text)) return 'location';
  if (/\b(payment|tender)\b/.test(text)) return 'payment_method';
  if (/\border type\b|\border_type\b|\bchannel\b/.test(text)) return 'order_type';
  return undefined;
}

function readResolverLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : DEFAULT_VALUE_RESOLVER_LIMIT;
  if (!Number.isFinite(parsed)) return DEFAULT_VALUE_RESOLVER_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_VALUE_RESOLVER_LIMIT);
}

function textValuesFromUnknown(value: unknown): string[] {
  const direct = readString(value);
  if (direct) return [direct];
  if (Array.isArray(value)) return value.flatMap(textValuesFromUnknown);
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(textValuesFromUnknown);
}

function searchVariantsForField(table: TableDefinition, field: FieldDefinition, searchText: string): string[] {
  const variants = new Set<string>([searchText]);
  const matchingConcepts = bestMatchingExpansionConcepts(valueConceptsForField(table, field), searchText);
  for (const concept of matchingConcepts) {
    for (const value of concept.matchValues) variants.add(value);
  }
  const metadata = analyzerFieldMetadata(table, field.name);
  const genericEntityVariant = genericLookupEntitySuffixVariant(field, metadata, searchText);
  if (genericEntityVariant) variants.add(genericEntityVariant);
  if (typoTolerantLookupField(field, metadata) && !lookupFieldUsesStrictSearchVariants(field, metadata)) {
    const partial = partialSearchVariant(searchText);
    if (partial) variants.add(partial);
    if (genericEntityVariant) {
      const genericPartial = partialSearchVariant(genericEntityVariant);
      if (genericPartial) variants.add(genericPartial);
    }
  }
  return uniqueStrings(Array.from(variants).map(value => value.trim()).filter(Boolean));
}

function typoTolerantLookupField(field: FieldDefinition, metadata: Record<string, unknown>): boolean {
  const entityType = readString(metadata.entityType) ?? entityTypeForField({} as TableDefinition, field, metadata);
  return [
    'client',
    'company',
    'customer',
    'location',
    'product',
    'site'
  ].includes(String(entityType ?? '').trim().toLowerCase());
}

function lookupFieldUsesStrictSearchVariants(field: FieldDefinition, metadata: Record<string, unknown>): boolean {
  const entityType = readString(metadata.entityType) ?? entityTypeForField({} as TableDefinition, field, metadata);
  return String(entityType ?? '').trim().toLowerCase() === 'product';
}

function partialSearchVariant(searchText: string): string | null {
  const tokens = searchTokens(searchText)
    .filter(token => token.length >= 3)
    .map(token => token.length >= 5 ? token.slice(0, 3) : token);
  const variant = uniqueStrings(tokens).join(' ');
  const normalized = normalizeText(searchText);
  return variant && variant !== normalized ? variant : null;
}

function genericLookupEntitySuffixVariant(
  field: FieldDefinition,
  metadata: Record<string, unknown>,
  searchText: string
): string | null {
  const entityType = readString(metadata.entityType) ?? entityTypeForField({} as TableDefinition, field, metadata);
  const normalizedEntityType = String(entityType ?? '').trim().toLowerCase();
  if (!['account', 'client', 'company', 'customer', 'entity', 'location', 'organization', 'organisation', 'site', 'subject', 'tenant'].includes(normalizedEntityType)) {
    return null;
  }
  const tokens = searchTokens(searchText).filter(token => !GENERIC_LOOKUP_ENTITY_SUFFIX_TOKENS.has(token));
  if (tokens.length === 0) return null;
  const stripped = tokens.join(' ');
  return normalizeText(stripped) === normalizeText(searchText) ? null : stripped;
}

function valueConceptsForField(table: TableDefinition, field: FieldDefinition): AnalyzerValueConcept[] {
  return uniqueFieldValueConcepts([
    ...valueConceptsForTable(table).filter(concept => concept.targetField === field.name),
    ...readFieldValueConcepts(analyzerFieldMetadata(table, field.name), field.name)
  ]);
}

function readFieldValueConcepts(metadata: Record<string, unknown>, targetField: string): AnalyzerValueConcept[] {
  const raw = metadata.valueConcepts ?? metadata.valueAliases ?? metadata.valueGroups;
  if (isRecord(raw)) {
    return Object.entries(raw).flatMap(([conceptKey, aliases]) => {
      if (!conceptKey.trim()) return [];
      return [{
        appliesToMetrics: [],
        conceptKey: conceptKey.trim(),
        label: conceptKey.trim(),
        matchType: 'in',
        matchValues: [conceptKey.trim()],
        synonyms: readStringArray(aliases),
        targetField
      }];
    });
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(item => {
    if (!isRecord(item)) return [];
    const conceptKey = readString(item.conceptKey ?? item.key ?? item.id ?? item.label);
    const matchValues = readStringArray(item.matchValues ?? item.values ?? item.sourceValues);
    if (!conceptKey || matchValues.length === 0) return [];
    return [{
      appliesToMetrics: readStringArray(item.appliesToMetrics),
      conceptKey,
      label: readString(item.label) ?? conceptKey,
      matchType: readString(item.matchType) ?? 'in',
      matchValues,
      synonyms: readStringArray(item.synonyms ?? item.aliases),
      targetField: readString(item.targetField ?? item.field) ?? targetField
    }];
  }).filter(concept => concept.targetField === targetField);
}

function uniqueFieldValueConcepts(concepts: AnalyzerValueConcept[]): AnalyzerValueConcept[] {
  return Array.from(new Map(concepts.map(concept => [
    `${concept.targetField}:${concept.conceptKey}:${concept.matchValues.join('|')}`,
    concept
  ])).values());
}

function valueMatchesSearch(value: string, searchVariants: string[]): boolean {
  const normalized = normalizeText(value);
  const valueTokens = new Set(searchTokens(value));
  return searchVariants.some(variant => {
    const normalizedVariant = normalizeText(variant);
    if (!normalizedVariant) return false;
    if (normalized === normalizedVariant || normalized.includes(normalizedVariant)) return true;
    const tokens = searchTokens(variant);
    return tokens.length > 0 && tokens.every(token => valueTokens.has(token));
  });
}

function lookupRowMatch(
  row: AnalyzerLookupDatasetRow,
  searchText: string,
  searchVariants: string[]
): { matched: boolean; matchType: string; score: number } {
  const directText = [row.searchText, row.value].join(' ');
  if (valueMatchesSearch(directText, searchVariants)) {
    const matchType = matchTypeForValue(directText, searchText, searchVariants);
    return { matched: true, matchType, score: directLookupScore(matchType) };
  }
  const fuzzy = fuzzyPhraseMatchAcrossVariants(directText, [searchText, ...searchVariants]);
  if (fuzzy.matched) {
    return { matched: true, matchType: 'fuzzy_lookup', score: 70 + fuzzy.score };
  }
  return { matched: false, matchType: 'none', score: 0 };
}

function fuzzyPhraseMatchAcrossVariants(value: string, variants: string[]): { matched: boolean; score: number } {
  let bestScore = 0;
  for (const variant of uniqueStrings(variants.map(item => item.trim()).filter(Boolean))) {
    const match = fuzzyPhraseMatch(value, variant);
    if (match.matched && match.score > bestScore) bestScore = match.score;
  }
  return bestScore > 0 ? { matched: true, score: bestScore } : { matched: false, score: 0 };
}

function fuzzyPhraseMatch(value: string, searchText: string): { matched: boolean; score: number } {
  const search = compactNormalizedText(searchText);
  if (search.length < 5) return { matched: false, score: 0 };
  let bestScore = 0;
  for (const candidate of fuzzyCandidatePhrases(value)) {
    const candidateText = compactNormalizedText(candidate);
    if (candidateText.length < 5) continue;
    const maxLength = Math.max(search.length, candidateText.length);
    const distance = levenshteinDistance(search, candidateText);
    const score = 1 - distance / maxLength;
    const accepted = maxLength <= 12
      ? distance <= 2 && score >= 0.78
      : distance <= 3 && score >= 0.84;
    if (accepted) bestScore = Math.max(bestScore, score);
  }
  return bestScore > 0 ? { matched: true, score: bestScore } : { matched: false, score: 0 };
}

function fuzzyCandidatePhrases(value: string): string[] {
  const normalized = normalizeText(value);
  const tokens = searchTokens(normalized);
  const phrases = new Set<string>([
    normalized,
    ...tokens
  ]);
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      phrases.add(tokens.slice(index, index + size).join(' '));
    }
  }
  return Array.from(phrases);
}

function matchTypeForValue(value: string, searchText: string, searchVariants: string[]): string {
  const normalizedValue = normalizeText(value);
  const normalizedSearch = normalizeText(searchText);
  if (normalizedValue === normalizedSearch) return 'exact';
  if (normalizedValue.includes(normalizedSearch)) return 'contains';
  if (searchVariants.some(variant => normalizeText(variant) !== normalizedSearch && valueMatchesSearch(value, [variant]))) return 'alias';
  return 'token_match';
}

function directLookupScore(matchType: string): number {
  switch (matchType) {
    case 'exact':
      return 130;
    case 'token_match':
      return 120;
    case 'alias':
      return 115;
    case 'contains':
      return 100;
    default:
      return 100;
  }
}

function bestMatchingExpansionConcepts(
  concepts: AnalyzerValueConcept[],
  searchText: string
): AnalyzerValueConcept[] {
  const scored = concepts
    .map(concept => ({ concept, score: valueConceptExpansionScore(concept, searchText) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score);
  const bestScore = scored[0]?.score ?? 0;
  if (bestScore <= 0) return [];
  return scored
    .filter(item => item.score === bestScore)
    .map(item => item.concept);
}

function valueConceptExpansionScore(
  concept: AnalyzerValueConcept,
  searchText: string
): number {
  const normalizedSearch = normalizeText(searchText);
  if (!normalizedSearch) return 0;
  const candidates = expansionCandidatesForConcept(concept);
  let best = 0;
  for (const candidate of candidates) {
    const score = normalizedConceptCandidateScore(candidate, normalizedSearch);
    if (score > best) best = score;
  }
  if (best <= 0) return 0;
  const specificityBonus = Math.max(0, 20 - concept.matchValues.length);
  return best * 100 + specificityBonus;
}

function expansionCandidatesForConcept(concept: AnalyzerValueConcept): string[] {
  return uniqueStrings([
    concept.label,
    concept.conceptKey,
    ...concept.synonyms,
    ...(concept.matchValues.length === 1 ? concept.matchValues : [])
  ].filter(Boolean));
}

function normalizedConceptCandidateScore(candidate: string, normalizedSearch: string): number {
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedCandidate) return 0;
  if (normalizedCandidate === normalizedSearch) return 5;
  if (normalizedCandidate.includes(normalizedSearch) || normalizedSearch.includes(normalizedCandidate)) return 4;
  if (valueMatchesSearch(candidate, [normalizedSearch])) return 3;
  if (fuzzyPhraseMatch(candidate, normalizedSearch).matched) return 2;
  return 0;
}

function searchTokens(value: string): string[] {
  return uniqueStrings(normalizeText(value).split(/\s+/).filter(token => token.length >= 2));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function compactNormalizedText(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? leftIndex) + 1,
        (previous[rightIndex] ?? rightIndex) + 1,
        (previous[rightIndex - 1] ?? rightIndex - 1) + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, character => `\\${character}`);
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function positiveMilliseconds(value: unknown, fallback: number): number {
  return positiveInteger(value, fallback / 1000) * 1000;
}

function withResolverTiming(
  result: Record<string, unknown>,
  startedAt: number,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const existing = isRecord(result.timing) ? result.timing : {};
  return {
    ...result,
    timing: {
      ...existing,
      ...extra,
      resolverElapsedMs: Date.now() - startedAt
    }
  };
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
