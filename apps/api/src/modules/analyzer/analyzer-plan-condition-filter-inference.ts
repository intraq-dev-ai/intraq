import type { TableDefinition } from '../data-source/foundation-store.js';
import type { AnalyzerCapabilityFilterOperator } from './analyzer-capability-contract.js';
import { analyzerFieldMetadata } from './analyzer-plan-field-matching.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import type { PreflightFilter } from './analyzer-plan-capability-filter-selection.js';

interface FilterableField {
  label?: string;
  name: string;
  operators: AnalyzerCapabilityFilterOperator[];
  role?: string;
  synonyms: string[];
  type: string;
}

export function withMetadataConditionFilters(
  table: TableDefinition,
  fields: FilterableField[],
  question: string,
  filters: PreflightFilter[]
): PreflightFilter[] {
  const inferred = inferredConditionFilters(table, fields, question);
  if (inferred.length === 0) return filters;
  const inferredFields = new Set(inferred.map(filter => filter.field).filter(Boolean));
  const conditionTokens = tokenSet(inferred.map(filter => filter.searchText ?? filter.label ?? '').join(' '));
  const retained = filters.filter(filter =>
    !inferredFields.has(filter.field)
    && !looseConditionFragmentFilter(filter, conditionTokens)
  );
  return [...retained, ...inferred];
}

function inferredConditionFilters(
  table: TableDefinition,
  fields: FilterableField[],
  question: string
): PreflightFilter[] {
  const questionText = normalizePhrase(question);
  if (!questionText) return [];
  return fields.flatMap(field => {
    if (!metadataBooleanConditionField(table, field)) return [];
    const match = bestConditionPhraseMatch(table, field, questionText);
    if (!match) return [];
    return [{
      field: field.name,
      label: match.phrase,
      operator: 'equals',
      value: match.value
    }];
  });
}

function bestConditionPhraseMatch(
  table: TableDefinition,
  field: FilterableField,
  questionText: string
): { phrase: string; value: 0 | 1 } | null {
  const candidates = conditionPhraseCandidates(table, field)
    .map(candidate => ({
      ...candidate,
      normalizedPhrase: normalizePhrase(candidate.phrase)
    }))
    .filter(candidate =>
      candidate.value === 1
      && candidate.normalizedPhrase
      && phraseIncluded(questionText, candidate.normalizedPhrase)
    )
    .sort((left, right) => right.normalizedPhrase.length - left.normalizedPhrase.length);
  const best = candidates[0];
  return best ? { phrase: best.phrase, value: best.value } : null;
}

function conditionPhraseCandidates(
  table: TableDefinition,
  field: FilterableField
): Array<{ phrase: string; value: 0 | 1 }> {
  const sourceField = table.fields.find(item => item.name === field.name);
  const metadata = analyzerFieldMetadata(table, field.name);
  const directTerms = uniqueStrings([
    field.name,
    field.label ?? '',
    ...field.synonyms,
    readString(sourceField?.label),
    readString(sourceField?.description),
    readString(sourceField?.dictionaryDescription),
    ...readStringArray(sourceField?.synonyms),
    readString(metadata.businessName),
    readString(metadata.label),
    readString(metadata.description),
    ...readStringArray(metadata.synonyms)
  ].filter((value): value is string => Boolean(value)));
  return expandConditionPhraseCandidates([
    ...directTerms.map(phrase => ({ phrase, value: 1 as const })),
    ...booleanConceptTerms(metadata)
  ]);
}

