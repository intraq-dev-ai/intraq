import type { TableDefinition } from '../data-source/foundation-store.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import { analyzerTokensFromText, analyzerTokensFromUnknown } from './analyzer-plan-field-matching.js';

export interface AnalyzerDerivedColumn {
  businessName?: string;
  columnType?: string;
  description?: string;
  formula: string;
  name: string;
  outputFormat?: string;
  sourceFields: string[];
  synonyms: string[];
  type?: string;
}

export interface AnalyzerValueConcept {
  appliesToMetrics: string[];
  conceptKey: string;
  label: string;
  matchType: string;
  matchValues: string[];
  synonyms: string[];
  targetField: string;
}

export function derivedColumnsForTable(table: TableDefinition): AnalyzerDerivedColumn[] {
  const dictionary = table.dictionary;
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  const routing = isRecord(ai.routing) ? ai.routing : isRecord(dictionary.routing) ? dictionary.routing : {};
  return uniqueDerivedColumns([
    ...readDerivedColumnList(dictionary.derivedColumns),
    ...readDerivedColumnList(ai.derivedColumns),
    ...readDerivedColumnList(routing.derivedColumns)
  ]).filter(column => derivedColumnSourceFields(table, column).length > 0);
}

export function valueConceptsForTable(table: TableDefinition): AnalyzerValueConcept[] {
  const dictionary = table.dictionary;
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  const routing = isRecord(ai.routing) ? ai.routing : isRecord(dictionary.routing) ? dictionary.routing : {};
  return uniqueValueConcepts([
    ...readValueConceptList(dictionary.valueConcepts),
    ...readValueConceptList(ai.valueConcepts),
    ...readValueConceptList(routing.valueConcepts)
  ]).filter(concept => table.fields.some(field => field.name === concept.targetField));
}

export function derivedColumnMatchesQuestion(column: AnalyzerDerivedColumn, question: string): boolean {
  const questionTokens = new Set(analyzerTokensFromText(question));
  return derivedColumnPhrases(column).some(phrase => {
    const phraseTokens = derivedMatchTokens(phrase);
    const matchedCount = phraseTokens.filter(token => questionTokens.has(token)).length;
    if (phraseTokens.length === 0 || matchedCount === 0) return false;
    if (phraseTokens.every(token => questionTokens.has(token))) return true;
    if (matchedCount >= 2 && matchedCount / phraseTokens.length >= 0.5) return true;
    return phraseTokens.some(token => questionTokens.has(token) && DISTINCTIVE_DERIVED_TOKENS.has(token));
  });
}

export function derivedColumnSourceFields(table: TableDefinition, column: AnalyzerDerivedColumn): string[] {
  const tableFields = table.fields.map(field => field.name);
  const explicitFields = column.sourceFields.filter(field => tableFields.includes(field));
  if (explicitFields.length > 0) return uniqueStrings(explicitFields);
  const formulaTokens = new Set(analyzerTokensFromText(column.formula));
  const loweredFormula = column.formula.toLowerCase();
  return tableFields.filter(field => {
    const loweredField = field.toLowerCase();
    return loweredFormula.includes(loweredField)
      || analyzerTokensFromText(field).every(token => formulaTokens.has(token));
  });
}

export function derivedColumnTokens(column: AnalyzerDerivedColumn): string[] {
  return analyzerTokensFromUnknown(derivedColumnPhrases(column));
}

export function valueConceptTokens(concept: AnalyzerValueConcept): string[] {
  return analyzerTokensFromUnknown([
    concept.conceptKey,
    concept.label,
    concept.matchValues,
    concept.synonyms
  ]);
}

function readDerivedColumnList(value: unknown): AnalyzerDerivedColumn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const name = readString(item.name);
    const formula = readString(item.formula);
    if (!name || !formula) return [];
    const column: AnalyzerDerivedColumn = {
      name,
      formula,
      sourceFields: uniqueStrings([
        ...readStringArray(item.sourceFields),
        ...readStringArray(item.referencedFields),
        ...readStringArray(item.fields)
      ]),
      synonyms: readStringArray(item.synonyms)
    };
    const businessName = readString(item.businessName) ?? readString(item.label);
    const columnType = readString(item.columnType);
    const description = readString(item.description);
    const outputFormat = readString(item.outputFormat) ?? readString(item.format);
    const type = readString(item.type);
    if (businessName) column.businessName = businessName;
    if (columnType) column.columnType = columnType;
    if (description) column.description = description;
    if (outputFormat) column.outputFormat = outputFormat;
    if (type) column.type = type;
    return [column];
  });
}

function uniqueDerivedColumns(columns: AnalyzerDerivedColumn[]): AnalyzerDerivedColumn[] {
  return Array.from(new Map(columns.map(column => [
    `${column.name}:${column.formula}`,
    column
  ])).values());
}

function readValueConceptList(value: unknown): AnalyzerValueConcept[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const conceptKey = readString(item.conceptKey) ?? readString(item.key);
    const targetField = readString(item.targetField) ?? readString(item.field);
    if (!conceptKey || !targetField) return [];
    return [{
      appliesToMetrics: readStringArray(item.appliesToMetrics),
      conceptKey,
      label: readString(item.label) ?? conceptKey,
      matchType: readString(item.matchType) ?? 'in',
      matchValues: readStringArray(item.matchValues ?? item.values),
      synonyms: readStringArray(item.synonyms),
      targetField
    }];
  });
}

function uniqueValueConcepts(concepts: AnalyzerValueConcept[]): AnalyzerValueConcept[] {
  return Array.from(new Map(concepts.map(concept => [
    `${concept.conceptKey}:${concept.targetField}:${concept.matchValues.join('|')}`,
    concept
  ])).values());
}

function derivedColumnPhrases(column: AnalyzerDerivedColumn): string[] {
  return uniqueStrings([
    column.name,
    column.businessName ?? '',
    column.description ?? '',
    ...column.synonyms
  ].filter(Boolean));
}

const DERIVED_MATCH_STOP_TOKENS = new Set([
  'a',
  'an',
  'for',
  'of',
  'period',
  'selected',
  'the'
]);

const DISTINCTIVE_DERIVED_TOKENS = new Set([
  'conversion',
  'lead',
  'margin',
  'rate',
  'share',
  'utilization'
]);

function derivedMatchTokens(phrase: string): string[] {
  return analyzerTokensFromText(phrase).filter(token => !DERIVED_MATCH_STOP_TOKENS.has(token));
}
