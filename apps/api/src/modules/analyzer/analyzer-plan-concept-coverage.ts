import type { TableDefinition } from '../data-source/foundation-store.js';
import {
  businessNameForTable,
  firstRoutingRecord
} from './analyzer-plan-schema.js';
import {
  isRecord,
  readString,
  uniqueStrings
} from './analyzer-plan-utils.js';
import {
  derivedColumnsForTable,
  derivedColumnTokens,
  valueConceptsForTable,
  valueConceptTokens
} from './analyzer-plan-derived-columns.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

type AnalyzerActionStep = AnalyzerActionPlanResponse['actions'][number];

interface CoverageTokens {
  all: Set<string>;
  strong: Set<string>;
}

export interface AnalyzerConceptCoverageResult {
  coveredTokens: string[];
  coverageRatio: number;
  meaningfulTokens: string[];
  unsupportedTokens: string[];
}

const COMMON_QUESTION_TOKENS = new Set([
  'a', 'about', 'across', 'after', 'again', 'all', 'an', 'analyzer', 'and', 'any', 'are',
  'as', 'at', 'average', 'avg', 'be', 'before', 'below', 'between', 'break', 'breakdown', 'bring', 'brings', 'but', 'by', 'can',
  'attention', 'chart', 'company', 'companies', 'compare', 'compared', 'comparison', 'component', 'components', 'could', 'current', 'daily', 'dollar', 'dollars',
  'create', 'created', 'creating', 'dashboard', 'date', 'day', 'days', 'did', 'do', 'does', 'doing', 'down', 'drop', 'dropped', 'exceeded',
  'each', 'eat', 'eating', 'exception', 'exceptions', 'find', 'focu', 'focus', 'for', 'from', 'generated', 'give', 'good', 'graph', 'has',
  'had', 'have', 'high', 'highest', 'how', 'i', 'in', 'include', 'includes', 'including', 'instruction', 'into', 'is', 'it', 'last', 'least', 'list',
  'best', 'fast', 'look', 'low', 'lowest', 'many', 'me', 'method', 'methods', 'missing', 'month', 'months',
  'monthly', 'most', 'my', 'need', 'needed', 'needing', 'needs', 'not', 'of', 'on', 'open', 'our',
  'over', 'past', 'percent', 'period', 'periods', 'please', 'previous', 'prior', 'question', 'queue', 'queues', 'range', 'rank', 'report', 'serve', 'share', 'show', 'sorted', 'standing', 'than', 'that', 'the',
  'require', 'required', 'requires', 'requiring', 'selling', 'should', 'their', 'this', 'to', 'today', 'top', 'total', 'totals', 'trend', 'trends', 'type', 'under',
  'us', 'value', 'values', 'versus', 'vs', 'was', 'we', 'week', 'weeks',
  'weekly', 'well', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'year',
  'years', 'yesterday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
  'weekend', 'weekends', 'weekday', 'weekdays', 'quarter', 'quarters',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'cbd', 'richmond', 'southbank', 'fitzroy', 'chapel', 'street', 'docklands', 'carlton',
  'melbourne', 'city', 'suburban', 'zero',
  'came', 'common', 'commonly', 'contribute', 'contributed', 'contribution',
  'get', 'gets', 'improve', 'improved', 'people'
]);

const ANALYTICAL_OPERATOR_TOKENS = new Set([
  'against',
  'better',
  'big',
  'bigger',
  'biggest',
  'change',
  'changed',
  'changes',
  'comparable',
  'decline',
  'declined',
  'declines',
  'decrease',
  'decreased',
  'decreases',
  'delta',
  'difference',
  'differences',
  'driver',
  'drivers',
  'gap',
  'gaps',
  'improving',
  'increase',
  'increased',
  'increases',
  'large',
  'larger',
  'largest',
  'movement',
  'movements',
  'perform',
  'performed',
  'performing',
  'relative',
  'small',
  'smaller',
  'smallest',
  'declining',
  'variance',
  'variances'
]);

const CRITICAL_BUSINESS_CONCEPTS = new Set([
  'accounting',
  'aggregator',
  'bank',
  'banking',
  'batch',
  'card',
  'cashier',
  'cashiers',
  'check',
  'checks',
  'comp',
  'comps',
  'customer',
  'customers',
  'daypart',
  'discount',
  'discounts',
  'employee',
  'employees',
  'guest',
  'guests',
  'hour',
  'hourly',
  'ingredient',
  'ingredients',
  'inventory',
  'member',
  'members',
  'payment',
  'payments',
  'payout',
  'payouts',
  'profit',
  'profits',
  'refund',
  'refunds',
  'server',
  'servers',
  'settlement',
  'settlements',
  'stock',
  'stockout',
  'stockouts',
  'tax',
  'taxes',
  'ticket',
  'tickets'
]);

