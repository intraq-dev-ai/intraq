import type { TableDefinition } from '../data-source/foundation-store.js';
import type {
  AnalyzerCapabilityFilterInvocation,
  AnalyzerCapabilityInvocation
} from './analyzer-capability-contract.js';
import {
  analyzerDateRangeSelectionForQuestion,
  analyzerParameterDefinitionsForTable,
  type AnalyzerParameterDefinition
} from './analyzer-plan-parameter-values.js';
import { analyzerFieldMetadata } from './analyzer-plan-field-matching.js';
import { isRecord, readString } from './analyzer-plan-utils.js';

type DateRangePair = { end: string; start: string };

export function normalizeCapabilityInvocationForParameterFilters(
  table: TableDefinition,
  invocation: AnalyzerCapabilityInvocation | null
): AnalyzerCapabilityInvocation | null {
  if (!invocation) return invocation;
  const normalizedFilters = invocation.filters?.map(filter => normalizeCapabilityBooleanFilter(table, filter)) ?? [];
  const filters = normalizedFilters.filter(filter => !filterMapsToParameter(table, filter));
  const groupBy = invocation.operation === 'list' ? [] : invocation.groupBy;
  if (
    filters.length === (invocation.filters?.length ?? 0)
    && filters.every((filter, index) => filter === invocation.filters?.[index])
    && groupBy === invocation.groupBy
  ) {
    return invocation;
  }
  const normalized: AnalyzerCapabilityInvocation = { ...invocation };
  if (filters.length > 0) normalized.filters = filters;
  else delete normalized.filters;
  if (groupBy && groupBy.length > 0) normalized.groupBy = groupBy;
  else delete normalized.groupBy;
  return normalized;
}

export function removeParameterBackedFilters(
  table: TableDefinition,
  filters: Record<string, unknown>[] | undefined
): Record<string, unknown>[] | undefined {
  if (!filters?.length) return filters;
  const retained = filters.filter(filter => !filterMapsToParameter(table, filter));
  if (retained.length === filters.length) return filters;
  return retained.length > 0 ? retained : undefined;
}

export function removeParameterBackedDateFilters(
  table: TableDefinition,
  filters: Record<string, unknown>[] | undefined
): Record<string, unknown>[] | undefined {
  return removeParameterBackedFilters(table, filters);
}

function filterMapsToParameter(
  table: TableDefinition,
  filter: AnalyzerCapabilityFilterInvocation | Record<string, unknown>
): boolean {
  return filterMapsToDeclaredParameter(table, filter)
    || filterMapsToDateRangeParameters(table, filter)
    || filterMapsToBusinessScopeParameter(table, filter);
}

function filterMapsToDeclaredParameter(
  table: TableDefinition,
  filter: AnalyzerCapabilityFilterInvocation | Record<string, unknown>
): boolean {
  const field = readString(filter.field);
  if (!field || table.fields.some(item => item.name === field)) return false;
  const normalizedField = normalizeParameterName(field);
  return analyzerParameterDefinitionsForTable(table).some(definition =>
    normalizeParameterName(definition.name) === normalizedField
  );
}

function normalizeCapabilityBooleanFilter(
  table: TableDefinition,
  filter: AnalyzerCapabilityFilterInvocation
): AnalyzerCapabilityFilterInvocation {
  const field = readString(filter.field);
  if (!field || !booleanField(table, field)) return filter;
  if (filter.value === undefined) {
    const operator = readString(filter.operator)?.trim().toLowerCase();
    if (operator === 'in' || operator === 'equals') {
      return {
        ...filter,
        operator: 'equals',
        value: 1
      };
    }
    return filter;
  }
  if (!Array.isArray(filter.value)) {
    const value = normalizeBooleanFilterValue(filter.value);
    if (value === null) return filter;
    return {
      ...filter,
      operator: 'equals',
      value
    };
  }
  const values = filter.value
    .map(normalizeBooleanFilterValue)
    .filter((value): value is 0 | 1 => value !== null);
  const uniqueValues = Array.from(new Set(values));
  if (uniqueValues.length === 0) return filter;
  return {
    ...filter,
    operator: uniqueValues.length === 1 ? 'equals' : 'in',
    value: uniqueValues.length === 1 ? uniqueValues[0] : uniqueValues
  };
}

function booleanField(table: TableDefinition, fieldName: string): boolean {
  const field = table.fields.find(item => item.name === fieldName);
  const type = String(field?.type ?? '').trim().toLowerCase();
  if (['bit', 'bool', 'boolean'].includes(type)) return true;
  const metadata = analyzerFieldMetadata(table, fieldName);
  if (!metadataHasBooleanConcepts(metadata)) return false;
  const role = readString(metadata.valueResolutionRole)
    ?? readString(metadata.filterRole)
    ?? readString(metadata.plannerFilterRole)
    ?? readString(metadata.semanticRole);
  if (['condition', 'flag', 'boolean'].includes(role?.trim().toLowerCase() ?? '')) return true;
  return metadata.filterOnly === true
    || readString(metadata.filterOnly)?.trim().toLowerCase() === 'true';
}

