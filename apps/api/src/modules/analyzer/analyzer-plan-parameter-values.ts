import type { TableDefinition } from '../data-source/foundation-store.js';
import { isRecord, readString } from './analyzer-plan-utils.js';

export interface DateRange {
  from: string;
  to: string;
}

export interface AnalyzerParameterDefinition {
  dateBoundary?: string;
  dataType?: string;
  dateRole?: string;
  defaultValue?: string;
  name: string;
  required?: boolean;
  source?: 'dictionary' | 'settings';
}

export interface AnalyzerParameterSelection {
  defaultedPeriodLabel?: string;
  values: Record<string, string>;
}

export interface AnalyzerDateRangeSelection {
  defaultedPeriodLabel?: string;
  range: DateRange | null;
}

const MONTHS = new Map([
  ['jan', 0],
  ['january', 0],
  ['feb', 1],
  ['february', 1],
  ['mar', 2],
  ['march', 2],
  ['apr', 3],
  ['april', 3],
  ['may', 4],
  ['jun', 5],
  ['june', 5],
  ['jul', 6],
  ['july', 6],
  ['aug', 7],
  ['august', 7],
  ['sep', 8],
  ['sept', 8],
  ['september', 8],
  ['oct', 9],
  ['october', 9],
  ['nov', 10],
  ['november', 10],
  ['dec', 11],
  ['december', 11]
]);

const WEAK_CONFIGURED_SCOPE_TOKENS = new Set([
  'and',
  'branch',
  'business',
  'client',
  'company',
  'customer',
  'entity',
  'group',
  'inc',
  'location',
  'ltd',
  'organization',
  'organisation',
  'pty',
  'site',
  'subject',
  'the'
]);

export function analyzerParameterValuesForQuestion(
  table: TableDefinition,
  question: string
): Record<string, string> {
  return analyzerParameterSelectionForQuestion(table, question).values;
}

