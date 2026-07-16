import type { DashboardComponentType } from '@intraq/contracts';
import type { AnalyzerPlanRequest } from '../../validation.js';
import type { DataSourceRecord, TableDefinition } from '../data-source/foundation-store.js';
import {
  businessNameForTable,
  firstRoutingRecord
} from './analyzer-plan-schema.js';
import { analyzerVisibleFieldNames } from './analyzer-plan-field-visibility.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import { analyzerFieldMetadata } from './analyzer-plan-field-matching.js';
import { analyzerTokenSet } from './analyzer-token-utils.js';
import { fieldValueResolutionForTable } from './analyzer-value-resolver.js';
import {
  actionFilterRecords,
  mergeAnalyzerFilters
} from './analyzer-plan-build-component-filters.js';
import { readParameterValues } from './analyzer-plan-build-component-parameters.js';
import { removeParameterBackedDateFilters } from './analyzer-plan-parameter-filter-normalizer.js';
import { analyzerParameterValuesCompatibleWithTable } from './analyzer-plan-parameter-sanitizer.js';
import type {
  AnalyzerActionStep,
  AnalyzerSelectedModel
} from './analyzer-plan-build-component-types.js';
import type {
  AnalyzerCapabilityFilterInvocation,
  AnalyzerCapabilityInvocation
} from './analyzer-capability-contract.js';

export function augmentActionForAnalyzer(
  action: AnalyzerActionStep,
  context: {
    capability?: AnalyzerCapabilityInvocation | null;
    capabilityFilters?: AnalyzerCapabilityFilterInvocation[];
    columns: Array<Record<string, unknown> & { field: string }>;
    dateFilter?: Record<string, unknown>;
    parameterValues: Record<string, string>;
    preferDefaultParameterValues: boolean;
    preferInferredParameterValues: boolean;
    request: AnalyzerPlanRequest;
    table: TableDefinition;
    title: string;
  }
): AnalyzerActionStep {
  if (action.action !== 'create_table') {
    return {
      action: action.action,
      params: { ...action.params }
    };
  }
  const capability = context.capability ?? null;
  const capabilityFilters = capability?.filters ?? context.capabilityFilters ?? [];
  const filtersWithCapability = removeDuplicateResultLookupFilters(
    context.table,
    context.columns,
    mergeCapabilityFiltersIntoActionFilters(context.table, action.params.filters, capabilityFilters)
  );
  const narrowedFilters = narrowExplicitlyMentionedLookupFilterValues(
    context.table,
    context.request.question,
    filtersWithCapability
  );
  const filters = removeParameterBackedDateFilters(context.table, context.dateFilter
    ? mergeAnalyzerFilters(narrowedFilters, context.dateFilter)
    : narrowedFilters);
  const capabilityParameterValues = parameterValuesFromCapabilityFilters(capabilityFilters);
  const baseParameterValues = mergeAnalyzerParameterValues(
    context.parameterValues,
    action.params.parameterValues,
    context.preferInferredParameterValues
  );
  const mergedParameterValues = analyzerParameterValuesCompatibleWithTable(
    context.table,
    { ...capabilityParameterValues, ...baseParameterValues }
  );
  const normalizedFilters = dropRedundantTextualScopeFilters(
    context.table,
    markParameterBackedScopeLookupFilters(
      context.table,
      dropRedundantTextualScopeFilters(
        context.table,
        removeContradictoryConditionSideFilters(
          context.table,
          alignConditionFiltersToQuestion(
            context.table,
            context.request.question,
            normalizeNaturalDateRangeFilters(context.table, context.request.question, normalizeConditionFilterValues(context.table, filters))
          )
        ),
        mergedParameterValues
      ),
      mergedParameterValues
    ),
    mergedParameterValues
  );
  const filterParams = normalizedFilters === undefined ? {} : { filters: normalizedFilters };
  const capabilitySort = capabilityActionSort(capability, context.columns);
  const capabilityTopN = capabilityActionTopN(capability);
  const valueResolutionWarnings = unresolvedLookupFilterWarnings(context.table, normalizedFilters)
    .concat(unresolvedLookupFilterWarnings(context.table, action.params.filter));
  const {
    filter: _rawFilter,
    filters: _rawFilters,
    sort: rawSort,
    ...baseParams
  } = action.params;
  return {
    action: action.action,
    params: {
      ...baseParams,
      title: readString(action.params.title) ?? context.title,
      columns: context.columns,
      ...filterParams,
      ...(!capability && rawSort !== undefined ? { sort: rawSort } : {}),
      ...(capabilitySort.length > 0 ? { sort: capabilitySort } : {}),
      ...(capabilityTopN !== undefined ? { topN: capabilityTopN, top_n: capabilityTopN } : {}),
      parameterValues: mergedParameterValues,
      dataSourceId: context.request.dataSourceId,
      dataSourceTableId: context.table.id,
      tableName: context.table.name,
      _dataSourceId: context.request.dataSourceId,
      _dataSourceTableId: context.table.id,
      _tableName: context.table.name,
      ...(valueResolutionWarnings.length > 0 ? { _valueResolutionWarnings: valueResolutionWarnings } : {})
    }
  };
}

