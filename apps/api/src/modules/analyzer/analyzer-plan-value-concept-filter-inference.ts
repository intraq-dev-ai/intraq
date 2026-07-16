import type { TableDefinition } from '../data-source/foundation-store.js';
import { analyzerFieldMetadata } from './analyzer-plan-field-matching.js';
import type { PreflightFilter } from './analyzer-plan-capability-filter-selection.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import { analyzerTokenSet } from './analyzer-token-utils.js';

interface FilterableField {
  label?: string;
  name: string;
  role?: string;
  synonyms?: string[];
  type: string;
}

const GENERIC_FIELD_TARGET_TOKENS = new Set([
  'field', 'filter', 'flag', 'from', 'record', 'records', 'status', 'value'
]);
const WEAK_ENTITY_TARGET_TOKENS = new Set([
  'invoice', 'invoices', 'item', 'items', 'line', 'lines', 'sale', 'sales'
]);
const GENERIC_VALUE_CONCEPT_EVIDENCE_TOKENS = new Set([
  ...GENERIC_FIELD_TARGET_TOKENS,
  'condition', 'filter', 'record', 'records', 'sale', 'sales'
]);
const REPLACEABLE_VALUE_CONCEPT_OPERATORS = new Set(['=', '==', 'equal', 'equals', 'is']);
const OUTPUT_FRAMING_TERMS = ['include', 'including', 'return', 'show'];

export function withValueConceptFilters(
  table: TableDefinition,
  fields: FilterableField[],
  question: string,
  filters: PreflightFilter[]
): PreflightFilter[] {
  const questionText = normalizePhrase(question);
  if (!questionText) return filters;
  const conceptQuestionText = withoutRequestedIdentifierOutputs(questionText, fields);
  const inferred = fields.flatMap(field => {
    const metadata = analyzerFieldMetadata(table, field.name);
    const matches = matchingConcepts(metadata, conceptQuestionText);
    if (matches.length === 0) return [];
    const longest = Math.max(...matches.map(match => match.wordCount));
    const selected = matches.filter(match => match.wordCount === longest);
    const values = uniqueConceptValues(selected.flatMap(match => match.values));
    if (values.length === 0 || values.every(booleanConceptValue)) return [];
    const candidate = {
      field: field.name,
      label: selected[0]?.phrase ?? field.name,
      operator: values.length === 1 ? 'equals' : 'in',
      value: values.length === 1 ? values[0] : values
    };
    const targetingFilters = filters.filter(filter => filterTargetsField(filter, field, metadata));
    const exactFieldFilters = filters.filter(filter => filter.field === field.name);
    if ([...exactFieldFilters, ...targetingFilters].some(filter =>
      !filterAllowsValueConceptCandidate(filter, candidate, field, fields)
    )) return [];
    return [candidate];
  });
  const nonRedundantInferred = inferred.filter(candidate =>
    !redundantLevelConcept(candidate, inferred)
  );
  const safeInferred = nonRedundantInferred.filter(candidate => !filters.some(filter =>
    !replaceableValueConceptFilter(filter)
    && canonicalizableValueConceptFilter(filter, candidate, fields)
  ));
  const retainedFilters = filters.filter(filter =>
    !replaceableValueConceptFilter(filter)
    || !safeInferred.some(candidate => canonicalizableValueConceptFilter(filter, candidate, fields))
  );
  const inferredToAppend = safeInferred.filter(candidate => !retainedFilters.some(filter =>
    supportedFilterTargetField(filter, fields)?.name === candidate.field
  ));
  return [
    ...retainedFilters,
    ...inferredToAppend
  ];
}

function filterTargetsField(
  filter: PreflightFilter,
  field: FilterableField,
  metadata: Record<string, unknown>
): boolean {
  const requested = analyzerTokenSet([
    filter.field, filter.label, filter.searchText
  ].filter((value): value is string => Boolean(value)).join(' '));
  if (requested.size === 0) return false;
  const fieldTerms = analyzerTokenSet([
    field.name,
    field.label,
    ...(field.synonyms ?? []),
    readString(metadata.businessName),
    readString(metadata.label),
    ...readStringArray(metadata.synonyms)
  ].filter((value): value is string => Boolean(value)).join(' '));
  for (const token of requested) {
    if (
      !GENERIC_FIELD_TARGET_TOKENS.has(token)
      && !WEAK_ENTITY_TARGET_TOKENS.has(token)
      && fieldTerms.has(token)
    ) return true;
  }
  return false;
}