export function analyzerParameterSelectionForQuestion(
  table: TableDefinition,
  question: string,
  now: Date = new Date()
): AnalyzerParameterSelection {
  const definitions = analyzerParameterDefinitionsForTable(table);
  const names = new Set(definitions.map(definition => definition.name));
  const nameLookup = parameterNameLookup(names);
  const asOfDateName = parameterNameByAliases(nameLookup, ['as_of_date', 'asOfDate']);
  const reportDateName = parameterNameByAliases(nameLookup, ['report_date', 'reportDate']);
  const rangePair = rangeParameterPair(nameLookup);
  const rawRange = explicitDateRange(question, now);
  const range = rawRange && rangePair
    ? normalizeDateRangeForParameterPair(rawRange, definitions, rangePair)
    : rawRange;
  const rawSingleDate = explicitSingleDate(question, now) ?? rawRange?.from ?? null;
  const singleDate = rawSingleDate && rangePair
    ? normalizeDateRangeForParameterPair({ from: rawSingleDate, to: rawSingleDate }, definitions, rangePair).from
    : rawSingleDate;
  const modelDefaultRange = rangePair ? defaultDateRangeForTable(table, definitions, rangePair) : null;
  const defaultRange = modelDefaultRange
    ?? (rangePair
      ? normalizeDateRangeForParameterPair(previousFullMonthRange(now), definitions, rangePair)
      : previousFullMonthRange(now));
  const values: Record<string, string> = {};
  let defaultedPeriodLabel: string | undefined;

  if (asOfDateName && singleDate) values[asOfDateName] = singleDate;
  if (reportDateName && singleDate) values[reportDateName] = singleDate;
  const organizationScopeName = parameterNameByAliases(nameLookup, [
    'accountId',
    'account_id',
    'account',
    'companyId',
    'organizationId',
    'organization_id',
    'organization',
    'organisationId',
    'organisation_id',
    'organisation',
    'company_id',
    'company',
    'clientId',
    'client_id',
    'client',
    'customerId',
    'customer_id',
    'customer',
    'businessId',
    'business_id',
    'business',
    'tenantId',
    'tenant_id',
    'tenant'
  ]);
  const locationScopeName = parameterNameByAliases(nameLookup, [
    'locationId',
    'location_id',
    'location',
    'branchId',
    'branch_id',
    'branch',
    'siteId',
    'site_id',
    'site',
    'warehouseId',
    'warehouse_id',
    'warehouse'
  ]);
  const organizationId = explicitOrganizationScopeId(question);
  const locationId = explicitLocationScopeId(question);
  const configuredScopeMentioned = questionMentionsConfiguredBusinessScope(table, question);
  const configuredScopeIdMentioned = questionMentionsConfiguredBusinessScopeId(table, organizationId, locationId);
  const configuredScopeIdMatch = configuredBusinessScopeIdMatch(table, organizationId, locationId);
  const treatExplicitLocationIdAsOrganizationScope = Boolean(
    locationId
    && configuredScopeIdMatch.organizationScope
    && !configuredScopeIdMatch.locationScope
  );
  if (organizationScopeName && organizationId) values[organizationScopeName] = organizationId;
  if (
    organizationScopeName
    && !organizationId
    && locationId
    && (
      treatExplicitLocationIdAsOrganizationScope
      || parameterNameMatchesConfiguredOrganizationScope(table, organizationScopeName, locationId)
      || (!locationScopeName && !tableHasLocationScopeField(table))
      || tableLocationFieldMapsToOrganizationScope(table)
    )
  ) {
    values[organizationScopeName] = locationId;
  }
  if (locationScopeName && locationId && !treatExplicitLocationIdAsOrganizationScope) values[locationScopeName] = locationId;
  if (rangePair && range) {
    values[rangePair.start] = range.from;
    values[rangePair.end] = range.to;
  } else if (rangePair && rawSingleDate) {
    const singleDateRange = normalizeDateRangeForParameterPair({ from: rawSingleDate, to: rawSingleDate }, definitions, rangePair);
    values[rangePair.start] = singleDateRange.from;
    values[rangePair.end] = singleDateRange.to;
  } else if (rangePair) {
    values[rangePair.start] = defaultRange.from;
    values[rangePair.end] = defaultRange.to;
    defaultedPeriodLabel = modelDefaultRange
      ? `the configured default period (${defaultRange.from} to ${defaultRange.to})`
      : `last month (${defaultRange.from} to ${defaultRange.to})`;
  } else if (asOfDateName && !singleDate) {
    const defaultValue = defaultDateValueForName(table, definitions, asOfDateName);
    values[asOfDateName] = defaultValue ?? defaultRange.to;
    defaultedPeriodLabel = defaultValue
      ? `the configured default date (${values[asOfDateName]})`
      : `the end of last month (${values[asOfDateName]})`;
  } else if (reportDateName && !singleDate) {
    const defaultValue = defaultDateValueForName(table, definitions, reportDateName);
    values[reportDateName] = defaultValue ?? defaultRange.to;
    defaultedPeriodLabel = defaultValue
      ? `the configured default date (${values[reportDateName]})`
      : `the end of last month (${values[reportDateName]})`;
  }

  for (const definition of definitions) {
    if (values[definition.name] !== undefined) continue;
    if (shouldSkipImplicitDefault(definition, {
      hasExplicitOrganizationScope: Boolean(organizationId) || configuredScopeMentioned || configuredScopeIdMentioned,
      hasExplicitLocationScope: Boolean(locationId) || configuredScopeMentioned || configuredScopeIdMentioned,
      hasRangeSelection: Boolean(rangePair && (range || singleDate))
    })) continue;
    const defaultValue = defaultParameterValueForName(table, definitions, definition.name);
    if (defaultValue !== null) values[definition.name] = defaultValue;
  }

  return {
    ...(defaultedPeriodLabel ? { defaultedPeriodLabel } : {}),
    values
  };
}

