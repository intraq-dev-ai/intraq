import type { AnalyzerCapabilityField } from './analyzer-capability-contract.js';
import type { PreflightFilter } from './analyzer-plan-capability-filter-selection.js';
import { analyzerTokenSet } from './analyzer-token-utils.js';

const EQUALITY_OPERATORS = new Set(['compare', 'contains', 'equal', 'equals', 'in', 'is', 'versus']);
const GREATER_OPERATORS = new Set(['gt', 'gte']);
const LESS_OPERATORS = new Set(['lt', 'lte']);
const WEAK_CONCEPT_TOKENS = new Set([
  'absolute',
  'amount',
  'amounts',
  'count',
  'counts',
  'invoice',
  'invoices',
  'total',
  'totals',
  'value',
  'values'
]);
const COMPARISON_REFERENCE_TOKENS = analyzerTokenSet(
  'and compare comparison output requested show the versus vs with'
);
const GENERIC_COMPARISON_TARGET_TOKENS = analyzerTokenSet(
  'comparison comparisons gst measure measures metric metrics output outputs tax total totals value values'
);
const OUTPUT_FRAMING_VALUE_TOKENS = analyzerTokenSet(
  'column display field include included including output requested return show'
);

export function normalizeNumericPreflightFilter(filter: PreflightFilter): PreflightFilter {
  const embeddedValue = inequalityFilter(filter)
    ? parseEmbeddedBusinessNumericText(filter.searchText)
    : null;
  if (!formattedNumericText(filter.value) && !formattedNumericText(filter.searchText) && embeddedValue === null) {
    return filter;
  }
  const parsedValue = numericFilterValue(filter.value)
    ?? parseBusinessNumericText(filter.searchText)
    ?? embeddedValue;
  if (parsedValue === null) return filter;
  const { searchText: _searchText, ...normalized } = filter;
  return {
    ...normalized,
    value: parsedValue
  };
}

