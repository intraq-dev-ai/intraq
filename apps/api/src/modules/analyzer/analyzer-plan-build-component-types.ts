import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

export type AnalyzerActionStep = AnalyzerActionPlanResponse['actions'][number];

export type AnalyzerSelectedModel = NonNullable<AnalyzerActionPlanResponse['intentDetails']['selectedModel']>;

export interface AnalyzerColumnReadResult {
  columns: Array<Record<string, unknown> & { field: string }>;
  invalidFields: string[];
}
