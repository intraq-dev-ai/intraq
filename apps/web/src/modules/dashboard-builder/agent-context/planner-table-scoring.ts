import type { BuilderDataTable } from '../types';
import {
  fieldMetadata,
  fieldTermsFromMetadata,
  readStringArray,
  routingMetadata
} from './planner-metadata';
import { normalizeSearchText, wordsFromText } from './text-normalization';

export function scoreTable(table: BuilderDataTable, normalizedPrompt: string): number {
  const dictionary = table.dictionary ?? {};
  const routing = routingMetadata(table);
  const intentTerms = [
    dictionary.businessName ?? '',
    ...(dictionary.sampleQuestions ?? []),
    ...(dictionary.ai?.sampleQuestions ?? []),
    ...readStringArray(routing.triggerKeywords),
    ...readStringArray(routing.useFor)
  ];
  const contextTerms = [
    table.name,
    table.description ?? '',
  ];
  const fieldIntentTerms = table.fields.flatMap(field => [
    field.description ?? '',
    field.dictionaryDescription ?? '',
    ...fieldTermsFromMetadata(fieldMetadata(table, field.name))
  ]);
  return [
    ...weightedTerms(intentTerms, 4),
    ...weightedTerms(contextTerms, 1),
    ...weightedTerms(fieldIntentTerms, 1)
  ]
    .filter(Boolean)
    .reduce((score, term) => score + termScore(normalizedPrompt, term.value) * term.weight, 0);
}

function weightedTerms(values: string[], weight: number): Array<{ value: string; weight: number }> {
  return values.map(value => ({ value, weight }));
}

function termScore(prompt: string, term: string): number {
  const normalized = normalizeSearchText(term);
  if (!normalized) return 0;
  const termWords = wordsFromText(normalized);
  if (prompt.includes(normalized)) return termWords.length > 1 ? 3 : 1;
  return termWords.filter(part => part.length > 3 && prompt.includes(part)).length;
}
