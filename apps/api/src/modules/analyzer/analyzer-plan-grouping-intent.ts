import { analyzerTokenSet } from './analyzer-token-utils.js';
import type { AnalyzerCapabilityField } from './analyzer-capability-contract.js';
import type { AnalyzerCapabilityOperationName } from './analyzer-plan-agent-loop-types.js';

export function normalizeAnalyzerGroupByForQuestion(
  groupBy: string[],
  operation: AnalyzerCapabilityOperationName,
  question: string
): string[] {
  if (operation === 'trend' || explicitlyRequestsTimeGrouping(question)) return groupBy;
  return groupBy.filter(item => !Array.from(analyzerTokenSet(item)).some(token =>
    ['date', 'day', 'week', 'month', 'quarter', 'year', 'time'].includes(token)
  ));
}

export function genericPaymentMethodGroupBy(value: string): boolean {
  const tokens = analyzerTokenSet(value);
  if (tokens.has('family') || tokens.has('cash') || tokens.has('card')) return false;
  return tokens.has('tender')
    || tokens.has('payment') && (tokens.has('method') || tokens.has('type'));
}

export function metricLikeGroupByField(
  fields: AnalyzerCapabilityField[],
  requestedTerm: string
): AnalyzerCapabilityField | null {
  const requestedTokens = analyzerTokenSet(requestedTerm);
  if (requestedTokens.size === 0) return null;
  return fields.find(field => [field.name, field.label, ...field.synonyms].some(term => {
    if (!term) return false;
    const fieldTokens = analyzerTokenSet(term);
    return fieldTokens.size > 0 && (
      setIsSubset(requestedTokens, fieldTokens)
      || setIsSubset(fieldTokens, requestedTokens)
    );
  })) ?? null;
}

function explicitlyRequestsTimeGrouping(question: string): boolean {
  return /\b(?:by|each|per)\s+(?:business\s+|trading\s+)?(?:date|day|week|month|quarter|year)\b/i.test(question)
    || /\b(?:daily|weekly|monthly|quarterly|yearly|trend|over time)\b/i.test(question);
}

function setIsSubset(left: Set<string>, right: Set<string>): boolean {
  for (const item of left) if (!right.has(item)) return false;
  return true;
}