function capabilityActionSort(
  capability: AnalyzerCapabilityInvocation | null,
  columns: Array<Record<string, unknown> & { field: string }>
): Array<{ direction: 'asc' | 'desc'; field: string }> {
  if (!capability) return [];
  const explicit = (capability.orderBy ?? [])
    .map(item => {
      const field = readString(item.field);
      return field ? {
        field,
        direction: item.direction === 'asc' || item.direction === 'desc'
          ? item.direction
          : defaultCapabilitySortDirection(capability.operation)
      } : null;
    })
    .filter((item): item is { direction: 'asc' | 'desc'; field: string } => Boolean(item));
  if (explicit.length > 0) return explicit;
  if (capability.operation !== 'top_n' && capability.operation !== 'compare') return [];
  const measureField = readString(capability.measure) ?? firstMeasureField(columns);
  return measureField ? [{ field: measureField, direction: 'desc' }] : [];
}

function capabilityActionTopN(
  capability: AnalyzerCapabilityInvocation | null
): number | undefined {
  if (!capability || capability.operation !== 'top_n') return undefined;
  return typeof capability.limit === 'number' && Number.isFinite(capability.limit) && capability.limit > 0
    ? Math.trunc(capability.limit)
    : undefined;
}

function defaultCapabilitySortDirection(
  operation: AnalyzerCapabilityInvocation['operation']
): 'asc' | 'desc' {
  return operation === 'top_n' || operation === 'compare' ? 'desc' : 'asc';
}

function firstMeasureField(
  columns: Array<Record<string, unknown> & { field: string }>
): string | null {
  const measure = columns.find(column => {
    const summarize = readString(column.summarize)?.trim().toLowerCase();
    return Boolean(summarize && summarize !== 'none');
  });
  return measure?.field ?? null;
}

function markParameterBackedScopeLookupFilters(
  table: TableDefinition,
  filters: Record<string, unknown>[] | undefined,
  parameterValues: Record<string, unknown>
): Record<string, unknown>[] | undefined {
  if (!filters?.length) return filters;
  const marked = filters.flatMap(filter => {
    if (filterHasValueResolutionMarker(filter)) return [filter];
    const fieldName = readString(filter.field) ?? readString(filter.name);
    if (!fieldName) return [filter];
    const field = table.fields.find(item => item.name === fieldName);
    if (!field) return [filter];
    const resolution = fieldValueResolutionForTable(table, field);
    if (resolution.mode !== 'lookup') return [filter];
    const scopeKind = scopeFieldKind(fieldName);
    const resolutionParameterValues = filterResolutionParameterValues(filter);
    const backedByParameters = scopeKind
      ? scopeFilterBackedByParameterValues(scopeKind, resolutionParameterValues)
        || hasScopeParameterValue(parameterValues, scopeKind)
      : false;
    if (
      !scopeKind
      || (!backedByParameters && !filterUsesExactScopeId(fieldName, filter))
    ) {
      return [filter];
    }
    const values = rawFilterValues(filter);
    if (values.length === 0) return [filter];
    if (backedByParameters && values.some(value => textualScopeFilterValue(value, field.type))) {
      return [];
    }
    return [{
      ...filter,
      resolution: {
        field: fieldName,
        mode: resolution.mode,
        source: backedByParameters ? 'model_parameters' : 'exact_scope_value',
        values
      }
    }];
  });
  return marked.length > 0 ? marked : undefined;
}

function dropRedundantTextualScopeFilters(
  table: TableDefinition,
  filters: Record<string, unknown>[] | undefined,
  parameterValues: Record<string, unknown>
): Record<string, unknown>[] | undefined {
  if (!filters?.length) return filters;
  const retained = filters.filter(filter => !scopeFilterBackedByParameters(table, filter, parameterValues));
  return retained.length > 0 ? retained : undefined;
}

function scopeFilterBackedByParameters(
  table: TableDefinition,
  filter: Record<string, unknown>,
  parameterValues: Record<string, unknown>
): boolean {
  const fieldName = readString(filter.field) ?? readString(filter.name);
  if (!fieldName) return false;
  const scopeKind = scopeFieldKind(fieldName);
  if (!scopeKind) return false;
  if (
    !scopeFilterBackedByParameterValues(scopeKind, filterResolutionParameterValues(filter))
    && !hasScopeParameterValue(parameterValues, scopeKind)
  ) {
    return false;
  }
  if (filterUsesExactScopeId(fieldName, filter)) return false;
  const field = table.fields.find(item => item.name === fieldName);
  if (!field) return false;
  return scopeFilterUsesText(filter, field.type);
}

function filterResolutionParameterValues(filter: Record<string, unknown>): Record<string, unknown> {
  const resolution = isRecord(filter.resolution) ? filter.resolution : null;
  return readParameterValues(resolution?.parameterValues);
}

function scopeFilterBackedByParameterValues(
  scopeKind: 'location' | 'organization',
  parameterValues: Record<string, unknown>
): boolean {
  if (hasScopeParameterValue(parameterValues, scopeKind)) return true;
  return scopeKind === 'location' && hasScopeParameterValue(parameterValues, 'organization');
}

function scopeFilterUsesText(
  filter: Record<string, unknown>,
  fieldType: string
): boolean {
  if (readString(filter.searchText) || readString(filter.requestedText) || readString(filter.query)) {
    return true;
  }
  const values = rawFilterValues(filter);
  if (values.length === 0) return false;
  return values.some(value => textualScopeFilterValue(value, fieldType));
}