function defaultDateRangeForTable(
  table: TableDefinition,
  definitions: AnalyzerParameterDefinition[],
  pair: { end: string; start: string }
): DateRange | null {
  const from = defaultDateValueForName(table, definitions, pair.start);
  const to = defaultDateValueForName(table, definitions, pair.end);
  return from && to ? { from, to } : null;
}

function defaultDateValueForName(
  table: TableDefinition,
  definitions: AnalyzerParameterDefinition[],
  name: string
): string | null {
  return normalizeDefaultDate(defaultParameterValueForName(table, definitions, name));
}

function defaultParameterValueForName(
  table: TableDefinition,
  definitions: AnalyzerParameterDefinition[],
  name: string
): string | null {
  const defaults = [
    isRecord(table.settings?.defaults) ? table.settings.defaults[name] : undefined,
    isRecord(table.dictionary.defaults) ? table.dictionary.defaults[name] : undefined,
    definitions.find(definition => definition.name === name)?.defaultValue
  ];
  for (const value of defaults) {
    const normalized = normalizeDefaultParameterValue(value);
    if (normalized) return normalized;
  }
  return null;
}

function parameterNameLookup(names: Set<string>): Map<string, string> {
  return new Map(Array.from(names).map(name => [normalizeParameterName(name), name]));
}

function parameterNameByAliases(
  lookup: Map<string, string>,
  aliases: string[]
): string | null {
  for (const alias of aliases) {
    const name = lookup.get(normalizeParameterName(alias));
    if (name) return name;
  }
  return null;
}

function tableHasLocationScopeField(table: TableDefinition): boolean {
  return table.fields.some(field => {
    const metadata = fieldMetadata(table, field.name);
    const tokens = fieldScopeTokens(field, metadata);
    return locationScopeTokens(tokens);
  });
}

function tableLocationFieldMapsToOrganizationScope(table: TableDefinition): boolean {
  return table.fields.some(field => {
    const metadata = fieldMetadata(table, field.name);
    const tokens = fieldScopeTokens(field, metadata);
    return locationScopeTokens(tokens) && organizationScopeTokens(tokens);
  });
}

function fieldMetadata(table: TableDefinition, fieldName: string): Record<string, unknown> {
  const dictionary = table.dictionary;
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  for (const source of [dictionary.columns, dictionary.fields, ai.columns, ai.fields]) {
    if (Array.isArray(source)) {
      const match = source.find(item => isRecord(item) && readString(item.name) === fieldName);
      if (isRecord(match)) return match;
    }
    if (isRecord(source) && isRecord(source[fieldName])) return source[fieldName];
  }
  return {};
}

function parameterTokens(values: unknown[]): Set<string> {
  return new Set(values.flatMap(stringsFromUnknown).flatMap(value => [
    normalizeParameterName(value),
    ...value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  ]));
}

function fieldScopeTokens(field: TableDefinition['fields'][number], metadata: Record<string, unknown>): Set<string> {
  return parameterTokens([
    field.name,
    (field as { label?: unknown }).label,
    field.description,
    field.dictionaryDescription,
    metadata.businessName,
    metadata.label,
    metadata.name,
    metadata.role,
    metadata.semanticRole,
    metadata.synonyms
  ]);
}

function stringsFromUnknown(value: unknown): string[] {
  const direct = readString(value);
  if (direct) return [direct];
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)];
  if (typeof value === 'boolean') return [value ? 'true' : 'false'];
  if (Array.isArray(value)) return value.flatMap(stringsFromUnknown);
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(stringsFromUnknown);
}

function locationScopeTokens(tokens: Set<string>): boolean {
  return ['branch', 'location', 'site', 'warehouse'].some(token => tokens.has(token))
    || tokens.has('branchid')
    || tokens.has('locationid')
    || tokens.has('siteid')
    || tokens.has('warehouseid');
}

