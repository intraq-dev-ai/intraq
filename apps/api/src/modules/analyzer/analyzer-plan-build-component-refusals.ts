import type { AnalyzerPlanRequest } from '../../validation.js';
import type { TableDefinition } from '../data-source/foundation-store.js';
import {
  recordAnalyzerUnmappedConceptEvent,
  type AnalyzerCapabilityGapIdentity
} from './analyzer-unmapped-concept-log.js';

export function missingModelKnowledgeReason(fields: string[]): string {
  return `I do not have enough data model metadata to answer that question yet. The selected model does not define: ${fields.join(', ')}.`;
}

export function unsupportedConceptsReason(concepts: string[]): string {
  return `Analyzer needs data model metadata for these business concepts before creating this dashboard: ${concepts.join(', ')}.`;
}

export function recordAnalyzerBuildRefusal(
  request: AnalyzerPlanRequest,
  table: TableDefinition,
  details: {
    coverageRatio?: number;
    invalidFields?: string[];
    meaningfulTokens?: string[];
    reason: string;
    unsupportedConcepts: string[];
  },
  identity?: AnalyzerCapabilityGapIdentity
): void {
  const event = {
    dataSourceId: identity?.dataSourceId ?? request.dataSourceId,
    question: request.question,
    reason: details.reason,
    tableId: table.id,
    tableName: table.name,
    unsupportedConcepts: details.unsupportedConcepts,
    ...(identity?.conversationId ? { conversationId: identity.conversationId } : {}),
    ...(identity ? { tenantId: identity.tenantId, userId: identity.userId } : {})
  };
  recordAnalyzerUnmappedConceptEvent({
    ...event,
    ...(typeof details.coverageRatio === 'number' ? { coverageRatio: details.coverageRatio } : {}),
    ...(details.invalidFields ? { invalidFields: details.invalidFields } : {}),
    ...(details.meaningfulTokens ? { meaningfulTokens: details.meaningfulTokens } : {})
  });
}
