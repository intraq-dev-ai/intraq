import type { TableDefinition } from '../data-source/foundation-store.js';
import {
  normalizeCapabilityFilterOperator,
  type AnalyzerCapabilityFilterOperator,
  type buildAnalyzerCapabilityManifest
} from './analyzer-capability-contract.js';
import { analyzerFieldMetadata } from './analyzer-plan-field-matching.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import { fieldValueResolutionForTable } from './analyzer-value-resolver.js';
import type { AnalyzerRequestBreakdownFilter } from './analyzer-plan-agent-loop-types.js';
import { analyzerTokenSet } from './analyzer-token-utils.js';
import { parseBusinessNumericText } from './analyzer-plan-capability-filter-intent.js';
import {
  descriptiveValueFilterHasMetadataEvidence,
  explicitFilterTargetFieldCompatibility
} from './analyzer-plan-filter-target-compatibility.js';

type CapabilityField = ReturnType<typeof buildAnalyzerCapabilityManifest>['filterableFields'][number];

export interface PreflightFilter {
  field?: string;
  label?: string;
  operator?: string;
  searchText?: string;
  value?: unknown;
}

export function readPreflightFilters(value: unknown, fallback: AnalyzerRequestBreakdownFilter[] = []): PreflightFilter[] {
  const parsed = Array.isArray(value)
    ? value.flatMap(item => {
      if (!isRecord(item)) return [];
      const field = readString(item.field);
      const label = readString(item.label);
      const operator = readString(item.operator);
      const searchText = readString(item.searchText) ?? readString(item.requestedText);
      const filter: PreflightFilter = {};
      if (field) filter.field = field;
      if (label) filter.label = label;
      if (operator) filter.operator = operator;
      if (searchText) filter.searchText = searchText;
      if ('value' in item) filter.value = item.value;
      return filterHasMeaningfulInput(filter) && !filterRepresentsRankingHint(filter) ? [filter] : [];
    })
    : [];
  return mergePreflightFilters(parsed, fallback
    .map(filter => ({ ...filter }))
    .filter(filter => filterHasMeaningfulInput(filter) && !filterRepresentsRankingHint(filter)));
}

function filterHasMeaningfulInput(filter: PreflightFilter): boolean {
  if (readString(filter.searchText)) return true;
  const operator = readString(filter.operator)?.trim().toLowerCase();
  if (operator === 'is_null' || operator === 'is_not_null') return Boolean(filter.field || filter.label);
  if ('value' in filter) return valueHasMeaningfulInput(filter.value);
  return false;
}

function valueHasMeaningfulInput(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(valueHasMeaningfulInput);
  return false;
}

function filterRepresentsRankingHint(filter: PreflightFilter): boolean {
  if (!readString(filter.searchText)) return false;
  if (!genericRankingValueLabel(filter)) return false;
  if (Array.isArray(filter.value) || typeof filter.value === 'number' || typeof filter.value === 'boolean') return false;
  const tokens = meaningfulLabelTokens(filter.searchText ?? '');
  if (tokens.size === 0) return false;
  return tokenSetsOverlap(tokens, new Set([
    'high',
    'highest',
    'top',
    'large',
    'largest',
    'big',
    'biggest',
    'low',
    'lowest',
    'bottom',
    'small',
    'smallest',
    'cheap',
    'cheapest',
    'expensive',
    'priciest'
  ]));
}

function genericRankingValueLabel(filter: PreflightFilter): boolean {
  const tokens = tokenSet([filter.field, filter.label].filter(Boolean).join(' '));
  if (tokens.size === 0) return false;
  return setIsSubset(tokens, new Set(['value', 'amount', 'price', 'invoice', 'order', 'check']));
}

function mergePreflightFilters(parsed: PreflightFilter[], fallback: PreflightFilter[]): PreflightFilter[] {
  if (parsed.length === 0) return fallback;
  if (fallback.length === 0) return parsed;
  const merged = parsed.map(filter => ({ ...filter }));
  for (const fallbackFilter of fallback) {
    const existingIndex = merged.findIndex(filter => filtersDescribeSameConcept(filter, fallbackFilter));
    if (existingIndex < 0) {
      merged.push({ ...fallbackFilter });
      continue;
    }
    const existing = merged[existingIndex];
    if (!existing) continue;
    merged[existingIndex] = mergePreflightFilter(existing, fallbackFilter);
  }
  return merged;
}

