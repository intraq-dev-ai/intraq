import type { PreflightFilter } from './analyzer-plan-capability-filter-selection.js';
import { parseConfirmedAnalyzerBusinessScope } from './analyzer-business-scope.js';
import { analyzerTokenSet } from './analyzer-token-utils.js';

const IDENTIFIER_TOKENS = new Set(['code', 'id', 'identifier', 'number']);
const BUSINESS_SCOPE_TOKENS = new Set([
  'account', 'branch', 'client', 'company', 'customer', 'entity', 'location', 'organization', 'organisation', 'site', 'subject', 'tenant'
]);
const GROUPING_MODIFIER_TOKENS = new Set([
  'a', 'an', 'ascending', 'desc', 'descending', 'each', 'order', 'ordered', 'sort', 'sorted', 'the'
]);

/** Removes a planner-created group that merely repeats one fixed filter scope. */
export function removeFixedFilterGroupBy(
  groupBy: string[],
  filters: PreflightFilter[],
  question: string,
  fixedScopeTerms = fixedBusinessScopeTerms(undefined, question),
  bindableScopeTerms?: string[]
): string[] {
  return groupBy.filter(term => {
    if (!businessScopeGroup(term) || explicitlyRequestsGroup(question, term)) return true;
    if (bindableScopeTerms && !bindableScopeTerms.some(scope => sameFieldIdentity(scope, term))) return true;
    const scopeIdentifiesGroup = fixedScopeTerms.some(scope => sameFieldIdentity(scope, term));
    return !filters.some(filter => filterReferencesGroup(filter, term)
      && (filterHasOneValue(filter) || scopeIdentifiesGroup));
  });
}

/** Reads reference-only scope filters without treating them as executable filters. */
export function businessScopeFilterReferences(...values: unknown[]): PreflightFilter[] {
  return values.flatMap(value => Array.isArray(value) ? value : []).flatMap(item => {
    if (!isRecord(item)) return [];
    const field = text(item.field);
    const label = text(item.label);
    const reference = [field, label].filter(Boolean).join(' ');
    if (!businessScopeGroup(reference)) return [];
    return [{ ...(field ? { field } : {}), ...(label ? { label } : {}) }];
  });
}

/** Uses confirmed server scope first, then a conservative company-id question pattern. */
export function fixedBusinessScopeTerms(body: unknown, question: string): string[] {
  const confirmed = isRecord(body)
    ? parseConfirmedAnalyzerBusinessScope(body.businessScope)
    : null;
  if (confirmed) {
    return Object.entries(confirmed).flatMap(([key, value]) =>
      businessScopeGroup(key) && concreteValue(value) ? [key] : []
    );
  }
  return /\bcompany\s+(?:(?:id|identifier|number)\s*(?:is|=|:|#)?|#)\s*\d+\b/i.test(question)
    ? ['companyId']
    : [];
}

/** Final guard against grouping by a scope already bound as a saved-model parameter. */
export function removeBoundBusinessScopeGroupBy(
  groupBy: string[],
  parameterValues: Record<string, unknown>,
  question: string
): string[] {
  const boundTerms = Object.entries(parameterValues).flatMap(([key, value]) =>
    businessScopeGroup(key) && concreteValue(value) ? [key] : []
  );
  return removeFixedFilterGroupBy(
    groupBy,
    boundTerms.map(field => ({ field, operator: 'equals', value: parameterValues[field] })),
    question,
    boundTerms
  );
}

export function analyzerBusinessScopeGroupTerm(term: string): boolean {
  return [...meaningfulTokens(term)].some(token => BUSINESS_SCOPE_TOKENS.has(token));
}

function businessScopeGroup(term: string): boolean {
  return analyzerBusinessScopeGroupTerm(term);
}

function filterHasOneValue(filter: PreflightFilter): boolean {
  if (Array.isArray(filter.value)) return filter.value.length === 1 && concreteValue(filter.value[0]);
  return concreteValue(filter.value) || concreteSearchText(filter);
}

function concreteValue(value: unknown): boolean {
  return typeof value === 'boolean'
    || typeof value === 'number' && Number.isFinite(value)
    || typeof value === 'string' && value.trim().length > 0;
}

function concreteSearchText(filter: PreflightFilter): boolean {
  const text = filter.searchText?.trim();
  if (!text || /[,;]|\b(?:and|or|versus|vs)\b/i.test(text)) return false;
  const referenceTokens = meaningfulTokens([filter.field, filter.label].filter(Boolean).join(' '));
  const textTokens = meaningfulTokens(text);
  return textTokens.size > 0 && [...textTokens].some(token => !referenceTokens.has(token));
}

function filterReferencesGroup(filter: PreflightFilter, term: string): boolean {
  return [filter.field, filter.label].some(reference =>
    typeof reference === 'string' && sameFieldIdentity(reference, term)
  );
}

export function analyzerBusinessScopeFieldIdentityMatches(left: string, right: string): boolean {
  const leftTokens = meaningfulTokens(left);
  const rightTokens = meaningfulTokens(right);
  return leftTokens.size > 0
    && leftTokens.size === rightTokens.size
    && [...leftTokens].every(token => rightTokens.has(token));
}

function sameFieldIdentity(left: string, right: string): boolean {
  return analyzerBusinessScopeFieldIdentityMatches(left, right);
}

function explicitlyRequestsGroup(question: string, term: string): boolean {
  const phrases = question.toLowerCase().matchAll(
    /\b(?:for\s+each|by|per|across|each)\s+([^,.;?]*)/g
  );
  for (const match of phrases) {
    const framed = (match[1] ?? '').split(/\b(?:for|where|from|on|within|with)\b/, 1)[0] ?? '';
    const candidates = framed.split(/\b(?:and|or|versus|vs)\b|[&/]/);
    if (candidates.some(candidate => sameGroupingIdentity(candidate, term))) return true;
  }
  return false;
}

function sameGroupingIdentity(candidate: string, term: string): boolean {
  const tokens = new Set([...meaningfulTokens(candidate)].filter(token => !GROUPING_MODIFIER_TOKENS.has(token)));
  const target = meaningfulTokens(term);
  return tokens.size > 0 && tokens.size === target.size && [...tokens].every(token => target.has(token));
}

function meaningfulTokens(value: string): Set<string> {
  return new Set([...analyzerTokenSet(value)].filter(token => !IDENTIFIER_TOKENS.has(token)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}