export function thresholdConceptTerms(filter: PreflightFilter): string[] {
  return [filter.field, filter.label, filter.searchText]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(value => value
      .replace(/[$£€]\s*(?:\d[\d,]*(?:\.\d+)?|\.\d+)/gi, ' ')
      .replace(/\b(?:\d+(?:\.\d+)?|\.\d+)\s*(?:c|cent|cents)\b/gi, ' ')
      .replace(/\b(?:absolute|above|below|exceeds?|greater|less|more|over|than|threshold|under)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
}

export function parseBusinessNumericText(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const cents = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:c|cent|cents|¢)$/.exec(normalized);
  if (cents) return finiteNumber(cents[1], 0.01);
  const currency = /^[+-]?\s*[$£€]\s*(?:\d[\d,]*(?:\.\d+)?|\.\d+)$/.test(normalized);
  const plain = /^[+-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)$/.test(normalized);
  if (!currency && !plain) return null;
  return finiteNumber(normalized.replace(/[$£€,\s]/g, ''), 1);
}

export function repeatedMeasureReferenceFilter(
  measure: AnalyzerCapabilityField,
  filter: PreflightFilter
): boolean {
  const operator = filter.operator?.trim().toLowerCase();
  if (operator && !EQUALITY_OPERATORS.has(operator)) return false;
  if (typeof filter.value === 'number' || typeof filter.value === 'boolean' || Array.isArray(filter.value)) {
    return false;
  }
  const references = [filter.field, filter.label]
    .filter((value): value is string => Boolean(value?.trim()));
  const values = [filter.searchText, typeof filter.value === 'string' ? filter.value : undefined]
    .filter((value): value is string => Boolean(value?.trim()));
  if (references.length === 0 || values.length === 0) return false;
  const measureTerms = [measure.name, measure.label, ...measure.synonyms]
    .filter((value): value is string => Boolean(value?.trim()));
  return references.some(reference => termsEquivalent(reference, measureTerms))
    && values.every(value => termsEquivalent(value, [...references, ...measureTerms]));
}

export function requestedOutputFieldReferenceFilter(
  field: AnalyzerCapabilityField,
  filter: PreflightFilter,
  question: string,
  requestedMeasures: AnalyzerCapabilityField[] = []
): boolean {
  const references = [filter.field, filter.label]
    .filter((value): value is string => Boolean(value?.trim()));
  const terms = [field.name, field.label, ...(field.role === 'measure' ? field.synonyms : [])]
    .filter((value): value is string => Boolean(value?.trim()));
  if (!references.some(reference => termsEquivalent(reference, terms))) return false;
  const normalizedQuestion = normalizePhrase(question);
  if (
    (outputReferenceFramed(normalizedQuestion, terms)
      || coordinatedOutputReferenceFramed(normalizedQuestion, terms)
      || comparedMeasureReferenceFramed(
        normalizedQuestion,
        field,
        terms,
        filter,
        requestedMeasures
      ))
    && !fieldPredicateQuestion(normalizedQuestion, terms, filter)
  ) {
    return true;
  }
  const operator = filter.operator?.trim().toLowerCase();
  if (operator && !EQUALITY_OPERATORS.has(operator)) return false;
  if (typeof filter.value === 'number' || typeof filter.value === 'boolean' || Array.isArray(filter.value)) {
    return false;
  }
  if (
    identifierOutputField(field)
    && outputReferenceFramed(normalizedQuestion, terms)
    && [filter.searchText, typeof filter.value === 'string' ? filter.value : undefined]
      .filter((value): value is string => Boolean(value?.trim()))
      .every(value => termsFragment(value, [...references, ...terms])
        || outputFramingReferenceValue(value, [...references, ...terms]))
  ) {
    return true;
  }
  if (filter.searchText && !termsEquivalent(filter.searchText, [...references, ...terms])) return false;
  const value = typeof filter.value === 'string' ? filter.value : null;
  if (value && !termsEquivalent(value, [...references, ...terms])) return false;
  if (
    (rankedOutputReferenceQuestion(question) || comparedOutputReferenceQuestion(question))
    && terms.some(term => phraseIncluded(normalizedQuestion, normalizePhrase(term)))
  ) {
    return true;
  }
  return outputReferenceFramed(normalizedQuestion, terms);
}

function comparedMeasureReferenceFramed(
  question: string,
  field: AnalyzerCapabilityField,
  terms: string[],
  filter: PreflightFilter,
  requestedMeasures: AnalyzerCapabilityField[]
): boolean {
  if (
    field.role !== 'measure'
    || !comparedOutputReferenceQuestion(question)
    || !terms.some(term => phraseIncluded(question, normalizePhrase(term)))
  ) return false;
  const operator = filter.operator?.trim().toLowerCase() ?? '';
  if (['gt', 'gte', 'lt', 'lte', '>', '>=', '<', '<=', 'is_null', 'is_not_null'].includes(operator)) {
    return false;
  }
  if (Array.isArray(filter.value) || typeof filter.value === 'number') return false;
  if (typeof filter.value === 'boolean') return filter.value;
  const requestedTerms = requestedMeasures.flatMap(measure => [
    measure.name,
    measure.label,
    ...measure.synonyms
  ]).filter((value): value is string => Boolean(value?.trim()));
  const values = [filter.searchText, typeof filter.value === 'string' ? filter.value : undefined]
    .filter((value): value is string => Boolean(value?.trim()));
  return values.length === 0 || values.every(value =>
    termsReferenceMeasure(value, [...terms, ...requestedTerms])
    || genericMeasureOutputMarker(value)
  );
}

function genericMeasureOutputMarker(value: string): boolean {
  const tokens = analyzerTokenSet(value);
  const allowed = analyzerTokenSet('comparison measure metric operand output requested value');
  return tokens.size > 0
    && [...tokens].every(token => allowed.has(token))
    && ['measure', 'metric', 'operand', 'output', 'requested'].some(token => tokens.has(token));
}

function fieldPredicateQuestion(
  question: string,
  terms: string[],
  filter: PreflightFilter
): boolean {
  const values = [filter.searchText, ...identifierPredicateValues(filter.value)]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizePhrase)
    .filter(value => value && !outputFramingReferenceValue(value, terms) && !termsEquivalent(value, terms));
  return terms.some(term => {
    const normalizedTerm = normalizePhrase(term);
    if (!normalizedTerm) return false;
    if (values.some(value => [
      `${normalizedTerm} ${value}`,
      `${normalizedTerm} equal ${value}`,
      `${normalizedTerm} equals ${value}`,
      `${normalizedTerm} equal to ${value}`,
      `${normalizedTerm} is ${value}`,
      `${normalizedTerm} in ${value}`,
      `${normalizedTerm} above ${value}`,
      `${normalizedTerm} below ${value}`,
      `${normalizedTerm} over ${value}`,
      `${normalizedTerm} under ${value}`,
      `${normalizedTerm} greater than ${value}`,
      `${normalizedTerm} less than ${value}`,
      `${normalizedTerm} at least ${value}`,
      `${normalizedTerm} at most ${value}`,
      `${normalizedTerm} is above ${value}`,
      `${normalizedTerm} is below ${value}`,
      `${normalizedTerm} is over ${value}`,
      `${normalizedTerm} is under ${value}`,
      `${normalizedTerm} is greater than ${value}`,
      `${normalizedTerm} is less than ${value}`,
      `${normalizedTerm} is at least ${value}`,
      `${normalizedTerm} is at most ${value}`
    ].some(phrase => phraseIncluded(question, phrase)))) return true;
    return [
      `${normalizedTerm} is null`,
      `${normalizedTerm} is not null`,
      `${normalizedTerm} not null`
    ].some(phrase => phraseIncluded(question, phrase));
  });
}