function expandConditionPhraseCandidates(
  candidates: Array<{ phrase: string; value: 0 | 1 }>
): Array<{ phrase: string; value: 0 | 1 }> {
  const seen = new Set<string>();
  return candidates.flatMap(candidate =>
    conditionPhraseAliases(candidate.phrase)
      .map(phrase => ({ phrase, value: candidate.value }))
      .filter(expanded => {
        const key = `${expanded.value}:${normalizePhrase(expanded.phrase)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
  );
}

function conditionPhraseAliases(phrase: string): string[] {
  const normalized = normalizePhrase(phrase);
  if (!zeroTotalConditionPhrase(normalized)) return [phrase];
  return uniqueStrings([
    phrase,
    'effectively zero',
    'effectively zero dollar',
    'effectively zero dollar invoice',
    'effectively zero dollar invoices',
    'effectively zero total',
    'effectively zero totals',
    'zero dollar',
    'zero dollar invoice',
    'zero dollar invoices',
    'zero total',
    'zero totals',
    'zero value',
    'zero value invoice',
    'zero value invoices'
  ]);
}

function zeroTotalConditionPhrase(normalizedPhrase: string): boolean {
  return /\b(?:effectively zero|zero dollar|zero total|zero value)\b/.test(normalizedPhrase);
}

function booleanConceptTerms(metadata: Record<string, unknown>): Array<{ phrase: string; value: 0 | 1 }> {
  const concepts = metadata.valueConcepts;
  if (!Array.isArray(concepts)) return [];
  return concepts.flatMap(concept => {
    if (!isRecord(concept)) return [];
    const value = firstBooleanConceptValue(concept.values);
    if (value === null) return [];
    return [
      readString(concept.conceptKey ?? concept.key ?? concept.id),
      readString(concept.label),
      ...readStringArray(concept.synonyms ?? concept.aliases)
    ].filter((phrase): phrase is string => Boolean(phrase))
      .filter(meaningfulConditionPhrase)
      .map(phrase => ({ phrase, value }));
  });
}

function meaningfulConditionPhrase(value: string): boolean {
  const normalized = normalizePhrase(value);
  return normalized.length > 2 && !GENERIC_BOOLEAN_CONDITION_PHRASES.has(normalized);
}

function metadataBooleanConditionField(table: TableDefinition, field: FilterableField): boolean {
  if (booleanFieldType(field.type)) return true;
  const metadata = analyzerFieldMetadata(table, field.name);
  if (booleanConceptTerms(metadata).length === 0) return false;
  const role = readString(metadata.valueResolutionRole)
    ?? readString(metadata.filterRole)
    ?? readString(metadata.plannerFilterRole)
    ?? readString(metadata.semanticRole);
  if (['condition', 'flag', 'boolean'].includes(role?.trim().toLowerCase() ?? '')) return true;
  return metadata.filterOnly === true
    || readString(metadata.filterOnly)?.trim().toLowerCase() === 'true';
}

function looseConditionFragmentFilter(filter: PreflightFilter, conditionTokens: Set<string>): boolean {
  if (dateRangeValue(filter.value)) return false;
  const text = [
    readString(filter.label),
    readString(filter.searchText),
    readString(filter.value)
  ].filter((value): value is string => Boolean(value)).join(' ');
  if (!text) return false;
  const tokens = conditionFragmentTokens(text);
  if (tokens.size === 0) return false;
  if (filter.value === undefined || filter.value === null) return true;
  if (typeof filter.value === 'boolean') return true;
  if (zeroValue(filter.value)) {
    const operator = filter.operator?.trim().toLowerCase() ?? 'equals';
    if (operator === 'equals') {
      return setIsSubset(tokens, conditionTokens) || tokenOverlapCount(tokens, conditionTokens) >= 2;
    }
    if (['!=', '<>', 'gt', 'not_equal', 'not_equals'].includes(operator)) {
      return tokenOverlapCount(tokens, conditionTokens) >= 1;
    }
  }
  if (typeof filter.value === 'string') {
    const valueTokens = conditionFragmentTokens(filter.value);
    return setIsSubset(tokens, conditionTokens) && setIsSubset(valueTokens, conditionTokens);
  }
  return false;
}

function conditionFragmentTokens(value: string): Set<string> {
  const tokens = tokenSet(value);
  return new Set(Array.from(tokens).filter(token => !['condition', 'flag', 'status'].includes(token)));
}

function zeroValue(value: unknown): boolean {
  if (typeof value === 'number') return Object.is(value, 0);
  return typeof value === 'string' && value.trim() === '0';
}

function dateRangeValue(value: unknown): boolean {
  return Array.isArray(value)
    && value.length === 2
    && value.every(item => typeof item === 'string' && Number.isFinite(Date.parse(item)));
}

function firstBooleanConceptValue(value: unknown): 0 | 1 | null {
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    if (item === true || item === 1 || item === '1' || item === 'true') return 1;
    if (item === false || item === 0 || item === '0' || item === 'false') return 0;
  }
  return null;
}

function booleanFieldType(value: string): boolean {
  return ['bit', 'bool', 'boolean'].includes(value.trim().toLowerCase());
}

function phraseIncluded(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

function normalizePhrase(value: string): string {
  return [...value.toLowerCase()]
    .map(character => isTokenCharacter(character) ? character : ' ')
    .join('')
    .split(' ')
    .filter(Boolean)
    .join(' ');
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizePhrase(value).split(' ').filter(Boolean));
}

function setIsSubset(left: Set<string>, right: Set<string>): boolean {
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}

function tokenOverlapCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const item of left) {
    if (right.has(item)) count += 1;
  }
  return count;
}

function isTokenCharacter(character: string): boolean {
  return character >= 'a' && character <= 'z' || character >= '0' && character <= '9';
}

const GENERIC_BOOLEAN_CONDITION_PHRASES = new Set([
  'exists',
  'flagged',
  'false',
  'missing flag',
  'no',
  'not present',
  'present',
  'true',
  'with',
  'without',
  'yes'
]);