function textualScopeFilterValue(value: unknown, fieldType: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (numericScopeFilterFieldType(fieldType) && numericScopeFilterText(trimmed)) return false;
  return true;
}

function numericScopeFilterFieldType(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return [
    'bigint',
    'decimal',
    'double',
    'float',
    'int',
    'integer',
    'number',
    'numeric',
    'real',
    'smallint'
  ].some(term => normalized === term || normalized.includes(term));
}

function numericScopeFilterText(value: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(value);
}

function normalizeConditionFilterValues(
  table: TableDefinition,
  filters: Record<string, unknown>[] | undefined
): Record<string, unknown>[] | undefined {
  if (!filters?.length) return filters;
  return filters.map(filter => {
    const fieldName = readString(filter.field);
    if (!fieldName || !fieldIsBooleanCondition(table, fieldName)) return filter;
    const operator = readString(filter.operator)?.trim().toLowerCase();
    if (operator === 'is_null' || operator === 'is_not_null') return filter;
    if (Object.prototype.hasOwnProperty.call(filter, 'value')) {
      if (Array.isArray(filter.value)) {
        const values = filter.value
          .map(normalizeConditionFilterValue)
          .filter((value): value is 0 | 1 => value !== null);
        const uniqueValues = Array.from(new Set(values));
        if (uniqueValues.length > 0) {
          return {
            ...filter,
            operator: uniqueValues.length === 1 ? 'equals' : 'in',
            value: uniqueValues.length === 1 ? uniqueValues[0] : uniqueValues
          };
        }
      }
      const value = normalizeConditionFilterValue(filter.value);
      if (value !== null) return { ...filter, operator: 'equals', value };
    }
    if (Object.prototype.hasOwnProperty.call(filter, 'values')) {
      const values = Array.isArray(filter.values)
        ? filter.values.map(normalizeConditionFilterValue).filter((value): value is 0 | 1 => value !== null)
        : [];
      if (values.length > 0) return { ...filter, operator: values.length === 1 ? 'equals' : 'in', value: values.length === 1 ? values[0] : values };
    }
    return filter;
  });
}

function scopeFieldKind(fieldName: string): 'location' | 'organization' | null {
  const normalized = fieldName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (
    normalized.includes('branch')
    || normalized.includes('location')
    || normalized.includes('site')
    || normalized.includes('warehouse')
  ) {
    return 'location';
  }
  if (
    normalized.includes('account')
    || normalized.includes('company')
    || normalized.includes('client')
    || normalized.includes('business')
    || normalized.includes('customer')
    || normalized.includes('organization')
    || normalized.includes('organisation')
    || normalized.includes('tenant')
  ) {
    return 'organization';
  }
  return null;
}

function hasScopeParameterValue(
  parameterValues: Record<string, unknown>,
  scopeKind: 'location' | 'organization'
): boolean {
  const keys = Object.keys(parameterValues).map(key => key.toLowerCase().replace(/[^a-z0-9]+/g, ''));
  return keys.some(key => scopeKind === 'location'
    ? key.includes('branch') || key.includes('location') || key.includes('site') || key.includes('warehouse')
    : key.includes('account') || key.includes('company') || key.includes('client') || key.includes('customer') || key.includes('business') || key.includes('organization') || key.includes('organisation') || key.includes('tenant'));
}

function rawFilterValues(filter: Record<string, unknown>): unknown[] {
  if (Array.isArray(filter.value)) return filter.value;
  if (Array.isArray(filter.values)) return filter.values;
  return Object.prototype.hasOwnProperty.call(filter, 'value') ? [filter.value] : [];
}

function filterUsesExactScopeId(fieldName: string, filter: Record<string, unknown>): boolean {
  const normalized = fieldName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!normalized.endsWith('id') && !normalized.includes('id')) return false;
  if (readString(filter.requestedText) || readString(filter.searchText) || readString(filter.query)) return false;
  if (Array.isArray(filter.value) || Array.isArray(filter.values)) return false;
  return typeof filter.value === 'number'
    || (typeof filter.value === 'string' && filter.value.trim().length > 0);
}

function normalizeNaturalDateRangeFilters(
  table: TableDefinition,
  question: string,
  filters: Record<string, unknown>[] | undefined
): Record<string, unknown>[] | undefined {
  if (!filters?.length) return filters;
  let changed = false;
  const normalized = filters.map(filter => {
    const fieldName = readString(filter.field);
    if (!fieldName || !fieldIsTimeFilter(table, fieldName)) return filter;
    const operator = readString(filter.operator)?.trim().toLowerCase();
    if (operator !== 'between') return filter;
    const value = naturalWeekRange(filter.value)
      ?? naturalWeekRangeFromSingleDate(filter.value, question);
    if (!value) return filter;
    changed = true;
    return { ...filter, value, values: value };
  });
  return changed ? normalized : filters;
}

function naturalWeekRange(value: unknown): [string, string] | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized.startsWith('week of ')) return null;
  const dateText = normalized.slice('week of '.length).trim();
  if (!isoDateOnly(dateText)) return null;
  const start = new Date(`${dateText}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return [formatUtcDate(start), formatUtcDate(end)];
}

function naturalWeekRangeFromSingleDate(value: unknown, question: string): [string, string] | null {
  if (typeof value !== 'string' || !questionMentionsWeek(question)) return null;
  const dateText = value.trim();
  if (!isoDateOnly(dateText)) return null;
  const start = new Date(`${dateText}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return [formatUtcDate(start), formatUtcDate(end)];
}