function mergePreflightFilter(primary: PreflightFilter, fallback: PreflightFilter): PreflightFilter {
  return {
    ...fallback,
    ...primary,
    ...(primary.field || !fallback.field ? {} : { field: fallback.field }),
    ...(primary.label || !fallback.label ? {} : { label: fallback.label }),
    ...(primary.operator || !fallback.operator ? {} : { operator: fallback.operator }),
    ...(primary.searchText || !fallback.searchText ? {} : { searchText: fallback.searchText }),
    ...('value' in primary || !('value' in fallback) ? {} : { value: fallback.value })
  };
}

function filtersDescribeSameConcept(left: PreflightFilter, right: PreflightFilter): boolean {
  const leftTerms = filterConceptTerms(left);
  const rightTerms = filterConceptTerms(right);
  if (leftTerms.length === 0 || rightTerms.length === 0) return false;
  if (leftTerms.some(term => rightTerms.includes(term))) return true;
  const leftTokens = meaningfulLabelTokens(leftTerms.join(' '));
  const rightTokens = meaningfulLabelTokens(rightTerms.join(' '));
  return leftTokens.size > 0 && rightTokens.size > 0 && tokenSetsOverlap(leftTokens, rightTokens);
}

function filterConceptTerms(filter: PreflightFilter): string[] {
  return uniqueStrings([
    readString(filter.field)?.replace(/[_-]+/g, ' '),
    readString(filter.label)
  ].filter((value): value is string => Boolean(value))
    .map(value => normalizedTokenText(value))
    .filter(Boolean));
}

export function selectFilterField(
  table: TableDefinition,
  fields: CapabilityField[],
  filter: PreflightFilter
): CapabilityField | null {
  return selectFilterFields(table, fields, filter)[0] ?? null;
}

