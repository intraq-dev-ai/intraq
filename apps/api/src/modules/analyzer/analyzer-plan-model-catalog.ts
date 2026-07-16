import {
  findDataSource,
  type TableDefinition
} from '../data-source/foundation-store.js';
import {
  scopedDataSourceForRead,
  type DataSourceAccessPolicy
} from '../data-source/source-access.js';
import {
  analyzerFieldMetadata,
  analyzerFieldValueTokens
} from './analyzer-plan-field-matching.js';
import { analyzerVisibleFields } from './analyzer-plan-field-visibility.js';
import {
  derivedColumnsForTable,
  derivedColumnTokens,
  valueConceptsForTable,
  valueConceptTokens
} from './analyzer-plan-derived-columns.js';
import { readString, readStringArray, uniqueStrings } from './analyzer-plan-utils.js';
import {
  businessNameForTable,
  firstRoutingRecord,
  isAnalyzerModel,
  sampleQuestionsForTable
} from './analyzer-plan-table-context.js';

export const DEFAULT_MODEL_CATALOG_LIMIT = 20;
export const MAX_MODEL_CATALOG_LIMIT = 25;

export function listDataModelsForAnalyzer(
  dataSourceId: string,
  args: Record<string, unknown> = {},
  fallbackQuery = '',
  accessPolicy?: DataSourceAccessPolicy
): Record<string, unknown> {
  const rawSource = findDataSource(dataSourceId);
  const source = rawSource && accessPolicy ? scopedDataSourceForRead(rawSource, accessPolicy) : rawSource;
  if (!source) {
    return {
      success: false,
      error: 'Selected data source was not found.',
      dataSourceId
    };
  }
  const models = source.tables.filter(isAnalyzerModel);
  const catalogQuery = modelCatalogQuery(readString(args.query), fallbackQuery);
  const offset = readCatalogOffset(args.offset);
  const limit = readCatalogLimit(args.limit);
  const scoredModels = rankModelsForCatalogQuery(models, catalogQuery);
  const page = scoredModels.slice(offset, offset + limit);
  const nextOffset = offset + limit < scoredModels.length ? offset + limit : null;
  return {
    success: true,
    dataSourceId: source.id,
    dataSourceName: source.name,
    query: catalogQuery.display,
    limit,
    offset,
    totalModels: models.length,
    totalMatches: scoredModels.length,
    nextOffset,
    models: page.map(item => modelSummaryForTable(item.table, item.score))
  };
}

export interface ModelCatalogQuery {
  display: string;
  primary: string;
  supplemental?: string;
}

export function modelCatalogQuery(requestedQuery: string | null | undefined, fallbackQuery: string): ModelCatalogQuery {
  const requested = requestedQuery?.trim() ?? '';
  const fallback = fallbackQuery.trim();
  const primary = fallback || requested;
  const supplemental = requested && normalizedSearchText(requested) !== normalizedSearchText(primary)
    ? requested
    : undefined;
  return {
    display: supplemental ? `${primary} ${supplemental}` : primary,
    primary,
    ...(supplemental ? { supplemental } : {})
  };
}

export function rankModelsForCatalogQuery(
  models: TableDefinition[],
  query: ModelCatalogQuery
): Array<{ index: number; score: number; table: TableDefinition }> {
  const primaryMatches = rankModelsByRouting(models, query.primary);
  if (primaryMatches.length > 0 || !query.supplemental) {
    return mergeRankedModels(primaryMatches, query.supplemental ? rankModelsByRouting(models, query.supplemental) : []);
  }
  return rankModelsByRouting(models, query.supplemental);
}

export function modelMatchesRoutingNotFor(table: TableDefinition, query: string): boolean {
  const queryText = normalizedSearchText(query);
  const queryTokens = searchTokens(query);
  if (!queryText || queryTokens.length === 0) return false;
  return readStringArray(firstRoutingRecord(table).notFor).some(term =>
    routingExclusionTermMatches(queryText, queryTokens, term)
  );
}

function mergeRankedModels(
  primary: Array<{ index: number; score: number; table: TableDefinition }>,
  supplemental: Array<{ index: number; score: number; table: TableDefinition }>
): Array<{ index: number; score: number; table: TableDefinition }> {
  const seen = new Set(primary.map(item => item.table.id));
  return [
    ...primary,
    ...supplemental.filter(item => {
      if (seen.has(item.table.id)) return false;
      seen.add(item.table.id);
      return true;
    })
  ];
}