function questionMentionsWeek(question: string): boolean {
  return tokenSetForCondition(normalizePhrase(question)).has('week');
}

function isoDateOnly(value: string): boolean {
  if (value.length !== 10) return false;
  return value[4] === '-'
    && value[7] === '-'
    && digitsOnly(value.slice(0, 4))
    && digitsOnly(value.slice(5, 7))
    && digitsOnly(value.slice(8, 10));
}

function digitsOnly(value: string): boolean {
  return [...value].every(character => character >= '0' && character <= '9');
}

function formatUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function removeContradictoryConditionSideFilters(
  table: TableDefinition,
  filters: Record<string, unknown>[] | undefined
): Record<string, unknown>[] | undefined {
  if (!filters || filters.length < 2) return filters;
  const activeConditions = new Set(filters.flatMap(filter => {
    const fieldName = readString(filter.field);
    if (!fieldName || !fieldIsBooleanCondition(table, fieldName)) return [];
    return normalizeConditionFilterValue(filter.value) === 1 ? [fieldName] : [];
  }));
  if (activeConditions.size === 0) return filters;
  const retained = filters.filter(filter => {
    const fieldName = readString(filter.field);
    if (!fieldName) return true;
    if (fieldIsTimeFilter(table, fieldName)) return true;
    if (fieldIsBooleanCondition(table, fieldName)) {
      return normalizeConditionFilterValue(filter.value) !== 0;
    }
    return !conditionSideFilter(table, filter);
  });
  return retained.length > 0 ? retained : undefined;
}