export function selectFilterFields(
  table: TableDefinition,
  fields: CapabilityField[],
  filter: PreflightFilter
): CapabilityField[] {
  const paymentFamilyField = preferredPaymentFamilyField(table, fields, filter);
  if (paymentFamilyField) return [paymentFamilyField];
  const exactName = readString(filter.field);
  const exact = exactName
    ? fields.find(field => field.name === exactName && exactFieldSupportedByFilter(table, field, filter)) ?? null
    : null;
  const compatibleFields = fields.filter(field => filterCompatibleWithField(field, filter));
  const candidateFields = preferInputFilterFields(
    table,
    compatibleFields.filter(field => filterConceptCompatibleWithField(table, field, filter))
  );
  const dateField = fallbackTimeFieldForDateRange(table, candidateFields, filter);
  if (dateField) return [dateField];
  const label = filter.label ?? '';
  const labelTokens = tokenSet(label);
  if (labelTokens.size === 0) {
    const fallback = fallbackLookupFieldForUnlabeledValue(table, candidateFields, filter);
    if (exact && (!fallback || fallback.name !== exact.name)) {
      return fallback ? [exact, fallback] : [exact];
    }
    return fallback ? [fallback] : exact ? [exact] : [];
  }
  const scored = candidateFields
    .map(field => ({
      field,
      score: combinedFieldScore(table, field, filter, labelTokens)
    }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score);
  if (scored.length > 0) {
    const ordered = scored.map(item => item.field);
    if (!exact) return ordered;
    const exactScore = combinedFieldScore(table, exact, filter, labelTokens);
    const bestScore = scored[0]?.score ?? 0;
    if (bestScore <= exactScore && ordered[0]?.name !== exact.name) {
      return [exact, ...ordered.filter(field => field.name !== exact.name)];
    }
    return ordered[0]?.name === exact.name ? ordered : [...ordered, exact].filter((field, index, array) =>
      array.findIndex(candidate => candidate.name === field.name) === index
    );
  }
  const fallback = fallbackLookupFieldForUnlabeledValue(table, candidateFields, filter);
  if (fallback) {
    if (exact && fallback.name !== exact.name) return [exact, fallback];
    return [fallback];
  }
  return exact ? [exact] : [];
}

function preferredPaymentFamilyField(
  table: TableDefinition,
  fields: CapabilityField[],
  filter: PreflightFilter
): CapabilityField | null {
  if (!paymentFamilyComparisonFilter(filter)) return null;
  const candidates = fields.filter(field => paymentFamilyFieldCandidate(table, field));
  if (candidates.length === 0) return null;
  return candidates.find(field => field.name === 'payment_family')
    ?? candidates.find(field => tokenSet(field.name).has('family'))
    ?? candidates[0]
    ?? null;
}

function paymentFamilyFieldCandidate(table: TableDefinition, field: CapabilityField): boolean {
  const tokens = tokenSet([
    ...metadataFieldTerms(field),
    ...semanticFieldTerms(table, field)
  ].join(' '));
  if (tokens.size === 0) return false;
  const familyLike = tokens.has('family') || field.name.trim().toLowerCase().includes('family');
  const paymentLike = tokens.has('payment') || tokens.has('tender') || tokens.has('cash') || tokens.has('card');
  return familyLike && paymentLike;
}

function paymentFamilyComparisonFilter(filter: PreflightFilter): boolean {
  const tokens = tokenSet([
    filter.searchText,
    ...textValues(filter.value)
  ].join(' '));
  if (tokens.size === 0) return false;
  const hasCashFamily = tokens.has('cash');
  const hasCardFamily = tokens.has('card')
    || tokens.has('credit')
    || tokens.has('debit')
    || tokens.has('eftpos');
  return hasCashFamily && hasCardFamily;
}

function textValues(value: unknown): string[] {
  const direct = readString(value);
  if (direct) return [direct];
  if (Array.isArray(value)) return value.flatMap(textValues);
  return [];
}

function combinedFieldScore(
  table: TableDefinition,
  field: CapabilityField,
  filter: PreflightFilter,
  labelTokens: Set<string>
): number {
  return booleanConditionFieldScore(table, field, filter)
    + metadataFieldScore(field, labelTokens)
    + metadataValueHintScore(table, field, filter)
    + searchSemanticHintScore(table, field, filter);
}

function booleanConditionFieldScore(
  table: TableDefinition,
  field: CapabilityField,
  filter: PreflightFilter
): number {
  if (!booleanConditionCandidateField(table, field)) return 0;
  return booleanConditionFilterMatchesField(table, field, filter) ? 10 : 0;
}

function preferInputFilterFields(table: TableDefinition, fields: CapabilityField[]): CapabilityField[] {
  const inputFields = fields.filter(field => !lookupResultFilterRole(table, field.name));
  return inputFields.length > 0 ? inputFields : fields;
}

function exactFieldSupportedByFilter(
  table: TableDefinition,
  field: CapabilityField,
  filter: PreflightFilter
): boolean {
  if (!filterCompatibleWithField(field, filter)) return false;
  if (!filterConceptCompatibleWithField(table, field, filter)) return false;
  const searchText = filter.searchText ?? primitiveSearchText(filter.value);
  if (!searchText || !stringLikeField(field.type)) return true;
  const labelTokens = tokenSet(filter.label ?? '');
  if (labelTokens.size > 0 && metadataFieldScore(field, labelTokens) > 0) return true;
  if (metadataValueHintScore(table, field, filter) > 0) return true;
  return identifierLikeTextFilter(table, field, searchText);
}

function filterConceptCompatibleWithField(
  table: TableDefinition,
  field: CapabilityField,
  filter: PreflightFilter
): boolean {
  const explicitTargetCompatibility = explicitFilterTargetFieldCompatibility(
    filter,
    fieldSemanticTerms(table, field)
  );
  if (explicitTargetCompatibility === false) return false;
  const descriptiveEvidence = descriptiveValueFilterHasMetadataEvidence(
    filter,
    valueHintTerms(analyzerFieldMetadata(table, field.name))
  );
  if (explicitTargetCompatibility === true) {
    return numericField(field.type) || descriptiveEvidence !== false;
  }
  if (booleanConditionCandidateField(table, field)) {
    return booleanConditionFilterMatchesField(table, field, filter);
  }
  if (descriptiveEvidence !== null) return descriptiveEvidence;
  if (filterLabelLooksLikeValue(filter)) {
    return true;
  }
  const labelTokens = meaningfulLabelTokens(filter.label ?? '');
  if (labelTokens.size === 0) return true;
  if (dateRangeFilter(filter) && dateLikeField(field.type)) return true;
  if (fieldSemanticCompatibilityScore(table, field, labelTokens) > 0) return true;
  if (metadataValueHintScore(table, field, filter) > 0) return true;
  const sourceField = table.fields.find(item => item.name === field.name);
  if (sourceField) {
    const resolution = fieldValueResolutionForTable(table, sourceField);
    if (resolution.entityType && tokenSetsOverlap(labelTokens, tokenSet(resolution.entityType))) return true;
  }
  const metadata = analyzerFieldMetadata(table, field.name);
  return metadataConceptTerms(metadata).some(term => tokenSetsOverlap(labelTokens, tokenSet(term)));
}

function booleanConditionCandidateField(table: TableDefinition, field: CapabilityField): boolean {
  if (booleanFieldType(field.type)) return true;
  const metadata = analyzerFieldMetadata(table, field.name);
  if (!metadataHasBooleanConcepts(metadata)) return false;
  const role = readString(metadata.valueResolutionRole)
    ?? readString(metadata.filterRole)
    ?? readString(metadata.plannerFilterRole)
    ?? readString(metadata.semanticRole);
  if (['condition', 'flag', 'boolean'].includes(role?.trim().toLowerCase() ?? '')) return true;
  return metadata.filterOnly === true
    || readString(metadata.filterOnly)?.trim().toLowerCase() === 'true';
}

function booleanConditionFilterMatchesField(
  table: TableDefinition,
  field: CapabilityField,
  filter: PreflightFilter
): boolean {
  if (filter.field === field.name) return true;
  const filterTokens = meaningfulBooleanConditionTokens([
    readString(filter.label),
    readString(filter.searchText),
    readString(filter.value)
  ].filter((value): value is string => Boolean(value)).join(' '));
  if (filterTokens.size === 0) return false;
  return booleanConditionTerms(table, field).some(term => {
    const termTokens = meaningfulBooleanConditionTokens(term);
    return termTokens.size >= 2 && setIsSubset(termTokens, filterTokens);
  });
}

function booleanConditionTerms(table: TableDefinition, field: CapabilityField): string[] {
  const sourceField = table.fields.find(item => item.name === field.name);
  const metadata = analyzerFieldMetadata(table, field.name);
  return uniqueStrings([
    field.name,
    field.label ?? '',
    ...field.synonyms,
    readString(sourceField?.label),
    readString(metadata.businessName),
    readString(metadata.label),
    ...readStringArray(metadata.synonyms),
    ...booleanConceptTerms(metadata)
  ].filter((value): value is string => Boolean(value)));
}

function booleanConceptTerms(metadata: Record<string, unknown>): string[] {
  const concepts = metadata.valueConcepts;
  if (!Array.isArray(concepts)) return [];
  return concepts.flatMap(concept => {
    if (!isRecord(concept)) return [];
    if (!conceptHasBooleanValue(concept)) return [];
    return [
      readString(concept.conceptKey ?? concept.key ?? concept.id),
      readString(concept.label),
      ...readStringArray(concept.synonyms ?? concept.aliases)
    ].filter((value): value is string => Boolean(value));
  });
}

function metadataHasBooleanConcepts(metadata: Record<string, unknown>): boolean {
  const concepts = metadata.valueConcepts;
  return Array.isArray(concepts) && concepts.some(concept => isRecord(concept) && conceptHasBooleanValue(concept));
}

function conceptHasBooleanValue(concept: Record<string, unknown>): boolean {
  const values = Array.isArray(concept.values) ? concept.values : [concept.values];
  return values.some(value => booleanConceptValue(value));
}

function booleanConceptValue(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return value === 0 || value === 1;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === 'false' || normalized === '0' || normalized === '1';
}

function filterLabelLooksLikeValue(filter: PreflightFilter): boolean {
  const label = filter.label;
  const valueText = filter.searchText ?? primitiveSearchText(filter.value);
  if (!label || !valueText) return false;
  return normalizedTokenText(label) === normalizedTokenText(valueText);
}

function fallbackTimeFieldForDateRange(
  table: TableDefinition,
  fields: CapabilityField[],
  filter: PreflightFilter
): CapabilityField | null {
  if (!dateRangeFilter(filter)) return null;
  const candidates = fields.filter(field =>
    dateLikeField(field.type)
    && field.operators.includes('between')
  );
  const primaryTimeField = primaryTimeFieldName(table);
  if (primaryTimeField) {
    const primary = candidates.find(field => field.name === primaryTimeField);
    if (primary) return primary;
  }
  return candidates.find(field => field.role === 'time') ?? candidates[0] ?? null;
}

function primaryTimeFieldName(table: TableDefinition): string | null {
  const settings = isRecord(table.settings) ? table.settings : {};
  const settingsPrimaryTimeField = readString(settings.primaryTimeField);
  if (settingsPrimaryTimeField) return settingsPrimaryTimeField;
  const dictionary = isRecord(table.dictionary) ? table.dictionary : {};
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  const routing = ai.routing;
  const firstRouting = Array.isArray(routing)
    ? routing.find(isRecord)
    : isRecord(routing) ? routing : null;
  return readString(firstRouting?.primaryTimeField);
}

function dateRangeFilter(filter: PreflightFilter): boolean {
  const operator = filter.operator ? normalizeCapabilityFilterOperator(filter.operator) : null;
  return (operator === null || operator === 'between')
    && Array.isArray(filter.value)
    && filter.value.length === 2
    && filter.value.every(dateLikeValue);
}

function dateLikeValue(value: unknown): boolean {
  if (typeof value !== 'string' || !value.includes('-')) return false;
  return Number.isFinite(Date.parse(value));
}

export function filterCompatibleWithField(field: CapabilityField, filter: PreflightFilter): boolean {
  const searchText = filter.searchText ?? primitiveSearchText(filter.value);
  if (!searchText) return true;
  if (numericField(field.type)) return numericLikeText(searchText);
  return true;
}

export function supportedOperator(
  operators: AnalyzerCapabilityFilterOperator[],
  filter: PreflightFilter,
  fieldType: string
): AnalyzerCapabilityFilterOperator | null {
  const explicit = filter.operator ? normalizeCapabilityFilterOperator(filter.operator) : null;
  if (explicit && operators.includes(explicit)) return explicit;
  const fallback = fallbackOperator(filter.value, fieldType);
  return operators.includes(fallback) ? fallback : null;
}

export function primitiveSearchText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

export function stringLikeField(type: string): boolean {
  const normalized = type.trim().toLowerCase();
  return normalized === 'string'
    || normalized === 'text'
    || normalized === 'varchar'
    || normalized === 'nvarchar'
    || normalized === 'char';
}

export function dateLikeField(type: string): boolean {
  const normalized = type.trim().toLowerCase();
  return normalized === 'date'
    || normalized === 'datetime'
    || normalized === 'datetime2'
    || normalized === 'timestamp';
}

function fallbackLookupFieldForUnlabeledValue(
  table: TableDefinition,
  fields: CapabilityField[],
  filter: PreflightFilter
): CapabilityField | null {
  const searchText = filter.searchText ?? primitiveSearchText(filter.value);
  if (!searchText) return null;
  const candidates = fields.filter(field => {
    const tableField = table.fields.find(item => item.name === field.name);
    if (!tableField || !stringLikeField(field.type)) return false;
    if (lookupResultFilterRole(table, field.name)) return false;
    const resolution = fieldValueResolutionForTable(table, tableField);
    return Boolean(resolution.entityType)
      && (resolution.mode === 'lookup' || resolution.mode === 'catalog');
  });
  return candidates
    .map(field => ({ field, score: metadataValueHintScore(table, field, filter) + unresolvedInputPolicyScore(table, field) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.field ?? null;
}

function metadataFieldScore(field: CapabilityField, labelTokens: Set<string>): number {
  return metadataFieldTerms(field).reduce((score, term) => {
    const tokens = meaningfulLabelTokens(term);
    if (tokens.size === 0) return score;
    let matches = 0;
    tokens.forEach(token => {
      if (labelTokens.has(token)) matches += 1;
    });
    return score + matches / tokens.size;
  }, 0);
}

function fieldSemanticCompatibilityScore(
  table: TableDefinition,
  field: CapabilityField,
  labelTokens: Set<string>
): number {
  return fieldSemanticTerms(table, field).reduce((best, term) => {
    const tokens = meaningfulLabelTokens(term);
    if (tokens.size === 0) return best;
    let matches = 0;
    tokens.forEach(token => {
      if (labelTokens.has(token)) matches += 1;
    });
    return Math.max(best, matches / tokens.size);
  }, 0);
}

function metadataFieldTerms(field: CapabilityField): string[] {
  return uniqueStrings([
    field.name,
    field.label ?? '',
    ...field.synonyms
  ].filter(Boolean));
}

function lookupResultFilterRole(table: TableDefinition, fieldName: string): boolean {
  const metadata = analyzerFieldMetadata(table, fieldName);
  const role = readString(metadata.lookupFilterRole)
    ?? readString(metadata.valueResolutionRole)
    ?? readString(metadata.filterRole)
    ?? readString(metadata.plannerFilterRole);
  return ['answer', 'output', 'result', 'result_field'].includes(role?.trim().toLowerCase() ?? '');
}

function unresolvedInputPolicyScore(table: TableDefinition, field: CapabilityField): number {
  const metadata = analyzerFieldMetadata(table, field.name);
  const policy = readString(metadata.unresolvedValuePolicy ?? metadata.unresolvedLookupPolicy);
  if (policy === 'allow_exact' || policy === 'allow_contains') return 1;
  return 0;
}

function metadataValueHintScore(table: TableDefinition, field: CapabilityField, filter: PreflightFilter): number {
  const searchText = filter.searchText ?? primitiveSearchText(filter.value);
  if (!searchText) return 0;
  const searchTokens = tokenSet(searchText);
  if (searchTokens.size === 0) return 0;
  const metadata = analyzerFieldMetadata(table, field.name);
  const hintValues = valueHintTerms(metadata);
  if (hintValues.length === 0) return 0;
  let score = 0;
  for (const hint of hintValues) {
    const hintTokens = tokenSet(hint);
    if (hintTokens.size === 0) continue;
    let matches = 0;
    searchTokens.forEach(token => {
      if (hintTokens.has(token)) matches += 1;
    });
    hintTokens.forEach(token => {
      if (searchTokens.has(token)) matches += 1;
    });
    if (matches > 0) score = Math.max(score, matches / Math.max(searchTokens.size, hintTokens.size));
  }
  return score * 4;
}

function searchSemanticHintScore(
  table: TableDefinition,
  field: CapabilityField,
  filter: PreflightFilter
): number {
  const searchText = filter.searchText ?? primitiveSearchText(filter.value);
  if (!searchText) return 0;
  const searchTokens = tokenSet(searchText);
  if (searchTokens.size === 0) return 0;
  return semanticFieldTerms(table, field).reduce((best, term) => {
    const fieldTokens = tokenSet(term);
    if (fieldTokens.size === 0) return best;
    let matches = 0;
    searchTokens.forEach(token => {
      if (fieldTokens.has(token)) matches += 1;
    });
    fieldTokens.forEach(token => {
      if (searchTokens.has(token)) matches += 1;
    });
    return Math.max(best, matches / Math.max(fieldTokens.size, searchTokens.size));
  }, 0) * 2;
}

function fieldSemanticTerms(table: TableDefinition, field: CapabilityField): string[] {
  const metadata = analyzerFieldMetadata(table, field.name);
  return uniqueStrings([
    ...metadataFieldTerms(field),
    ...metadataConceptTerms(metadata)
  ]);
}

function semanticFieldTerms(table: TableDefinition, field: CapabilityField): string[] {
  const metadata = analyzerFieldMetadata(table, field.name);
  return uniqueStrings([
    ...fieldSemanticTerms(table, field),
    ...valueHintTerms(metadata),
  ]);
}

function valueHintTerms(metadata: Record<string, unknown>): string[] {
  const terms = [
    ...readStringArray(metadata.values),
    ...readStringArray(metadata.sampleValues),
    ...readStringArray(metadata.valueSynonyms),
    ...readStringArray(metadata.valueAliases)
  ];
  const concepts = metadata.valueConcepts ?? metadata.valueAliases ?? metadata.valueGroups;
  if (Array.isArray(concepts)) {
    for (const concept of concepts) {
      if (!isRecord(concept)) continue;
      terms.push(
        ...[
          readString(concept.conceptKey ?? concept.key ?? concept.id),
          readString(concept.label)
        ].filter((value): value is string => Boolean(value)),
        ...readStringArray(concept.synonyms ?? concept.aliases),
        ...readStringArray(concept.matchValues ?? concept.values ?? concept.sourceValues)
      );
    }
  }
  return uniqueStrings(terms);
}

function metadataConceptTerms(metadata: Record<string, unknown>): string[] {
  return uniqueStrings([
    readString(metadata.entityType),
    readString(metadata.businessEntity),
    readString(metadata.valueEntity),
    readString(metadata.semanticRole),
    readString(metadata.filterRole),
    readString(metadata.valueResolutionRole)
  ].filter((value): value is string => Boolean(value)));
}

function identifierLikeTextFilter(table: TableDefinition, field: CapabilityField, searchText: string): boolean {
  if (field.role !== 'identifier') return false;
  const sourceField = table.fields.find(item => item.name === field.name);
  if (!sourceField) return false;
  const metadata = analyzerFieldMetadata(table, field.name);
  const resolution = fieldValueResolutionForTable(table, sourceField);
  if (resolution.mode !== 'none' && !readString(metadata.valueResolutionMode)) return false;
  return containsDigit(searchText) && tokenSet(searchText).size <= 2;
}

function containsDigit(value: string): boolean {
  for (const character of value) {
    if (character >= '0' && character <= '9') return true;
  }
  return false;
}

function numericField(type: string): boolean {
  const normalized = type.trim().toLowerCase();
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

function booleanFieldType(type: string): boolean {
  return ['bit', 'bool', 'boolean'].includes(type.trim().toLowerCase());
}

function numericLikeText(value: string): boolean {
  return parseBusinessNumericText(value) !== null;
}

function fallbackOperator(value: unknown, fieldType: string): AnalyzerCapabilityFilterOperator {
  if (Array.isArray(value)) return value.length === 2 && dateLikeField(fieldType) ? 'between' : 'in';
  return 'equals';
}

function tokenSet(value: string): Set<string> {
  return analyzerTokenSet(value);
}

function meaningfulLabelTokens(value: string): Set<string> {
  const tokens = Array.from(tokenSet(value)).filter(token => !WEAK_FIELD_CONCEPT_TOKENS.has(token));
  return new Set(tokens);
}

function tokenSetsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const token of left) {
    if (right.has(token)) return true;
  }
  return false;
}

function setIsSubset(left: Set<string>, right: Set<string>): boolean {
  for (const token of left) {
    if (!right.has(token)) return false;
  }
  return true;
}

function normalizedTokenText(value: string): string {
  return Array.from(tokenSet(value)).join(' ');
}

function meaningfulBooleanConditionTokens(value: string): Set<string> {
  const tokens = Array.from(tokenSet(value)).filter(token => !WEAK_BOOLEAN_CONDITION_TOKENS.has(token));
  return new Set(tokens);
}

const WEAK_FIELD_CONCEPT_TOKENS = new Set([
  'field',
  'id',
  'identifier',
  'method',
  'name',
  'number',
  'status',
  'text',
  'type',
  'value'
]);

const WEAK_BOOLEAN_CONDITION_TOKENS = new Set([
  'flag',
  'has',
  'is',
  'with',
  'without'
]);