const LOW_COVERAGE_RATIO_GATE = 0.34;
const MIN_TOKENS_FOR_RATIO_GATE = 3;

export function unsupportedQuestionConceptsForAnalyzerPlan(
  question: string,
  table: TableDefinition,
  actions: AnalyzerActionStep[]
): string[] {
  return conceptCoverageForAnalyzerPlan(question, table, actions).unsupportedTokens;
}

export function conceptCoverageForAnalyzerPlan(
  question: string,
  table: TableDefinition,
  actions: AnalyzerActionStep[] = []
): AnalyzerConceptCoverageResult {
  const coverage = coverageTokensForTable(table);
  const plannedValueTokens = valueTokensFromPlannedFilters(actions);
  const meaningfulTokens = meaningfulQuestionTokens(question)
    .filter(token => !isNumericToken(token))
    .filter(token => !tokenInSet(token, plannedValueTokens));
  const coveredTokens = meaningfulTokens.filter(token =>
    tokenInSet(token, coverage.strong) || tokenInSet(token, coverage.all)
  );
  const unmappedTokens = meaningfulTokens.filter(token => !coveredTokens.includes(token));
  const criticalUnsupported = unmappedTokens.filter(token =>
    tokenInSet(token, CRITICAL_BUSINESS_CONCEPTS)
  );
  const coverageRatio = meaningfulTokens.length === 0 ? 1 : coveredTokens.length / meaningfulTokens.length;
  const ratioUnsupported = criticalUnsupported.length === 0
    && meaningfulTokens.length >= MIN_TOKENS_FOR_RATIO_GATE
    && coverageRatio < LOW_COVERAGE_RATIO_GATE
    ? unmappedTokens
    : [];

  return {
    coveredTokens: uniqueStrings(coveredTokens),
    coverageRatio,
    meaningfulTokens,
    unsupportedTokens: uniqueStrings([
      ...criticalUnsupported,
      ...ratioUnsupported
    ])
  };
}

function valueTokensFromPlannedFilters(actions: AnalyzerActionStep[]): Set<string> {
  const result = new Set<string>();
  for (const action of actions) {
    const params = isRecord(action.params) ? action.params : {};
    const filters = [
      ...arrayFromUnknown(params.filters),
      ...arrayFromUnknown(params.filter)
    ];
    for (const filter of filters) {
      if (!isRecord(filter)) continue;
      addTokens(result, [
        filter.field,
        filter.label,
        filter.value,
        filter.values,
        filter.requestedText,
        filter.requestedTexts,
        filter.searchText
      ]);
    }
  }
  return result;
}