function organizationScopeTokens(tokens: Set<string>): boolean {
  return ['account', 'business', 'client', 'company', 'customer', 'organization', 'organisation', 'tenant'].some(token => tokens.has(token))
    || tokens.has('accountid')
    || tokens.has('businessid')
    || tokens.has('clientid')
    || tokens.has('companyid')
    || tokens.has('customerid')
    || tokens.has('organizationid')
    || tokens.has('organisationid')
    || tokens.has('tenantid');
}

function rangeParameterPair(lookup: Map<string, string>): { end: string; start: string } | null {
  const pairs: Array<[string, string]> = [
    ['from', 'to'],
    ['fromDate', 'toDate'],
    ['startDate', 'endDate'],
    ['dateFrom', 'dateTo']
  ];
  for (const [startAlias, endAlias] of pairs) {
    const start = lookup.get(normalizeParameterName(startAlias));
    const end = lookup.get(normalizeParameterName(endAlias));
    if (start && end) return { start, end };
  }
  return null;
}

function normalizeParameterName(value: string): string {
  return value.trim().replace(/[\s_-]+/g, '').toLowerCase();
}

export function analyzerDateRangeSelectionForQuestion(
  question: string,
  now: Date = new Date()
): AnalyzerDateRangeSelection {
  const range = explicitDateRange(question, now);
  const singleDate = explicitSingleDate(question, now);
  if (range) return { range };
  if (singleDate) return { range: { from: singleDate, to: singleDate } };
  if (questionRequestsUnboundedRange(question)) return { range: null };
  const defaultRange = previousFullMonthRange(now);
  return {
    defaultedPeriodLabel: `last month (${defaultRange.from} to ${defaultRange.to})`,
    range: defaultRange
  };
}

export function analyzerParameterNamesForTable(table: TableDefinition): Set<string> {
  return new Set(analyzerParameterDefinitionsForTable(table).map(definition => definition.name));
}

export function analyzerParameterDefinitionsForTable(table: TableDefinition): AnalyzerParameterDefinition[] {
  return [
    ...readParameterDefinitions(table.dictionary.parameters, 'dictionary'),
    ...readParameterDefinitions(table.settings?.parameters, 'settings')
  ];
}

export function analyzerParameterDateRangeForDisplay(
  table: TableDefinition,
  range: DateRange,
  endParameterName: string
): DateRange {
  const definition = findEffectiveParameterDefinition(
    analyzerParameterDefinitionsForTable(table),
    endParameterName
  );
  if (!definition || !usesExclusiveEndBoundary(definition) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) {
    return { ...range };
  }
  return {
    from: range.from,
    to: addIsoDateDays(range.to, -1)
  };
}

export function shouldExposeAnalyzerParameterDefault(definition: AnalyzerParameterDefinition): boolean {
  return !isBusinessScopeParameter(definition)
    && (normalizeParameterName(definition.dateRole ?? '') !== 'asof' || definition.source === 'dictionary');
}

function shouldSkipImplicitDefault(
  definition: AnalyzerParameterDefinition,
  context: {
    hasExplicitOrganizationScope: boolean;
    hasExplicitLocationScope: boolean;
    hasRangeSelection: boolean;
  }
): boolean {
  if (isOrganizationScopeParameter(definition)) return !context.hasExplicitOrganizationScope;
  if (isLocationScopeParameter(definition)) return !context.hasExplicitLocationScope;
  if (context.hasRangeSelection && normalizeParameterName(definition.dateRole ?? '') === 'asof') return true;
  return false;
}

function isBusinessScopeParameter(definition: AnalyzerParameterDefinition): boolean {
  return isOrganizationScopeParameter(definition) || isLocationScopeParameter(definition);
}

export function isAnalyzerBusinessScopeParameter(definition: AnalyzerParameterDefinition): boolean {
  return isBusinessScopeParameter(definition);
}

