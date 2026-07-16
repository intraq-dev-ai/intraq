import type { AnalyzerCapabilityOperation } from './analyzer-capability-contract.js';
import { analyzerTokenSet } from './analyzer-token-utils.js';

export function operationRequiresMeasure(operation: AnalyzerCapabilityOperation): boolean {
  return operation !== 'list';
}

export function normalizeRequestedMeasure(
  measure: string | undefined,
  context: {
    groupBy: string[];
    operation: AnalyzerCapabilityOperation;
    question: string;
  }
): string | undefined {
  const value = measure?.trim();
  if (!value) return undefined;
  if (operationOnlyMeasureTerm(value, context.operation)) return undefined;
  if (genericShareFramingMeasure(value, context.groupBy, context.question)) return undefined;
  return value;
}

function genericShareFramingMeasure(
  value: string,
  groupBy: string[],
  question: string
): boolean {
  if (groupBy.length === 0) return false;
  const tokens = analyzerTokenSet(value);
  if (tokens.size === 0) return false;
  if (!setIsSubset(tokens, new Set(['breakdown', 'mix', 'percent', 'percentage', 'share', 'split']))) {
    return false;
  }
  const questionTokens = analyzerTokenSet(question);
  return ['mix', 'share', 'percent', 'percentage', 'split', 'breakdown']
    .some(token => questionTokens.has(token));
}

function operationOnlyMeasureTerm(value: string, operation: AnalyzerCapabilityOperation): boolean {
  const tokens = analyzerTokenSet(value);
  if (tokens.size === 0) return false;
  return operationTerms(operation).some(term => {
    const operationTokens = analyzerTokenSet(term);
    return operationTokens.size > 0 && setIsSubset(tokens, operationTokens);
  });
}

function operationTerms(operation: AnalyzerCapabilityOperation): string[] {
  switch (operation) {
    case 'aggregate': return ['aggregate', 'aggregation', 'summary', 'summarize'];
    case 'bucket': return ['bucket', 'buckets', 'bucketed'];
    case 'compare': return ['compare', 'comparison', 'versus', 'vs'];
    case 'top_n': return ['top', 'bottom', 'rank', 'ranking'];
    case 'trend': return ['trend', 'trending', 'over time'];
    case 'list':
    default: return ['list', 'detail', 'details', 'records'];
  }
}

function setIsSubset(left: Set<string>, right: Set<string>): boolean {
  for (const item of left) if (!right.has(item)) return false;
  return true;
}
