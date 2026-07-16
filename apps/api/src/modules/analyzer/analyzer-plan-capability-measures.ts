import type { AnalyzerCapabilityField } from './analyzer-capability-contract.js';
import { uniqueStrings } from './analyzer-plan-utils.js';
import { analyzerTokenSet } from './analyzer-token-utils.js';

const GENERIC_MEASURE_TERMS = new Set([
  'amount',
  'count',
  'metric',
  'number',
  'quantity',
  'sales',
  'total',
  'value'
]);

export function explicitlyRequestedMeasureNames(
  fields: AnalyzerCapabilityField[],
  question: string
): string[] {
  const normalizedQuestion = normalizedPhrase(question);
  if (!normalizedQuestion) return [];
  return uniqueStrings(fields.flatMap(field =>
    measureTerms(field).some(term => explicitMeasurePhrase(normalizedQuestion, term))
      ? [field.name]
      : []
  ));
}

export function explicitlyRequestedMeasureTerms(
  fields: AnalyzerCapabilityField[],
  question: string
): string[] {
  const normalizedQuestion = normalizedPhrase(question);
  if (!normalizedQuestion) return [];
  return uniqueStrings(fields.flatMap(field =>
    measureTerms(field)
      .map(normalizedPhrase)
      .filter(term =>
        explicitMeasurePhrase(normalizedQuestion, term)
        && !measureTermOnlyInPredicate(normalizedQuestion, term)
      )
  ));
}

export function preferSpecificMeasureTerms(terms: string[]): string[] {
  const unique = uniqueStrings(terms.map(normalizedPhrase).filter(Boolean));
  return unique.filter(term => {
    const tokens = analyzerTokenSet(term);
    return !unique.some(candidate => {
      if (candidate === term) return false;
      const candidateTokens = analyzerTokenSet(candidate);
      return candidateTokens.size > tokens.size
        && [...tokens].every(token => candidateTokens.has(token));
    });
  });
}

function measureTerms(field: AnalyzerCapabilityField): string[] {
  return uniqueStrings([field.name, field.label, ...field.synonyms]
    .filter((value): value is string => Boolean(value?.trim())));
}

function explicitMeasurePhrase(question: string, term: string): boolean {
  const normalizedTerm = normalizedPhrase(term);
  if (!normalizedTerm) return false;
  const tokens = analyzerTokenSet(normalizedTerm);
  if (tokens.size === 1 && GENERIC_MEASURE_TERMS.has(Array.from(tokens)[0] ?? '')) return false;
  return question === normalizedTerm
    || question.startsWith(`${normalizedTerm} `)
    || question.endsWith(` ${normalizedTerm}`)
    || question.includes(` ${normalizedTerm} `);
}

function measureTermOnlyInPredicate(question: string, term: string): boolean {
  const whereIndex = question.indexOf(' where ');
  if (whereIndex < 0) return false;
  const beforePredicate = question.slice(0, whereIndex);
  if (explicitMeasurePhrase(beforePredicate, term)) return false;
  const predicate = question.slice(whereIndex + 7);
  if (!explicitMeasurePhrase(predicate, term)) return false;
  return /\b(?:above|below|differs|equal|equals|exceeds|greater|less|matches|over|under)\b/.test(predicate);
}

function normalizedPhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