function arrayFromUnknown(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function questionMentionsFieldConcept(question: string, fieldName: string): boolean {
  const questionTokens = new Set(meaningfulQuestionTokens(question));
  return meaningfulQuestionTokens(fieldName).some(token => questionTokens.has(token));
}

function coverageTokensForTable(table: TableDefinition): CoverageTokens {
  const routing = firstRoutingRecord(table);
  const dictionary = table.dictionary;
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  const settings = isRecord(table.settings) ? table.settings : {};
  const clientScope = isRecord(settings.clientScope) ? settings.clientScope : {};
  const all = new Set<string>();
  const strong = new Set<string>();

  addTokens(strong, [
    table.name,
    businessNameForTable(table),
    dictionary.businessName,
    dictionary.keyMetrics,
    ai.keyMetrics,
    ai.sampleQuestions,
    dictionary.sampleQuestions,
    routing.domain,
    routing.grain,
    routing.nanoCard,
    routing.triggerKeywords,
    routing.useFor,
    routing.exampleQuestions
  ]);
  addTokens(all, Array.from(strong));
  addTokens(all, [
    table.description,
    dictionary.description,
    dictionary.businessPurpose,
    ai.whenToUse,
    clientScope.accountName,
    clientScope.businessName,
    clientScope.clientName,
    clientScope.companyName,
    clientScope.customerName,
    clientScope.entityName,
    clientScope.locationName,
    clientScope.organizationName,
    clientScope.organisationName,
    clientScope.siteName,
    clientScope.subjectName,
    clientScope.accountId,
    clientScope.businessId,
    clientScope.clientId,
    clientScope.companyId,
    clientScope.customerId,
    clientScope.entityId,
    clientScope.locationId,
    clientScope.organizationId,
    clientScope.organisationId,
    clientScope.siteId,
    clientScope.subjectId,
    clientScope.warehouseId
  ]);
  for (const column of derivedColumnsForTable(table)) {
    addTokens(strong, [
      column.name,
      column.businessName,
      column.synonyms,
      derivedColumnTokens(column)
    ]);
    addTokens(all, [
      column.description,
      column.outputFormat,
      column.sourceFields
    ]);
  }
  for (const concept of valueConceptsForTable(table)) {
    addTokens(strong, [
      concept.conceptKey,
      concept.label,
      concept.synonyms,
      valueConceptTokens(concept)
    ]);
    addTokens(all, [
      concept.matchValues,
      concept.appliesToMetrics,
      concept.targetField
    ]);
  }

  for (const field of table.fields) {
    const metadata = fieldMetadata(table, field.name);
    addTokens(strong, [
      field.name,
      metadata.name,
      metadata.businessName,
      metadata.label,
      metadata.aliases,
      metadata.synonyms,
      metadata.role,
      metadata.columnType,
      metadata.semanticRole,
      metadata.metricType,
      field.description,
      field.dictionaryDescription,
      metadata.description,
      metadata.dictionaryDescription,
      metadata.businessDefinition
    ]);
    addTokens(all, [
      field.name,
      field.description,
      field.dictionaryDescription,
      metadata.description,
      metadata.dictionaryDescription,
      metadata.businessDefinition,
      metadata.format,
      metadata.unit,
      table.sampleRows?.map(row => row[field.name])
    ]);
  }
  return { all, strong };
}

function meaningfulQuestionTokens(question: string): string[] {
  return uniqueStrings(tokensFromText(question)
    .map(token => ({ raw: token, canonical: canonicalToken(token) }))
    .filter(token => token.canonical.length > 2
      && !COMMON_QUESTION_TOKENS.has(token.raw)
      && !COMMON_QUESTION_TOKENS.has(token.canonical)
      && !ANALYTICAL_OPERATOR_TOKENS.has(token.raw)
      && !ANALYTICAL_OPERATOR_TOKENS.has(token.canonical))
    .map(token => token.canonical));
}

function tokenInSet(token: string, set: Set<string>): boolean {
  if (set.has(token)) return true;
  return tokenVariants(token).some(variant => set.has(variant));
}

function isNumericToken(token: string): boolean {
  return Array.from(token).every(character => character >= '0' && character <= '9');
}

function addTokens(target: Set<string>, values: unknown[]): void {
  for (const value of values) {
    for (const text of stringsFromValue(value)) {
      for (const token of tokensFromText(text)) {
        for (const variant of tokenVariants(token)) {
          target.add(variant);
        }
      }
    }
  }
}

function stringsFromValue(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsFromValue);
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(stringsFromValue);
}

function tokensFromText(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const character of value.toLowerCase()) {
    if (isTokenCharacter(character)) {
      current += character;
    } else if (current) {
      tokens.push(current);
      current = '';
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function isTokenCharacter(character: string): boolean {
  return character >= 'a' && character <= 'z' || character >= '0' && character <= '9';
}

function tokenVariants(token: string): string[] {
  const canonical = canonicalToken(token);
  return uniqueStrings([
    token,
    canonical,
    ...semanticTokenVariants(token),
    ...semanticTokenVariants(canonical)
  ]);
}

function canonicalToken(token: string): string {
  if (token === 'focus') return token;
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('oss')) return token;
  if (token.length > 4 && token.endsWith('ss')) return token;
  if (token.length > 5 && token.endsWith('tions')) return token.slice(0, -1);
  if (
    token.length > 5
    && (token.endsWith('ches') || token.endsWith('shes') || token.endsWith('xes') || token.endsWith('zes'))
  ) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function semanticTokenVariants(token: string): string[] {
  if (token === 'location') return ['site', 'branch'];
  if (token === 'locations') return ['sites', 'branches'];
  if (token === 'site') return ['location', 'branch'];
  if (token === 'sites') return ['locations', 'branches'];
  if (token === 'branch') return ['location', 'site'];
  if (token === 'branches') return ['locations', 'sites'];
  return [];
}

function fieldMetadata(table: TableDefinition, fieldName: string): Record<string, unknown> {
  const dictionary = table.dictionary;
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  const sources = [dictionary.columns, dictionary.fields, ai.columns, ai.fields];
  for (const source of sources) {
    const metadata = metadataFromSource(source, fieldName);
    if (metadata) return metadata;
  }
  return {};
}

function metadataFromSource(source: unknown, fieldName: string): Record<string, unknown> | null {
  if (Array.isArray(source)) {
    const match = source.find(item => isRecord(item) && readString(item.name) === fieldName);
    return isRecord(match) ? match : null;
  }
  if (isRecord(source) && isRecord(source[fieldName])) return source[fieldName];
  return null;
}
