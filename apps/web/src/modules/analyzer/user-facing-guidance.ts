import type { AnalyzerPlan } from './types';

export function userFacingAnalyzerGuidance(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .map(item => typeof item === 'string' ? item.trim() : '')
      .filter(item => item.length > 0)
    : [];
}

export function analyzerPlanForUserFacingAnswer(plan: AnalyzerPlan): AnalyzerPlan {
  if (!plan.intentDetails) return plan;
  return {
    ...plan,
    intentDetails: {
      ...plan.intentDetails,
      insightGuidance: []
    }
  };
}
