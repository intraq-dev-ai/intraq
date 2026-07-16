import type { AnalyzerPlanRequest } from '../../validation.js';
import {
  clarificationPlanFromToolArgs
} from './analyzer-plan-build-component.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

export function isUnsafeAnalyzerDataAccessInstruction(value: string | null): boolean {
  const text = value?.toLowerCase() ?? '';
  return /\b(ignore|bypass|disable|remove|skip)\b.*\b(row[- ]level security|rls|scope|access control|permissions?)\b/.test(text)
    || /\b(row[- ]level security|rls|scope|access control|permissions?)\b.*\b(ignore|bypass|disable|remove|skip)\b/.test(text)
    || /\b(show|list|give|access|query|use)\b.*\b(other|another|all)\b.*\b(tenant|client|company|account|customer|organization|organisation|location|database)\b/.test(text)
    || /\b(use|query|access)\b.*\b(raw|source|provider)\b.*\b(tables?|database)\b/.test(text)
    || /\b(instead of|ignore|bypass|skip)\b.*\b(selected|curated|ai-ready)\b.*\b(models?|data models?)\b/.test(text);
}

export function unsafeAnalyzerDataAccessClarification(
  request: AnalyzerPlanRequest,
  suggestedFollowUps: string[] = []
): AnalyzerActionPlanResponse {
  return clarificationPlanFromToolArgs(request, {
    missingContextType: 'schema',
    reason: 'Analyzer can only use the selected tenant-scoped AI-ready data models. It cannot bypass row-level security, use raw provider tables directly, or expose other tenants.',
    suggestedFollowUps: suggestedFollowUps.length > 0 ? suggestedFollowUps : [
      'Ask for the same analysis using the selected AI-ready data models.',
      'Choose an approved data model that has the required fields.',
      'Ask an admin to create a reviewed model if the current catalog is missing this analysis.'
    ]
  });
}