function alignConditionFiltersToQuestion(
  table: TableDefinition,
  question: string,
  filters: Record<string, unknown>[] | undefined
): Record<string, unknown>[] | undefined {
  if (!filters?.length) return filters;
  const conditionIndexes = filters.flatMap((filter, index) => {
    const fieldName = readString(filter.field);
    return fieldName && fieldIsBooleanCondition(table, fieldName) ? [{ fieldName, filter, index }] : [];
  });
  if (conditionIndexes.length === 1) {
    const onlyCondition = conditionIndexes[0];
    if (!onlyCondition) return filters;
    if (
      normalizeConditionFilterValue(onlyCondition.filter.value) !== 0
      || conditionQuestionScore(table, onlyCondition.fieldName, question) <= 0
    ) return filters;
    return filters.map((item, itemIndex) =>
      itemIndex === onlyCondition.index ? { ...item, operator: 'equals', value: 1 } : item);
  }
  const scored = conditionIndexes
    .map(item => ({ ...item, score: conditionQuestionScore(table, item.fieldName, question) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best) return filters;
  const selected = new Set(scored
    .filter(item => item.score >= Math.max(1, best.score - 0.05) || conditionExplicitlyMentioned(table, item.fieldName, question))
    .map(item => item.index));
  if (selected.size === conditionIndexes.length) return filters;
  return filters.flatMap((filter, index) => {
    const fieldName = readString(filter.field);
    if (!fieldName || !fieldIsBooleanCondition(table, fieldName)) return [filter];
    return selected.has(index) ? [{ ...filter, operator: 'equals', value: 1 }] : [];
  });
}

function conditionExplicitlyMentioned(table: TableDefinition, fieldName: string, question: string): boolean {
  const questionText = normalizePhrase(question);
  if (!questionText) return false;
  return conditionTerms(table, fieldName).some(term => {
    const phrase = normalizePhrase(term);
    if (exactConditionPhraseScore(questionText, phrase) > 0) return true;
    if (phrase.includes(' but ')) return false;
    const phraseTokens = tokenSetForCondition(phrase);
    if (phraseTokens.size < 2) return false;
    if (!sharedQualifierPhrase(phraseTokens)) return false;
    const questionTokens = tokenSetForCondition(questionText);
    let matches = 0;
    phraseTokens.forEach(token => {
      if (questionTokens.has(token)) matches += 1;
    });
    return matches === phraseTokens.size;
  });
}

function sharedQualifierPhrase(tokens: Set<string>): boolean {
  return tokens.has('missing');
}

function conditionQuestionScore(table: TableDefinition, fieldName: string, question: string): number {
  const questionText = normalizePhrase(question);
  if (!questionText) return 0;
  return conditionTerms(table, fieldName).reduce((best, term) => {
    const phrase = normalizePhrase(term);
    if (!phrase) return best;
    const phraseScore = exactConditionPhraseScore(questionText, phrase);
    const phraseTokens = tokenSetForCondition(phrase);
    const questionTokens = tokenSetForCondition(questionText);
    let matches = 0;
    phraseTokens.forEach(token => {
      if (questionTokens.has(token)) matches += 1;
    });
    const tokenScore = phraseTokens.size > 0 ? matches / phraseTokens.size : 0;
    return Math.max(best, phraseScore + tokenScore);
  }, 0);
}

function exactConditionPhraseScore(questionText: string, phrase: string): number {
  if (!phrase || !questionText.includes(phrase)) return 0;
  const tokenCount = tokenSetForCondition(phrase).size;
  return tokenCount >= 3 ? 20 : 6;
}

function conditionTerms(table: TableDefinition, fieldName: string): string[] {
  const field = table.fields.find(item => item.name === fieldName);
  const metadata = analyzerFieldMetadata(table, fieldName);
  const terms = [
    fieldName,
    readString(field?.label),
    readString(field?.description),
    readString(field?.dictionaryDescription),
    ...readStringArray(field?.synonyms),
    readString(metadata.businessName),
    readString(metadata.label),
    readString(metadata.description),
    ...readStringArray(metadata.synonyms),
    ...readStringArray(metadata.valueAliases),
    ...readStringArray(metadata.valueSynonyms)
  ].filter((value): value is string => Boolean(value));
  const concepts = metadata.valueConcepts;
  if (Array.isArray(concepts)) {
    for (const concept of concepts) {
      if (!isRecord(concept)) continue;
      if (genericBooleanConcept(concept)) continue;
      terms.push(
        ...[
          readString(concept.conceptKey ?? concept.key ?? concept.id),
          readString(concept.label)
        ].filter((value): value is string => Boolean(value)),
        ...readStringArray(concept.synonyms ?? concept.aliases),
        ...readStringArray(concept.values)
      );
    }
  }
  return uniqueStrings(terms);
}

function genericBooleanConcept(concept: Record<string, unknown>): boolean {
  const key = normalizePhrase(readString(concept.conceptKey ?? concept.key ?? concept.id) ?? '');
  const label = normalizePhrase(readString(concept.label) ?? '');
  return key.endsWith(' true')
    || key.endsWith(' false')
    || label === 'true'
    || label === 'false';
}

function normalizePhrase(value: string): string {
  return [...value.toLowerCase()]
    .map(character => character >= 'a' && character <= 'z' || character >= '0' && character <= '9' ? character : ' ')
    .join('')
    .split(' ')
    .filter(Boolean)
    .join(' ');
}

function tokenSetForCondition(value: string): Set<string> {
  return new Set(value.split(' ').filter(token => token.length > 1));
}

function conditionSideFilter(table: TableDefinition, filter: Record<string, unknown>): boolean {
  const fieldName = readString(filter.field);
  if (!fieldName) return false;
  const field = table.fields.find(item => item.name === fieldName);
  const metadata = analyzerFieldMetadata(table, fieldName);
  const role = readString(metadata.role)?.trim().toLowerCase()
    ?? readString(metadata.semanticRole)?.trim().toLowerCase();
  if (role === 'scope' || role === 'tenant' || role === 'security') return false;
  const fieldRole = readString(metadata.role)?.trim().toLowerCase()
    ?? readString(field?.role)?.trim().toLowerCase();
  if (fieldRole === 'identifier' || fieldNameLooksIdentifier(fieldName)) return suspiciousIdentifierConditionFilter(field?.type, filter);
  const value = Object.prototype.hasOwnProperty.call(filter, 'value') ? filter.value : undefined;
  const operator = readString(filter.operator)?.trim().toLowerCase();
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number' && fieldIsTextual(field?.type)) return true;
  if (operator === 'is_null' || operator === 'is_not_null') return true;
  return false;
}

function fieldIsTextual(type: unknown): boolean {
  const normalizedType = readString(type)?.trim().toLowerCase() ?? '';
  return [
    'char',
    'nchar',
    'nvarchar',
    'string',
    'text',
    'varchar'
  ].includes(normalizedType);
}

function fieldNameLooksIdentifier(fieldName: string): boolean {
  const normalized = fieldName.trim().toLowerCase();
  return normalized === 'id'
    || normalized.endsWith('_id')
    || normalized.endsWith(' id')
    || normalized.endsWith('id');
}

function suspiciousIdentifierConditionFilter(type: unknown, filter: Record<string, unknown>): boolean {
  const normalizedType = readString(type)?.trim().toLowerCase() ?? '';
  if (!['integer', 'int', 'bigint', 'number', 'numeric', 'decimal'].includes(normalizedType)) return false;
  const operator = readString(filter.operator)?.trim().toLowerCase();
  const value = typeof filter.value === 'number' && Number.isFinite(filter.value) ? filter.value : null;
  return value !== null && (
    operator === 'lt' && value <= 0
    || operator === 'lte' && value <= 0
    || operator === 'equals' && value === 0
  );
}

function fieldIsBooleanCondition(table: TableDefinition, fieldName: string): boolean {
  const fieldType = readString(table.fields.find(item => item.name === fieldName)?.type)?.trim().toLowerCase() ?? '';
  if (['bit', 'bool', 'boolean'].includes(fieldType)) return true;
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
    return values.some(value => normalizeConditionFilterValue(value) !== null);
  });
}

