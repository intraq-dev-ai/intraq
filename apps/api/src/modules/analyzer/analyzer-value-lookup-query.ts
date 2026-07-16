import { dialectForSourceType, quoteSqlIdentifierForType } from '../data-source/sql-dialect.js';
import { uniqueStrings } from './analyzer-plan-utils.js';
import type { AnalyzerValueLookupConfig } from './analyzer-value-lookup.js';

export function buildLookupDatasetQuery(
  sourceType: string,
  config: AnalyzerValueLookupConfig,
  scopeValues: string[]
): string {
  const dialect = dialectForSourceType(sourceType);
  const table = quoteSqlIdentifierForType(config.tableName, sourceType);
  const valueField = quoteSqlIdentifierForType(config.valueField, sourceType);
  const projections = lookupProjections(sourceType, config);
  const where = [`${valueField} is not null`];
  if (config.scopeField && scopeValues.length > 0) {
    const scopeField = quoteSqlIdentifierForType(config.scopeField, sourceType);
    where.push(scopeValues.length === 1
      ? `${scopeField} = ${sqlLiteral(scopeValues[0])}`
      : `${scopeField} in (${scopeValues.map(sqlLiteral).join(', ')})`);
  }
  const selectClause = dialect === 'sqlserver'
    ? `select top ${config.maxRows} ${projections.join(', ')}`
    : `select ${projections.join(', ')}`;
  return [
    selectClause,
    `from ${table}`,
    `where ${where.join(' and ')}`,
    ...(dialect === 'sqlserver' ? [] : [`limit ${config.maxRows}`])
  ].join(' ');
}

export function buildLookupDatasetSearchQuery(
  sourceType: string,
  config: AnalyzerValueLookupConfig,
  scopeValues: string[],
  searchVariants: string[]
): string {
  if (inMemoryQuerySourceType(sourceType)) {
    return buildInMemoryLookupDatasetSearchQuery(sourceType, config, scopeValues, searchVariants);
  }
  const dialect = dialectForSourceType(sourceType);
  const table = quoteSqlIdentifierForType(config.tableName, sourceType);
  const valueField = quoteSqlIdentifierForType(config.valueField, sourceType);
  const searchableFields = uniqueStrings([
    config.valueField,
    config.labelField,
    ...config.searchFields
  ].filter((value): value is string => Boolean(value)))
    .map(field => quoteSqlIdentifierForType(field, sourceType));
  const searchPredicates = searchVariants
    .slice(0, 8)
    .map(variant => searchPredicateForVariant(sourceType, searchableFields, variant))
    .filter(Boolean);
  const where = [`${valueField} is not null`];
  if (config.scopeField && scopeValues.length > 0) {
    const scopeField = quoteSqlIdentifierForType(config.scopeField, sourceType);
    where.push(scopeValues.length === 1
      ? `${scopeField} = ${sqlLiteral(scopeValues[0])}`
      : `${scopeField} in (${scopeValues.map(sqlLiteral).join(', ')})`);
  }
  where.push(searchPredicates.length > 0 ? `(${searchPredicates.join(' or ')})` : '1 = 0');
  const selectClause = dialect === 'sqlserver'
    ? `select top ${config.maxRows} ${lookupProjections(sourceType, config).join(', ')}`
    : `select ${lookupProjections(sourceType, config).join(', ')}`;
  return [
    selectClause,
    `from ${table}`,
    `where ${where.join(' and ')}`,
    ...(dialect === 'sqlserver' ? [] : [`limit ${config.maxRows}`])
  ].join(' ');
}

export function buildLookupDatasetBroadSearchQuery(
  sourceType: string,
  config: AnalyzerValueLookupConfig,
  scopeValues: string[],
  searchVariants: string[]
): string {
  if (inMemoryQuerySourceType(sourceType)) {
    return buildInMemoryLookupDatasetBroadSearchQuery(sourceType, config, scopeValues, searchVariants);
  }
  const dialect = dialectForSourceType(sourceType);
  const table = quoteSqlIdentifierForType(config.tableName, sourceType);
  const valueField = quoteSqlIdentifierForType(config.valueField, sourceType);
  const searchableFields = uniqueStrings([
    config.valueField,
    config.labelField,
    ...config.searchFields
  ].filter((value): value is string => Boolean(value)))
    .map(field => quoteSqlIdentifierForType(field, sourceType));
  const broadTokens = broadSearchTokens(searchVariants);
  const searchPredicates = broadTokens.map(token => `(${searchableFields
    .map(field => lookupSearchLikePredicate(sourceType, field, token))
    .join(' or ')})`);
  const where = [`${valueField} is not null`];
  if (config.scopeField && scopeValues.length > 0) {
    const scopeField = quoteSqlIdentifierForType(config.scopeField, sourceType);
    where.push(scopeValues.length === 1
      ? `${scopeField} = ${sqlLiteral(scopeValues[0])}`
      : `${scopeField} in (${scopeValues.map(sqlLiteral).join(', ')})`);
  }
  where.push(searchPredicates.length > 0 ? `(${searchPredicates.join(' or ')})` : '1 = 0');
  const selectClause = dialect === 'sqlserver'
    ? `select top ${config.maxRows} ${lookupProjections(sourceType, config).join(', ')}`
    : `select ${lookupProjections(sourceType, config).join(', ')}`;
  return [
    selectClause,
    `from ${table}`,
    `where ${where.join(' and ')}`,
    ...(dialect === 'sqlserver' ? [] : [`limit ${config.maxRows}`])
  ].join(' ');
}

