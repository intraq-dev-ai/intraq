import type { TableDefinition } from '../data-source/foundation-store.js';
import type { AnalyzerCapabilityOperation } from './analyzer-capability-contract.js';
import type { AnalyzerSafeRefusalInput } from './analyzer-safe-refusal.js';

export interface AnalyzerModelQualityGateInput {
  groupBy: string[];
  measures: string[];
  operation: AnalyzerCapabilityOperation;
  question: string;
  table: TableDefinition;
}

export interface AnalyzerModelQualityRefusal {
  reason: string;
  safeRefusal: AnalyzerSafeRefusalInput;
  suggestedFollowUps: string[];
}

export function analyzerModelQualityRefusal(
  _input: AnalyzerModelQualityGateInput
): AnalyzerModelQualityRefusal | null {
  return null;
}