function modelSummaryForTable(table: TableDefinition, routingScore = 0): Record<string, unknown> {
  const routing = firstRoutingRecord(table);
  return {
    id: table.id,
    name: table.name,
    routingScore,
    businessName: businessNameForTable(table),
    description: table.description,
    businessPurpose: readString(table.dictionary.businessPurpose),
    sampleQuestions: sampleQuestionsForTable(table),
    aiDomain: readString(routing.domain),
    aiGrain: readString(routing.grain),
    aiPrimaryTimeField: readString(routing.primaryTimeField),
    aiTriggerKeywords: readStringArray(routing.triggerKeywords),
    aiUseFor: readStringArray(routing.useFor),
    aiNotFor: readStringArray(routing.notFor),
    aiNanoCard: readString(routing.nanoCard)
  };
}

function rankModelsByRouting(
  models: TableDefinition[],
  query: string
): Array<{ index: number; score: number; table: TableDefinition }> {
  const queryText = normalizedSearchText(query);
  const queryTokens = searchTokens(query);
  return models
    .map((table, index) => ({
      index,
      score: queryTokens.length > 0 ? routingScore(table, queryText, queryTokens) : 0,
      table
    }))
    .filter(item => queryTokens.length === 0 || item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

function routingScore(table: TableDefinition, queryText: string, queryTokens: string[]): number {
  return routingTermsForTable(table).reduce(
    (score, term) => score + weightedRoutingTermScore(queryText, queryTokens, term.value, term.weight),
    0
  );
}

function routingTermsForTable(table: TableDefinition): Array<{ value: unknown; weight: number }> {
  const routing = firstRoutingRecord(table);
  const dictionary = table.dictionary;
  const ai = typeof dictionary.ai === 'object' && dictionary.ai !== null && !Array.isArray(dictionary.ai)
    ? dictionary.ai as Record<string, unknown>
    : {};
  return [
    { value: dictionary.businessName, weight: 6 },
    { value: dictionary.businessPurpose, weight: 4 },
    { value: dictionary.description, weight: 2 },
    { value: ai.whenToUse, weight: 6 },
    { value: routing.domain, weight: 5 },
    { value: routing.grain, weight: 2 },
    { value: routing.nanoCard, weight: 4 },
    ...readStringArray(routing.triggerKeywords).map(value => ({ value, weight: 10 })),
    ...readStringArray(routing.useFor).map(value => ({ value, weight: 8 })),
    ...readStringArray(routing.notFor).map(value => ({ value, weight: -8 })),
    ...readStringArray(routing.exampleQuestions).map(value => ({ value, weight: 7 })),
    ...sampleQuestionsForTable(table).map(value => ({ value, weight: 7 })),
    ...fieldRoutingTermsForTable(table),
    ...derivedColumnRoutingTermsForTable(table),
    ...valueConceptRoutingTermsForTable(table)
  ];
}

function fieldRoutingTermsForTable(table: TableDefinition): Array<{ value: unknown; weight: number }> {
  return analyzerVisibleFields(table).flatMap(field => {
    const metadata = analyzerFieldMetadata(table, field.name);
    return [
      { value: field.name, weight: 10 },
      { value: field.description, weight: 3 },
      { value: field.dictionaryDescription, weight: 3 },
      { value: metadata.name, weight: 10 },
      { value: metadata.businessName, weight: 10 },
      { value: metadata.label, weight: 8 },
      { value: metadata.role, weight: 2 },
      { value: metadata.semanticRole, weight: 2 },
      { value: metadata.format, weight: 2 },
      ...readStringArray(metadata.synonyms).map(value => ({ value, weight: 10 })),
      ...readStringArray(metadata.aliases).map(value => ({ value, weight: 10 })),
      ...analyzerFieldValueTokens(table, field.name).map(value => ({ value, weight: 4 }))
    ];
  });
}

function derivedColumnRoutingTermsForTable(table: TableDefinition): Array<{ value: unknown; weight: number }> {
  return derivedColumnsForTable(table).flatMap(column => [
    { value: column.name, weight: 12 },
    { value: column.businessName, weight: 12 },
    { value: column.description, weight: 6 },
    ...column.synonyms.map(value => ({ value, weight: 12 })),
    ...derivedColumnTokens(column).map(value => ({ value, weight: 4 }))
  ]);
}

function valueConceptRoutingTermsForTable(table: TableDefinition): Array<{ value: unknown; weight: number }> {
  return valueConceptsForTable(table).flatMap(concept => [
    { value: concept.conceptKey, weight: 7 },
    { value: concept.label, weight: 7 },
    ...concept.matchValues.map(value => ({ value, weight: 5 })),
    ...concept.synonyms.map(value => ({ value, weight: 7 })),
    ...valueConceptTokens(concept).map(value => ({ value, weight: 3 }))
  ]);
}

function weightedRoutingTermScore(
  queryText: string,
  queryTokens: string[],
  value: unknown,
  weight: number
): number {
  const term = readString(value);
  if (!term) return 0;
  const termText = normalizedSearchText(term);
  const termTokens = searchTokens(term);
  if (!termText || termTokens.length === 0) return 0;
  if (normalizedPhraseIncludes(queryText, termText)) return weight * 3;
  const matchingTokens = termTokens.filter(token => queryTokens.includes(token)).length;
  if (matchingTokens === 0) return 0;
  if (matchingTokens === termTokens.length) return weight * 2;
  return weight * matchingTokens;
}

function routingExclusionTermMatches(queryText: string, queryTokens: string[], value: unknown): boolean {
  const term = readString(value);
  if (!term) return false;
  const { exceptionText, exclusionText } = splitRoutingExclusion(term);
  if (exceptionText && exclusionTextMatchesQuery(queryText, queryTokens, exceptionText)) {
    return false;
  }
  return exclusionSegments(exclusionText).some(segment => {
    const termText = normalizedSearchText(segment);
    const termTokens = meaningfulExclusionTokens(searchTokens(segment));
    if (!termText || termTokens.length === 0) return false;
    if (normalizedPhraseIncludes(queryText, termText)) return true;
    return exclusionSegmentTokenMatch(termTokens, queryTokens);
  });
}

function exclusionTextMatchesQuery(queryText: string, queryTokens: string[], value: string): boolean {
  return exclusionSegments(value).some(segment => {
    const termText = normalizedSearchText(segment);
    const termTokens = meaningfulExclusionTokens(searchTokens(segment));
    if (!termText || termTokens.length === 0) return false;
    if (normalizedPhraseIncludes(queryText, termText)) return true;
    return exclusionSegmentTokenMatch(termTokens, queryTokens);
  });
}

function exclusionSegmentTokenMatch(termTokens: string[], queryTokens: string[]): boolean {
  const matchingTokens = termTokens.filter(token => queryTokens.includes(token)).length;
  if (termTokens.length <= 3) return matchingTokens === termTokens.length;
  return matchingTokens >= Math.max(3, Math.ceil(termTokens.length * 0.75));
}

function meaningfulExclusionTokens(tokens: string[]): string[] {
  return tokens.filter(token => !ROUTING_EXCLUSION_STOP_TOKENS.has(token));
}

function splitRoutingExclusion(value: string): { exceptionText?: string; exclusionText: string } {
  const marker = ' unless ';
  const index = value.toLowerCase().indexOf(marker);
  if (index < 0) return { exclusionText: value };
  const exclusionText = value.slice(0, index).trim();
  const exceptionText = value.slice(index + marker.length).trim();
  return {
    exclusionText: exclusionText || value,
    ...(exceptionText ? { exceptionText } : {})
  };
}

function exclusionSegments(value: string): string[] {
  return uniqueStrings(value
    .split(/[,;]|\bor\b/i)
    .map(segment => segment.trim())
    .filter(Boolean)
    .concat(value));
}

function normalizedSearchText(value: string): string {
  return searchTokens(value).join(' ');
}

function normalizedPhraseIncludes(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

function searchTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const character of value.toLowerCase()) {
    if (isSearchTokenCharacter(character)) {
      current += character;
    } else if (current) {
      tokens.push(current);
      current = '';
    }
  }
  if (current) tokens.push(current);
  return uniqueStrings(tokens);
}

function isSearchTokenCharacter(character: string): boolean {
  return character >= 'a' && character <= 'z' || character >= '0' && character <= '9';
}

const ROUTING_EXCLUSION_STOP_TOKENS = new Set([
  'a',
  'an',
  'and',
  'are',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'of',
  'on',
  'or',
  'measure',
  'measures',
  'metric',
  'metrics',
  'report',
  'requested',
  'show',
  'the',
  'to',
  'with'
]);

function readCatalogLimit(value: unknown): number {
  const requested = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : DEFAULT_MODEL_CATALOG_LIMIT;
  return Math.min(Math.max(requested, 1), MAX_MODEL_CATALOG_LIMIT);
}

function readCatalogOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}