function normalizeConditionFilterValue(value: unknown): 0 | 1 | null {
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

function narrowExplicitlyMentionedLookupFilterValues(
  table: TableDefinition,
  question: string,
  filters: Record<string, unknown>[] | undefined
): Record<string, unknown>[] | undefined {
  if (!filters?.length) return filters;
  return filters.map(filter => {
    if (filterHasValueResolutionMarker(filter)) return narrowResolvedLookupFilterByExactRequestedValue(table, filter);
    const fieldName = readString(filter.field);
    const values = readStringArray(filter.value);
    if (!fieldName || values.length < 2) return filter;
    const field = table.fields.find(item => item.name === fieldName);
    if (!field) return filter;
    const resolution = fieldValueResolutionForTable(table, field);
    if (resolution.mode !== 'lookup') return filter;
    const mentioned = values.filter(value => textContainsPhrase(question, value));
    if (mentioned.length !== 1) return filter;
    return {
      ...filter,
      operator: 'equals',
      value: mentioned[0]
    };
  });
}

function narrowResolvedLookupFilterByExactRequestedValue(
  table: TableDefinition,
  filter: Record<string, unknown>
): Record<string, unknown> {
  const source = valueResolutionSource(filter);
  const requestedText = readString(filter.requestedText);
  const values = readStringArray(filter.value);
  if (!requestedText || values.length < 2) return filter;
  const requestedKey = normalizeSearchText(requestedText);
  const exact = values.find(value => normalizeSearchText(value) === requestedKey);
  if (!exact) return filter;
  if (
    (source === 'value_concepts' || source === 'catalog')
    && preserveBroadenedConceptFilter(table, filter, requestedKey)
  ) {
    return filter;
  }
  return exact
    ? {
        ...filter,
        operator: 'equals',
        value: exact
      }
    : filter;
}

function preserveBroadenedConceptFilter(
  table: TableDefinition,
  filter: Record<string, unknown>,
  requestedKey: string
): boolean {
  const fieldName = readString(filter.field);
  if (!fieldName || !requestedKey) return false;
  const metadata = analyzerFieldMetadata(table, fieldName);
  const concepts = Array.isArray(metadata.valueConcepts) ? metadata.valueConcepts : [];
  for (const concept of concepts) {
    if (!isRecord(concept)) continue;
    const matchValues = readStringArray(concept.values ?? concept.matchValues ?? concept.sourceValues);
    if (matchValues.length < 2) continue;
    const conceptLabel = normalizeSearchText(readString(concept.label) ?? readString(concept.conceptKey) ?? '');
    if (conceptLabel === requestedKey) return true;
    const conceptSynonyms = readStringArray(concept.synonyms ?? concept.aliases)
      .map(normalizeSearchText)
      .filter(Boolean);
    if (conceptSynonyms.includes(requestedKey)) return true;
    const exactMemberMatch = matchValues.some(value => normalizeSearchText(value) === requestedKey);
    if (!exactMemberMatch) continue;
    return false;
  }
  return false;
}

function valueResolutionSource(filter: Record<string, unknown>): string | null {
  const resolution = isRecord(filter.resolution) ? filter.resolution : {};
  const valueResolution = isRecord(filter.valueResolution) ? filter.valueResolution : {};
  return readString(resolution.source ?? valueResolution.source)?.trim().toLowerCase() ?? null;
}

function textContainsPhrase(text: string, phrase: string): boolean {
  const normalizedText = normalizeSearchText(text);
  const normalizedPhrase = normalizeSearchText(phrase);
  return Boolean(normalizedPhrase && normalizedText.includes(normalizedPhrase));
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function removeDuplicateResultLookupFilters(
  table: TableDefinition,
  columns: Array<Record<string, unknown> & { field: string }>,
  filters: Record<string, unknown>[] | undefined
): Record<string, unknown>[] | undefined {
  if (!filters || filters.length < 2) return filters;
  const columnFields = new Set(columns.map(column => column.field));
  return filters.filter((filter, index) => {
    const fieldName = readString(filter.field);
    if (!fieldName) return true;
    const valueKey = filterValueKey(filter);
    if (!valueKey) return true;
    if (
      fieldIsTimeFilter(table, fieldName)
      && filters.some((candidate, candidateIndex) =>
        candidateIndex < index
        && fieldIsTimeFilter(table, readString(candidate.field) ?? '')
        && filterValueKey(candidate) === valueKey
      )
    ) {
      return false;
    }
    const entityType = fieldEntityType(table, fieldName);
    if (!entityType) return true;
    if (
      fieldHasResultFilterRole(table, fieldName)
      && filters.some((candidate, candidateIndex) =>
        candidateIndex !== index
        && fieldEntityType(table, readString(candidate.field) ?? '') === entityType
        && !fieldHasResultFilterRole(table, readString(candidate.field) ?? '')
        && filtersReferenceSameUserValue(candidate, filter)
      )
    ) {
      return false;
    }
    const duplicateInputFilter = filters.find((candidate, candidateIndex) =>
      candidateIndex !== index
      && fieldEntityType(table, readString(candidate.field) ?? '') === entityType
      && filterValueKey(candidate) === valueKey
      && !fieldHasResultFilterRole(table, readString(candidate.field) ?? '')
      && !columnFields.has(readString(candidate.field) ?? '')
    );
    if (
      duplicateInputFilter
      && (fieldHasResultFilterRole(table, fieldName) || columnFields.has(fieldName))
    ) {
      return false;
    }
    return !filters.some((candidate, candidateIndex) =>
      candidateIndex !== index
      && !fieldHasResultFilterRole(table, readString(candidate.field) ?? '')
      && !columnFields.has(readString(candidate.field) ?? '')
      && fieldEntityType(table, readString(candidate.field) ?? '') === entityType
      && filterValueKey(candidate) === valueKey
    );
  });
}

function filtersReferenceSameUserValue(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftValues = userFilterValueTexts(left);
  const rightValues = userFilterValueTexts(right);
  return leftValues.some(leftValue =>
    rightValues.some(rightValue =>
      textContainsPhrase(leftValue, rightValue) || textContainsPhrase(rightValue, leftValue)
    )
  );
}

function userFilterValueTexts(filter: Record<string, unknown>): string[] {
  return uniqueStrings([
    readString(filter.requestedText),
    readString(filter.searchText),
    readString(filter.query),
    readString(filter.value),
    ...readStringArray(filter.value),
    ...readStringArray(filter.values)
  ].filter((value): value is string => Boolean(value)));
}

function fieldIsTimeFilter(table: TableDefinition, fieldName: string): boolean {
  const metadata = analyzerFieldMetadata(table, fieldName);
  const role = readString(metadata.role);
  const field = table.fields.find(item => item.name === fieldName);
  const type = readString(field?.type)?.trim().toLowerCase() ?? '';
  return role === 'time'
    || type === 'date'
    || type === 'datetime'
    || type === 'datetime2'
    || type === 'timestamp';
}

function fieldHasResultFilterRole(table: TableDefinition, fieldName: string): boolean {
  const metadata = analyzerFieldMetadata(table, fieldName);
  const role = readString(metadata.lookupFilterRole)
    ?? readString(metadata.valueResolutionRole)
    ?? readString(metadata.filterRole)
    ?? readString(metadata.plannerFilterRole);
  return ['answer', 'output', 'result', 'result_field'].includes(role?.trim().toLowerCase() ?? '');
}

function fieldEntityType(table: TableDefinition, fieldName: string): string | null {
  const metadata = analyzerFieldMetadata(table, fieldName);
  return readString(metadata.entityType)?.trim().toLowerCase() ?? null;
}

function filterValueKey(filter: Record<string, unknown>): string | null {
  const value = Object.prototype.hasOwnProperty.call(filter, 'value')
    ? filter.value
    : Object.prototype.hasOwnProperty.call(filter, 'values')
      ? filter.values
      : undefined;
  return value === undefined ? null : JSON.stringify(value);
}

function capabilityFilterRecord(filter: AnalyzerCapabilityFilterInvocation): Record<string, unknown> {
  return {
    field: filter.field,
    operator: filter.operator,
    ...(filter.requestedText ? { requestedText: filter.requestedText } : {}),
    ...(filter.resolution ? { resolution: filter.resolution } : {}),
    ...(filter.value === undefined ? {} : { value: filter.value })
  };
}

function mergeCapabilityFiltersIntoActionFilters(
  table: TableDefinition,
  actionFilters: unknown,
  capabilityFilters: AnalyzerCapabilityFilterInvocation[]
): Record<string, unknown>[] | undefined {
  if (capabilityFilters.length === 0) {
    const existing = actionFilterRecords(actionFilters);
    return existing.length > 0 ? existing : undefined;
  }
  const capabilityRecords = capabilityFilters.map(capabilityFilterRecord);
  const capabilityFields = new Set(capabilityRecords.map(filter => readString(filter.field)).filter(Boolean));
  const capabilityEntityTypes = new Set(capabilityRecords
    .map(filter => fieldEntityType(table, readString(filter.field) ?? ''))
    .filter((value): value is string => Boolean(value)));
  return [
    ...capabilityRecords,
    ...actionFilterRecords(actionFilters).filter(filter => {
      const field = readString(filter.field);
      if (!field) return true;
      if (capabilityFields.has(field)) return false;
      const entityType = fieldEntityType(table, field);
      if (entityType && capabilityEntityTypes.has(entityType)) return false;
      if (capabilityRecords.some(capabilityFilter => capabilityFilterSupersedesActionFilter(table, capabilityFilter, filter))) {
        return false;
      }
      return true;
    })
  ];
}

function capabilityFilterSupersedesActionFilter(
  table: TableDefinition,
  capabilityFilter: Record<string, unknown>,
  actionFilter: Record<string, unknown>
): boolean {
  const capabilityField = readString(capabilityFilter.field);
  const actionField = readString(actionFilter.field);
  if (!capabilityField || !actionField || capabilityField === actionField) return false;
  if (!semanticFamilyField(table, capabilityField) || semanticFamilyField(table, actionField)) return false;
  const capabilityValues = normalizedFilterTextValues(capabilityFilter);
  const actionValues = normalizedFilterTextValues(actionFilter);
  if (capabilityValues.length === 0 || actionValues.length === 0) return false;
  const capabilityValueSet = new Set(capabilityValues);
  if (!actionValues.every(value => capabilityValueSet.has(value))) return false;
  const capabilityDomainTokens = semanticDomainTokens(table, capabilityField);
  const actionDomainTokens = semanticDomainTokens(table, actionField);
  if (capabilityDomainTokens.size === 0 || actionDomainTokens.size === 0) return false;
  return [...actionDomainTokens].some(token => capabilityDomainTokens.has(token));
}

function semanticFamilyField(table: TableDefinition, fieldName: string): boolean {
  return semanticFieldTokens(table, fieldName).has('family');
}

function semanticDomainTokens(table: TableDefinition, fieldName: string): Set<string> {
  const tokens = semanticFieldTokens(table, fieldName);
  for (const noise of ['family', 'field', 'filter', 'id', 'identifier', 'key', 'label', 'method', 'name', 'type', 'value']) {
    tokens.delete(noise);
  }
  return tokens;
}

function semanticFieldTokens(table: TableDefinition, fieldName: string): Set<string> {
  const metadata = analyzerFieldMetadata(table, fieldName);
  return analyzerTokenSet([
    fieldName,
    readString(metadata.name),
    readString(metadata.businessName),
    readString(metadata.label),
    readString(metadata.description),
    ...readStringArray(metadata.aliases),
    ...readStringArray(metadata.synonyms)
  ].filter(Boolean).join(' '));
}

function normalizedFilterTextValues(filter: Record<string, unknown>): string[] {
  return uniqueStrings([
    readString(filter.value),
    ...readStringArray(filter.value),
    ...readStringArray(filter.values)
  ].filter((value): value is string => typeof value === 'string')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean));
}

function mergeAnalyzerParameterValues(
  defaultValues: Record<string, string>,
  explicitValue: unknown,
  preferDefaultValues: boolean
): Record<string, unknown> {
  const explicit = readParameterValues(explicitValue);
  return preferDefaultValues
    ? { ...explicit, ...defaultValues }
    : { ...defaultValues, ...explicit };
}

function parameterValuesFromCapabilityFilters(
  filters: AnalyzerCapabilityFilterInvocation[]
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const filter of filters) {
    if (!isRecord(filter.resolution)) continue;
    Object.assign(values, readParameterValues(filter.resolution.parameterValues));
  }
  return values;
}