function metadataHasBooleanConcepts(metadata: Record<string, unknown>): boolean {
  const concepts = metadata.valueConcepts;
  return Array.isArray(concepts) && concepts.some(concept => {
    if (!isRecord(concept)) return false;
    const values = Array.isArray(concept.values) ? concept.values : [concept.values];
    return values.some(value => normalizeBooleanFilterValue(value) !== null);
  });
}

function normalizeBooleanFilterValue(value: unknown): 0 | 1 | null {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 0) return 0;
    if (value === 1) return 1;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === 'yes' || normalized === '1') return 1;
  if (normalized === 'false' || normalized === 'no' || normalized === '0') return 0;
  return null;
}

function filterMapsToDateRangeParameters(
  table: TableDefinition,
  filter: AnalyzerCapabilityFilterInvocation | Record<string, unknown>
): boolean {
  const field = readString(filter.field);
  if (!field || table.fields.some(item => item.name === field)) return false;
  const definitions = analyzerParameterDefinitionsForTable(table);
  if (!dateRangeParameterPair(definitions)) return false;
  return dateLikeFilterValue(filter);
}

function filterMapsToBusinessScopeParameter(
  table: TableDefinition,
  filter: AnalyzerCapabilityFilterInvocation | Record<string, unknown>
): boolean {
  const field = readString(filter.field);
  if (!field) return false;
  const definitions = analyzerParameterDefinitionsForTable(table);
  const fieldFamily = businessScopeFamily(field);
  if (!fieldFamily) return false;
  if (definitions.some(definition => businessScopeFamily(definition.name) === fieldFamily)) return true;
  if (fieldFamily !== 'location') return false;
  const modelHasExplicitLocationScope = table.fields.some(item => businessScopeFamily(item.name) === 'location');
  if (modelHasExplicitLocationScope) return false;
  return definitions.some(definition => businessScopeFamily(definition.name) === 'organization');
}

function dateRangeParameterPair(definitions: AnalyzerParameterDefinition[]): DateRangePair | null {
  const byName = new Map(definitions.map(definition => [normalizeParameterName(definition.name), definition.name]));
  const pairs: Array<[string, string]> = [
    ['from', 'to'],
    ['fromDate', 'toDate'],
    ['startDate', 'endDate'],
    ['dateFrom', 'dateTo']
  ];
  for (const [startAlias, endAlias] of pairs) {
    const start = byName.get(normalizeParameterName(startAlias));
    const end = byName.get(normalizeParameterName(endAlias));
    if (start && end) return { start, end };
  }
  return null;
}

function dateLikeFilterValue(filter: AnalyzerCapabilityFilterInvocation | Record<string, unknown>): boolean {
  const operator = readString(filter.operator)?.trim().toLowerCase();
  if (!operator || !['between', 'equals', 'gte', 'gt', 'lte', 'lt'].includes(operator)) return false;
  if (Object.prototype.hasOwnProperty.call(filter, 'value')) return dateLikeValue(filter.value);
  if (Object.prototype.hasOwnProperty.call(filter, 'values')) {
    return dateLikeValue((filter as Record<string, unknown>).values);
  }
  return false;
}

function dateLikeValue(value: unknown): boolean {
  if (typeof value === 'string') return isIsoDateText(value) || Boolean(analyzerDateRangeSelectionForQuestion(value).range);
  if (!Array.isArray(value)) return false;
  const items = value.filter(item => item !== null && item !== undefined);
  return items.length > 0 && items.every(item =>
    typeof item === 'string'
    && (isIsoDateText(item) || Boolean(analyzerDateRangeSelectionForQuestion(item).range))
  );
}

function isIsoDateText(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return false;
  const time = Date.parse(trimmed);
  return Number.isFinite(time);
}

function normalizeParameterName(value: string): string {
  return value.trim().replace(/[\s_-]+/g, '').toLowerCase();
}

function businessScopeFamily(value: string): 'location' | 'organization' | null {
  const normalized = normalizeParameterName(value);
  if ([
    'account',
    'accountid',
    'company',
    'companyid',
    'client',
    'clientid',
    'customer',
    'customerid',
    'business',
    'businessid',
    'organization',
    'organizationid',
    'organisation',
    'organisationid',
    'tenant',
    'tenantid'
  ].includes(normalized)) return 'organization';
  if ([
    'branch',
    'branchid',
    'location',
    'locationid',
    'site',
    'siteid'
  ].includes(normalized)) return 'location';
  return null;
}