function buildInMemoryLookupDatasetSearchQuery(
  sourceType: string,
  config: AnalyzerValueLookupConfig,
  scopeValues: string[],
  searchVariants: string[]
): string {
  const table = quoteSqlIdentifierForType(config.tableName, sourceType);
  const valueField = quoteSqlIdentifierForType(config.valueField, sourceType);
  const searchField = quoteSqlIdentifierForType(
    config.labelField ?? config.searchFields.find(field => field !== config.valueField) ?? config.valueField,
    sourceType
  );
  const tokens = searchTokens(searchVariants.at(-1) ?? searchVariants[0] ?? '').slice(0, 4);
  const where = [`${valueField} is not null`];
  if (config.scopeField && scopeValues.length > 0) {
    const scopeField = quoteSqlIdentifierForType(config.scopeField, sourceType);
    where.push(scopeValues.length === 1
      ? `${scopeField} = ${sqlLiteral(scopeValues[0])}`
      : `${scopeField} in (${scopeValues.map(sqlLiteral).join(', ')})`);
  }
  tokens.forEach(token => {
    where.push(`${searchField} like ${sqlLiteral(`%${escapeLikePattern(token)}%`)}`);
  });
  return [
    `select ${lookupProjections(sourceType, config).join(', ')}`,
    `from ${table}`,
    `where ${where.join(' and ')}`,
    `limit ${config.maxRows}`
  ].join(' ');
}

function buildInMemoryLookupDatasetBroadSearchQuery(
  sourceType: string,
  config: AnalyzerValueLookupConfig,
  scopeValues: string[],
  searchVariants: string[]
): string {
  const table = quoteSqlIdentifierForType(config.tableName, sourceType);
  const valueField = quoteSqlIdentifierForType(config.valueField, sourceType);
  const searchField = quoteSqlIdentifierForType(
    config.labelField ?? config.searchFields.find(field => field !== config.valueField) ?? config.valueField,
    sourceType
  );
  const tokens = broadSearchTokens(searchVariants);
  const where = [`${valueField} is not null`];
  if (config.scopeField && scopeValues.length > 0) {
    const scopeField = quoteSqlIdentifierForType(config.scopeField, sourceType);
    where.push(scopeValues.length === 1
      ? `${scopeField} = ${sqlLiteral(scopeValues[0])}`
      : `${scopeField} in (${scopeValues.map(sqlLiteral).join(', ')})`);
  }
  where.push(tokens.length > 0
    ? `(${tokens.map(token => `${searchField} like ${sqlLiteral(`%${escapeLikePattern(token)}%`)}`).join(' or ')})`
    : '1 = 0');
  return [
    `select ${lookupProjections(sourceType, config).join(', ')}`,
    `from ${table}`,
    `where ${where.join(' and ')}`,
    `limit ${config.maxRows}`
  ].join(' ');
}

function lookupProjections(sourceType: string, config: AnalyzerValueLookupConfig): string[] {
  const valueField = quoteSqlIdentifierForType(config.valueField, sourceType);
  const projections = [`${valueField} as value`];
  if (config.labelField && config.labelField !== config.valueField) {
    projections.push(`${quoteSqlIdentifierForType(config.labelField, sourceType)} as label`);
  }
  config.searchFields
    .filter(field => field !== config.valueField && field !== config.labelField)
    .slice(0, 6)
    .forEach((field, index) => {
      projections.push(`${quoteSqlIdentifierForType(field, sourceType)} as search_${index}`);
    });
  return projections;
}

function searchPredicateForVariant(sourceType: string, searchableFields: string[], variant: string): string {
  const tokens = searchTokens(variant).slice(0, 4);
  if (tokens.length === 0) return '';
  return `(${tokens.map(token => {
    const fieldPredicates = searchableFields
      .map(field => lookupSearchLikePredicate(sourceType, field, token));
    return `(${fieldPredicates.join(' or ')})`;
  }).join(' and ')})`;
}

function lookupSearchLikePredicate(sourceType: string, field: string, token: string): string {
  const pattern = sqlLiteral(`%${escapeLikePattern(token)}%`);
  if (inMemoryQuerySourceType(sourceType)) return `${field} like ${pattern}`;
  return `lower(${field}) like ${pattern} escape ${sqlLiteral('\\')}`;
}

function inMemoryQuerySourceType(sourceType: string): boolean {
  return ['sample', 'source', 'temp'].includes(sourceType.trim().toLowerCase());
}

function searchTokens(value: string): string[] {
  return uniqueStrings(normalizeText(value).split(/\s+/).filter(token => token.length >= 2));
}

const BROAD_SEARCH_WEAK_TOKENS = new Set([
  'client',
  'clients',
  'company',
  'companies',
  'field',
  'id',
  'identifier',
  'location',
  'locations',
  'name',
  'payment',
  'site',
  'sites',
  'status',
  'tenant',
  'tenants',
  'text',
  'type',
  'types',
  'value',
  'values'
]);

function broadSearchTokens(searchVariants: string[]): string[] {
  const tokens = uniqueStrings(searchVariants
    .flatMap(searchTokens)
    .filter(token => token.length >= 3 && !BROAD_SEARCH_WEAK_TOKENS.has(token)));
  const sorted = tokens.sort((left, right) => right.length - left.length || left.localeCompare(right));
  if (sorted.length > 0) return sorted.slice(0, 4);
  return uniqueStrings(searchVariants.flatMap(searchTokens))
    .filter(token => token.length >= 2)
    .slice(0, 4);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