function unresolvedLookupFilterWarnings(table: TableDefinition, value: unknown): string[] {
  const visibleFields = analyzerVisibleFieldNames(table);
  const warnings: string[] = [];
  for (const filter of actionFilterRecords(value)) {
    const fieldName = readString(filter.field) ?? readString(filter.name);
    if (!fieldName || !visibleFields.has(fieldName) || filterHasValueResolutionMarker(filter)) continue;
    const field = table.fields.find(item => item.name === fieldName);
    if (!field || !filterHasUserValue(filter)) continue;
    const resolution = fieldValueResolutionForTable(table, field);
    if (resolution.mode !== 'lookup') continue;
    warnings.push([
      `Resolve ${fieldName} with resolve_field_values before filtering.`,
      resolution.entityType ? `Entity: ${resolution.entityType}.` : '',
      'Dynamic source values must use exact source spelling.'
    ].filter(Boolean).join(' '));
  }
  return uniqueStrings(warnings);
}

function filterHasValueResolutionMarker(filter: Record<string, unknown>): boolean {
  if (valueResolutionSource(filter) === 'unresolved_text_filter') return false;
  return Boolean(
    filter.resolvedValue
    || filter.resolvedValues
    || filter.valueResolution
    || filter.valueResolutionResult
    || filter.resolution
    || filter.matchType
    || filter._resolvedBy === 'resolve_field_values'
  );
}