function isOrganizationScopeParameter(definition: AnalyzerParameterDefinition): boolean {
  const normalized = normalizeParameterName(definition.name);
  return normalized === 'account'
    || normalized === 'accountid'
    || normalized === 'company'
    || normalized === 'companyid'
    || normalized === 'client'
    || normalized === 'clientid'
    || normalized === 'customer'
    || normalized === 'customerid'
    || normalized === 'tenant'
    || normalized === 'tenantid'
    || normalized === 'organization'
    || normalized === 'organizationid'
    || normalized === 'organisation'
    || normalized === 'organisationid'
    || normalized === 'business'
    || normalized === 'businessid';
}

function isLocationScopeParameter(definition: AnalyzerParameterDefinition): boolean {
  const normalized = normalizeParameterName(definition.name);
  return normalized === 'branch'
    || normalized === 'branchid'
    || normalized === 'location'
    || normalized === 'locationid'
    || normalized === 'site'
    || normalized === 'siteid'
    || normalized === 'warehouse'
    || normalized === 'warehouseid';
}

function readParameterDefinitions(
  value: unknown,
  source: NonNullable<AnalyzerParameterDefinition['source']>
): AnalyzerParameterDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const name = readString(item.name);
    if (!name) return [];
    const dataType = readString(item.dataType) ?? readString(item.type);
    const dateRole = readString(item.dateRole);
    const dateBoundary = readString(item.dateBoundary) ?? readString(item.boundary) ?? readString(item.endBoundary);
    const defaultValue = normalizeDefaultParameterValue(item.defaultValue ?? item.default);
    return [{
      name,
      required: item.required !== false,
      ...(dataType ? { dataType } : {}),
      ...(dateRole ? { dateRole } : {}),
      ...(dateBoundary ? { dateBoundary } : {}),
      ...(defaultValue ? { defaultValue } : {}),
      source
    }];
  });
}

function normalizeDateRangeForParameterPair(
  range: DateRange,
  definitions: AnalyzerParameterDefinition[],
  pair: { end: string; start: string }
): DateRange {
  const endDefinition = findEffectiveParameterDefinition(definitions, pair.end);
  if (!endDefinition || !usesExclusiveEndBoundary(endDefinition)) return range;
  return {
    from: range.from,
    to: addIsoDateDays(range.to, 1)
  };
}

function findEffectiveParameterDefinition(
  definitions: AnalyzerParameterDefinition[],
  name: string
): AnalyzerParameterDefinition | undefined {
  for (let index = definitions.length - 1; index >= 0; index -= 1) {
    const definition = definitions[index];
    if (definition?.name === name) return definition;
  }
  return undefined;
}

function usesExclusiveEndBoundary(definition: AnalyzerParameterDefinition): boolean {
  if (normalizeParameterName(definition.dateRole ?? '') !== 'end') return false;
  const boundary = normalizeParameterName(definition.dateBoundary ?? '');
  return boundary === 'exclusive' || boundary === 'exclusiveend' || boundary === 'endexclusive';
}