function coordinatedOutputReferenceFramed(question: string, terms: string[]): boolean {
  const paddedQuestion = ` ${question} `;
  const boundaryTokens = new Set(['having', 'when', 'where', 'whose', 'with']);
  return terms.some(term => {
    const normalizedTerm = normalizePhrase(term);
    if (!normalizedTerm) return false;
    const termNeedle = ` ${normalizedTerm} `;
    return ['include', 'including', 'return'].some(frame => {
      const frameNeedle = ` ${frame} `;
      const frameIndex = paddedQuestion.indexOf(frameNeedle);
      if (frameIndex < 0) return false;
      const termIndex = paddedQuestion.indexOf(termNeedle, frameIndex + frameNeedle.length);
      if (termIndex < 0) return false;
      const betweenTokens = paddedQuestion
        .slice(frameIndex + frameNeedle.length, termIndex)
        .trim()
        .split(' ')
        .filter(Boolean);
      return betweenTokens.length <= 12 && !betweenTokens.some(token => boundaryTokens.has(token));
    });
  });
}

function identifierPredicateValues(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (!Array.isArray(value)) return [];
  return value.flatMap(identifierPredicateValues);
}

export function comparedRequestedMeasureReferenceFilter(
  measure: AnalyzerCapabilityField,
  filter: PreflightFilter,
  requestedMeasures: string[],
  operation: string,
  question: string
): boolean {
  if (operation !== 'compare' || !comparedOutputReferenceQuestion(question)) return false;
  const measureTerms = [measure.name, measure.label, ...measure.synonyms]
    .filter((value): value is string => Boolean(value?.trim()));
  if (!requestedMeasures.some(item => termsEquivalent(item, measureTerms))) return false;
  const references = [filter.field, filter.label]
    .filter((value): value is string => Boolean(value?.trim()));
  const searchText = filter.searchText?.trim() ?? '';
  const namedByReference = references.some(reference => termsEquivalent(reference, measureTerms));
  const namedByExactSearchText = genericComparedMeasureTarget(references)
    && Boolean(searchText && termsEquivalent(searchText, measureTerms));
  if (!namedByReference && !namedByExactSearchText) return false;
  if (typeof filter.value === 'number' || typeof filter.value === 'boolean' || Array.isArray(filter.value)) {
    return false;
  }
  const value = typeof filter.value === 'string' ? filter.value : null;
  if (value && !termsReferenceMeasure(value, [...references, ...measureTerms])) return false;
  if (searchText && parseBusinessNumericText(searchText) !== null) return false;
  const operator = filter.operator?.trim().toLowerCase() ?? '';
  if (['gt', 'gte', 'lt', 'lte', '>', '>=', '<', '<='].includes(operator)) return false;
  if (
    ['contains', 'equal', 'equals', 'in', 'is'].includes(operator)
    && searchText
    && !termsReferenceMeasure(searchText, [...references, ...measureTerms])
  ) {
    return false;
  }
  const normalizedQuestion = normalizePhrase(question);
  return measureTerms.some(term => phraseIncluded(normalizedQuestion, normalizePhrase(term)));
}