function filterHasUserValue(filter: Record<string, unknown>): boolean {
  return Boolean(
    readString(filter.value)
    || readString(filter.searchText)
    || readString(filter.query)
    || readStringArray(filter.values).length > 0
  );
}

export function valueResolutionGuidanceFromActions(actions: AnalyzerActionStep[]): string[] {
  return uniqueStrings(actions.flatMap(action => readStringArray(action.params._valueResolutionWarnings)));
}

export function selectedModelFor(
  table: TableDefinition,
  columns: Array<Record<string, unknown> & { field: string }>
): AnalyzerSelectedModel {
  const routing = firstRoutingRecord(table);
  return {
    id: table.id,
    name: table.name,
    businessName: businessNameForTable(table),
    domain: readString(routing.domain) ?? 'generic',
    grain: readString(routing.grain),
    primaryTimeField: readString(routing.primaryTimeField),
    dimensions: columns.filter(column => readString(column.summarize) === 'none').map(column => column.field),
    metrics: columns.filter(column => readString(column.summarize) !== 'none').map(column => column.field)
  };
}

export function resolveTableFromBuildComponent(
  source: DataSourceRecord,
  args: Record<string, unknown>,
  actions: AnalyzerActionStep[]
): TableDefinition | null {
  const candidates = [
    readString(args.tableId),
    readString(args.tableName),
    ...actions.flatMap(action => [
      readString(action.params.tableId),
      readString(action.params.tableName),
      readString(action.params.dataSourceTableId),
      readString(action.params._dataSourceTableId),
      readString(action.params._tableName),
      readString(action.params.dataSource)
    ])
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const table = source.tables.find(item => item.id === candidate || item.name === candidate);
    if (table) return table;
  }
  return null;
}

export function readActionSteps(value: unknown): AnalyzerActionStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const action = readString(item.action);
    const params = isRecord(item.params) ? item.params : {};
    return action ? [{ action, params: { ...params } }] : [];
  });
}

export function componentTypeFromActions(actions: AnalyzerActionStep[]): DashboardComponentType | null {
  for (const action of actions) {
    if (action.action === 'create_table') return 'table';
    if (action.action === 'create_card') return 'card';
    if (action.action === 'create_matrix') return 'matrix';
    if (action.action === 'create_filter') return 'filter';
    if (action.action === 'create_chart') return parseComponentType(action.params.componentType) ?? 'chart';
  }
  return null;
}

export function parseComponentType(value: unknown): DashboardComponentType | null {
  if (
    value === 'chart'
    || value === 'table'
    || value === 'card'
    || value === 'pie'
    || value === 'matrix'
    || value === 'filter'
  ) {
    return value;
  }
  return null;
}