function canonicalizableValueConceptFilter(
  filter: PreflightFilter,
  inferred: PreflightFilter,
  fields: FilterableField[]
): boolean {
  const supportedTarget = supportedFilterTargetField(filter, fields);
  if (supportedTarget) {
    return filter.value === true
      && replaceableValueConceptFilter(filter)
      && supportedTarget.name === inferred.field
      && !booleanFieldType(supportedTarget.type);
  }
  return looseValueConceptFragmentFilter(filter, inferred)
    || unsupportedTargetMatchesValueConcept(filter, inferred);
}

function supportedFilterTargetField(
  filter: PreflightFilter,
  fields: FilterableField[]
): FilterableField | null {
  const target = normalizePhrase(filter.field ?? filter.label ?? '');
  if (!target) return null;
  return fields.find(field => [field.name, field.label, ...(field.synonyms ?? [])]
    .some(term => normalizePhrase(term ?? '') === target)) ?? null;
}

function looseValueConceptFragmentFilter(filter: PreflightFilter, inferred: PreflightFilter): boolean {
  const phrase = normalizePhrase(inferred.label ?? inferred.searchText ?? '');
  if (!phrase) return false;
  return [filter.label, filter.searchText, typeof filter.value === 'string' ? filter.value : undefined]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizePhrase)
    .filter(value => value.split(' ').length >= 2)
    .some(value => phraseIncluded(value, phrase) || phraseIncluded(phrase, value));
}

function unsupportedTargetMatchesValueConcept(filter: PreflightFilter, inferred: PreflightFilter): boolean {
  const rawTargetTokens = meaningfulTokens(filter.field ?? filter.label ?? '', GENERIC_FIELD_TARGET_TOKENS);
  const targetTokens = new Set([...rawTargetTokens].filter(token => !WEAK_ENTITY_TARGET_TOKENS.has(token)));
  const conceptTokens = analyzerTokenSet([
    inferred.label,
    inferred.searchText,
    ...stringValues(inferred.value)
  ].filter((value): value is string => Boolean(value)).join(' '));
  const distinctiveTargetOverlap = tokenSetsOverlap(targetTokens, conceptTokens);
  if (typeof filter.value === 'boolean') return filter.value && distinctiveTargetOverlap;
  const valueTokens = meaningfulTokens([
    filter.searchText,
    ...stringValues(filter.value)
  ].filter((value): value is string => Boolean(value)).join(' '), GENERIC_VALUE_CONCEPT_EVIDENCE_TOKENS);
  for (const token of rawTargetTokens) valueTokens.delete(token);
  return tokenSetsOverlap(rawTargetTokens, conceptTokens)
    && tokenSetsOverlap(valueTokens, conceptTokens);
}

function meaningfulTokens(value: string, ignored: Set<string>): Set<string> {
  return new Set([...analyzerTokenSet(value)].filter(token => !ignored.has(token)));
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.flatMap(stringValues);
}

function tokenSetsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const token of left) {
    if (right.has(token)) return true;
  }
  return false;
}

function replaceableValueConceptFilter(filter: PreflightFilter): boolean {
  const operator = filter.operator?.trim().toLowerCase();
  return !operator || REPLACEABLE_VALUE_CONCEPT_OPERATORS.has(operator);
}

function replaceablePositiveBooleanConceptFilter(
  filter: PreflightFilter,
  candidateField: FilterableField,
  fields: FilterableField[]
): boolean {
  if (filter.value !== true || !replaceableValueConceptFilter(filter)) return false;
  const supportedTarget = supportedFilterTargetField(filter, fields);
  return !supportedTarget || (
    supportedTarget.name === candidateField.name
    && !booleanFieldType(candidateField.type)
  );
}