function addIsoDateDays(value: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (!Number.isFinite(date.getTime())) return value;
  const shifted = addUtcDays(date, days);
  return formatDate(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

function normalizeDefaultDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

function normalizeDefaultParameterValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
}

function questionMentionsConfiguredBusinessScope(table: TableDefinition, question: string): boolean {
  const settings = isRecord(table.settings) ? table.settings : {};
  const clientScope = isRecord(settings.clientScope) ? settings.clientScope : {};
  const candidates = [
    clientScope.accountName,
    clientScope.businessName,
    clientScope.clientName,
    clientScope.companyName,
    clientScope.customerName,
    clientScope.entityName,
    clientScope.locationName,
    clientScope.organizationName,
    clientScope.organisationName,
    clientScope.siteName,
    clientScope.subjectName
  ].flatMap(stringsFromUnknown);
  return candidates.some(candidate => configuredScopeNameMatchesQuestion(candidate, question));
}

function configuredScopeNameMatchesQuestion(scopeName: string, question: string): boolean {
  const questionTokens = parameterTokens([question]);
  const scopeTokens = Array.from(parameterTokens([scopeName]))
    .filter(token => token.length >= 3 && !WEAK_CONFIGURED_SCOPE_TOKENS.has(token));
  return scopeTokens.some(token => questionTokens.has(token));
}

function questionMentionsConfiguredBusinessScopeId(
  table: TableDefinition,
  organizationId: string | null,
  locationId: string | null
): boolean {
  const match = configuredBusinessScopeIdMatch(table, organizationId, locationId);
  return match.organizationScope || match.locationScope;
}

function configuredBusinessScopeIdMatch(
  table: TableDefinition,
  organizationId: string | null,
  locationId: string | null
): { organizationScope: boolean; locationScope: boolean } {
  const settings = isRecord(table.settings) ? table.settings : {};
  const defaults = isRecord(settings.defaults) ? settings.defaults : {};
  const clientScope = isRecord(settings.clientScope) ? settings.clientScope : {};
  const organizationScope = valueMatchesAnyScopeId(organizationId, [
    clientScope.accountId,
    clientScope.businessId,
    clientScope.clientId,
    clientScope.organizationId,
    clientScope.organisationId,
    clientScope.companyId,
    clientScope.customerId,
    clientScope.entityId,
    clientScope.subjectId,
    clientScope.tenantId,
    defaults.accountId,
    defaults.businessId,
    defaults.clientId,
    defaults.organizationId,
    defaults.organisationId,
    defaults.companyId,
    defaults.customerId,
    defaults.entityId,
    defaults.subjectId,
    defaults.tenantId
  ]) || valueMatchesAnyScopeId(locationId, [
    clientScope.accountId,
    clientScope.businessId,
    clientScope.clientId,
    clientScope.organizationId,
    clientScope.organisationId,
    clientScope.companyId,
    clientScope.customerId,
    clientScope.entityId,
    clientScope.subjectId,
    clientScope.tenantId,
    defaults.accountId,
    defaults.businessId,
    defaults.clientId,
    defaults.organizationId,
    defaults.organisationId,
    defaults.companyId,
    defaults.customerId,
    defaults.entityId,
    defaults.subjectId,
    defaults.tenantId
  ]);
  const locationScope = valueMatchesAnyScopeId(locationId, [
    clientScope.branchId,
    clientScope.locationId,
    clientScope.siteId,
    clientScope.warehouseId,
    defaults.branchId,
    defaults.locationId,
    defaults.siteId,
    defaults.warehouseId
  ]);
  return { organizationScope, locationScope };
}

function valueMatchesAnyScopeId(value: string | null, candidates: unknown[]): boolean {
  if (!value) return false;
  return candidates
    .flatMap(stringsFromUnknown)
    .some(candidate => candidate === value);
}

function parameterNameMatchesConfiguredOrganizationScope(
  table: TableDefinition,
  parameterName: string,
  locationId: string
): boolean {
  if (!['accountid', 'businessid', 'clientid', 'companyid', 'customerid', 'organizationid', 'organisationid', 'tenantid'].includes(normalizeParameterName(parameterName))) {
    return false;
  }
  const match = configuredBusinessScopeIdMatch(table, null, locationId);
  return match.organizationScope && !match.locationScope;
}

function explicitDateRange(question: string, now: Date): DateRange | null {
  return monthYearRange(question) ?? relativeDateRange(question, now) ?? isoDateRange(question) ?? weekOfIsoDateRange(question);
}

function explicitOrganizationScopeId(question: string): string | null {
  return firstValidScopeId(question, [
    /\b(?:account|company|client|customer|tenant|business|organization|organisation|entity|subject)\s*(?:id)?\s*(?:is|=|:)?\s*,?\s*(\d{4,})\b/i,
    /\bfor\s*,?\s*(\d{5,})\b/i
  ]);
}

function explicitLocationScopeId(question: string): string | null {
  return firstValidScopeId(question, [
    /\b(?:branch|location|site|warehouse)\s*(?:id)?\s*(?:is|=|:)?\s*,?\s*(\d{3,})\b/i
  ]);
}

function firstValidScopeId(question: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(question);
    const value = match?.[1];
    if (value && isValidBusinessScopeId(value)) return value;
  }
  return null;
}

