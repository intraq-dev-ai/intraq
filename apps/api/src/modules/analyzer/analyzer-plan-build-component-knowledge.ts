import { localMetadataCatalog } from '@intraq/agent-core';
import type { KnowledgeReference } from '@intraq/contracts';

export function knowledgeReferencesFromIds(ids: string[]): KnowledgeReference[] {
  const requestedIds = new Set(ids);
  return localMetadataCatalog
    .filter(reference => requestedIds.has(reference.id))
    .map(({ metricFields, recommendedVisualizations, ...reference }) => reference);
}