function comparedOutputReferenceQuestion(question: string): boolean {
  const tokens = analyzerTokenSet(question);
  return ['compare', 'comparison', 'versus', 'vs'].some(token => tokens.has(token));
}

function rankedOutputReferenceQuestion(question: string): boolean {
  const tokens = analyzerTokenSet(question);
  return [
    'best',
    'highest',
    'largest',
    'lowest',
    'smallest',
    'strongest',
    'top',
    'what',
    'which'
  ].some(token => tokens.has(token));
}

function phraseIncluded(question: string, phrase: string): boolean {
  return Boolean(phrase) && ` ${question} `.includes(` ${phrase} `);
}

function identifierOutputField(field: AnalyzerCapabilityField): boolean {
  return field.role === 'identifier' || /(?:^|_)id$/.test(field.name.trim().toLowerCase());
}

function outputReferenceFramed(question: string, terms: string[]): boolean {
  return terms.some(term => {
    const normalizedTerm = normalizePhrase(term);
    return normalizedTerm && [
      `include ${normalizedTerm}`,
      `including ${normalizedTerm}`,
      `return ${normalizedTerm}`,
      `show ${normalizedTerm}`
    ].some(phrase => phraseIncluded(question, phrase));
  });
}

function outputFramingReferenceValue(value: string, candidates: string[]): boolean {
  const tokens = analyzerTokenSet(value);
  if (tokens.size === 0) return false;
  const candidateTokens = analyzerTokenSet(candidates.join(' '));
  let hasFramingToken = false;
  for (const token of tokens) {
    if (OUTPUT_FRAMING_VALUE_TOKENS.has(token)) {
      hasFramingToken = true;
      continue;
    }
    if (!candidateTokens.has(token)) return false;
  }
  return hasFramingToken;
}

function termsFragment(value: string, candidates: string[]): boolean {
  const tokens = analyzerTokenSet(value);
  if (tokens.size === 0) return false;
  return candidates.some(candidate => {
    const candidateTokens = analyzerTokenSet(candidate);
    return candidateTokens.size > 0 && [...tokens].every(token => candidateTokens.has(token));
  });
}

export function thresholdEncodedByMeasure(
  requestedMeasure: AnalyzerCapabilityField | null,
  filterMeasure: AnalyzerCapabilityField | null,
  filter: PreflightFilter
): boolean {
  if (!requestedMeasure?.description || !filterMeasure) return false;
  const threshold = numericFilterValue(filter.value);
  if (threshold === null || !thresholdDirectionMatchesDescription(filter.operator, requestedMeasure.description)) {
    return false;
  }
  if (!descriptionContainsThreshold(requestedMeasure.description, threshold)) return false;
  const filterTerms = significantTokens([
    filterMeasure.name,
    filterMeasure.label,
    filterMeasure.description,
    ...filterMeasure.synonyms
  ].filter((value): value is string => Boolean(value)).join(' '));
  const measureTerms = significantTokens(requestedMeasure.description);
  return overlapCount(filterTerms, measureTerms) >= 2;
}

function numericFilterValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value) || typeof value === 'boolean') return null;
  return parseBusinessNumericText(value);
}

function formattedNumericText(value: unknown): boolean {
  return typeof value === 'string'
    && parseBusinessNumericText(value) !== null
    && /[$£€¢,]|\b(?:c|cent|cents)\b/i.test(value);
}

function parseEmbeddedBusinessNumericText(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/[$£€]\s*(?:\d[\d,]*(?:\.\d+)?|\.\d+)|(?:\d+(?:\.\d+)?|\.\d+)\s*(?:c|cent|cents|¢)\b/i);
  return match ? parseBusinessNumericText(match[0]) : null;
}

function inequalityFilter(filter: PreflightFilter): boolean {
  return ['gt', 'gte', 'lt', 'lte', '>', '>=', '<', '<=']
    .includes(filter.operator?.trim().toLowerCase() ?? '');
}

function finiteNumber(value: string | undefined, multiplier: number): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed * multiplier : null;
}

function termsEquivalent(value: string, candidates: string[]): boolean {
  const tokens = analyzerTokenSet(value);
  if (tokens.size === 0) return false;
  return candidates.some(candidate => {
    const candidateTokens = analyzerTokenSet(candidate);
    return candidateTokens.size === tokens.size && overlapCount(tokens, candidateTokens) === tokens.size;
  });
}

function termsReferenceMeasure(value: string, candidates: string[]): boolean {
  if (termsEquivalent(value, candidates)) return true;
  const tokens = analyzerTokenSet(value);
  return candidates.some(candidate => {
    const candidateTokens = analyzerTokenSet(candidate);
    if (candidateTokens.size === 0) return false;
    if (![...candidateTokens].every(token => tokens.has(token))) return false;
    return [...tokens].every(token =>
      candidateTokens.has(token) || COMPARISON_REFERENCE_TOKENS.has(token)
    );
  });
}

function genericComparedMeasureTarget(references: string[]): boolean {
  return references.length > 0 && references.every(reference => {
    const tokens = analyzerTokenSet(reference);
    return tokens.size > 0 && [...tokens].every(token => GENERIC_COMPARISON_TARGET_TOKENS.has(token));
  });
}

function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function thresholdDirectionMatchesDescription(operator: string | undefined, description: string): boolean {
  const normalizedOperator = operator?.trim().toLowerCase();
  if (!normalizedOperator) return false;
  const normalizedDescription = description.toLowerCase();
  if (GREATER_OPERATORS.has(normalizedOperator)) {
    return /\b(?:above|exceeds?|greater than|more than|over)\b/.test(normalizedDescription);
  }
  if (LESS_OPERATORS.has(normalizedOperator)) {
    return /\b(?:below|fewer than|less than|under)\b/.test(normalizedDescription);
  }
  return false;
}

function descriptionContainsThreshold(description: string, expected: number): boolean {
  const candidates = description.match(/[$£€]?\d[\d,]*(?:\.\d+)?\s*(?:c|cent|cents|¢)?/gi) ?? [];
  return candidates.some(candidate => {
    const value = parseBusinessNumericText(candidate);
    return value !== null && Math.abs(value - expected) < 1e-9;
  });
}

function significantTokens(value: string): Set<string> {
  return new Set(Array.from(analyzerTokenSet(value)).filter(token => !WEAK_CONCEPT_TOKENS.has(token)));
}

function overlapCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  left.forEach(token => {
    if (right.has(token)) count += 1;
  });
  return count;
}