function filterAllowsValueConceptCandidate(
  filter: PreflightFilter,
  candidate: PreflightFilter,
  candidateField: FilterableField,
  fields: FilterableField[]
): boolean {
  if (replaceablePositiveBooleanConceptFilter(filter, candidateField, fields)) return true;
  const supportedTarget = supportedFilterTargetField(filter, fields);
  if (supportedTarget?.name !== candidateField.name || !replaceableValueConceptFilter(filter)) return false;
  const evidenceTokens = distinctiveConceptTokens([
    filter.searchText,
    ...stringValues(filter.value)
  ].filter((value): value is string => Boolean(value)).join(' '));
  const candidateTokens = distinctiveConceptTokens([
    candidate.label,
    candidate.searchText,
    ...stringValues(candidate.value)
  ].filter((value): value is string => Boolean(value)).join(' '));
  return tokenSetsOverlap(evidenceTokens, candidateTokens);
}

function distinctiveConceptTokens(value: string): Set<string> {
  return new Set([...analyzerTokenSet(value)].filter(token =>
    !GENERIC_VALUE_CONCEPT_EVIDENCE_TOKENS.has(token)
    && !WEAK_ENTITY_TARGET_TOKENS.has(token)
  ));
}

function withoutRequestedIdentifierOutputs(question: string, fields: FilterableField[]): string {
  const identifierTerms = uniqueStrings(fields
    .filter(field => field.role === 'identifier' || /(?:^|_)(?:id|number)$/.test(field.name.trim().toLowerCase()))
    .flatMap(field => [field.name, field.label, ...(field.synonyms ?? [])])
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizePhrase)
    .filter(value => value.split(' ').length >= 2))
    .sort((left, right) => right.length - left.length);
  const hasFramedIdentifier = identifierTerms.some(term => OUTPUT_FRAMING_TERMS.some(frame =>
    phraseIncluded(question, `${frame} ${term}`)
  ));
  if (!hasFramedIdentifier) return question;
  return identifierTerms.reduce(removePhrase, question);
}

function removePhrase(text: string, phrase: string): string {
  return normalizePhrase(` ${text} `.split(` ${phrase} `).join(' '));
}

function redundantLevelConcept(candidate: PreflightFilter, inferred: PreflightFilter[]): boolean {
  const match = /^(.+)_level$/.exec(candidate.field?.trim().toLowerCase() ?? '');
  if (match?.[1] !== 'exclusion') return false;
  const levelTokens = analyzerTokenSet(stringValues(candidate.value).join(' '));
  if (levelTokens.size === 0) return false;
  return inferred.some(other => {
    if (other === candidate || !other.field?.startsWith(`${match[1]}_`)) return false;
    const otherValueTokens = analyzerTokenSet(stringValues(other.value).join(' '));
    for (const token of levelTokens) {
      if (!otherValueTokens.has(token)) return false;
    }
    return true;
  });
}

function booleanFieldType(value: string): boolean {
  return ['bit', 'bool', 'boolean'].includes(value.trim().toLowerCase());
}

function matchingConcepts(
  metadata: Record<string, unknown>,
  questionText: string
): Array<{ phrase: string; values: unknown[]; wordCount: number }> {
  const concepts = Array.isArray(metadata.valueConcepts) ? metadata.valueConcepts : [];
  return concepts.flatMap(concept => {
    if (!isRecord(concept)) return [];
    const values = Array.isArray(concept.values) ? concept.values : [concept.values];
    const phrases = uniqueStrings([
      readString(concept.label),
      ...readStringArray(concept.synonyms ?? concept.aliases)
    ].filter((value): value is string => Boolean(value)));
    return phrases.flatMap(phrase => {
      const normalized = normalizePhrase(phrase);
      if (!normalized || !phraseIncluded(questionText, normalized)) return [];
      return [{ phrase, values, wordCount: normalized.split(' ').length }];
    });
  });
}

function uniqueConceptValues(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  return values.filter(value => {
    if (value === null || value === undefined) return false;
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function booleanConceptValue(value: unknown): boolean {
  return value === true || value === false || value === 0 || value === 1
    || value === '0' || value === '1' || value === 'true' || value === 'false';
}

function phraseIncluded(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