function isValidBusinessScopeId(value: string): boolean {
  const numberValue = Number(value);
  return Number.isInteger(numberValue)
    && numberValue > 99
    && !(numberValue >= 1900 && numberValue <= 2099);
}

function explicitSingleDate(question: string, now: Date): string | null {
  return relativeSingleDate(question, now) ?? isoDateMentions(question)[0] ?? null;
}

function isoDateRange(question: string): DateRange | null {
  const dates = isoDateMentions(question);
  if (dates.length < 2) return null;
  return { from: dates[0]!, to: dates[1]! };
}

function weekOfIsoDateRange(question: string): DateRange | null {
  if (!question.toLowerCase().includes('week')) return null;
  const [dateText] = isoDateMentions(question);
  if (!dateText) return null;
  const start = new Date(`${dateText}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return null;
  const end = addUtcDays(start, 6);
  return {
    from: formatDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    to: formatDate(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  };
}

function isoDateMentions(question: string): string[] {
  return Array.from(question.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g))
    .flatMap(match => {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      return validDateParts(year, month - 1, day) ? [formatDate(year, month - 1, day)] : [];
    });
}

function monthYearRange(question: string): DateRange | null {
  const match = new RegExp(`\\b(${Array.from(MONTHS.keys()).join('|')})\\s+(20\\d{2})\\b`, 'i').exec(question);
  if (!match?.[1] || !match[2]) return null;
  const month = MONTHS.get(match[1].toLowerCase());
  const year = Number(match[2]);
  if (month === undefined || !Number.isInteger(year)) return null;
  return {
    from: formatDate(year, month, 1),
    to: formatDate(year, month, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())
  };
}

function relativeDateRange(question: string, now: Date): DateRange | null {
  const normalized = question.toLowerCase();
  const today = startOfUtcDay(now);
  if (normalized.includes('last month') || normalized.includes('previous month')) return previousFullMonthRange(today);
  if (normalized.includes('this month') || normalized.includes('current month')) {
    return {
      from: formatDate(today.getUTCFullYear(), today.getUTCMonth(), 1),
      to: formatDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    };
  }
  if (normalized.includes('last week') || normalized.includes('previous week')) {
    const thisWeekStart = startOfUtcWeek(today);
    const start = addUtcDays(thisWeekStart, -7);
    const end = addUtcDays(thisWeekStart, -1);
    return {
      from: formatDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
      to: formatDate(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
    };
  }
  if (normalized.includes('this week') || normalized.includes('current week')) {
    const start = startOfUtcWeek(today);
    return {
      from: formatDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
      to: formatDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    };
  }
  if (/\b(last|past)\s+7\s+days\b/i.test(question)) {
    const start = addUtcDays(today, -6);
    return {
      from: formatDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
      to: formatDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    };
  }
  return null;
}

function relativeSingleDate(question: string, now: Date): string | null {
  const normalized = question.toLowerCase();
  const today = startOfUtcDay(now);
  if (normalized.includes('yesterday')) {
    const yesterday = addUtcDays(today, -1);
    return formatDate(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate());
  }
  if (normalized.includes('today')) return formatDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return null;
}

function questionRequestsUnboundedRange(question: string): boolean {
  return /\b(all time|lifetime|entire history|full history|since inception)\b/i.test(question);
}

function previousFullMonthRange(now: Date): DateRange {
  const today = startOfUtcDay(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const previousMonthStart = new Date(Date.UTC(year, month - 1, 1));
  const previousMonthEnd = new Date(Date.UTC(year, month, 0));
  return {
    from: formatDate(previousMonthStart.getUTCFullYear(), previousMonthStart.getUTCMonth(), 1),
    to: formatDate(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), previousMonthEnd.getUTCDate())
  };
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addUtcDays(startOfUtcDay(date), -daysSinceMonday);
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function validDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
