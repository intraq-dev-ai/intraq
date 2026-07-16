import type { KnowledgeReference } from '@intraq/contracts';

export interface LocalKnowledgeEntry extends KnowledgeReference {
  metricFields: string[];
  recommendedVisualizations: string[];
}

export const localMetadataCatalog: [LocalKnowledgeEntry] = [{
  id: 'metadata-guided-analysis',
  title: 'Metadata-guided analysis',
  domain: 'generic',
  summary: 'Use selected data models, table metadata, field metadata, saved SQL, relationships, and result rows as the source of truth.',
  tags: ['metadata', 'data-model', 'dashboard-builder'],
  metricFields: [],
  recommendedVisualizations: ['table', 'bar', 'line', 'card']
}];

export function findLocalKnowledge(_prompt: string): LocalKnowledgeEntry[] {
  return [...localMetadataCatalog];
}
